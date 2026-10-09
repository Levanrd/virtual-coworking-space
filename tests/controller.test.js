import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createThirdPerson} from '../src/thirdPerson.js';
import {WorldState} from '../server/state.js';
import {seatPosition} from '../shared/world.js';

test('third-person controller moves, jumps, exits chairs, clears input on blur and eases camera',{concurrency:false},async()=>{
  const previousWindow=globalThis.window, previousDocument=globalThis.document;
  const win=new EventTarget(), doc=new EventTarget();
  doc.querySelector=()=>null;doc.activeElement=null;
  globalThis.window=win;globalThis.document=doc;
  const element=new EventTarget();element.style={};element.setAttribute=()=>{};
  const state=new WorldState(),self=state.add('controller');
  const camera=new THREE.PerspectiveCamera(),geometry=new THREE.Group();
  let moves=0;
  const props={self,users:[self],roomId:'studio',onMove:()=>moves++,onJump:async({motionVersion})=>state.jump(self,motionVersion),onStand:async()=>state.release(self),onRoom:async()=>{}};
  const controller=createThirdPerson({camera,element,geometry,getState:()=>props});
  let now=performance.now();
  function frame(){const p=controller.update(now+=1000/60);controller.follow({x:p.x,y:p.y || 0,z:p.z});return p;}
  try{
    frame();controller.direction('w',true);
    let p;for(let i=0;i<60;i++)p=frame();
    assert.ok(p.z<3 && moves>0);
    win.dispatchEvent(new Event('blur'));const stopped=frame();assert.equal(frame().z,stopped.z);
    props.transitioning=true;controller.direction('w',true);const held=frame();
    assert.equal(frame().z,held.z);props.transitioning=false;assert.equal(frame().z,held.z);
    controller.zoom(.5);assert.equal(controller.getView().distance,4.2);
    await controller.jump();const airborne=controller.update(performance.now()+360);assert.ok(airborne.y>0.9);
    state.join(self,{table:'design',seat:0});p=frame();assert.equal(p.table,'design');
    const seat=seatPosition('design',0);controller.follow({x:seat.x,y:0,z:seat.z});
    const before=camera.position.clone();await controller.jump();p=frame();
    assert.equal(self.table,null);assert.ok(camera.position.distanceTo(before)<0.5);
    controller.turn(Math.PI*2+0.3);for(let i=0;i<30;i++)frame();
    assert.ok(camera.position.toArray().every(Number.isFinite));
  }finally{controller.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
