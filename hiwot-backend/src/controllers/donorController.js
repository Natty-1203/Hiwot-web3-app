import CashProgram from '../models/CashProgram.js';
import GoodsProgram from '../models/GoodsProgram.js';
import Claim from '../models/Claim.js';
import Shipment from '../models/Shipment.js';
import Donor from '../models/Donor.js';


export const getDonorShipments = async (req, res) => {
  try {
    const { wallet } = req.params;
    const { status, program_id, from_date, to_date, limit = 20, page = 1, sort = '-createdAt' } = req.query;

    const filter = { donor_wallet: wallet };
    if (status) filter.status = status;
    if (program_id) filter.program_id = program_id;
    if (from_date) filter.createdAt = { $gte: new Date(from_date) };
    if (to_date) filter.createdAt = { ...filter.createdAt, $lte: new Date(to_date) };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const shipments = await Shipment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Shipment.countDocuments(filter);
    const pages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      shipments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages
      }
    });
  } catch (error) {
    console.error('Get donor shipments error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getDonorImpact = async (req, res) => {
  try {
    const { wallet } = req.params;
    const { from_date, to_date, group_by = 'month' } = req.query;

    // Get all programs funded by this donor
    const cashPrograms = await CashProgram.find({ organizationWallet: wallet }).lean();
    const goodsPrograms = await GoodsProgram.find({ organizationWallet: wallet }).lean();
    const programIds = [...cashPrograms.map(p => p.internalId), ...goodsPrograms.map(p => p.internalId)];

    // Get all claims for those programs
    const claims = await Claim.find({ programInternalId: { $in: programIds } }).lean();
    const filteredClaims = claims.filter(c => {
      const cDate = new Date(c.timestamp);
      if (from_date && cDate < new Date(from_date)) return false;
      if (to_date && cDate > new Date(to_date)) return false;
      return true;
    });

    // Summary
    const totalBeneficiaries = new Set(filteredClaims.map(c => c.nullifier)).size;
    const totalCashDistributed = filteredClaims.filter(c => c.claimType === 'cash').reduce((sum, c) => sum + (c.amount / 1e7), 0);
    const totalGoodsDistributed = filteredClaims.filter(c => c.claimType === 'goods').reduce((sum, c) => sum + c.quantity, 0);
    const totalPrograms = cashPrograms.length + goodsPrograms.length;
    const totalShipments = await Shipment.countDocuments({ donor_wallet: wallet });

    // Breakdown by program (optional)
    const programBreakdown = [...cashPrograms, ...goodsPrograms].map(prog => {
      const progClaims = filteredClaims.filter(c => c.programInternalId === prog.internalId);
      const beneficiaries = new Set(progClaims.map(c => c.nullifier)).size;
      const distributedCash = progClaims.filter(c => c.claimType === 'cash').reduce((sum, c) => sum + (c.amount / 1e7), 0);
      const distributedGoods = progClaims.filter(c => c.claimType === 'goods').reduce((sum, c) => sum + c.quantity, 0);
      return {
        program_id: prog.internalId,
        title: prog.title,
        beneficiaries,
        distributed_cash: distributedCash,
        distributed_goods: distributedGoods,
        type: prog.type
      };
    });

    // Trends by month
    const trends = {};
    filteredClaims.forEach(claim => {
      const date = new Date(claim.timestamp);
      let key;
      if (group_by === 'month') key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      else if (group_by === 'region') key = claim.location ? `${claim.location.lat},${claim.location.lng}` : 'unknown';
      else key = claim.programInternalId;

      if (!trends[key]) trends[key] = { cash: 0, goods: 0, beneficiaries: new Set() };
      if (claim.claimType === 'cash') trends[key].cash += claim.amount / 1e7;
      else trends[key].goods += claim.quantity;
      trends[key].beneficiaries.add(claim.nullifier);
    });
    // Convert beneficiaries Set to count
    const trendData = Object.entries(trends).map(([key, val]) => ({
      key,
      cash: val.cash,
      goods: val.goods,
      beneficiaries: val.beneficiaries.size
    }));

    res.json({
      success: true,
      impact: {
        summary: {
          total_beneficiaries: totalBeneficiaries,
          total_cash_distributed: totalCashDistributed,
          total_goods_distributed: totalGoodsDistributed,
          total_programs: totalPrograms,
          total_shipments: totalShipments,
          report_period: { from: from_date || null, to: to_date || null }
        },
        breakdown: programBreakdown,
        trends: trendData,
        generated_at: new Date()?.toISOString()
      }
    });
  } catch (error) {
    console.error('Impact error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getDonorProfile = async (req, res) => {
  try {
    const { wallet } = req.params;
    let donor = await Donor.findOne({ wallet }).lean();
    if (!donor) {
      // If not exists, return minimal info
      donor = { wallet, name: wallet, email: null, organization: null, website: null, logo: null };
    }
    res.json({ success: true, donor });
  } catch (error) {
    console.error('Get donor profile error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const updateDonorProfile = async (req, res) => {
  try {
    const { wallet } = req.params;
    const updates = req.body;
    const donor = await Donor.findOneAndUpdate(
      { wallet },
      { ...updates, updatedAt: new Date() },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, donor });
  } catch (error) {
    console.error('Update donor profile error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getDonorDashboard = async (req, res) => {
  try {
    const { wallet } = req.params;
    // Get all programs funded
    const cashPrograms = await CashProgram.find({ organizationWallet: wallet }).lean();
    const goodsPrograms = await GoodsProgram.find({ organizationWallet: wallet }).lean();
    const allPrograms = [...cashPrograms, ...goodsPrograms];
    const programIds = allPrograms.map(p => p.internalId);

    // Get recent claims
    const recentClaims = await Claim.find({ programInternalId: { $in: programIds } })
      .sort('-timestamp')
      .limit(10)
      .lean();

    // Get active programs
    const activePrograms = allPrograms.filter(p => p.active);

    // Get shipment stats
    const totalShipments = await Shipment.countDocuments({ donor_wallet: wallet });
    const recentShipments = await Shipment.find({ donor_wallet: wallet })
      .sort('-createdAt')
      .limit(5)
      .lean();

    res.json({
      success: true,
      dashboard: {
        summary: {
          total_programs: allPrograms.length,
          active_programs: activePrograms.length,
          total_shipments: totalShipments,
          recent_claims: recentClaims.map(c => ({
            tx_hash: c.txHash,
            program_id: c.programInternalId,
            amount: c.claimType === 'cash' ? c.amount / 1e7 : null,
            timestamp: c.timestamp?.toISOString()
          })),
          recent_shipments: recentShipments.map(s => ({
            shipmentId: s.shipmentId,
            status: s.status,
            updated_at: s.updatedAt?.toISOString()
          }))
        }
      }
    });
  } catch (error) {
    console.error('Donor dashboard error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
