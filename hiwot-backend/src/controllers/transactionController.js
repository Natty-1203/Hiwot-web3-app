import Claim from '../models/Claim.js';
import Beneficiary from '../models/Beneficiary.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';

export const getTransactions = async (req, res) => {
  try {
    const { program_id, type } = req.query;
    const filter = {};
    if (program_id) filter.programInternalId = program_id;
    if (type) filter.claimType = type;

    const claims = await Claim.find(filter).sort('-timestamp').lean();

    const nullifiers = [...new Set(claims.map(c => c.nullifier))];
    const beneficiaries = await Beneficiary.find({ nullifier: { $in: nullifiers } }).lean();
    const walletMap = Object.fromEntries(beneficiaries.map(b => [b.nullifier, b.walletAddress]));

    // Get program titles
    const cashProgramIds = [...new Set(claims.filter(c => c.claimType === 'cash').map(c => c.programInternalId))];
    const goodsProgramIds = [...new Set(claims.filter(c => c.claimType === 'goods').map(c => c.programInternalId))];
    const cashPrograms = await CashProgram.find({ internalId: { $in: cashProgramIds } }).lean();
    const goodsPrograms = await GoodsProgram.find({ internalId: { $in: goodsProgramIds } }).lean();
    const programTitleMap = {
      ...Object.fromEntries(cashPrograms.map(p => [p.internalId, p.title])),
      ...Object.fromEntries(goodsPrograms.map(p => [p.internalId, p.title]))
    };

    const transactions = claims.map(c => ({
      tx_hash: c.txHash,
      program_id: c.programInternalId,
      program_title: programTitleMap[c.programInternalId] || '',
      amount: c.claimType === 'cash' ? (c.amount / 1e7) : null,
      item: c.claimType === 'goods' ? {
        itemId: c.itemId,
        quantity: c.quantity,
        unit: c.unit,
        batchNumber: c.batchNumber,
        expiryDate: c.expiryDate
      } : null,
      wallet_address: walletMap[c.nullifier] || null,
      timestamp: c.timestamp?.toISOString()
    }));

    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
