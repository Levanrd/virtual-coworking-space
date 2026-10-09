import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ArrowCounterClockwise, ArrowLeft, ArrowRight, PersonSimpleWalk, Pause, Cube } from '@phosphor-icons/react';
import { createAvatar, poseAvatar } from './avatarRig.js';
import { appearanceKey } from '../shared/avatar.js';

function disposeModel(model) {
  model.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
}

export default function CharacterPreview({ profile }) {
  const host = useRef(null), api = useRef(null), latest = useRef(profile), walkingRef = useRef(false);
  latest.current = profile;
  const [walking, setWalking] = useState(false), [unavailable, setUnavailable] = useState(false);
  walkingRef.current = walking;
  useEffect(() => {
    const element = host.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { setUnavailable(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff5e9', '#858198', 2.5));
    const key = new THREE.DirectionalLight('#fff5e9', 3.5); key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#d7c6fc', 2); rim.position.set(-3, 3, -2); scene.add(rim);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(.67, .72, .09, 48), new THREE.MeshStandardMaterial({ color: '#c7b8df', roughness: .8 }));
    plinth.position.y = -.055; scene.add(plinth);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.45, 32), new THREE.MeshBasicMaterial({ color: '#514566', transparent: true, opacity: .16, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.008; shadow.scale.y = .65; scene.add(shadow);
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
    camera.position.set(.95, 1.3, 3.65);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, .88, 0);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = .12;
    controls.minDistance = 2.7; controls.maxDistance = 5.2;
    controls.minPolarAngle = Math.PI / 3; controls.maxPolarAngle = Math.PI * .58;
    controls.update(); controls.saveState();
    let avatar, frame, previous = 0, visible = true, contextLost = false, currentAppearance;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
    observer.observe(element);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    });
    resize.observe(element);
    api.current = {
      update(profile) {
        if (currentAppearance === appearanceKey(profile)) return;
        currentAppearance = appearanceKey(profile);
        if (avatar) { scene.remove(avatar); disposeModel(avatar); }
        avatar = createAvatar({ ...profile, table: null }); scene.add(avatar);
      },
      rotate(angle) {
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        camera.position.copy(controls.target).add(offset); controls.update();
      },
      reset() { controls.reset(); },
    };
    api.current.update(latest.current);
    function render(now) {
      frame = requestAnimationFrame(render);
      if (document.hidden || !visible || contextLost) { previous = now; return; }
      if (now - previous < 1000 / 30) return;
      const dt = Math.min((now - previous) / 1000, .05); previous = now;
      poseAvatar(avatar, { seated: false, speed: walkingRef.current ? 2.5 : 0, airborne: false, dt, reduced: reduced.matches });
      controls.update(); renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
    const lost = event => { event.preventDefault(); contextLost = true; setUnavailable(true); };
    const restored = () => { contextLost = false; setUnavailable(false); };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    renderer.domElement.addEventListener('webglcontextrestored', restored);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      disposeModel(scene); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); api.current = null;
    };
  }, []);
  const signature = appearanceKey(profile);
  useEffect(() => { api.current?.update(profile); }, [signature]);
  return <section className="avatar-studio" aria-label="Live character preview">
    <div className="avatar-studio-heading"><Cube size={16} /><span>Live preview</span><span className="avatar-live-dot" /></div>
    <div ref={host} className="avatar-studio-canvas" role="img" aria-label="Rotatable 3D character. Drag to orbit, scroll or pinch to zoom. Use the rotation buttons below with a keyboard." />
    {unavailable && <p className="avatar-preview-error" role="status">3D preview is unavailable. You can still customize and save your character.</p>}
    <div className="avatar-studio-footer">
      <p>Drag to rotate · Scroll to zoom</p>
      <div className="avatar-view-controls">
        <button type="button" aria-label="Rotate character left" disabled={unavailable} onClick={() => api.current?.rotate(-Math.PI / 4)}><ArrowLeft size={18} /></button>
        <button type="button" aria-label="Reset character view" disabled={unavailable} onClick={() => api.current?.reset()}><ArrowCounterClockwise size={18} /></button>
        <button type="button" aria-label="Rotate character right" disabled={unavailable} onClick={() => api.current?.rotate(Math.PI / 4)}><ArrowRight size={18} /></button>
        <button type="button" className="avatar-walk" aria-pressed={walking} disabled={unavailable} onClick={() => setWalking(value => !value)}>{walking ? <Pause size={18} /> : <PersonSimpleWalk size={18} />}{walking ? 'Pause' : 'Walk'}</button>
      </div>
    </div>
  </section>;
}
