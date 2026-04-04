// Convert degrees to approximate km: 0.01 deg ~ 1.1 km
export function generateGeofencePolygon(lat, lng, radiusDeg = 0.01) {
  return [
    { lat: lat - radiusDeg, lng: lng - radiusDeg },
    { lat: lat - radiusDeg, lng: lng + radiusDeg },
    { lat: lat + radiusDeg, lng: lng + radiusDeg },
    { lat: lat + radiusDeg, lng: lng - radiusDeg },
    { lat: lat - radiusDeg, lng: lng - radiusDeg } // close polygon
  ];
}
