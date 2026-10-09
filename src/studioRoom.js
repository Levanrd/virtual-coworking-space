import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roomTables, SEAT_OFFSETS, ROOM_DESIGNS } from '../shared/world.js';
import { buildRoomArchitecture } from './roomArchitecture.js';

// Original, locally generated materials: no network assets or per-frame texture work.
function surface(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = kind === 'oak' ? 1024 : 128;
  const c = canvas.getContext('2d');
  let seed = 41;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const n = canvas.width;
  if (kind === 'oak') {
    for (let plank = 0; plank < 8; plank++) {
      const x = plank * 128;
      c.fillStyle = `hsl(33 36% ${61 + random() * 6}%)`;
      c.fillRect(x, 0, 128, n);
      for (let grain = 0; grain < 85; grain++) {
        const gx = x + random() * 128;
        c.strokeStyle = `rgba(99,70,39,${.025 + random() * .045})`;
        c.lineWidth = .3 + random() * 1.2;
        c.beginPath(); c.moveTo(gx, 0);
        c.bezierCurveTo(gx + 7, 240, gx - 9, 650, gx + 2, 1024); c.stroke();
      }
      c.fillStyle = '#88755645'; c.fillRect(x, 0, 1.4, n);
      const seam = 190 + (plank % 3) * 270;
      c.fillRect(x, seam, 128, 1.5);
    }
  } else {
    const pixels = c.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const v = 165 + random() * 55 + ((x + y) % 2) * 20;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v;
      pixels.data[i + 3] = 255;
    }
    c.putImageData(pixels, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (kind === 'oak') texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(kind === 'oak' ? 2 : 5, kind === 'oak' ? 3 : 5);
  return texture;
}

export function buildStudio(scene) {
  const root = new THREE.Group(); root.name = 'The Studio'; scene.add(root);
  const oak = surface('oak'), weave = surface('weave');
  const deskOak = oak.clone(); deskOak.repeat.set(.65, .26);
  const materials = new Map();
  function mat(color, type = 'paint') {
    const key = `${color}:${type}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: type === 'metal' ? .3 : type === 'fabric' ? .95 : .65,
      metalness: type === 'metal' ? .55 : 0,
      ...(type === 'wood' ? {map: deskOak, roughness: .66} : {}),
      ...(type === 'fabric' ? {bumpMap: weave, bumpScale: .008} : {}),
    }));
    return materials.get(key);
  }
  function put(parent, geometry, material, p, shadow = true) {
    const m = new THREE.Mesh(geometry, material); m.position.set(...p);
    m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, size, p, color, type = 'paint', radius = .035) {
    return put(parent, radius ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(n => n * .28))) : new THREE.BoxGeometry(...size), mat(color, type), p);
  }
  function cyl(parent, top, bottom, h, p, color, type = 'paint', segments = 24) {
    return put(parent, new THREE.CylinderGeometry(top, bottom, h, segments), mat(color, type), p);
  }
  function sign(parent, title, subtitle, p, width, ink = '#414735') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 320;
    const c = canvas.getContext('2d'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ink;
    c.font = '600 88px "DM Sans", sans-serif'; c.fillText(title, 512, subtitle ? 115 : 160, 970);
    if (subtitle) { c.font = '400 29px "DM Sans", sans-serif'; c.fillText(subtitle, 512, 220, 970); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const m = put(parent, new THREE.PlaneGeometry(width, width * .3125), new THREE.MeshBasicMaterial({map:texture, transparent:true, depthWrite:false}), p, false);
    m.userData.cameraIgnore = true; return m;
  }
  // Soft baked contact shadows complement the live directional shadows.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const sc = shadowCanvas.getContext('2d'), gradient = sc.createRadialGradient(32,32,3,32,32,32);
  gradient.addColorStop(0,'#3c302540'); gradient.addColorStop(.55,'#3c302522'); gradient.addColorStop(1,'#3c302500');
  sc.fillStyle = gradient; sc.fillRect(0,0,64,64);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const contactMaterial = new THREE.MeshBasicMaterial({map:shadowTexture, transparent:true, depthWrite:false});
  function contact(parent, x, z, w, d) {
    const m = put(parent, new THREE.PlaneGeometry(w,d), contactMaterial, [x,.008,z], false);
    m.rotation.x = -Math.PI/2; m.userData.cameraIgnore = true;
  }
  function plant(parent, x, z, scale = 1) {
    const g = new THREE.Group(); g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    cyl(g,.28,.21,.48,[0,.24,0],'#e4d7c5');
    cyl(g,.282,.282,.035,[0,.465,0],'#f2e8d9');
    cyl(g,.25,.25,.012,[0,.485,0],'#55452f');
    cyl(g,.022,.032,1.1,[0,1.02,0],'#6e7350', 'paint', 8);
    const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6), mat('#638552'), 22);
    const transform = new THREE.Object3D();
    for(let i=0;i<22;i++) {
      const a=i*2.399, t=i/22, spread=.16+Math.sin(t*Math.PI)*.2;
      transform.position.set(Math.cos(a)*spread,.62+t*1.05,Math.sin(a)*spread);
      transform.rotation.set(Math.sin(a)*.8,a,Math.cos(a)*.9);
      transform.scale.set(.11+(i%3)*.025,.23+(i%4)*.025,.023);
      transform.updateMatrix();leaves.setMatrixAt(i,transform.matrix);
      leaves.setColorAt(i,new THREE.Color(['#8d9f6e','#b3bf82','#789764'][i%3]));
    }
    leaves.castShadow = true; leaves.receiveShadow = true; leaves.userData.cameraIgnore = true; g.add(leaves);
    contact(g,0,0,.9,.9);return g;
  }
  function chair(parent,x,z,rotation,color,data) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);
    box(g,[.70,.18,.66],[0,.5,0],color,'fabric',.1);
    const back=box(g,[.70,.59,.17],[0,.85,-.28],color,'fabric',.1);back.rotation.x=-.06;
    for(const side of [-1,1]) {
      box(g,[.065,.12,.45],[side*.325,.67,-.01],color,'fabric');
      cyl(g,.017,.017,.25,[side*.315,.56,.13],'#877866','metal',8);
    }
    cyl(g,.047,.058,.38,[0,.25,0],'#807767','metal',12);
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      const foot=box(g,[.035,.04,.34],[Math.sin(a)*.14,.075,Math.cos(a)*.14],'#8d8172','metal',.01);foot.rotation.y=a;
      const wheel=cyl(g,.047,.047,.045,[Math.sin(a)*.29,.047,Math.cos(a)*.29],'#554f49','paint',12);wheel.rotation.z=Math.PI/2;
    }
    if(data)g.traverse(o=>{if(o.isMesh)o.userData={...data};});
    contact(parent,x,z,.95,.95);return g;
  }
  function laptop(parent,x,z,angle=0){
    // Placement uses the chair's heading; the screen must face back toward it.
    const g=new THREE.Group();g.position.set(x,1.07,z);g.rotation.y=angle+Math.PI;parent.add(g);
    box(g,[.48,.025,.33],[0,0,0],'#aaa9a5','metal',.012);
    box(g,[.39,.003,.15],[0,.015,-.045],'#686b68','paint',.008);
    box(g,[.14,.003,.08],[0,.015,.092],'#c9c9c2','metal',.008);
    const screen=box(g,[.48,.31,.024],[0,.16,-.155],'#828881','metal',.016);screen.rotation.x=-.1;
    box(g,[.42,.25,.005],[0,.162,-.134],'#c6d7cd','paint',.008);
    for(let i=0;i<4;i++)box(g,[.24-i*.035,.009,.004],[-.04,.24-i*.044,-.129],i===0?'#889b91':'#9dafab','paint',0);
    g.traverse(o=>{o.userData.cameraIgnore=true;});
  }

  buildRoomArchitecture(root,'studio',{box,plant,sign,cyl:(parent,r,h,p,color,type)=>cyl(parent,r,r,h,p,color,type)});
  // Pin-up walls and material shelves give the studio a workshop identity.
  for(const fixture of ROOM_DESIGNS.studio.fixtures) {
    const side=fixture.x<0?-1:1;
    const board = new THREE.Group();board.position.set(fixture.x,0,fixture.z);board.rotation.y=side<0?Math.PI/2:-Math.PI/2;root.add(board);
    box(board,[3.7,1.8,.12],[0,2.0,0],'#b19c80','wood');
    box(board,[3.5,1.6,.04],[0,2.0,.08],'#f1eadb');
    sign(board,side<0?'Make room for ideas.':'From sketch to something.', 'The studio / project wall',[0,2.57,.11],3.2);
    for(let i=0;i<6;i++) {
      const note=box(board,[.36,.31,.008],[-1.15+(i%3)*.72,1.70+Math.floor(i/3)*.42,.113],['#c1cbb2','#d5b69a','#c1b5cf'][i%3]);note.rotation.z=(i%3-1)*.06;
    }
    box(board,[3.6,.72,.35],[0,.36,0],'#c0af91','wood');
    for(let i=0;i<7;i++)box(board,[.27,.12+i%3*.07,.22],[-1.35+i*.43,.80,0],['#b9aa91','#a4b39d','#ad9bb9'][i%3]);
  }
  for(const table of roomTables('studio')){
    const g=new THREE.Group();g.position.set(table.x,0,table.z);root.add(g);
    const top=box(g,[3.65,.14,1.5],[0,.98,0],'#fff7e9','wood',.055);top.userData={table:table.id};
    for(const side of [-1,1]){box(g,[.13,.92,1.08],[side*1.42,.48,0],'#a18c6e','paint',.035);box(g,[3.0,.08,.12],[0,.30,0],'#b09a7d');}
    const palette={design:'#b8a5cb',builders:'#d9b594',quiet:'#a5b7a4',open:'#c6a29b'};
    for(let seat=0;seat<6;seat++){const p=SEAT_OFFSETS[seat];chair(g,p[0],p[1],p[2],palette[table.id],{table:table.id,seat});if([0,2,4].includes(seat))laptop(g,p[0],p[1]*.51,seat>2?Math.PI:0);}
    cyl(g,.085,.07,.17,[.58,1.15,.10],'#eee7d9');
    const handle=put(g,new THREE.TorusGeometry(.057,.012,6,12),mat('#eee7d9'),[.675,1.16,.1]);handle.rotation.y=Math.PI/2;
    const pot=plant(g,-.55,0,.24);pot.position.y=1.06;
    box(g,[.4,.04,.30],[.96,1.07,.08],'#91a38e');box(g,[.37,.027,.29],[.98,1.104,.075],'#eee7d5');
    if(table.id==='design'||table.id==='quiet') {
      for(let i=0;i<4;i++){const sheet=box(g,[.22,.004,.17],[-.12+i*.23,1.055,-.06],['#d8c2ae','#bcb4cf','#b5c6ad','#e4d0a2'][i]);sheet.rotation.y=.2*i;}
      cyl(g,.035,.035,.14,[-.80,1.12,.12],'#ba9d73');
    } else {
      for(let i=0;i<3;i++)box(g,[.13,.09+i*.05,.13],[-.30+i*.20,1.10+i*.025,.05],['#aabca8','#c1ad91','#b5a5c6'][i]);
    }
    contact(root,table.x,table.z,4.6,2.9);
    cyl(root,.016,.016,1.05,[table.x,4.96,table.z],'#8f7a5e','metal',8);
    cyl(root,.25,.48,.22,[table.x,4.36,table.z],'#d2bd99');
    const diffuser=cyl(root,.41,.41,.012,[table.x,4.246,table.z],'#fff0c9');diffuser.material=new THREE.MeshStandardMaterial({color:'#fff0d1',emissive:'#ffe1a2',emissiveIntensity:.6});
  }
  // Planting remains outside the chair exits and the central route to all doorways.
  for(const [x,z,s] of [[-8.7,-7.5,1.45],[8.6,-7.5,1.55],[-8.7,9.5,1.5],[-.2,9.5,1.25]])plant(root,x,z,s);
  const wayfinding=sign(root,'↑  Find your place','The studio / Common Ground',[0,.011,-4.9],2.6,'#6a7758');wayfinding.rotation.x=-Math.PI/2;
  // Static architecture/materials never need animation or repeated shadow-map renders.
  root.updateMatrixWorld(true);
  // Merge static pieces by material AND interaction identity. A chair retains its
  // table/seat hit target; decor cannot accidentally become a selectable chair.
  const batches = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const key = `${o.material.uuid}:${o.castShadow}:${JSON.stringify(o.userData)}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(o);
  });
  for (const pieces of batches.values()) {
    if (pieces.length < 2) continue;
    const geometries = pieces.map(o => {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      return g.applyMatrix4(o.matrixWorld);
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, pieces[0].material);
    m.userData = {...pieces[0].userData};m.castShadow = pieces[0].castShadow;m.receiveShadow = true;
    pieces.forEach(o => { o.removeFromParent(); o.geometry.dispose(); });
    root.add(m);
  }
  return root;
}
