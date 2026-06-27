import CashProgram from '../../models/CashProgram.js';
import GoodsProgram from '../../models/GoodsProgram.js';
import { successResponse, errorResponse } from '../../utils/response.js';

// Simple point-in-polygon algorithm
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > point[1]) != (yj > point[1])) &&
      (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export const verifyLocation = async (req, res) => {
  try {
    const { location } = req.body;
    if (!location || !location.lat || !location.lng) {
      return errorResponse(res, 'VALIDATION_ERROR', 'location with lat/lng required', 400);
    }
    const point = [location.lat, location.lng];

    // Get all active programs (cash and goods) that have geofence
    const cashPrograms = await CashProgram.find({ active: true, geofence: { $exists: true, $ne: [] } }).lean();
    const goodsPrograms = await GoodsProgram.find({ active: true, geofence: { $exists: true, $ne: [] } }).lean();
    const allPrograms = [...cashPrograms, ...goodsPrograms];

    let inZone = false;
    let distance = 0; // TODO: compute min distance to program edge

    for (const program of allPrograms) {
      const polygon = program.geofence.map(c => [c.lat, c.lng]);
      if (pointInPolygon(point, polygon)) {
        inZone = true;
        break;
      }
    }

    successResponse(res, { inZone, distance });
  } catch (error) {
    console.error('Geofence verify error:', error);
    errorResponse(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
};