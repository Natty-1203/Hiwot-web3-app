import Distribution from '../../models/Distribution.js';
import Agent from '../../models/Agent.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getAgentDashboard = async (req, res) => {
  try {
    const { wallet } = req.params;
    const agent = await Agent.findOne({ agentId: wallet }).lean(); // use agentId or wallet field
    if (!agent) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);

    // Get today's distributions
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dailyDistributions = await Distribution.countDocuments({
      agentWallet: wallet,
      timestamp: { $gte: today, $lt: tomorrow }
    });

    // Get total distributions
    const totalDistributions = await Distribution.countDocuments({ agentWallet: wallet });

    // Compute rating (mock)
    const rating = 4.8; // placeholder

    successResponse(res, {
      agent: {
        name: agent.name,
        region: agent.region || 'Unknown'
      },
      stats: {
        daily: {
          distributions: dailyDistributions
        },
        total: {
          distributions: totalDistributions
        }
      },
      performance: {
        rating
      }
    });
  } catch (error) {
    console.error('Agent dashboard error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const getAgentDistributions = async (req, res) => {
  try {
    const { wallet } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const distributions = await Distribution.find({ agentWallet: wallet })
      .sort('-timestamp')
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const total = await Distribution.countDocuments({ agentWallet: wallet });

    successResponse(res, {
      distributions: distributions.map(d => ({
        distributionId: d.distributionId,
        amount: d.type === 'cash' ? d.amount : d.quantity,
        type: d.type,
        status: d.status,
        timestamp: d.timestamp
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total
      }
    });
  } catch (error) {
    console.error('Agent distributions error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};