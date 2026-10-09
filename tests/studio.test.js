import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildStudio } from '../src/studioRoom.js';
import { TABLES, seatPosition } from '../shared/world.js';

test('batched Studio geometry preserves all 24 individual chair raycast targets', () => {
  // Textures are not rasterized in Node. Exercise the actual scene geometry,
  // transforms and batching rather than mocking the picking calculation.
  const previous = globalThis.document;
  globalThis.document = {createElement: () => ({width:0,height:0,getContext: () => ({
    fillRect(){},beginPath(){},moveTo(){},bezierCurveTo(){},stroke(){},fillText(){},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){},
    createRadialGradient(){return {addColorStop(){}};},
  })})};
  let scene;
  try {
    scene = new THREE.Scene();const root=buildStudio(scene);root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster();
    for(const table of TABLES) for(let seat=0;seat<table.seats;seat++) {
      const p=seatPosition(table.id,seat);
      ray.set(new THREE.Vector3(p.x,1.35,p.z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(root,true)[0];
      assert.equal(hit?.object.userData.table,table.id,`${table.id} seat ${seat}: table`);
      assert.equal(hit?.object.userData.seat,seat,`${table.id} seat ${seat}: seat`);
    }
    let meshes=0;root.traverse(o=>{if(o.isMesh)meshes++;});
    assert.ok(meshes<400,`Static scene exceeded its 400-mesh budget: ${meshes}`);
  } finally {
    if(previous===undefined)delete globalThis.document;else globalThis.document=previous;
    const geometry=new Set(),material=new Set(),texture=new Set();
    scene?.traverse(o=>{if(o.geometry)geometry.add(o.geometry);if(o.material)material.add(o.material);});
    material.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)texture.add(v);m.dispose();});
    geometry.forEach(g=>g.dispose());texture.forEach(t=>t.dispose());
  }
});
