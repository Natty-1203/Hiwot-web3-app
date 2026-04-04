import Beneficiary from '../models/Beneficiary.js';
import OfflineQueue from '../models/OfflineQueue.js';
import { generateNullifier } from '../utils/crypto.js';
import { stellarService } from '../services/stellar.js';
import pkg from '@stellar/stellar-sdk';
const { Keypair } = pkg;

function createStellarWallet() {
  const keypair = Keypair.random();
  return { publicKey: keypair.publicKey() };
}

export const registerBeneficiary = async (req, res) => {
  try {
    const { biometric_hash, device_id, location, demographics } = req.body;
    if (!biometric_hash) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELD', message: 'biometric_hash is required' } });
    }
    const nullifier = generateNullifier(biometric_hash);
    const existing = await Beneficiary.findOne({ nullifier });
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'BENEFICIARY_EXISTS', message: 'Beneficiary already registered' } });
    }
    const { publicKey } = createStellarWallet();
    const beneficiary = new Beneficiary({
      nullifier,
      walletAddress: publicKey,
      deviceId: device_id,
      registeredLocation: location,
      demographics,
      synced: false
    });
    await beneficiary.save();

    let txHash = null;
    try {
      const result = await stellarService.registerBeneficiary(nullifier);
      txHash = result.txHash;
      beneficiary.synced = true;
      beneficiary.txHash = txHash;
      await beneficiary.save();
    } catch (error) {
      console.warn('Blockchain sync failed, queuing registration:', error.message);
      await OfflineQueue.create({ actionType: 'register', payload: { nullifier }, status: 'pending' });
    }

    res.status(201).json({
      success: true,
      beneficiary: {
        id: beneficiary.internalId,
        nullifier_hash: beneficiary.nullifier,
        wallet_address: beneficiary.walletAddress,
        created_at: beneficiary.registeredAt?.toISOString()
      },
      tx_hash: txHash
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
};

export const getBeneficiary = async (req, res) => {
  try {
    const { nullifier_hash } = req.params;
    if (!nullifier_hash) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAM', message: 'nullifier_hash is required' } });
    }
    const beneficiary = await Beneficiary.findOne({ nullifier: nullifier_hash });
    if (!beneficiary) {
      return res.status(404).json({ success: false, error: { code: 'BENEFICIARY_NOT_FOUND', message: 'Beneficiary not found' } });
    }
    res.json({
      success: true,
      beneficiary: {
        id: beneficiary.internalId,
        nullifier_hash: beneficiary.nullifier,
        wallet_address: beneficiary.walletAddress,
        created_at: beneficiary.registeredAt?.toISOString()
      }
    });
  } catch (error) {
    console.error('Get beneficiary error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};
