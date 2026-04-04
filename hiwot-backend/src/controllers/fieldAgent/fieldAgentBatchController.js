import Batch from '../../models/Batch.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createBatch = async (req, res) => {
  try {
    const { creator_wallet, description, quantity, metadata } = req.body;
    const batchIdString = `batch_${Date.now()}`;
    const metadataHash = computeMetadataHash(metadata); // compute hash of metadata object
    const result = await stellarService.createBatch(creator_wallet, batchIdString, description, quantity, metadataHash);
    // store batch in local DB if needed
    successResponse(res, { batchId: batchIdString, txHash: result.txHash }, 201);
  } catch (error) {
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};

export const getBatch = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const batch = await Batch.findOne({ batchId: batch_id }).lean();
    if (!batch) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Batch not found', 404);

    successResponse(res, { batch });
  } catch (error) {
    console.error('Get batch error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};

export const updateBatch = async (req, res) => {
  try {
    const { batch_id } = req.params;
    const updates = req.body;
    const batch = await Batch.findOne({ batchId: batch_id });
    if (!batch) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Batch not found', 404);

    if (updates.status) batch.status = updates.status;
    if (updates.items) {
      // Update items: merge by itemId
      for (const item of updates.items) {
        const existing = batch.items.find(i => i.itemId === item.itemId);
        if (existing) {
          if (item.remaining !== undefined) existing.remaining = item.remaining;
          if (item.name) existing.name = item.name;
        } else {
          batch.items.push(item);
        }
      }
    }
    batch.lastUpdated = new Date();
    await batch.save();

    successResponse(res, { batch });
  } catch (error) {
    console.error('Update batch error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};