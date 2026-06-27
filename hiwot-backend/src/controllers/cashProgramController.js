import CashProgram from '../models/CashProgram.js';
import { generateGeofencePolygon } from '../utils/geofence.js';
import { stellarService } from '../services/stellar.js';
import Claim from '../models/Claim.js';
import Beneficiary from '../models/Beneficiary.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const createCashProgram = async (req, res) => {
  try {
    const { organization_wallet, title, amount_per_person, total_funds, location, deadline, frequency_days = 30 } = req.body;
    if (!organization_wallet || !title || !amount_per_person || !total_funds || !location || !deadline) {
      return errorResponse(res, 'VALIDATION_ERROR', 'All fields required', 400);
    }

    // Generate geofence polygon from location point (or use provided polygon)
    const geofenceVertices = generateGeofencePolygon(location.lat, location.lng, 0.01).map(c => ({ lat: Math.round(c.lat * 1e7), lng: Math.round(c.lng * 1e7) }));
    const startTime = Math.floor(Date.now() / 1000);
    const endTime = Math.floor(new Date(deadline).getTime() / 1000);
    const amountPerPersonStroops = Math.round(amount_per_person * 1e7);
    const totalBudgetStroops = Math.round(total_funds * 1e7);

    // Generate a unique program ID string (will be hashed to BytesN<32>)
    const programIdString = `cash_${title}_${Date.now()}`;

    const result = await stellarService.createProgram(
      organization_wallet,
      programIdString,
      amountPerPersonStroops,
      totalBudgetStroops,
      frequency_days,
      geofenceVertices,
      startTime,
      endTime
    );

    // Store program in local DB with the programIdString as internalId (or store mapping)
    const program = new CashProgram({
      internalId: programIdString,
      programId: programIdString,
      organizationWallet: organization_wallet,
      title,
      amountPerPerson: amount_per_person,
      totalFunds: total_funds,
      remainingFunds: total_funds,
      location,
      geofence: geofenceVertices.map(c => ({ lat: c.lat / 1e7, lng: c.lng / 1e7 })),
      deadline: new Date(deadline),
      active: true,
      synced: true,
      txHash: result.txHash
    });
    await program.save();

    successResponse(res, {
      program: {
        program_id: program.internalId,
        title: program.title,
        amount_per_person: program.amountPerPerson,
        total_funds: program.totalFunds,
        remaining_funds: program.remainingFunds,
        location: program.location,
        deadline: program.deadline.toISOString().split('T')[0],
        created_at: program.createdAt.toISOString()
      }
    }, 201);
  } catch (error) {
    console.error('Create cash program error:', error);
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};

export const getCashPrograms = async (req, res) => {
  try {
    const { active, limit = 10, page = 1 } = req.query;
    const filter = {};
    if (active === 'true') filter.active = true;

    const programs = await CashProgram.find(filter)
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .lean();

    res.json({
      success: true,
      programs: programs.map(p => ({
        program_id: p.internalId,
        title: p.title,
        amount_per_person: p.amountPerPerson,
        remaining_funds: p.remainingFunds,
        deadline: p.deadline?.toISOString()?.split('T')[0]
      }))
    });
  } catch (error) {
    console.error('Get cash programs error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const getCashProgramDetails = async (req, res) => {
  try {
    const { program_id } = req.params;
    const program = await CashProgram.findOne({ internalId: program_id }).lean();
    if (!program) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Program not found' } });
    }

    // Get claims for this program
    const claims = await Claim.find({ programInternalId: program_id, claimType: 'cash' }).lean();

    const totalBeneficiaries = new Set(claims.map(c => c.nullifier)).size;
    const totalDistributed = claims.reduce((sum, c) => sum + (c.amount / 1e7), 0);
    const completionRate = program.totalFunds ? (totalDistributed / program.totalFunds) * 100 : 0;
    const daysActive = Math.max(1, Math.ceil((new Date() - program.createdAt) / (1000 * 60 * 60 * 24)));
    const dailyAverage = totalDistributed / daysActive;

    // Recent transactions (last 5)
    const recentTransactions = claims
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map(c => ({
        tx_hash: c.txHash,
        amount: c.amount / 1e7,
        timestamp: c.timestamp?.toISOString()
      }));

    res.json({
      success: true,
      program: {
        program_id: program.internalId,
        title: program.title,
        organization_wallet: program.organizationWallet,
        amount_per_person: program.amountPerPerson,
        total_funds: program.totalFunds,
        remaining_funds: program.remainingFunds,
        location: program.location,
        deadline: program.deadline?.toISOString()?.split('T')[0],
        status: program.active ? 'active' : 'closed',
        created_at: program.createdAt?.toISOString(),
        updated_at: program.updatedAt?.toISOString(),
        statistics: {
          total_beneficiaries: totalBeneficiaries,
          total_distributed: totalDistributed,
          daily_average: Math.round(dailyAverage),
          completion_rate: Math.round(completionRate)
        },
        recent_transactions: recentTransactions
      }
    });
  } catch (error) {
    console.error('Get cash program details error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
};

export const getOrganizationCashPrograms = async (req, res) => {
  try {
    const { wallet } = req.params;
    const programs = await CashProgram.find({ organizationWallet: wallet }).lean();
    res.json({
      success: true,
      programs: programs.map(p => ({
        program_id: p.internalId,
        title: p.title,
        remaining_funds: p.remainingFunds,
        claims: p.totalClaims
      }))
    });
  } catch (error) {
    console.error('Get organization cash programs error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

