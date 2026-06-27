use soroban_sdk::Vec;
use crate::types::Location;

// Check if a point is inside a polygon using ray casting algorithm
pub fn point_in_polygon(point: Location, vertices: Vec<Location>) -> bool {
    let x = point.lat;
    let y = point.lon;
    
    let mut inside = false;
    let n = vertices.len();
    if n < 3 { return false; } // A polygon must have at least 3 vertices

    let mut j = n - 1;

    for i in 0..n {
        let pi = vertices.get(i).unwrap();
        let pj = vertices.get(j).unwrap();
        
        if (pi.lon > y) != (pj.lon > y) {
            let dy = pj.lon - pi.lon;
            if dy != 0 {
                let x_intersect = (pj.lat - pi.lat) * (y - pi.lon) / dy + pi.lat;
                if x < x_intersect {
                    inside = !inside;
                }
            }
        }
        j = i;
    }
    
    inside
}