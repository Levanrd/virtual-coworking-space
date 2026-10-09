import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCampus} from '../src/campusRoom.js';
import {ROOMS, roomTables, seatPosition, ROOM_DESIGNS} from '../shared/world.js';
import {isWalkable, standPosition, walkStep} from '../shared/navigation.js';
import {nearbySeat, campusPortals,portalAt} from '../shared/campus.js';
import {portalPoint,roomArrival,floorPlan,insideFootprint} from '../shared/architecture.js';
import {WorldState} from '../server/state.js';

test('all room seats share server coordinates and provide unobstructed exits',()=>{
  const world=new WorldState();
  for(const room of ROOMS) {
    const user=world.add(`test-${room.id}`,{room:room.id});
    for(const table of roomTables(room.id))for(let seat=0;seat<table.seats;seat++) {
      const point=seatPosition(table.id,seat,room.id);
      const exit=standPosition(table.id,seat,room.id);
      assert.equal(isWalkable(point.x,point.z,room.id),false);
      assert.equal(isWalkable(exit.x,exit.z,room.id),true,`${room.id}/${table.id}/${seat} exit`);
      assert.equal(world.join(user,{table:table.id,seat}).ok,true);
      assert.equal(user.x,point.x);assert.equal(user.z,point.z);assert.equal(user.rotation,point.rotation);
      world.release(user);assert.equal(user.x,exit.x);assert.equal(user.z,exit.z);
      assert.ok(nearbySeat({...exit,room:room.id},[]),`${room.id} nearby seat`);
    }
    for(const fixture of ROOM_DESIGNS[room.id].fixtures)assert.equal(isWalkable(fixture.x,fixture.z,room.id),false);
    for(const portal of campusPortals(room.id)) {
      let p={...roomArrival(room.id,portal.id),room:room.id};
      for(let i=0;i<18;i++)p={...p,...walkStep(p,{x:-Math.sin(portal.angle),z:-Math.cos(portal.angle)},.05)};
      assert.equal(portalAt(room.id,p)?.id,portal.id,`${room.id}/${portal.id}: cannot cross doorway`);
    }
  }
});

test('floor plans have distinct silhouettes and collision margins follow concave and curved edges',()=>{
  assert.equal(insideFootprint('studio',5,6),false,'L-shaped courtyard is outside');
  assert.equal(insideFootprint('studio',-5,6),true);
  assert.equal(insideFootprint('focus',10,8),false,'Oval corner is outside');
  assert.equal(insideFootprint('focus',0,7),true);
  assert.equal(insideFootprint('lounge',0,6),false,'Peanut waist is recessed');
  assert.equal(insideFootprint('lounge',5,5.5),true,'Lounge lobe remains usable');
  for(const room of ROOMS)for(const [x,z] of floorPlan(room.id).outline)assert.equal(insideFootprint(room.id,x,z),false,'Avatar margin excludes the perimeter');
});

test('every seat exit can be reached on foot from the entrance in each room',()=>{
  for(const room of ROOMS) {
    const step=.12,spawn=roomArrival(room.id),start=[Math.round(spawn.x/step),Math.round(spawn.z/step)],queue=[start],visited=new Set([start.join(',')]);
    for(let i=0;i<queue.length;i++) {
      const [x,z]=queue[i];
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,nz=z+dz,key=`${nx},${nz}`;
        if(!visited.has(key)&&isWalkable(nx*step,nz*step,room.id)){visited.add(key);queue.push([nx,nz]);}
      }
    }
    for(const table of roomTables(room.id))for(let seat=0;seat<6;seat++) {
      const p=standPosition(table.id,seat,room.id);
      assert.ok(queue.some(([x,z])=>Math.hypot(x*step-p.x,z*step-p.z)<.18),`${room.id}/${table.id}/${seat} is unreachable`);
    }
    for(const portal of campusPortals(room.id)) {
      const p=roomArrival(room.id,portal.id);
      assert.ok(queue.some(([x,z])=>Math.hypot(x*step-p.x,z*step-p.z)<.18),`${room.id}/${portal.id}: arrival is unreachable`);
    }
  }
});

test('all eight zone models preserve every chair hit target and remain within the mesh budget',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({
    fillRect(){},beginPath(){},moveTo(){},bezierCurveTo(){},stroke(){},fillText(){},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){},
    createRadialGradient(){return {addColorStop(){}};},
  })})};
  try {
    for(const room of ROOMS) {
      const scene=new THREE.Scene(),root=buildCampus(scene,room.id);root.updateMatrixWorld(true);
      const ray=new THREE.Raycaster();
      for(const portal of campusPortals(room.id)) {
        // A doorway must offer a long, unobstructed view and continuous flooring.
        const origin=portalPoint(portal,0,-.1);
        ray.set(new THREE.Vector3(origin.x,1.5,origin.z),new THREE.Vector3(-Math.sin(portal.angle),0,-Math.cos(portal.angle)));
        const front=ray.intersectObject(root,true)[0];
        assert.ok(!front||front.distance>16,`${room.id}/${portal.id}: blocked destination sightline at ${front?.distance} (${front?.point.toArray()})`);
        for(const z of [-.3,-3,-9,-15]) {
          const point=portalPoint(portal,0,z);
          ray.set(new THREE.Vector3(point.x,2,point.z),new THREE.Vector3(0,-1,0));
          const floor=ray.intersectObject(root,true)[0];
          assert.ok(floor&&Math.abs(floor.point.y)<.05,`${room.id}/${portal.id}: floor discontinuity at ${z}`);
        }
      }
      for(const table of roomTables(room.id))for(let seat=0;seat<6;seat++) {
        const p=seatPosition(table.id,seat,room.id);
        ray.set(new THREE.Vector3(p.x,1.3,p.z),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(root,true)[0];
        assert.equal(hit?.object.userData.table,table.id,`${room.id}/${table.id}/${seat} table hit`);
        assert.equal(hit?.object.userData.seat,seat,`${room.id}/${table.id}/${seat} seat hit`);
      }
      root.userData.animate?.(10,false);root.userData.animate?.(11,true);
      let count=0,triangles=0;const geometries=new Set(),materials=new Set(),textures=new Set();
      root.traverse(m=>{if(m.isMesh)count++;if(m.geometry){
        assert.ok(m.geometry.attributes.position.array.every(Number.isFinite),`${room.id}: invalid geometry`);
        geometries.add(m.geometry);
        triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);
      }if(m.material)materials.add(m.material);});
      assert.ok(count<400,`${room.id}: ${count} meshes exceeds budget`);
      assert.ok(triangles<400000,`${room.id}: ${triangles} triangles exceeds budget`);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();});textures.forEach(t=>t.dispose());
    }
  } finally {if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
