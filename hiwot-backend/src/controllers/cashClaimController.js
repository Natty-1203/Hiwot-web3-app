import Claim from '../models/Claim.js';
import Beneficiary from '../models/Beneficiary.js';
import CashProgram from '../models/CashProgram.js';
import OfflineQueue from '../models/OfflineQueue.js';
import { stellarService } from '../services/stellar.js';
import { mockBankService } from '../services/mockBank.js';
import crypto from 'crypto';

// Helper to compute commitment: SHA256(nullifier + programId + secret)
function computeCommitment(nullifier, programId, secret) {
  const data = nullifier + programId.toString() + secret;
  return '0x' + crypto.createHash('sha256').update(data).digest('hex');
}

export const claimCash = async (req, res) => {
  try {
    const { nullifier_hash, program_id, location } = req.body;
    if (!nullifier_hash || !program_id || !location) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'All fields required' } });
    }

    const beneficiary = await Beneficiary.findOne({ nullifier: nullifier_hash });
    if (!beneficiary) {
      return res.status(403).json({ success: false, error: { code: 'BENEFICIARY_NOT_FOUND', message: 'Beneficiary not registered' } });
    }

    const program = await CashProgram.findOne({ internalId: program_id });
    if (!program) {
      return res.status(404).json({ success: false, error: { code: 'PROGRAM_NOT_FOUND', message: 'Program not found' } });
    }

    // Check if already claimed (using local DB)
    const existing = await Claim.findOne({ nullifier: nullifier_hash, programInternalId: program_id, claimType: 'cash' });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_CLAIMED', message: 'Already claimed this program' } });
    }

    // Determine beneficiary address for the contract
    let beneficiaryAddress;
    if (program.disbursementMethod === 'Direct') {
      beneficiaryAddress = beneficiary.walletAddress;
    } else {
      beneficiaryAddress = program.bankAddress;
    }

    // Generate secret (32 random bytes)
    const secret = crypto.randomBytes(32).toString('hex');
    // Compute commitment
    const commitment = computeCommitment(nullifier_hash, program.programId, secret);

    // Create local claim record (pending)
    const claim = new Claim({
      nullifier: nullifier_hash,
      programId: program.programId,
      programInternalId: program_id,
      claimType: 'cash',
      amount: 0,
      timestamp: new Date(),
      status: 'pending',
      synced: false,
      secret,
      commitment,
      disbursementMethod: program.disbursementMethod,
      beneficiaryAddress: program.disbursementMethod === 'Direct' ? beneficiaryAddress : undefined
    });
    await claim.save();

    // Call the smart contract
    const locationStr = `${location.lat},${location.lng}`;
    let claimReceipt;
    try {
      claimReceipt = await stellarService.claimAid(
        nullifier_hash,
        program.programId,
        locationStr,
        beneficiaryAddress,
        secret
      );
    } catch (error) {
      console.warn('Blockchain claim failed, queuing:', error.message);
      // Queue for later
      await OfflineQueue.create({
        actionType: 'claim',
        payload: {
          nullifier: nullifier_hash,
          programId: program.programId,
          programInternalId: program_id,
          location: locationStr,
          claimType: 'cash',
          secret,
          commitment,
          beneficiaryAddress,
          amountUSD: program.amountPerPerson
        },
        status: 'pending'
      });
      return res.status(202).json({ success: true, message: 'Claim queued for processing (offline mode)', queued: true });
    }

    // Update claim record with success
    const amountStroops = Math.round(program.amountPerPerson * 1e7);
    const amountUSD = program.amountPerPerson;
    claim.amount = amountStroops;
    claim.timestamp = new Date();
    claim.txHash = claimReceipt.txHash;
    claim.status = 'completed';
    claim.synced = true;
    await claim.save();

    // Update program totals
    program.totalClaims += 1;
    program.remainingFunds -= amountUSD;
    await program.save();

    // Call mock bank service (now using commitment as idempotency key)
    let bankResult;
    try {
      bankResult = await mockBankService.transfer({
        commitment,
        nullifier: nullifier_hash,
        amountUSD,
        programId: program.programId,
        timestamp: Math.floor(Date.now() / 1000)
      });
    } catch (bankError) {
      console.error('Bank transfer failed:', bankError.message);
      bankResult = { success: false, error: bankError.message };
    }

    // Return response
    res.status(200).json({
      success: true,
      transaction: {
        tx_hash: claimReceipt.txHash,
        amount: amountUSD,
        currency: 'USDC',
        wallet_address: beneficiary.walletAddress,
        claimed_at: claim.timestamp?.toISOString(),
        commitment
      },
      bankTransfer: bankResult
    });
  } catch (error) {
    console.error('Cash claim error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getCashClaimStatus = async (req, res) => {
  try {
    const { program_id, nullifier_hash } = req.query;
    if (!program_id || !nullifier_hash) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'program_id and nullifier_hash required' } });
    }

    // First check local DB
    let claim = await Claim.findOne({ nullifier: nullifier_hash, programInternalId: program_id, claimType: 'cash' });
    if (!claim) {
      return res.json({ success: true, claimed: false });
    }

    // Trust local DB (on-chain verify skipped for speed)

    res.json({
      success: true,
      claimed: true,
      claimed_at: claim.timestamp?.toISOString(),
      transaction_hash: claim.txHash
    });
  } catch (error) {
    console.error('Cash claim status error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const listCashClaims = async (req, res) => {
  try {
    const { program_id, page = 1, limit = 20 } = req.query;
    const filter = { claimType: 'cash' };
    if (program_id) filter.programInternalId = program_id;

    const claims = await Claim.find(filter).sort('-timestamp').limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit)).lean();
    res.json({
      success: true,
      claims: claims.map(c => ({
        nullifier_hash: c.nullifier,
        program_id: c.programInternalId,
        amount: c.amount / 1e7,
        tx_hash: c.txHash,
        timestamp: c.timestamp?.toISOString(),
        commitment: c.commitment
      })),
      page: parseInt(page),
      limit: parseInt(limit),
      total: await Claim.countDocuments(filter)
    });
  } catch (error) {
    console.error('List cash claims error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
