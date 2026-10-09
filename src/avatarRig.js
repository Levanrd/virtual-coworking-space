import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { APPEARANCE_DEFAULTS } from '../shared/avatar.js';

function block(parent, size, position, color) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(...size, 2, Math.min(...size) * 0.12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.82 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function joint(parent, x, y, z = 0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}
function roundedDetail(parent, position, scale, color, rotation = [0,0,0]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({color, roughness:.86}));
  m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);m.castShadow=true;parent.add(m);return m;
}
function addHair(head, {hair, hairstyle}) {
  // One continuous shell follows the rounded square head. Separate boxes and
  // overlapping strands produced a forehead band and visible intersections.
  const segments = 64;
  const positions = [0, .30, -.006], indices = [];
  const rings = [
    [.48, .298], [.84, .28], [.97, .247], [1, .205],
    [1, null], [.92, null],
  ];
  const square = value => Math.sign(value) * Math.pow(Math.abs(value), .28);
  for (let ring = 0; ring < rings.length; ring++) {
    const [radius, height] = rings[ring];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const front = THREE.MathUtils.smoothstep(Math.cos(angle), .35, .85);
      const hairline = THREE.MathUtils.lerp(hairstyle === 'bob' ? -.235 : -.055, .145, front)
        + front * .022 * Math.sin(angle * 2 + .4);
      const flare = hairstyle === 'bob' && ring >= 4 ? 1.06 : 1;
      positions.push(.246 * radius * square(Math.sin(angle)) * flare,
        height ?? hairline + (ring === 5 ? .008 : 0),
        .222 * radius * square(Math.cos(angle)) * flare - .006);
      const current = 1 + ring * segments + i;
      const next = 1 + ring * segments + (i + 1) % segments;
      if (ring === 0) indices.push(0, current, next);
      else {
        const previous = current - segments, previousNext = next - segments;
        indices.push(previous, current, next, previous, next, previousNext);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cap = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color:hair, roughness:.86}));
  cap.name = 'hair-cap';
  cap.castShadow = true;
  head.add(cap);
}
export function createAvatar(user) {
  user = { ...APPEARANCE_DEFAULTS, ...user };
  const root = new THREE.Group();
  root.userData.appearance = { gender: user.gender, outfit: user.outfit, pants: user.pants };
  const hips = joint(root, 0, 0.72);
  const torso = joint(hips, 0, 0);
  const width = user.gender === 'female' ? .43 : .48;
  block(torso, [width, 0.54, 0.29], [0, 0.27, 0], user.color);
  const head = joint(torso, 0, 0.78);
  block(head, [0.45, 0.44, 0.4], [0, 0, 0], user.skin);
  addHair(head, user);
  if (user.hairstyle !== 'bob') {
    roundedDetail(head,[-.23,-.035,0],[.045,.065,.045],user.skin);
    roundedDetail(head,[.23,-.035,0],[.045,.065,.045],user.skin);
  }
  if (user.hairstyle === "bun") {
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 16, 12),
      new THREE.MeshStandardMaterial({ color: user.hair }),
    );
    bun.position.set(0, 0.31, -0.13);
    bun.castShadow = true;
    head.add(bun);
  }
  for (const x of [-0.095, 0.095]) {
    roundedDetail(head,[x,.008,.206],[.018,.027,.009],'#343039');
    roundedDetail(head,[x-.004,.016,.215],[.004,.006,.003],'#fff6e9');
  }
  const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.046,-.074,.211),new THREE.Vector3(0,-.12,.217),new THREE.Vector3(.046,-.074,.211));
  const smile = new THREE.Mesh(new THREE.TubeGeometry(smileCurve,8,.006,5,false),new THREE.MeshStandardMaterial({color:'#704e43'}));head.add(smile);
  const trim = new THREE.Color(user.color).lerp(new THREE.Color('#e9dfcf'),.20);
  block(torso,[width-.02,.045,.30],[0,.034,0],trim);
  if (user.outfit === 'hoodie') block(torso,[.19,.10,.025],[0,.18,.157],user.color);
  // A soft hood and collar give the back-facing avatar a recognizable silhouette.
  if (user.outfit === 'hoodie') roundedDetail(torso,[0,.49,-.115],[.19,.075,.105],trim);
  else for (const y of [.36,.26,.16]) roundedDetail(torso,[0,y,.153],[.012,.012,.007],trim);
  block(torso,[.25,.025,.025],[0,.48,.151],trim);
  const legs = [],
    arms = [];
  for (const side of [-1, 1]) {
    const hip = joint(hips, side * 0.14, 0);
    block(hip, [0.18, 0.32, 0.21], [0, -0.16, 0], user.pants);
    const knee = joint(hip, 0, -0.32);
    const shin = block(knee, [0.18, 0.34, 0.21], [0, -0.17, 0], user.pants);
    const shoe = block(knee, [0.22, 0.12, 0.34], [0, -0.34, 0.07], "#f6f2eb");
    block(shoe,[.221,.022,.341],[0,-.045,0],'#d7d2c9');
    for(let i=0;i<3;i++)block(shoe,[.105,.008,.015],[0,.061,-.015+i*.04],'#dedacf');
    legs.push({ hip, knee, shin, shoe });
    const shoulder = joint(torso, side * (width / 2 + .10), 0.47);
    block(shoulder, [0.16, 0.25, 0.2], [0, -0.125, 0], user.color);
    const elbow = joint(shoulder, 0, -0.25);
    block(elbow, [0.15, 0.19, 0.18], [0, -0.095, 0], user.color);
    block(elbow,[.155,.035,.185],[0,-.177,0],trim);
    block(elbow, [0.15, 0.14, 0.18], [0, -0.235, 0], user.skin);
    arms.push({ shoulder, elbow });
  }
  root.userData.rig = {
    hips,
    torso,
    head,
    legs,
    arms,
    phase: 0,
    idleTime: 0,
    blend: 0,
    seated: null,
  };
  poseAvatar(root, { seated: !!user.table, speed: 0, airborne: false, dt: 0 });
  return root;
}

export function poseAvatar(
  root,
  { seated, speed, airborne, dt, reduced = false, gesture },
) {
  const rig = root.userData.rig;
  const changed = rig.seated !== seated;
  rig.seated = seated;
  const moving = !seated && !airborne ? Math.min(speed / 3.2, 1) : 0;
  rig.blend = changed
    ? 0
    : THREE.MathUtils.lerp(rig.blend, moving, 1 - Math.exp(-14 * dt));
  rig.phase += speed * dt * 4.1;
  rig.idleTime += dt;
  const swing = Math.sin(rig.phase) * rig.blend * (reduced ? 0.2 : 0.65);
  rig.hips.position.y = seated
    ? 0.68
    : 0.72 +
      (airborne || reduced
        ? 0
        : Math.abs(Math.sin(rig.phase * 2)) * rig.blend * 0.022);
  rig.hips.position.z = seated ? 0.04 : 0;
  rig.torso.rotation.x = seated ? -0.035 : airborne ? -0.08 : rig.blend * 0.05;
  rig.torso.position.y = reduced || airborne ? 0 : Math.sin(rig.idleTime*1.7)*.003;
  rig.head.rotation.y = reduced || moving || airborne ? 0 : Math.sin(rig.idleTime*.65)*.025;
  rig.head.rotation.x=gesture==='nod'&&!reduced&&!moving?Math.sin(rig.idleTime*7)*.14:0;
  for (let i = 0; i < 2; i++) {
    const leg = rig.legs[i],
      arm = rig.arms[i],
      opposite = i === 0 ? 1 : -1;
    leg.hip.rotation.x = seated
      ? -Math.PI / 2
      : airborne
        ? -0.32
        : swing * opposite;
    leg.knee.rotation.x = seated
      ? Math.PI / 2
      : airborne
        ? 0.65
        : Math.max(0, -swing * opposite) * 0.75;
    const shinLength = seated ? 0.6 : 0.34;
    leg.shin.scale.y = shinLength / 0.34;
    leg.shin.position.y = -shinLength / 2;
    leg.shoe.position.y = -shinLength;
    arm.shoulder.rotation.x = seated
      ? -0.4
      : airborne
        ? -1.1
        : -swing * opposite * 0.85;
    arm.shoulder.rotation.z = airborne ? opposite * 0.15 : 0;
    arm.elbow.rotation.x = seated ? -0.65 : airborne ? -0.35 : -0.08;
    if(!reduced&&!moving&&!airborne) {
      if(gesture==='wave'&&i===1){arm.shoulder.rotation.z=2.1;arm.shoulder.rotation.x=-.25;arm.elbow.rotation.x=-.6+Math.sin(rig.idleTime*10)*.35;}
      if(gesture==='stretch'&&!seated){arm.shoulder.rotation.z=opposite*-2.7;arm.elbow.rotation.x=-.25;}
      if(gesture==='clap'){arm.shoulder.rotation.x=-1.15;arm.shoulder.rotation.z=opposite*-.45;arm.elbow.rotation.x=-.4-Math.abs(Math.sin(rig.idleTime*9))*.5;}
    }
  }
}
