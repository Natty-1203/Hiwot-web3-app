import Agent from '../../models/Agent.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getAgentProfile = async (req, res) => {
  try {
    const { wallet } = req.params;
    let agent = await Agent.findOne({ agentId: wallet }).lean();
    if (!agent) {
      // Return minimal profile if not found
      agent = { agentId: wallet, name: wallet, email: null, phone: null };
    }
    successResponse(res, { agent });
  } catch (error) {
    console.error('Get agent profile error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const updateAgentProfile = async (req, res) => {
  try {
    const { wallet } = req.params;
    const updates = req.body;
    let agent = await Agent.findOne({ agentId: wallet });
    if (!agent) {
      agent = new Agent({ agentId: wallet });
    }
    // Allowed fields to update
    if (updates.name) agent.name = updates.name;
    if (updates.email) agent.email = updates.email;
    if (updates.phone) agent.phone = updates.phone;
    if (updates.region) agent.region = updates.region;
    // etc.
    agent.updatedAt = new Date();
    await agent.save();

    successResponse(res, { agent });
  } catch (error) {
    console.error('Update agent profile error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};