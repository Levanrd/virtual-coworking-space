import * as THREE from 'three';
import {ROOM_DESIGNS} from '../shared/world.js';
import {floorPlan,portalLocal} from '../shared/architecture.js';
import {campusPortals} from '../shared/campus.js';
import {buildPortalInterior} from './portalInteriors.js';

// Small repeatable PBR maps, generated once per room. No downloaded assets,
// transmission passes, screen-space reflections or extra shadow-casting lights.
function finish(kind,color) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
  let seed=73;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  if(kind==='wood') {
    for(let plank=0;plank<8;plank++) {
      ctx.fillStyle=plank%2?'#ffffff10':'#2c180b0b';ctx.fillRect(plank*32,0,32,256);
      for(let j=0;j<24;j++){ctx.fillStyle=j%2?'#37200d12':'#ffffff13';ctx.fillRect(plank*32+random()*31,random()*80,random()*.6+.2,180);}
      ctx.fillStyle='#38291335';ctx.fillRect(plank*32,0,.7,256);ctx.fillRect(plank*32,(plank%3)*80+30,32,.6);
    }
  } else {
    for(let i=0;i<8000;i++){ctx.fillStyle=i%2?'#ffffff10':'#2d2b2710';ctx.fillRect(random()*256,random()*256,1,1);}
    if(kind==='stone'){ctx.fillStyle='#4d4b3c23';ctx.fillRect(0,0,256,1);ctx.fillRect(0,0,1,256);}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  const bump=texture.clone();bump.colorSpace=THREE.NoColorSpace;
  return new THREE.MeshStandardMaterial({color:'#fff',map:texture,bumpMap:bump,bumpScale:kind==='wood'?.013:.018,roughness:kind==='wood'?.68:.92});
}
export function buildRoomArchitecture(root,roomId,{box,cyl,plant,sign}) {
  const plan=floorPlan(roomId),outline=plan.outline,portals=campusPortals(roomId);
  const outdoor=!!ROOM_DESIGNS[roomId]?.outdoor;
  const garden=roomId==='terrace'||outdoor,lounge=roomId==='lounge',studio=roomId==='studio';
  const wallColor=lounge?'#d4bfa5':studio?'#e7dfcd':'#dbe0d4';
  const trim=lounge?'#795d45':garden?'#738064':'#a79c86';
  const floorMaterial=finish(roomId==='focus'||outdoor&&ROOM_DESIGNS[roomId].surface!=='wood'?'stone':'wood',outdoor?(ROOM_DESIGNS[roomId].surface==='grass'?'#93a57a':ROOM_DESIGNS[roomId].surface==='stone'?'#c8beaa':'#b79b74'):garden?'#b79b74':lounge?'#ab8965':studio?'#cdbb94':'#c8cec4');
  const plaster=finish('plaster',wallColor);
  const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
  const slab=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false,steps:1,curveSegments:1}),floorMaterial);
  slab.rotation.x=-Math.PI/2;slab.position.y=-.16;slab.receiveShadow=true;root.add(slab);
  const foundation=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:false,steps:1}),new THREE.MeshStandardMaterial({color:'#aaa18c',roughness:.94}));
  foundation.rotation.x=-Math.PI/2;foundation.position.y=-2.66;foundation.receiveShadow=true;root.add(foundation);
  // Map floor grain in world units rather than stretching it across the polygon.
  const uv=slab.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/4,uv.getY(i)/4);
  const glass=new THREE.MeshStandardMaterial({color:'#d9e9e7',roughness:.2,metalness:.1,transparent:true,opacity:.10,depthWrite:false,side:THREE.DoubleSide});
  function boundaryPiece(a,b,index) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
    const g=new THREE.Group();g.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=-Math.atan2(dz,dx);root.add(g);
    const add=(size,pos,color,type='paint')=>box(g,size,pos,color,type,0);
    if(outdoor) {
      add([length+.025,.12,.24],[0,-.04,0],'#b8b59a','stone');
    } else if(garden) {
      add([length+.025,.2,.21],[0,-.04,0],'#d7ceb4');
      add([length,.055,.045],[0,1.02,0],trim,'metal');
      add([.045,1.04,.045],[-length/2,.5,0],trim,'metal');
      add([length,.025,.025],[0,.48,0],trim,'metal');
    } else {
      const base=add([length+.035,.48,.20],[0,.24,0],wallColor);base.material=plaster;
      const crown=add([length+.035,.55,.20],[0,plan.height-.275,0],wallColor);crown.material=plaster;
      add([length+.02,.07,.26],[0,.51,0],trim,'wood');
      add([length+.02,.08,.24],[0,plan.height-.59,0],trim,'wood');
      if(index%5===0&&roomId==='focus') {
        const panel=add([length+.015,plan.height-1.02,.13],[0,plan.height/2,0],'#b2bba8','fabric');panel.material=plaster;
      } else {
        const pane=add([length,plan.height-1.1,.015],[0,plan.height/2,0],'#d9e9e7');pane.material=glass;pane.castShadow=false;pane.userData.cameraIgnore=true;
      }
      add([.045,plan.height-.9,.075],[-length/2,plan.height/2,0],trim,'metal');
      add([length,.028,.065],[0,2.15,0],trim,'metal');
    }
  }
  // Subdivide long straight walls and clip actual door openings on curved edges.
  let index=0;
  for(let i=0;i<outline.length;i++) {
    const a=outline[i],b=outline[(i+1)%outline.length],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.6);
    for(let j=0;j<count;j++) {
      const start=[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count];
      const end=[a[0]+(b[0]-a[0])*(j+1)/count,a[1]+(b[1]-a[1])*(j+1)/count];
      let pieces=[[start,end]];
      for(const portal of portals)pieces=pieces.flatMap(([s,e])=>{
        const ls=portalLocal(portal,...s),le=portalLocal(portal,...e);
        if(Math.min(Math.abs(ls.z),Math.abs(le.z))>.8||Math.max(ls.x,le.x)<-2.0||Math.min(ls.x,le.x)>2.0)return [[s,e]];
        const delta=le.x-ls.x;if(Math.abs(delta)<.0001)return [];
        const times=[0,1,...[-2,2].map(x=>(x-ls.x)/delta).filter(t=>t>0&&t<1)].sort((a,b)=>a-b),result=[];
        for(let k=0;k<times.length-1;k++){
          const t=times[k],u=times[k+1],mid=ls.x+delta*(t+u)/2;
          if(Math.abs(mid)>2)result.push([[s[0]+(e[0]-s[0])*t,s[1]+(e[1]-s[1])*t],[s[0]+(e[0]-s[0])*u,s[1]+(e[1]-s[1])*u]]);
        }return result;
      });
      pieces.forEach(([s,e])=>boundaryPiece(s,e,index++));
    }
  }
  if(!garden) {
    // A long rooflight reveals sky and lights the circulation spine naturally.
    const roofShape=shape.clone(),hole=new THREE.Path();
    const skylight=studio?[[-8,-1],[-2,-1],[-2,9],[-8,9]]:[[-2,-3.5],[2,-3.5],[2,3.5],[-2,3.5]];
    skylight.forEach(([x,z],i)=>i?hole.lineTo(x,-z):hole.moveTo(x,-z));hole.closePath();roofShape.holes.push(hole);
    const ceiling=new THREE.Mesh(new THREE.ShapeGeometry(roofShape),new THREE.MeshStandardMaterial({color:wallColor,roughness:.95,side:THREE.DoubleSide}));
    ceiling.rotation.x=-Math.PI/2;ceiling.position.y=plan.height;ceiling.receiveShadow=true;root.add(ceiling);
    for(let i=0;i<skylight.length;i++) {
      const a=skylight[i],b=skylight[(i+1)%skylight.length],beam=box(root,[Math.hypot(a[0]-b[0],a[1]-b[1]),.18,.12],[(a[0]+b[0])/2,plan.height-.05,(a[1]+b[1])/2],trim,'wood',0);
      beam.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);
    }
  }
  for(const portal of portals) {
    const g=new THREE.Group();g.position.set(portal.x,0,portal.z);g.rotation.y=portal.angle;root.add(g);
    for(const x of [-1.91,1.91])box(g,[.22,3.55,.36],[x,1.775,0],trim,'wood',.025);
    box(g,[4.08,.65,.38],[0,3.58,0],wallColor,'paint',.03);
    if(!garden)box(g,[4.12,Math.max(.1,plan.height-3.9),.22],[0,(plan.height+3.9)/2,0],wallColor,'paint',0);
    sign(g,portal.name,'Walk through to enter',[0,3.58,.205],3.55,lounge?'#5b4433':'#3d5143');
    box(g,[3.65,.014,1.8],[0,.008,-.25],garden?'#c0b39a':'#c7c9b8','stone',0);
    const interior=buildPortalInterior(g,{...portal,x:0},{box,cyl,plant});interior.position.z=7;
  }
  // Sparse distant trees and skyline keep the perimeter glazing visually open.
  const landscape=new THREE.Mesh(new THREE.CylinderGeometry(55,55,.12,64),new THREE.MeshStandardMaterial({color:'#91a180',roughness:1}));
  landscape.position.y=-2.72;landscape.receiveShadow=true;landscape.userData.cameraIgnore=true;root.add(landscape);
  for(let i=0;i<12;i++) {
    const t=i*Math.PI/6,x=Math.cos(t)*20,z=Math.sin(t)*19;
    if(portals.some(p=>{const local=portalLocal(p,x,z);return local.z<0&&Math.abs(local.x)<3.5;}))continue;
    plant(root,x,z,2.2+i%3*.25).position.y=-2.66;
    if(i%2===0){const height=4+i%3*2,tower=box(root,[3,height,3],[x*1.7,height/2-2.66,z*1.7],'#becdd0','paint',0);tower.castShadow=false;}
  }
  root.userData.floorPlan=plan.name;
}
