import CashProgram from '../../models/CashProgram.js';
import GoodsProgram from '../../models/GoodsProgram.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getGeofence = async (req, res) => {
  try {
    const { program_id } = req.params;
    let program = await CashProgram.findOne({ internalId: program_id }).lean();
    if (!program) program = await GoodsProgram.findOne({ internalId: program_id }).lean();
    if (!program) return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Program not found', 404);

    const coordinates = program.geofence ? program.geofence.map(c => [c.lat, c.lng]) : [];
    // Compute center and area (simple average for center)
    let center = null;
    let area = null;
    if (coordinates.length > 0) {
      const sumLat = coordinates.reduce((s, c) => s + c[0], 0);
      const sumLng = coordinates.reduce((s, c) => s + c[1], 0);
      center = [sumLat / coordinates.length, sumLng / coordinates.length];
      // Area calculation omitted
    }

    successResponse(res, {
      geofence: {
        program_id: program.internalId,
        coordinates,
        center,
        area_km2: null,
        created_at: program.createdAt ? new Date(program.createdAt).getTime() : Date.now(),
        updated_at: program.updatedAt ? new Date(program.updatedAt).getTime() : Date.now()
      }
    });
  } catch (error) {
    console.error('Get geofence error:', error);
    errorResponse(res, 'INTERNAL_ERROR', error.message, 500);
  }
};

export const updateGeofence = async (req, res) => {
  try {
    const { program_id } = req.params;
    const { coordinates } = req.body;
    if (!coordinates || !Array.isArray(coordinates)) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Invalid geofence coordinates', 400);
    }
    // Convert to our coordinate format
    const geofenceCoords = coordinates.map(([lat, lng]) => ({ lat, lng }));

    // Try cash first, then goods
    let program = await CashProgram.findOne({ internalId: program_id });
    if (program) {
      program.geofence = geofenceCoords;
      await program.save();
    } else {
      program = await GoodsProgram.findOne({ internalId: program_id });
      if (program) {
        program.geofence = geofenceCoords;
        await program.save();
      } else {
        return errorResponse(res, 'RESOURCE_NOT_FOUND', 'Program not found', 404);
      }
    }

    successResponse(res, {
      message: 'Geofence updated successfully',
      geofence: {
        program_id: program.internalId,
        coordinates: geofenceCoords.map(c => [c.lat, c.lng]),
        updated_at: program.updatedAt ? new Date(program.updatedAt).getTime() : Date.now()
      }
    });
  } catch (error) {
    console.error('Update geofence error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};