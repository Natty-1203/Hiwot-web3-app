
import Beneficiary from '../models/Beneficiary.js';
import Claim from '../models/Claim.js';
import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';

export const getStats = async (req, res) => {
  try {
    const { region, program_id } = req.query;

    // Base filters
    const programFilter = {};
    if (region) programFilter['location.region'] = region; // if you store region

    const claimFilter = {};
    if (program_id) claimFilter.programInternalId = program_id;

    // Aggregations
    const [
      totalCashPrograms,
      totalGoodsPrograms,
      activeCashPrograms,
      activeGoodsPrograms,
      totalBeneficiaries,
      totalClaims,
      fundsResult,
      demographicsStats
    ] = await Promise.all([
      CashProgram.countDocuments(programFilter),
      GoodsProgram.countDocuments(programFilter),
      CashProgram.countDocuments({ ...programFilter, active: true }),
      GoodsProgram.countDocuments({ ...programFilter, active: true }),
      Beneficiary.countDocuments(), // optionally filter by region if you store location
      Claim.countDocuments(claimFilter),
      Claim.aggregate([
        { $match: claimFilter },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      // Demographics: count of claims by gender, age groups, etc.
      Claim.aggregate([
        { $match: { ...claimFilter, claimType: 'cash' } }, // only cash claims have amount
        { $lookup: {
            from: 'beneficiaries',
            localField: 'nullifier',
            foreignField: 'nullifier',
            as: 'beneficiary'
        }},
        { $unwind: '$beneficiary' },
        { $group: {
            _id: {
              gender: '$beneficiary.demographics.gender',
              ageGroup: {
                $switch: {
                  branches: [
                    { case: { $lt: ['$beneficiary.demographics.age', 18] }, then: 'child' },
                    { case: { $lt: ['$beneficiary.demographics.age', 60] }, then: 'adult' },
                    { case: { $gte: ['$beneficiary.demographics.age', 60] }, then: 'elderly' }
                  ],
                  default: 'unknown'
                }
              }
            },
            count: { $sum: 1 }
        }}
      ])
    ]);

    const totalFundsDistributed = fundsResult[0]?.total / 1e7 || 0;

    res.json({
      success: true,
      total_programs: totalCashPrograms + totalGoodsPrograms,
      active_programs: activeCashPrograms + activeGoodsPrograms,
      total_beneficiaries: totalBeneficiaries,
      total_claims: totalClaims,
      total_funds_distributed: totalFundsDistributed,
      demographics: demographicsStats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
};
