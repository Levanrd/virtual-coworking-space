import { ROOM_DESIGNS, roomTables, seatPosition } from "./world.js";
import {inPortalApproach} from './campus.js';
import {insideFootprint} from './architecture.js';

export const WALK_SPEED = 3.2;
const roomObstacles = Object.fromEntries(Object.keys(ROOM_DESIGNS).map(room => [room, [
  ...roomTables(room).map((t) => ({ x: t.x, z: t.z, w: ['lounge','cafe'].includes(room)?1.25:3.65, d:['lounge','cafe'].includes(room)?1.25:room==='focus'?1.78:1.5 })),
  ...roomTables(room).flatMap((t) =>
    t.seatOffsets.map(([x, z]) => ({
      x: t.x + x,
      z: t.z + z,
      w: ['lounge','cafe'].includes(room) ? 1.08 : .73,
      d: ['lounge','cafe'].includes(room) ? 1.08 : .72,
    })),
  ),
  ...ROOM_DESIGNS[room].fixtures,
]]));
export const JUMP_DURATION = 0.72;
export const JUMP_COOLDOWN = 0.1;
export function jumpHeight(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= JUMP_DURATION)
    return 0;
  const phase = seconds / JUMP_DURATION;
  return 4 * 1.05 * phase * (1 - phase);
}
export function remoteJumpHeight(user, now) {
  if (user.table || !user.jumpStartedAt || !Number.isFinite(user.snapshotTime))
    return 0;
  return jumpHeight(
    (user.snapshotTime - user.jumpStartedAt + now - user.receivedAt) / 1000,
  );
}
export function isWalkable(x, z, room = 'studio') {
  return (
    (insideFootprint(room,x,z) || inPortalApproach(room,x,z)) &&
    !(roomObstacles[room] || roomObstacles.studio).some(
      (o) =>
        Math.abs(x - o.x) < o.w / 2 + 0.27 &&
        Math.abs(z - o.z) < o.d / 2 + 0.27,
    )
  );
}
export function standPosition(table, seat, room = 'studio') {
  const p = seatPosition(table, seat, room);
  return {
    x: p.x - Math.sin(p.rotation) * 0.95,
    z: p.z - Math.cos(p.rotation) * 0.95,
    rotation: p.rotation,
  };
}

// Camera yaw describes the offset behind the character. Forward points into view.
export function cameraDirection(forward, right, yaw) {
  const length = Math.hypot(forward, right);
  if (!length) return { x: 0, z: 0 };
  return {
    x: (-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length,
    z: (-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length,
  };
}

export function walkStep(position, direction, seconds, room = position.room || 'studio') {
  const distance = WALK_SPEED * Math.min(Math.max(seconds, 0), 0.05);
  let x = position.x + direction.x * distance;
  if (!isWalkable(x, position.z, room)) x = position.x;
  let z = position.z + direction.z * distance;
  if (!isWalkable(x, z, room)) z = position.z;
  return { x, z };
}
