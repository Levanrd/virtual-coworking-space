import { ROOMS, roomTables, seatPosition } from './world.js';
import {floorPlan,portalLocal} from './architecture.js';

// The architecture, interaction prompts and room transitions share these positions.
export function campusPortals(roomId) {
  return floorPlan(roomId).doors.map(([id,x,z,angle])=>({...ROOMS.find(r=>r.id===id),x,z,angle}));
}
export function inPortalApproach(roomId, x, z) {
  return campusPortals(roomId).some(p=>{const local=portalLocal(p,x,z);return local.z>=-1.3&&local.z<=1&&Math.abs(local.x)<1.35;});
}
export function portalAt(roomId, position) {
  if (!position || position.table) return null;
  return campusPortals(roomId).find(p=>{const local=portalLocal(p,position.x,position.z);return local.z<=-.5&&local.z>=-1.3&&Math.abs(local.x)<1.35;}) || null;
}
export function nearbySeat(position, users) {
  if (!position || position.table) return null;
  let closest = null, distance = 1.65;
  for (const table of roomTables(position.room)) for (let seat = 0; seat < table.seats; seat++) {
    if (users.some(u => u.table === table.id && u.seat === seat)) continue;
    const p = seatPosition(table.id, seat, position.room);
    const d = Math.hypot(position.x - p.x, position.z - p.z);
    if (d < distance) { distance = d; closest = {table: table.id, seat, ...p}; }
  }
  return closest;
}
