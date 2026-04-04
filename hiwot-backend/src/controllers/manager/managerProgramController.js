import CashProgram from '../../models/CashProgram.js';
import GoodsProgram from '../../models/GoodsProgram.js';
import Claim from '../../models/Claim.js';
import Beneficiary from '../../models/Beneficiary.js';
import Agent from '../../models/Agent.js';
import { successResponse, errorResponse } from '../../utils/response.js';

// Helper: get manager's organization wallet (from auth header; for demo, use fixed or extract)
function getManagerWallet(req) {
  // In production, decode JWT or header. For hackathon, we can assume it's passed in header or use a test wallet.
  return req.headers['x-org-wallet'] || 'GCBXXX23'; // default test wallet
}

// Get all programs (cash + goods) for this manager
export const getManagerPrograms = async (req, res) => {
  try {
    const managerWallet = getManagerWallet(req);
    const { status, from_date, to_date, limit = 20, page = 1 } = req.query;

    // Build date filters
    const dateFilter = {};
    if (from_date) dateFilter.createdAt = { $gte: new Date(from_date) };
    if (to_date) dateFilter.createdAt = { ...dateFilter.createdAt, $lte: new Date(to_date) };

    // Query cash and goods programs where organizationWallet matches manager
    let cashPrograms = await CashProgram.find({ organizationWallet: managerWallet, ...dateFilter }).lean();
    let goodsPrograms = await GoodsProgram.find({ organizationWallet: managerWallet, ...dateFilter }).lean();

    // Combine and filter by status if requested
    let allPrograms = [...cashPrograms, ...goodsPrograms];
    if (status === 'active') allPrograms = allPrograms.filter(p => p.active);
    else if (status === 'completed') allPrograms = allPrograms.filter(p => !p.active);

    // Sort by createdAt desc
    allPrograms.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate
    const total = allPrograms.length;
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);
    const paginated = allPrograms.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Enrich with donor_name and statistics
    const enriched = await Promise.all(paginated.map(async program => {
      // Get total beneficiaries (unique nullifiers from claims)
      const claims = await Claim.find({ programInternalId: program.internalId }).lean();
      const uniqueBeneficiaries = new Set(claims.map(c => c.nullifier)).size;
      const totalDistributions = claims.length;
      const totalBudget = program.type === 'cash' ? program.totalFunds : program.totalFunds || 0;
      const remainingBudget = program.type === 'cash' ? program.remainingFunds : null;
      const progress = totalBudget ? ((totalBudget - (remainingBudget || 0)) / totalBudget) * 100 : 0;

      // Use program title as name
      return {
        program_id: program.internalId,
        name: program.title,
        donor: program.organizationWallet,
        donor_name: program.organizationWallet, // you could later join with Donor model
        total_budget: totalBudget,
        remaining_budget: remainingBudget,
        amount_per_person: program.amountPerPerson,
        geofence: program.geofence ? program.geofence.map(c => [c.lat, c.lng]) : [],
        is_active: program.active,
        created_at: program.createdAt.getTime(),
        beneficiaries_reached: uniqueBeneficiaries,
        distributions_count: totalDistributions,
        progress_percentage: Math.round(progress)
      };
    }));

    successResponse(res, { programs: enriched }, 200, {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Get manager programs error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

// Get single program details (cash or goods)
export const getManagerProgramDetails = async (req, res) => {
  try {
    const { program_id } = req.params;
    // Try cash first
    let program = await CashProgram.findOne({ internalId: program_id }).lean();
    let type = 'cash';
    if (!program) {
      program = await GoodsProgram.findOne({ internalId: program_id }).lean();
      type = 'goods';
    }
    if (!program) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Program not found', 404);

    // Get claims
    const claims = await Claim.find({ programInternalId: program_id }).lean();
    const uniqueBeneficiaries = new Set(claims.map(c => c.nullifier)).size;
    const totalDistributed = type === 'cash'
      ? claims.reduce((sum, c) => sum + (c.amount / 1e7), 0)
      : claims.reduce((sum, c) => sum + c.quantity, 0);

    const remainingFunds = type === 'cash' ? program.remainingFunds : null;
    const totalBudget = type === 'cash' ? program.totalFunds : null;
    const completionRate = totalBudget ? ((totalBudget - remainingFunds) / totalBudget) * 100 : 0;

    // Distribution by day (last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dailyClaims = claims.filter(c => c.timestamp >= sevenDaysAgo);
    const daysMap = new Map();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      daysMap.set(dateStr, 0);
    }
    dailyClaims.forEach(c => {
      const dateStr = c.timestamp.toISOString().split('T')[0];
      if (daysMap.has(dateStr)) daysMap.set(dateStr, daysMap.get(dateStr) + 1);
    });
    const distributionsByDay = Array.from(daysMap.entries()).map(([date, count]) => ({ date, count })).reverse();

    // Get active agents assigned to this program
    const agents = await Agent.find({ programsAssigned: program_id, isActive: true }).lean();

    const programData = {
      program_id: program.internalId,
      name: program.title,
      donor: program.organizationWallet,
      donor_name: program.organizationWallet,
      total_budget: totalBudget,
      remaining_budget: remainingFunds,
      amount_per_person: program.amountPerPerson,
      geofence: program.geofence ? program.geofence.map(c => [c.lat, c.lng]) : [],
      is_active: program.active,
      created_at: program.createdAt.getTime(),
      beneficiaries_reached: uniqueBeneficiaries,
      distributions_count: claims.length,
      program_type: type,
      statistics: {
        total_beneficiaries: uniqueBeneficiaries,
        total_distributed: totalDistributed,
        remaining_funds: remainingFunds,
        active_agents: agents.length,
        completion_rate: completionRate,
        distributions_by_day: distributionsByDay
      }
    };

    successResponse(res, { program: programData });
  } catch (error) {
    console.error('Get manager program details error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

// Create new program (deploy smart contract) – unified for cash/goods
export const createManagerProgram = async (req, res) => {
  try {
    const managerWallet = getManagerWallet(req);
    const {
      name,
      budget,
      amount_per_person,
      geofence,
      donor,
      donor_name,
      program_type,
      frequency_days,
      rules
    } = req.body;

    // Validate
    if (!name || !budget || !amount_per_person || !geofence || !program_type) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Missing required fields', 400);
    }

    // Convert geofence from array of [lat,lng] to our Coordinate format
    const geofenceCoordinates = geofence.map(([lat, lng]) => ({ lat, lng }));

    // Use existing contract creation (mock)
    // For cash program
    if (program_type === 'cash') {
      const { stellarService } = await import('../../services/stellar.js');
      const amountPerPersonStroops = Math.round(amount_per_person * 1e7);
      const totalFundsStroops = Math.round(budget * 1e7);
      const frequencyDays = Number(frequency_days) > 0 ? Math.round(Number(frequency_days)) : 30;
      const startTime = Math.floor(Date.now() / 1000);
      const deadlineTimestamp = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
      const geofenceVertices = geofenceCoordinates.map(c => ({
        lat: Math.round(c.lat * 1e7),
        lng: Math.round(c.lng * 1e7)
      }));
      const programIdString = `cash_${name}_${Date.now()}`;

      const result = await stellarService.createProgram(
        managerWallet,
        programIdString,
        amountPerPersonStroops,
        totalFundsStroops,
        frequencyDays,
        geofenceVertices,
        startTime,
        deadlineTimestamp
      );

      const program = new CashProgram({
        internalId: programIdString,
        programId: programIdString,
        organizationWallet: managerWallet,
        title: name,
        amountPerPerson: amount_per_person,
        totalFunds: budget,
        remainingFunds: budget,
        location: { lat: geofenceCoordinates[0]?.lat, lng: geofenceCoordinates[0]?.lng },
        geofence: geofenceCoordinates,
        deadline: new Date(deadlineTimestamp * 1000),
        synced: true,
        txHash: result.txHash,
        active: true
      });
      await program.save();

      successResponse(res, {
        program: {
          program_id: program.internalId,
          name: program.title,
          transaction_hash: result.txHash,
          created_at: program.createdAt.getTime()
        }
      }, 201);
    } else if (program_type === 'goods') {
      // For goods, we need inventory items. For simplicity, we'll create a goods program with no inventory? Actually spec expects inventory.
      // We'll create a placeholder inventory (empty) and let the manager add items later.
      const program = new GoodsProgram({
        organizationWallet: managerWallet,
        title: name,
        inventory: [], // empty, can be added via inventory endpoints
        location: { lat: geofenceCoordinates[0]?.lat, lng: geofenceCoordinates[0]?.lng },
        geofence: geofenceCoordinates,
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        active: true
      });
      await program.save();

      successResponse(res, {
        program: {
          program_id: program.internalId,
          name: program.title,
          transaction_hash: null,
          created_at: program.createdAt.getTime()
        }
      }, 201);
    } else {
      return errorResponse(res, 'VALIDATION_ERROR', 'Invalid program_type', 400);
    }
  } catch (error) {
    console.error('Create manager program error:', error);
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};