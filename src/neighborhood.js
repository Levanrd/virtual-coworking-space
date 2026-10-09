import * as THREE from 'three';
import { campusPortals } from '../shared/campus.js';
import { portalLocal } from '../shared/architecture.js';

// A zone owns its scenery. Adjacent zones are only lightweight doorway previews.
export function buildNeighborhood(root, id, {box,cyl,plant,sign,mat,animated}) {
  const green = id === 'park' || id === 'retreat';
  const stone = id === 'courtyard' || id === 'cafe';
  if(green) {
    box(root,[27,.018,2.2],[0,.012,0],id==='retreat'?'#c1ab88':'#d5c9a5','stone',0);
    box(root,[2.2,.018,23],[0,.013,0],'#d5c9a5','stone',0);
    for(const x of [-5,5]) for(const z of [-4,4]) cyl(root,2.9,.016,[x,.014,z],'#c4b99b','stone');
  } else {
    // Inset paving bands leave broad, legible pedestrian routes.
    for(const x of [-2,2]) box(root,[.06,.016,19],[x,.012,0],'#9d9985','stone',0);
    for(const z of [-8,8]) box(root,[22,.016,.06],[0,.012,z],'#9d9985','stone',0);
  }
  if(id==='cafe') {
    // An arcade wraps the café; it is scenery beyond the walkable perimeter.
    box(root,[15,4,.5],[0,2,-12],'#d5b996','paint',0);
    for(const x of [-5,0,5]) {
      box(root,[3.9,2.7,.08],[x,1.65,-11.7],'#667b75','paint',0);
      box(root,[4.2,.10,2],[x,3.4,-10.8],'#8d9e86','fabric',0);
    }
    sign(root,'CORNER CAFÉ','Coffee. Company. A slower moment.',[0,3.85,-11.6],6,'#654d39');
  }
  if(id==='courtyard') {
    for(const x of [-6,6]) {
      box(root,[5,3.5,.45],[x,1.75,-13],'#d8cfbc','stone',0);
      for(const dx of [-1.5,0,1.5]) box(root,[1.15,2.4,.06],[x+dx,1.7,-12.74],'#7d9693','paint',0);
    }
  }
  // Forest clusters use distance-switched instancing, never hundreds of objects.
  const portals=campusPortals(id);
  const positions=[];
  for(let i=0;i<(green?54:24);i++) {
    const angle=i*2.39996, radius=18+(i%5)*2.7;
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    if(portals.some(p=>{const q=portalLocal(p,x,z);return q.z<0&&Math.abs(q.x)<3.5;}))continue;
    positions.push([x,z,6+(i%4)*.65]);
  }
  for(let cluster=0;cluster<8;cluster++) {
  const clusterPositions=positions.filter((_,index)=>index%8===cluster);if(!clusterPositions.length)continue;
  const cx=clusterPositions.reduce((sum,p)=>sum+p[0],0)/clusterPositions.length,cz=clusterPositions.reduce((sum,p)=>sum+p[1],0)/clusterPositions.length;
  const lod=new THREE.LOD();lod.position.set(cx,0,cz);root.add(lod);
  for(const [detail,distance] of [[2,0],[0,23]]) {
    const group=new THREE.Group(), dummy=new THREE.Object3D();
    const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,detail),mat(id==='retreat'?'#617e67':'#81986a'),clusterPositions.length);
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.10,.15,1,6),mat('#7b7055'),clusterPositions.length);
    clusterPositions.forEach(([px,pz,h],i)=>{
      const x=px-cx,z=pz-cz;
      dummy.position.set(x,h*.78-2.65,z);dummy.scale.set(h*.28,h*.36,h*.28);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      dummy.position.set(x,h*.325-2.65,z);dummy.scale.set(1,h*.65,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    });
    crowns.userData.cameraIgnore=true;trunks.userData.cameraIgnore=true;
    group.add(crowns,trunks);lod.addLevel(group,distance);
  }
  }
  // A slow sway applies only to lightweight foreground foliage.

  if(id==='retreat') {
    const water=cyl(root,7,.04,[-23,-2.68,10],'#85adb2');water.castShadow=false;
    water.material=new THREE.MeshStandardMaterial({color:'#85adb2',roughness:.3,metalness:.12});
    water.userData.cameraIgnore=true;
  }
  root.userData.surface=stone?'stone':id==='park'?'grass':'wood';
}
