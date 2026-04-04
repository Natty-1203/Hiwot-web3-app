import Claim from '../models/Claim.js';
import Beneficiary from '../models/Beneficiary.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';

export const exportClaimsCSV = async (req, res) => {
  try {
    const { program_id, type } = req.query; // type = 'cash' or 'goods'
    const filter = {};
    if (program_id) filter.programInternalId = program_id;
    if (type) filter.claimType = type;

    const claims = await Claim.find(filter).sort('-timestamp').lean();
    const nullifiers = [...new Set(claims.map(c => c.nullifier))];
    const beneficiaries = await Beneficiary.find({ nullifier: { $in: nullifiers } }).lean();
    const benMap = Object.fromEntries(beneficiaries.map(b => [b.nullifier, b]));

    // Fetch program titles for cash and goods
    const cashProgramIds = [...new Set(claims.filter(c => c.claimType === 'cash').map(c => c.programInternalId))];
    const goodsProgramIds = [...new Set(claims.filter(c => c.claimType === 'goods').map(c => c.programInternalId))];
    const cashPrograms = await CashProgram.find({ internalId: { $in: cashProgramIds } }).lean();
    const goodsPrograms = await GoodsProgram.find({ internalId: { $in: goodsProgramIds } }).lean();
    const programTitleMap = {
      ...Object.fromEntries(cashPrograms.map(p => [p.internalId, p.title])),
      ...Object.fromEntries(goodsPrograms.map(p => [p.internalId, p.title]))
    };

    const fields = [
      'claim_id', 'timestamp', 'program_id', 'program_title', 'claim_type',
      'amount_USD', 'item_id', 'quantity', 'unit', 'batch_number', 'expiry_date',
      'nullifier', 'wallet_address', 'beneficiary_age', 'beneficiary_gender', 'household_size'
    ];
    const csvRows = [fields.join(',')];

    for (const claim of claims) {
      const ben = benMap[claim.nullifier] || {};
      const row = [
        claim._id,
        claim.timestamp?.toISOString(),
        claim.programInternalId,
        programTitleMap[claim.programInternalId] || '',
        claim.claimType,
        claim.claimType === 'cash' ? (claim.amount / 1e7) : '',
        claim.itemId || '',
        claim.quantity || '',
        claim.unit || '',
        claim.batchNumber || '',
        claim.expiryDate ? claim.expiryDate?.toISOString() : '',
        claim.nullifier,
        ben.walletAddress || '',
        ben.demographics?.age || '',
        ben.demographics?.gender || '',
        ben.demographics?.householdSize || ''
      ];
      csvRows.push(row.map(v => `"${v}"`).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=claims_${program_id || 'all'}.csv`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
