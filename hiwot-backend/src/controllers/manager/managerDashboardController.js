import CashProgram from '../../models/CashProgram.js';
import GoodsProgram from '../../models/GoodsProgram.js';
import Claim from '../../models/Claim.js';
import Beneficiary from '../../models/Beneficiary.js';
import Agent from '../../models/Agent.js';
import Inventory from '../../models/Inventory.js';
import { successResponse, errorResponse } from '../../utils/response.js';

function getManagerWallet(req) {
  return req.headers['x-org-wallet'] || 'GCBXXX23';
}

export const getManagerDashboard = async (req, res) => {
  try {
    const managerWallet = getManagerWallet(req);

    // Get all programs for this manager
    const cashPrograms = await CashProgram.find({ organizationWallet: managerWallet }).lean();
    const goodsPrograms = await GoodsProgram.find({ organizationWallet: managerWallet }).lean();
    const allPrograms = [...cashPrograms, ...goodsPrograms];
    const programIds = allPrograms.map(p => p.internalId);

    // Aggregated totals
    let totalBudget = 0;
    let totalRemaining = 0;
    cashPrograms.forEach(p => {
      totalBudget += p.totalFunds;
      totalRemaining += p.remainingFunds;
    });
    // For goods, no budget; we skip for now.

    // Total beneficiaries (unique across all programs)
    const claims = await Claim.find({ programInternalId: { $in: programIds } }).lean();
    const uniqueBeneficiaries = new Set(claims.map(c => c.nullifier)).size;

    const activeAgents = await Agent.countDocuments({ isActive: true });

    // Recent programs (last 5)
    const recentPrograms = allPrograms
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map(p => {
        const progClaims = claims.filter(c => c.programInternalId === p.internalId);
        const totalBudgetP = p.type === 'cash' ? p.totalFunds : 0;
        const remaining = p.type === 'cash' ? p.remainingFunds : 0;
        const progress = totalBudgetP ? ((totalBudgetP - remaining) / totalBudgetP) * 100 : 0;
        return {
          program_id: p.internalId,
          name: p.title,
          created_at: p.createdAt.getTime(),
          progress_percentage: Math.round(progress)
        };
      });

    // Low stock alerts (items with quantity < lowStockThreshold)
    const lowStockItems = await Inventory.find({
      $expr: { $lt: ['$quantity', '$lowStockThreshold'] }
    }).lean();
    const lowStockAlerts = lowStockItems.map(item => ({
      item_id: item.itemId,
      name: item.name,
      quantity: item.quantity,
      threshold: item.lowStockThreshold
    }));

    // Recent distributions (last 5 claims)
    const recentClaims = await Claim.find({ programInternalId: { $in: programIds } })
      .sort('-timestamp')
      .limit(5)
      .lean();
    const programTitleMap = {};
    allPrograms.forEach(p => { programTitleMap[p.internalId] = p.title; });
    const recentDistributions = recentClaims.map(c => ({
      distribution_id: c._id,
      amount: c.claimType === 'cash' ? c.amount / 1e7 : c.quantity,
      timestamp: c.timestamp.getTime(),
      program_name: programTitleMap[c.programInternalId] || ''
    }));

    successResponse(res, {
      dashboard: {
        summary: {
          total_programs: allPrograms.length,
          total_budget: totalBudget,
          total_remaining: totalRemaining,
          total_beneficiaries: uniqueBeneficiaries,
          active_agents: activeAgents
        },
        recent_programs: recentPrograms,
        low_stock_alerts: lowStockAlerts,
        recent_distributions: recentDistributions
      }
    });
  } catch (error) {
    console.error('Manager dashboard error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};