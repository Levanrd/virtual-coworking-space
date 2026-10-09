import {buildNeighborhood} from './neighborhood.js';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {roomTables, ROOM_DESIGNS} from '../shared/world.js';
import {buildRoomArchitecture} from './roomArchitecture.js';

// Every visible seat uses the same room data as authoritative server seating.
export function buildThemedRoom(scene, roomId) {
  const design = ROOM_DESIGNS[roomId] || ROOM_DESIGNS.focus;
  const outdoor = !!design.outdoor;
  const garden = roomId === 'terrace' || outdoor, lounge = roomId === 'lounge' || roomId === 'cafe';
  const root = new THREE.Group(); root.name = `${roomId} interior`; scene.add(root);
  const materials = new Map(), animated = [];
  function mat(color, type='paint') {
    const key = `${color}:${type}`;
    if (!materials.has(key)) {
      const material = new THREE.MeshStandardMaterial({color,roughness:type==='metal'?.35:.88,metalness:type==='metal'?.45:0});
      if(type==='wood' || type==='fabric') {
        const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,128,128);
        for(let i=0;i<64;i++) {
          ctx.fillStyle=i%2?'#ffffff0b':'#3020130b';
          if(type==='wood')ctx.fillRect((i*37)%128,0,1,128);
          else {ctx.fillRect(i*2,0,1,128);ctx.fillRect(0,i*2,128,1);}
        }
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(2,2);
        material.color.set('#ffffff');material.map=texture;
      }
      materials.set(key,material);
    }
    return materials.get(key);
  }
  function mesh(parent, geometry, position, color, type='paint') {
    const m=new THREE.Mesh(geometry,mat(color,type));m.position.set(...position);
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  const box=(p,s,v,c,t='paint',r=.025)=>mesh(p,r?new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(n=>n*.2))):new THREE.BoxGeometry(...s),v,c,t);
  const cyl=(p,r,h,v,c,t='paint')=>mesh(p,new THREE.CylinderGeometry(r,r,h,24),v,c,t);
  function group(p,x,z,angle=0) {const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;p.add(g);return g;}
  function sign(p,title,subtitle,v,width,ink='#384c43') {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.fillStyle=ink;ctx.textAlign='center';
    ctx.font='600 70px "DM Sans",sans-serif';ctx.fillText(title,512,108,980);
    ctx.font='400 28px "DM Sans",sans-serif';ctx.fillText(subtitle,512,178,980);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
    m.position.set(...v);m.userData.cameraIgnore=true;p.add(m);return m;
  }
  function plant(p,x,z,size=1,breeze=false) {
    const g=group(p,x,z);g.scale.setScalar(size);
    cyl(g,.19,.38,[0,.19,0],garden?'#b59277':'#d5c8af');cyl(g,.17,.012,[0,.385,0],'#514131');
    cyl(g,.018,.68,[0,.71,0],'#6f7252');
    const foliage=new THREE.Group();foliage.position.y=.5;g.add(foliage);
    const leaves=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),mat('#7d9869'),14);
    const transform=new THREE.Object3D();
    for(let i=0;i<14;i++) {
      const a=i*2.4;transform.position.set(Math.sin(a)*.18,i*.043,Math.cos(a)*.18);
      transform.rotation.set(.65*Math.cos(a),a,.55*Math.sin(a));transform.scale.set(.09,.21,.025);
      transform.updateMatrix();leaves.setMatrixAt(i,transform.matrix);
      leaves.setColorAt(i,new THREE.Color(['#72875d','#9aaf7b','#587753'][i%3]));
    }
    leaves.castShadow=true;leaves.userData.cameraIgnore=true;foliage.add(leaves);
    if(breeze)animated.push((time,reduced)=>{foliage.rotation.z=reduced?0:Math.sin(time*.65+x)*.035;});
    return g;
  }
  function chair(parent,offset,color,data) {
    const [x,z,angle]=offset,g=group(parent,x,z,angle);
    if(lounge) {
      box(g,[.70,.20,.68],[0,.48,0],color,'fabric',.09);
      box(g,[.74,.54,.17],[0,.78,-.29],color,'fabric',.075);
      for(const side of [-1,1])box(g,[.13,.35,.67],[side*.33,.6,0],color,'fabric',.06);
      for(const x of [-.25,.25])for(const z of [-.24,.24])box(g,[.055,.34,.055],[x,.17,z],'#664c36','wood');
    } else if(garden) {
      for(let i=0;i<5;i++)box(g,[.66,.07,.105],[0,.53,-.25+i*.125],'#b2936c','wood');
      for(let i=0;i<4;i++)box(g,[.66,.09,.05],[0,.74+i*.11,-.29],'#b2936c','wood');
      for(const x of [-.28,.28])for(const z of [-.25,.25])box(g,[.04,.52,.04],[x,.26,z],'#4e6250','metal');
      for(const x of [-.29,.29])box(g,[.035,.65,.035],[x,.74,-.30],'#4e6250','metal');
      box(g,[.59,.025,.51],[0,.578,0],color,'fabric',.05);
    } else {
      box(g,[.63,.14,.61],[0,.52,0],color,'fabric',.07);
      box(g,[.62,.57,.1],[0,.86,-.27],color,'fabric',.05);
      cyl(g,.045,.4,[0,.26,0],'#6e7975','metal');
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;const leg=box(g,[.035,.04,.55],[0,.06,0],'#6e7975','metal');leg.rotation.y=a;}
    }
    g.traverse(m=>{if(m.isMesh)m.userData={...data};});
  }
  function laptop(parent,x,z,angle,y=1.055) {
    const g=group(parent,x,z,angle+Math.PI);g.position.y=y;
    box(g,[.43,.025,.30],[0,0,0],'#9baba8','metal');
    box(g,[.34,.003,.13],[0,.016,-.035],'#556664');box(g,[.11,.003,.06],[0,.016,.10],'#c5cec9');
    box(g,[.43,.28,.026],[0,.14,-.135],'#5a6c68');
    box(g,[.38,.23,.008],[0,.14,-.118],'#d0e0d7');
    for(let i=0;i<3;i++)box(g,[.24-i*.04,.009,.003],[-.02,.20-i*.045,-.112],'#83a296');
    g.traverse(m=>{m.userData.cameraIgnore=true;});
  }
  function mug(p,x,z,y=1.06) {
    cyl(p,.055,.105,[x,y+.05,z],'#f3e8d5');cyl(p,.044,.004,[x,y+.105,z],'#6c4b32');
    const handle=mesh(p,new THREE.TorusGeometry(.036,.009,6,12),[x+.063,y+.06,z],'#f3e8d5');handle.rotation.y=Math.PI/2;
  }
  function deskLamp(p,x,z,angle=0) {
    const g=group(p,x,z,angle);cyl(g,.09,.025,[0,1.07,0],'#50645b','metal');
    cyl(g,.012,.32,[0,1.24,0],'#50645b','metal');
    box(g,[.19,.045,.12],[0,1.41,.045],'#50645b');box(g,[.16,.008,.10],[0,1.384,.045],'#fff0ba');
  }
  buildRoomArchitecture(root,roomId,{box,cyl,plant,sign});
  if(garden && !outdoor) {
    for(const x of [2.2,6.8])box(root,[.18,.19,4.1],[x,3.28,-3],'#a19174','wood');
    for(let z=-5;z<-1;z+=.35)box(root,[4.9,.10,.10],[4.5,3.42,z],'#b5a589','wood');
    for(let i=0;i<9;i++)cyl(root,.035,.07,[2.3+i*.55,3.15-Math.sin(i/8*Math.PI)*.18,-1.1],'#fff0c1');
  }
  if(outdoor) buildNeighborhood(root,roomId,{box,cyl,plant,sign,mat,animated});
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const shadowContext=shadowCanvas.getContext('2d'),gradient=shadowContext.createRadialGradient(32,32,5,32,32,32);
  gradient.addColorStop(0,'#302b2340');gradient.addColorStop(1,'#302b2300');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,64,64);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  const contactMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});
  for(const table of roomTables(roomId)) {
    const g=group(root,table.x,table.z);
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(lounge?4.7:5.1,lounge?4.7:3.5),contactMaterial);
    contact.rotation.x=-Math.PI/2;contact.position.y=.033;contact.userData.cameraIgnore=true;g.add(contact);
    if(lounge) {
      cyl(g,2.12,.016,[0,.005,0],table.id==='quiet'?'#939b80':'#b6a087','fabric');
      const top=cyl(g,.625,.08,[0,.71,0],'#c3a67d','wood');top.userData={table:table.id};
      cyl(g,.28,.67,[0,.34,0],'#826448','wood');
      box(g,[.30,.04,.23],[.17,.78,.10],'#73836c');box(g,[.26,.025,.20],[.14,.81,.09],'#e5d5b6');
      mug(g,-.25,.12,.75);mug(g,.16,-.25,.75);const pot=plant(g,-.18,-.18,.20);pot.position.y=.75;
      if(roomId==='cafe') {
        cyl(g,.035,3.1,[0,1.55,0],'#725d43','wood');
        mesh(g,new THREE.ConeGeometry(2.05,.42,12),[0,3.3,0],table.id==='quiet'?'#abb493':'#ddcdb1','fabric');
      } else {cyl(g,.27,.18,[0,3.25,0],'#dbc7a7');cyl(g,.012,1.1,[0,3.9,0],'#685443','metal');}

    } else if(garden) {
      for(let z=-.64;z<=.64;z+=.16)box(g,[3.4,.12,.14],[0,.98,z],'#b69a72','wood');
      for(const x of [-1.25,1.25])box(g,[.13,.94,1.0],[x,.47,0],'#516750','metal');
      const herb=plant(g,-.45,0,.25,true);herb.position.y=1.05;mug(g,.5,.05);
      for(const seat of [0,4]){const p=table.seatOffsets[seat];laptop(g,p[0],p[1]*.48,p[2]);}
      box(g,[.3,.025,.23],[.95,1.06,.06],'#dfd4a7');
    } else {
      box(g,[3.7,.012,2.8],[0,.006,0],'#aebeb4','fabric');
      for(const [x,z,angle] of table.seatOffsets) {
        const d=group(g,x,z*.5,angle);
        const top=box(d,[1.06,.09,.72],[0,1.0,0],'#dbccb0','wood');top.userData={table:table.id};
        for(const dx of [-.43,.43])for(const dz of [-.26,.26])box(d,[.035,.97,.035],[dx,.49,dz],'#8a9990','metal');
        laptop(g,x,z*.50,angle);deskLamp(g,x+.37,z*.50,angle);
        box(d,[.028,.42,.73],[-.55,1.23,0],'#9cad9f','fabric');
      }
      box(g,[3.55,.58,.08],[0,1.30,0],'#90a598','fabric');
    }
    table.seatOffsets.forEach((offset,seat)=>chair(g,offset,
      lounge?['#ba916d','#85947f','#c1a486','#9e7f6b'][roomTables(roomId).indexOf(table)]:garden?'#bdc9a4':'#92a799',
      {table:table.id,seat}));
  }
  for(const fixture of design.fixtures) {
    if(fixture.type==='pergola-post') {box(root,[fixture.w,3.25,fixture.d],[fixture.x,1.625,fixture.z],'#95866b','wood');continue;}
    if(fixture.type==='plant') {plant(root,fixture.x,fixture.z,1.45,outdoor);continue;}
    if(fixture.type==='fountain') {cyl(root,1.25,.42,[fixture.x,.21,fixture.z],'#b6b3a1','stone');cyl(root,1.1,.012,[fixture.x,.43,fixture.z],'#88b6b9');cyl(root,.25,.5,[fixture.x,.68,fixture.z],'#c8c4b0','stone');continue;}
    const g=group(root,fixture.x,fixture.z,fixture.angle??(fixture.x<0?Math.PI/2:-Math.PI/2));
    if(fixture.type==='bookcase') {
      box(g,[3.2,2.5,.45],[0,1.25,0],'#9b957c','wood');
      for(let row=0;row<4;row++) {
        box(g,[3.1,.07,.53],[0,.32+row*.59,.04],'#d1c4a7','wood');
        for(let i=0;i<13;i++)box(g,[.12+(i%2)*.025,.27+(i%3)*.07,.24],[-1.38+i*.22,.50+row*.59,.16],['#74897d','#d5c4a4','#a08e7c','#81989b'][i%4]);
      }
    } else if(fixture.type==='coffee-bar') {
      box(g,[3,1.02,.56],[0,.51,0],'#7b6249','wood');box(g,[3.1,.07,.64],[0,1.06,0],'#dfcdb1');
      box(g,[.7,.5,.36],[-.65,1.33,0],'#4b5149','metal');
      for(const x of [-.83,-.50]){cyl(g,.04,.12,[x,1.24,.2],'#b0a998','metal');mug(g,x,.24,1.095);}
      for(let i=0;i<3;i++)mug(g,.3+i*.25,.12,1.095);
      sign(g,'Coffee & company','Help yourself to a slower moment',[0,2.2,.31],2.8,'#745a40');
    } else if(fixture.type==='fireplace') {
      box(g,[2.7,3.4,.46],[0,1.7,0],'#95836e');box(g,[1.8,1,.06],[0,.82,.25],'#403d34');
      box(g,[2.9,.12,.57],[0,1.5,.01],'#c9b897');
      for(let i=0;i<5;i++) {
        const fire=mesh(g,new THREE.ConeGeometry(.11,.35+i%2*.14,8),[-.56+i*.28,.63,.31],'#dc9b57');
        fire.material=new THREE.MeshStandardMaterial({color:'#e6ae65',emissive:'#dd8640',emissiveIntensity:.65});
        fire.userData.dynamic=true;animated.push((t,reduced)=>{fire.scale.y=reduced?1:1+Math.sin(t*2.5+i)*.12;});
      }
    } else if(fixture.type==='planter') {
      box(g,[fixture.d,.58,fixture.w],[0,.29,0],'#b5a28b','wood');box(g,[fixture.d-.10,.03,fixture.w-.08],[0,.59,0],'#5c5840');
      for(let i=0;i<5;i++){const herb=plant(g,-fixture.d/2+.35+i*.68,0,.8,true);herb.position.y=.4;}
    }
  }
  if(!garden&&!lounge) {
    const clock=group(root,0,-8.6);cyl(clock,.30,.045,[0,3.98,0],'#ebede1').rotation.x=Math.PI/2;
    for(const [length,speed] of [[.16,1/43200],[.23,1/3600]]) {
      const pivot=new THREE.Group();pivot.position.set(0,3.98,.04);clock.add(pivot);
      const hand=box(pivot,[.015,length,.015],[0,length/2,0],'#52695e');hand.userData.dynamic=true;
      animated.push(()=>{const now=new Date();const seconds=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();pivot.rotation.z=-seconds*speed*Math.PI*2;});
    }
  }
  sign(root,design.label,design.hint,[0,.018,5.5],2.5,lounge?'#e2cbae':'#536d50').rotation.x=-Math.PI/2;
  // Batch static meshes while retaining the identity of each selectable chair.
  root.updateMatrixWorld(true);const batches=new Map();
  root.traverse(m=>{
    if(!m.isMesh||m.isInstancedMesh||m.userData.dynamic)return;
    const key=`${m.material.uuid}:${JSON.stringify(m.userData)}:${m.castShadow}`;
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);
  });
  for(const pieces of batches.values()) {
    if(pieces.length<2)continue;
    const geometries=pieces.map(m=>(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const combined=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!combined)continue;
    const m=new THREE.Mesh(combined,pieces[0].material);m.userData={...pieces[0].userData};m.castShadow=pieces[0].castShadow;m.receiveShadow=true;
    pieces.forEach(p=>{p.removeFromParent();p.geometry.dispose();});root.add(m);
  }
  root.userData.animate=(time,reduced)=>animated.forEach(update=>update(time,reduced));
  return root;
}
