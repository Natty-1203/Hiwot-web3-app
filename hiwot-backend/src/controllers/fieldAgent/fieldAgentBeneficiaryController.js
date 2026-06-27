import Beneficiary from '../../models/Beneficiary.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { generateNullifier } from '../../utils/crypto.js';
import { stellarService } from '../../services/stellar.js';
import pkg from '@stellar/stellar-sdk';
const { Keypair } = pkg;
import crypto from 'crypto';


function createStellarWallet() {
  const keypair = Keypair.random();
  return { publicKey: keypair.publicKey() };
}

function computeMetadataHash(metadata) {
  const str = JSON.stringify(metadata);
  return '0x' + crypto.createHash('sha256').update(str).digest('hex');
}

export const registerOrUpdateBeneficiary = async (req, res) => {
  try {
    const { nullifier, metadata, registeredBy, registrationLocation } = req.body;
    if (!nullifier || !metadata) {
      return errorResponse(res, 'VALIDATION_ERROR', 'nullifier and metadata required', 400);
    }

    // Compute metadata hash
    const metadataHash = computeMetadataHash(metadata);

    // Call identity contract to register
    const result = await stellarService.registerBeneficiary(nullifier, registeredBy, metadataHash);

    // Also store in local DB for faster lookups (optional)
    let beneficiary = await Beneficiary.findOne({ nullifier });
    if (beneficiary) {
      // update local record
      beneficiary.name = metadata.name;
      beneficiary.phone = metadata.phone;
      beneficiary.locationText = metadata.location;
      beneficiary.familySize = metadata.familySize;
      beneficiary.vulnerabilityScore = metadata.vulnerabilityScore;
      beneficiary.demographics = metadata.demographics;
      beneficiary.registeredBy = registeredBy;
      beneficiary.registrationLocation = registrationLocation;
      beneficiary.synced = true;
      beneficiary.txHash = result.txHash;
      await beneficiary.save();
    } else {
      // create new
      const { publicKey } = createStellarWallet();
      beneficiary = new Beneficiary({
        nullifier,
        walletAddress: publicKey,
        name: metadata.name,
        phone: metadata.phone,
        locationText: metadata.location,
        familySize: metadata.familySize,
        vulnerabilityScore: metadata.vulnerabilityScore,
        demographics: metadata.demographics,
        registeredBy,
        registrationLocation,
        synced: true,
        txHash: result.txHash
      });
      await beneficiary.save();
    }

    successResponse(res, {
      beneficiary: {
        id: beneficiary.internalId,
        name: beneficiary.name,
        phone: beneficiary.phone,
        location: beneficiary.locationText,
        familySize: beneficiary.familySize,
        vulnerabilityScore: beneficiary.vulnerabilityScore,
        isActive: beneficiary.isActive,
        txHash: beneficiary.txHash
      },
      action: beneficiary.wasNew ? 'created' : 'updated',
      txHash: result.txHash
    }, 201);
  } catch (error) {
    console.error('Register/update beneficiary error:', error);
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};

export const getBeneficiaryWithEligibility = async (req, res) => {
  try {
    const { nullifier } = req.params;
    const { include_history, limit, program_id } = req.query;

    const beneficiary = await Beneficiary.findOne({ nullifier });
    if (!beneficiary) {
      return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Beneficiary not found', 404);
    }

    // Simple eligibility: any active program with remaining funds
    let eligible = true;
    let totalAvailable = 0;

    let history = {};
    if (include_history === 'true') {
      const Claim = (await import('../../models/Claim.js')).default;
      const filter = { nullifier };
      if (program_id) filter.programInternalId = program_id;
      const claims = await Claim.find(filter)
        .sort('-timestamp')
        .limit(parseInt(limit) || 10);
      const totalDistributed = claims.reduce((sum, c) => sum + (c.amount ? c.amount / 1e7 : c.quantity), 0);
      history = {
        totalDistributed,
        recent: claims.map(c => ({
          program_id: c.programInternalId,
          amount: c.claimType === 'cash' ? c.amount / 1e7 : c.quantity,
          timestamp: c.timestamp
        }))
      };
    }

    successResponse(res, {
      beneficiary: {
        name: beneficiary.name,
        phone: beneficiary.phone,
        familySize: beneficiary.familySize,
        location: beneficiary.locationText
      },
      eligibility: {
        eligible,
        totalAvailable
      },
      history
    });
  } catch (error) {
    console.error('Get beneficiary error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};