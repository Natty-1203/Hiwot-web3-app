import Distribution from '../../models/Distribution.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const syncData = async (req, res) => {
  try {
    const { data } = req.body; // could be offline distributions
    if (data && Array.isArray(data)) {
      // Process offline data (similar to bulk sync)
      // For simplicity, we'll just count pending
      // In a real implementation, you'd insert and then mark as synced.
    }

    // Check if there are any pending sync items
    const pendingSync = await Distribution.countDocuments({ syncStatus: 'pending' }) > 0;

    successResponse(res, {
      pendingSync,
      lastSyncTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};