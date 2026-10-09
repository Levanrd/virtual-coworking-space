import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraDirection,
  walkStep,
  WALK_SPEED,
  standPosition,
  isWalkable,
  jumpHeight,
  JUMP_DURATION,
  remoteJumpHeight,
} from "../shared/navigation.js";
import { TABLES, seatPosition } from "../shared/world.js";

test("walking follows camera heading and diagonal movement has the same speed", () => {
  assert.deepEqual(cameraDirection(1, 0, 0), { x: 0, z: -1 });
  const turned = cameraDirection(1, 0, Math.PI / 2);
  assert.ok(Math.abs(turned.x + 1) < 1e-10);
  assert.ok(Math.abs(turned.z) < 1e-10);
  assert.equal(Math.hypot(...Object.values(cameraDirection(1, 1, 0))), 1);
  assert.deepEqual(cameraDirection(0, 0, 2), { x: 0, z: 0 });
});

test("movement is frame-rate independent and long background frames cannot teleport", () => {
  function walk(frames) {
    let position = { x: 0, z: 6 };
    for (let i = 0; i < frames; i++)
      position = walkStep(position, { x: 0, z: -1 }, 1 / frames);
    return position;
  }
  assert.ok(Math.abs(walk(30).z - walk(120).z) < 1e-10);
  assert.ok(Math.abs(walk(60).z - (6 - WALK_SPEED)) < 1e-10);
  assert.equal(
    walkStep({ x: 0, z: 6 }, { x: 0, z: -1 }, 10).z,
    6 - WALK_SPEED * 0.05,
  );
});

test("walking cannot leave room bounds or pass through desks and slides along obstacles", () => {
  assert.deepEqual(
    walkStep({ x: .7, z: 10.7 }, cameraDirection(-1, 1, 0), 0.05),
    { x: .7, z: 10.7 },
  );
  const before = { x: -7.15, z: -4 };
  assert.deepEqual(walkStep(before, { x: 1, z: 0 }, 0.05), before);
  const sliding = walkStep(before, cameraDirection(1, 1, 0), 0.05);
  assert.equal(sliding.x, before.x);
  assert.ok(sliding.z < before.z);
});

test("every chair has a clear nearby exit and chair footprints block walking", () => {
  for (const table of TABLES)
    for (let seat = 0; seat < table.seats; seat++) {
      const chair = seatPosition(table.id, seat),
        exit = standPosition(table.id, seat);
      assert.equal(isWalkable(chair.x, chair.z), false);
      assert.equal(
        isWalkable(exit.x, exit.z),
        true,
        `${table.id} seat ${seat} exit`,
      );
      assert.ok(
        Math.abs(Math.hypot(exit.x - chair.x, exit.z - chair.z) - 0.95) < 1e-9,
      );
    }
});

test("jump arc lands deterministically and remote animation uses server-relative elapsed time", () => {
  assert.equal(jumpHeight(0), 0);
  assert.equal(jumpHeight(JUMP_DURATION / 2), 1.05);
  assert.equal(jumpHeight(JUMP_DURATION), 0);
  assert.equal(jumpHeight(100), 0);
  assert.equal(jumpHeight(NaN), 0);
  const user = { jumpStartedAt: 900000, snapshotTime: 900180, receivedAt: 100 };
  assert.equal(remoteJumpHeight(user, 280), 1.05);
  assert.equal(remoteJumpHeight({ ...user, table: "design" }, 280), 0);
});
