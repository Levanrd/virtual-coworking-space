import test from 'node:test';
import assert from 'node:assert/strict';
import {createQualityController, graphicsMode} from '../src/graphicsQuality.js';
import {validSettings} from '../src/storage.js';
import {cameraBoundaryDistance} from '../src/cameraBounds.js';
import {insideFootprint, roomArrival, portalPoint} from '../shared/architecture.js';
import {campusPortals} from '../shared/campus.js';
import {ROOMS, roomTables, seatPosition} from '../shared/world.js';
import {standPosition} from '../shared/navigation.js';

function pacing(controller) {
  let time = 0;
  controller.sample(time);
  return (fps, seconds, active = true) => { for (let i = 0; i < fps * seconds; i++) controller.sample(time += 1000 / fps, active); return controller.level; };
}
test('automatic graphics responds to sustained load and avoids quality oscillation', () => {
  const c = createQualityController(); const run = pacing(c);
  assert.equal(run(60, 1), 'balanced');
  assert.equal(run(25, 8), 'low');
  assert.equal(run(60, 60), 'low', 'Do not repeat a failed quality level');
  c.setMode('auto'); assert.equal(c.level, 'low', 'Unchanged props must retain adaptation');
  c.setMode('high'); assert.equal(run(20, 20), 'high', 'Manual quality stays selected');
  c.setMode('auto'); assert.equal(c.level, 'balanced');
  assert.equal(run(60, 20), 'high', 'Sustained headroom improves quality');
  assert.equal(run(25, 8), 'balanced');
});
test('automatic quality ignores hidden tabs, resumed frames and room warm-up', () => {
  const c = createQualityController(), run = pacing(c);
  assert.equal(run(10, 20, false), 'balanced');
  assert.equal(run(1, 20), 'balanced', 'Background throttling is not GPU load');
  assert.equal(run(20, 1), 'balanced');
  c.reset(); assert.equal(run(20, 1), 'balanced');
  assert.equal(createQualityController({cores:4}).level, 'low');
  assert.equal(createQualityController({memory:4}).level, 'low');
  assert.equal(graphicsMode('invalid'), 'auto');
  assert.ok(validSettings({theme:'dark'}), 'Existing preferences migrate');
  assert.ok(!validSettings({theme:'dark',graphics:'ultra'}));
});
test('camera stays inside curved and concave boundaries at every seat and exit', () => {
  for (const room of ROOMS) {
    const points = [roomArrival(room.id), ...roomTables(room.id).flatMap(table => Array.from({length:6}, (_, seat) => [seatPosition(table.id,seat,room.id),standPosition(table.id,seat,room.id)]).flat())];
    for (const origin of points) for (let i=0;i<32;i++) {
      const direction = {x:Math.sin(i*Math.PI/16), z:Math.cos(i*Math.PI/16)};
      const distance = cameraBoundaryDistance(room.id, origin, direction, 8);
      assert.ok(Number.isFinite(distance) && distance > 0 && distance <= 8);
      if (distance < 8) assert.ok(insideFootprint(room.id,origin.x+direction.x*distance,origin.z+direction.z*distance,0),`${room.id} camera crosses perimeter`);
    }
    for (const portal of campusPortals(room.id)) {
      const p = portalPoint(portal,0,2.1);
      assert.equal(cameraBoundaryDistance(room.id,p,{x:-Math.sin(portal.angle),z:-Math.cos(portal.angle)},3.7),3.7,'Doorway remains open to camera');
    }
  }
});
