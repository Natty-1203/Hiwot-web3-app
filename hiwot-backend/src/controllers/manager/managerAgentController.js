import Agent from '../../models/Agent.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getAgents = async (req, res) => {
  try {
    const { status, program_id, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (status === 'active') filter.isActive = true;
    else if (status === 'inactive') filter.isActive = false;
    if (program_id) filter.programsAssigned = program_id;

    const total = await Agent.countDocuments(filter);
    const agents = await Agent.find(filter)
      .sort('-createdAt')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const enriched = agents.map(agent => ({
      agent_id: agent.agentId,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      is_active: agent.isActive,
      programs_assigned: agent.programsAssigned,
      last_active: agent.lastActive?.getTime() || null,
      total_distributions: agent.totalDistributions,
      success_rate: agent.successRate
    }));

    successResponse(res, { agents: enriched }, 200, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Get agents error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const getAgent = async (req, res) => {
  try {
    const { agent_id } = req.params;
    const agent = await Agent.findOne({ agentId: agent_id }).lean();
    if (!agent) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);

    // For recent distributions, we need to fetch claims from Claim collection where this agent was involved.
    // Since we don't have agent association in claims yet, we'll leave empty for now.
    const recentDistributions = []; // could be populated from claim records if we store agentId

    const enriched = {
      agent_id: agent.agentId,
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      is_active: agent.isActive,
      programs_assigned: agent.programsAssigned,
      last_active: agent.lastActive?.getTime() || null,
      total_distributions: agent.totalDistributions,
      success_rate: agent.successRate,
      recent_distributions: recentDistributions
    };

    successResponse(res, { agent: enriched });
  } catch (error) {
    console.error('Get agent error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const createAgent = async (req, res) => {
  try {
    const { name, email, phone, programs_assigned } = req.body;
    if (!name || !email) return errorResponse(res, 'VALIDATION_ERROR', 'Name and email required', 400);

    const existing = await Agent.findOne({ email });
    if (existing) return errorResponse(res, 'VALIDATION_ERROR', 'Agent with this email already exists', 400);

    const agent = new Agent({
      name,
      email,
      phone,
      programsAssigned: programs_assigned || [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await agent.save();

    successResponse(res, {
      agent: {
        agent_id: agent.agentId,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        is_active: agent.isActive,
        programs_assigned: agent.programsAssigned,
        created_at: agent.createdAt.getTime()
      }
    }, 201);
  } catch (error) {
    console.error('Create agent error:', error);
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};

export const updateAgent = async (req, res) => {
  try {
    const { agent_id } = req.params;
    const updates = req.body;
    const allowed = ['name', 'email', 'phone', 'is_active', 'programs_assigned'];
    const filtered = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) filtered[key] = key === 'is_active' ? updates[key] : updates[key];
    }
    if (filtered.programs_assigned) filtered.programsAssigned = filtered.programs_assigned;
    filtered.updatedAt = new Date();

    const agent = await Agent.findOneAndUpdate({ agentId: agent_id }, filtered, { new: true }).lean();
    if (!agent) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);

    successResponse(res, {
      agent: {
        agent_id: agent.agentId,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        is_active: agent.isActive,
        programs_assigned: agent.programsAssigned,
        updated_at: agent.updatedAt.getTime()
      }
    });
  } catch (error) {
    console.error('Update agent error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const deleteAgent = async (req, res) => {
  try {
    const { agent_id } = req.params;
    const result = await Agent.deleteOne({ agentId: agent_id });
    if (result.deletedCount === 0) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Agent not found', 404);
    res.status(204).end();
  } catch (error) {
    console.error('Delete agent error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};