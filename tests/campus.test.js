import test from 'node:test';
import assert from 'node:assert/strict';
import { campusPortals, portalAt, nearbySeat } from '../shared/campus.js';
import { ROOMS, seatPosition } from '../shared/world.js';
import { walkStep, standPosition, isWalkable } from '../shared/navigation.js';
import {portalPoint,roomArrival} from '../shared/architecture.js';

test('every zone has distinct reciprocal portals with clear arrivals', () => {
  for (const room of ROOMS) {
    const portals=campusPortals(room.id);
    assert.ok(portals.length>=1);
    assert.equal(new Set(portals.map(p=>p.id)).size,portals.length);
    assert.ok(portals.every(p=>p.id!==room.id));
    for(const p of portals) {
      assert.ok(campusPortals(p.id).some(back=>back.id===room.id),'Paths must connect in both directions');
      assert.equal(portalAt(room.id,portalPoint(p,0,.3)),null,'Do not fade before crossing the doorway');
      assert.equal(portalAt(room.id,portalPoint(p,0,-.6)).id,p.id);
      const threshold=portalPoint(p,0,-.6),beyond=portalPoint(p,0,-1.5);
      assert.ok(isWalkable(threshold.x,threshold.z,room.id),'Threshold must be reachable');
      assert.equal(isWalkable(beyond.x,beyond.z,room.id),false,'Preview is not a second navigable room');
      const arrival=roomArrival(room.id,p.id);
      assert.ok(isWalkable(arrival.x,arrival.z,room.id),'Arrival must be clear');
      assert.equal(portalAt(room.id,arrival),null,'Arrival cannot immediately send you back');
    }
    assert.equal(new Set(portals.map(p=>p.angle)).size,portals.length,'Doors must face different directions');
  }
});
test('doorway transitions require entering the opening and never trigger while seated',()=>{
  assert.equal(portalAt('studio',{x:0,z:-6}),null);
  assert.equal(portalAt('studio',{x:2.5,z:-6.5}),null);
  assert.equal(portalAt('studio',{x:0,z:-9.6,table:'design'}),null);
  let p={x:0,z:6};for(let i=0;i<100;i++)p=walkStep(p,{x:0,z:-1},.05);
  assert.equal(portalAt('studio',p).id,'focus');
});
test('nearby seating ignores occupied chairs and does not offer seating when already seated',()=>{
  const p=standPosition('design',0);
  assert.equal(nearbySeat(p,[]).seat,0);
  const busy=nearbySeat(p,[{table:'design',seat:0}]);
  assert.ok(!busy || busy.table!=='design' || busy.seat!==0);
  assert.equal(nearbySeat({...p,table:'design'},[]),null);
  assert.equal(nearbySeat({x:0,z:6},[]),null);
  const s=nearbySeat(p,[]);assert.equal(s.x,seatPosition('design',0).x);
});
