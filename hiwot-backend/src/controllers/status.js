import Claim from '../models/Claim.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';
import { stellarService } from '../services/stellar.js';

/**
 * Get claim status for a specific beneficiary and program
 * GET /api/status/:nullifier/:programId
 */
export const getClaimStatus = async (req, res) => {
  const { nullifier, programId } = req.params;

  // 1. Validate parameters
  if (!nullifier || !programId) {
    return res.status(400).json({ error: 'nullifier and programId are required' });
  }

  const nullifierRegex = /^(0x)?[0-9a-fA-F]{64}$/;
  if (!nullifierRegex.test(nullifier)) {
    return res.status(400).json({ error: 'Invalid nullifier format' });
  }

  const normalizedProgramId = String(programId).trim();
  if (!normalizedProgramId) {
    return res.status(400).json({ error: 'programId is required' });
  }

  try {
    // 2. First check local database (fast)
    let claim = await Claim.findOne({
      nullifier,
      $or: [
        { programInternalId: normalizedProgramId },
        { programId: normalizedProgramId }
      ]
    })
      .select('amount timestamp txHash status bankReference authorization -_id')
      .lean();

    // 3. If found locally and synced, return it
    if (claim && claim.status === 'completed') {
      return res.status(200).json({
        claimed: true,
        claimDetails: {
          amount: claim.amount,
          timestamp: claim.timestamp,
          txHash: claim.txHash,
          bankReference: claim.bankReference,
          status: claim.status
        }
      });
    }

    // 4. If not found locally or pending, query blockchain for authoritative answer
    // This is optional but good for consistency. If blockchain is unreachable,
    // we can fallback to local pending record.
    let blockchainClaimed = false;
    let blockchainDetails = null;
    try {
      blockchainClaimed = await stellarService.getClaimStatus(nullifier, normalizedProgramId);
      
      // Optionally, if blockchain says claimed but we don't have local record,
      // we might want to fetch additional details (like amount, timestamp) from the contract
      // using another view function. For simplicity, we'll just return claimed: true without details.
    } catch (error) {
      console.warn('Blockchain status check failed:', error.message);
      // If blockchain fails, we rely on local data (or return false if no local)
    }

    // If blockchain says claimed but we have no local record, return minimal info
    if (blockchainClaimed && !claim) {
      return res.status(200).json({
        claimed: true,
        message: 'Claimed according to blockchain, but details not available locally'
      });
    }

    // If blockchain says not claimed but local has pending record, return pending
    if (!blockchainClaimed && claim && claim.status === 'pending') {
      return res.status(200).json({
        claimed: false,
        pending: true,
        message: 'Claim is pending processing'
      });
    }

    // 5. Default: not claimed
    return res.status(200).json({
      claimed: false
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


export const getBeneficiaryClaims = async (req, res) => {
  try {
    const { nullifier } = req.params;
    const claims = await Claim.find({ nullifier }).sort('-timestamp').lean();
    // Optionally fetch program titles using CashProgram/GoodsProgram
    const cashProgramIds = [...new Set(claims.filter(c => c.claimType === 'cash').map(c => c.programInternalId))];
    const goodsProgramIds = [...new Set(claims.filter(c => c.claimType === 'goods').map(c => c.programInternalId))];
    const cashPrograms = await CashProgram.find({ internalId: { $in: cashProgramIds } }).lean();
    const goodsPrograms = await GoodsProgram.find({ internalId: { $in: goodsProgramIds } }).lean();
    const programMap = {
      ...Object.fromEntries(cashPrograms.map(p => [p.internalId, p.title])),
      ...Object.fromEntries(goodsPrograms.map(p => [p.internalId, p.title]))
    };

    const enrichedClaims = claims.map(c => ({
      programId: c.programInternalId,
      programTitle: programMap[c.programInternalId] || '',
      amount: c.claimType === 'cash' ? (c.amount / 1e7) : null,
      item: c.claimType === 'goods' ? {
        itemId: c.itemId,
        quantity: c.quantity,
        unit: c.unit,
        batchNumber: c.batchNumber,
        expiryDate: c.expiryDate
      } : null,
      timestamp: c.timestamp,
      txHash: c.txHash,
      status: c.status
    }));

    res.json({ nullifier, claims: enrichedClaims });
  } catch (error) {
    console.error('Beneficiary claims error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
