import {floorPlan, portalLocal} from '../shared/architecture.js';
import {campusPortals} from '../shared/campus.js';

// Glass can be visually transparent without letting the camera leave the room.
// Analytic perimeter tests also cover the spaces between terrace railings.
export function cameraBoundaryDistance(room, origin, direction, distance) {
  const outline = floorPlan(room).outline, doors = campusPortals(room);
  let nearest = distance;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
    const ex = bx - ax, ez = bz - az;
    const cross = direction.x * ez - direction.z * ex;
    if (Math.abs(cross) < 1e-8) continue;
    const dx = ax - origin.x, dz = az - origin.z;
    const t = (dx * ez - dz * ex) / cross;
    const u = (dx * direction.z - dz * direction.x) / cross;
    if (t < 0 || t > nearest || u < 0 || u > 1) continue;
    const x = origin.x + direction.x * t, z = origin.z + direction.z * t;
    if (doors.some(door => { const p = portalLocal(door, x, z); return Math.abs(p.x) < 1.7 && Math.abs(p.z) < .8; })) continue;
    nearest = Math.max(.08, t - .2);
  }
  return nearest;
}
