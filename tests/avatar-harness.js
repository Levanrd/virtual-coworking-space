// Development-only visual check using the same geometry as the campus.
import * as THREE from 'three';
import {createAvatar} from '../src/avatarRig.js';

document.body.style.fontFamily = 'system-ui, sans-serif';
const heading = document.createElement('h1');
heading.textContent = 'Avatar hair · front, side, back';
heading.style.cssText = 'font-size:22px;text-align:center;margin:20px';
document.body.append(heading);
const grid = document.createElement('main');
grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0 20px 20px';
document.body.append(grid);
for (const angle of [0, Math.PI / 2, Math.PI]) {
  for (const hairstyle of ['short', 'bob', 'bun']) {
    const cell = document.createElement('section');
    cell.style.cssText = 'position:relative;background:#e2dbd0;border-radius:12px;overflow:hidden';
    const label = document.createElement('span');
    label.textContent = `${hairstyle} · ${angle === 0 ? 'front' : angle === Math.PI ? 'back' : 'side'}`;
    label.style.cssText = 'position:absolute;left:12px;top:8px;font-size:13px;color:#4d443d';
    cell.append(label); grid.append(cell);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e2dbd0');
    scene.add(new THREE.HemisphereLight('#ffffff', '#887a65', 2.5));
    const light = new THREE.DirectionalLight('#fff4e5', 3);
    light.position.set(-3, 5, 4); scene.add(light);
    const avatar = createAvatar({color:'#a18bc8',skin:'#d9b38c',hair:'#49352e',hairstyle});
    avatar.rotation.y = angle; scene.add(avatar);
    const camera = new THREE.PerspectiveCamera(30, 1, .01, 20);
    camera.position.set(0, 1.94, 2.25); camera.lookAt(0, 1.5, 0);
    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(400, 210); camera.aspect = 400/210; camera.updateProjectionMatrix();
    renderer.domElement.style.cssText = 'display:block;width:100%;height:auto';
    cell.append(renderer.domElement); renderer.render(scene, camera);
  }
}
