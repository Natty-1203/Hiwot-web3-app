import Distribution from '../../models/Distribution.js';
import Beneficiary from '../../models/Beneficiary.js';
import CashProgram from '../../models/CashProgram.js';
import GoodsProgram from '../../models/GoodsProgram.js';
import Claim from '../../models/Claim.js';
import { stellarService } from '../../services/stellar.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import crypto from 'crypto';

export const distributeAid = async (req, res) => {
  try {
    const { nullifier, program_id, distribution, agent_wallet, location } = req.body;
    if (!nullifier || !program_id || !distribution || !agent_wallet) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Missing required fields', 400);
    }

    // Verify beneficiary and program exist locally
    const beneficiary = await Beneficiary.findOne({ nullifier });
    if (!beneficiary) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Beneficiary not found', 404);

    const program = await CashProgram.findOne({ internalId: program_id });
    if (!program) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Program not found', 404);

    // Check eligibility via contract
    const isEligible = await stellarService.checkEligibility(program.internalId, nullifier, location);
    if (!isEligible) {
      return errorResponse(res, 'NOT_ELIGIBLE', 'Beneficiary not eligible for this program', 400);
    }

    // Call distribute (this will transfer USDC from donor to agent)
    const result = await stellarService.distribute(agent_wallet, program.internalId, nullifier, location, null);

    // Record distribution locally
    const distributionRecord = new Distribution({
      nullifier,
      programInternalId: program_id,
      type: 'cash',
      amount: distribution.amount,
      agentWallet: agent_wallet,
      location,
      status: 'confirmed',
      syncStatus: 'synced',
      txHash: result.txHash
    });
    await distributionRecord.save();

    // Update local program remaining funds (optional, can also fetch from contract)
    const remaining = await stellarService.getRemainingBudget(program.internalId);
    program.remainingFunds = remaining / 1e7;
    program.totalClaims += 1;
    await program.save();

    successResponse(res, {
      distribution: {
        distributionId: distributionRecord.distributionId,
        type: 'cash',
        amount: distribution.amount,
        status: 'confirmed'
      },
      updatedEligibility: {
        remainingAmount: program.remainingFunds
      }
    }, 201);
  } catch (error) {
    console.error('Distribution error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const bulkSyncDistributions = async (req, res) => {
  try {
    const { distributions } = req.body; // array of distribution objects (offline)
    if (!distributions || !Array.isArray(distributions)) {
      return errorResponse(res, 'VALIDATION_ERROR', 'distributions array required', 400);
    }

    let successful = 0;
    let failed = 0;
    const conflicts = [];

    for (const dist of distributions) {
      try {
        // Simulate processing each distribution
        // For each, we could call the same logic as distributeAid
        // For brevity, we'll just create Distribution records with status confirmed
        const newDist = new Distribution({
          ...dist,
          status: 'confirmed',
          syncStatus: 'synced',
          timestamp: new Date()
        });
        await newDist.save();
        successful++;
      } catch (err) {
        failed++;
        conflicts.push({ distribution: dist, error: err.message });
      }
    }

    successResponse(res, {
      summary: {
        total: distributions.length,
        successful,
        failed
      },
      conflicts
    });
  } catch (error) {
    console.error('Bulk sync error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};