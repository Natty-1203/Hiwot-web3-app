import Claim from '../models/Claim.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';

export const verifyTransaction = async (req, res) => {
  try {
    const { program_id, tx_hash } = req.params;
    const claim = await Claim.findOne({ programInternalId: program_id, txHash: tx_hash }).lean();
    if (!claim) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    }

    // In production, you would also verify on Stellar explorer.
    res.json({
      success: true,
      transaction: {
        tx_hash: claim.txHash,
        program_id: claim.programInternalId,
        amount: claim.claimType === 'cash' ? claim.amount / 1e7 : null,
        item: claim.claimType === 'goods' ? {
          itemId: claim.itemId,
          quantity: claim.quantity,
          batchNumber: claim.batchNumber
        } : null,
        timestamp: claim.timestamp?.toISOString(),
        verified: true,
        blockchain_explorer_url: `https://stellar.expert/explorer/testnet/tx/${claim.txHash}`
      }
    });
  } catch (error) {
    console.error('Verify transaction error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getProgramVerificationSummary = async (req, res) => {
  try {
    const { program_id } = req.params;
    const claims = await Claim.find({ programInternalId: program_id }).lean();
    const totalClaims = claims.length;
    const verifiedClaims = claims.filter(c => c.txHash).length;
    const lastClaim = claims.sort((a,b) => b.timestamp - a.timestamp)[0];
    const firstClaim = claims.sort((a,b) => a.timestamp - b.timestamp)[0];

    res.json({
      success: true,
      summary: {
        program_id,
        total_claims: totalClaims,
        verified_claims: verifiedClaims,
        verification_rate: totalClaims ? (verifiedClaims / totalClaims) * 100 : 0,
        first_claim: firstClaim ? firstClaim.timestamp?.toISOString() : null,
        last_claim: lastClaim ? lastClaim.timestamp?.toISOString() : null,
        blockchain_explorer_base: 'https://stellar.expert/explorer/testnet/tx/'
      }
    });
  } catch (error) {
    console.error('Verification summary error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
