import {createWorldAudio} from './worldAudio.js';
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildCampus } from "./campusRoom.js";
import { nearbySeat } from "../shared/campus.js";
import { createAvatar, poseAvatar } from "./avatarRig.js";
import { appearanceKey } from '../shared/avatar.js';
import { remoteJumpHeight } from "../shared/navigation.js";
import { createThirdPerson } from "./thirdPerson.js";
import {createQualityController, GRAPHICS_LEVELS} from './graphicsQuality.js';
import {REACTION_DISPLAY} from './reactions.js';
import {
  LockSimple,
  Users,
  ArrowUpRight,
  Cursor,
  Cube,
  Plus,
  Minus,
  ArrowsOut,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "@phosphor-icons/react";
import { roomTables, ROOM_DESIGNS, seatPosition } from "../shared/world.js";

export default function WorldScene({
  controlRef,
  room,
  users,
  self,
  tables,
  selected,
  onSelect,
  onSeat,
  onMove,
  onJump,
  onStand,
  onRoom,
  reactions = {},
  onHelp,
  transitioning = false,
  onRoomReady,
  graphics = 'auto',
  onQualityChange,
  paused=false, speaking={}, soundEnabled=false,
}) {
  const mount = useRef(null);
  const props = useRef({});
  props.current = {
    roomId: room.id,
    paused, speaking, soundEnabled,
    onRoom,
    users,
    self,
    tables,
    selected,
    onSelect,
    onSeat,
    onMove,
    onJump,
    onStand,
    reactions,
    transitioning,
    onRoomReady,
    graphics,
    onQualityChange,
  };
  const labels = useRef({});
  const seatPrompt = useRef(null);
  const nearestSeat = useRef(null);
  const nameLabels = useRef({});
  const reactionLabels = useRef({});
  const api = useRef(null);
  const cameraView = useRef(null);
  const quality = useRef(null);
  if (!quality.current) quality.current = createQualityController({mode: graphics, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory});
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = mount.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(true);
      props.current.onRoomReady?.(room.id);
      return;
    }
    setError(false);
    const governor = quality.current;
    governor.setMode(props.current.graphics);
    governor.reset();
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor("#f1ede8", 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const design = ROOM_DESIGNS[room.id] || ROOM_DESIGNS.studio;
    const camera = new THREE.PerspectiveCamera(58, 1, 0.08, 100);
    camera.position.set(0, 2.65, 10.5);
    camera.lookAt(0, 1.05, 6);
    scene.background = new THREE.Color(design.background);
    let environmentTarget = null;
    let skyTexture = null;
    if (room.id !== 'terrace' && !design.outdoor) {
      const sky = document.createElement('canvas'); sky.width = 8; sky.height = 256;
      const c = sky.getContext('2d'), gradient = c.createLinearGradient(0,0,0,256);
      gradient.addColorStop(0,'#b3cddd');gradient.addColorStop(.55,'#e1e8e4');gradient.addColorStop(1,'#ece7d9');
      c.fillStyle = gradient;c.fillRect(0,0,8,256);
      skyTexture = new THREE.CanvasTexture(sky);skyTexture.colorSpace=THREE.SRGBColorSpace;scene.background=skyTexture;
      const environment = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
      environmentTarget = generator.fromScene(environment,.04);
      scene.environment = environmentTarget.texture;scene.environmentIntensity=.28;
      environment.dispose();generator.dispose();
    }
    scene.fog = new THREE.Fog("#dce3dd", 26, 70);
    scene.add(new THREE.HemisphereLight("#fff9ee", "#b6ad9c", 1.4));
    const sunlight = new THREE.DirectionalLight(design.sun, design.intensity);
    sunlight.position.set(-11, 9, 3);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    Object.assign(sunlight.shadow.camera, {
      left: -19,
      right: 19,
      top: 19,
      bottom: -19,
      near: 1,
      far: 45,
    });
    sunlight.shadow.bias = -0.0005;
    sunlight.shadow.normalBias = 0.025;
    sunlight.shadow.radius = 3;
    scene.add(sunlight);
    const bounce = new THREE.DirectionalLight("#dae2ed", 0.8);
    bounce.position.set(-8, 6, -3);
    scene.add(bounce);
    const geometry = buildCampus(scene, room.id);
    const avatars = new Map();
    const worldAudio=createWorldAudio(room.id);
    let width = 1,
      height = 1,
      frame;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.47, 0.54, 40),
      new THREE.MeshBasicMaterial({ color: "#8765c6", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    scene.add(ring);
    const chairOutline = new THREE.Mesh(new THREE.RingGeometry(.43,.47,48),new THREE.MeshBasicMaterial({color:'#bd93ee',transparent:true,opacity:.85,side:THREE.DoubleSide}));
    chairOutline.rotation.x=-Math.PI/2;
    scene.add(chairOutline);
    const controls = createThirdPerson({
      camera,
      element: renderer.domElement,
      geometry,
      view:cameraView.current,
      getState: () => props.current,
    });
    function resize() {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    let appliedQuality = null, appliedDpr = null;
    function applyQuality(level) {
      const preset = GRAPHICS_LEVELS[level];
      const dpr = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
      if (level === appliedQuality && dpr === appliedDpr) return;
      renderer.setPixelRatio(dpr);
      renderer.shadowMap.enabled = preset.shadowSize > 0;
      sunlight.castShadow = preset.shadowSize > 0;
      sunlight.shadow.map?.dispose(); sunlight.shadow.map = null;
      sunlight.shadow.mapSize.set(preset.shadowSize || 512, preset.shadowSize || 512);
      scene.traverse(object => {
        for (const material of [object.material].flat().filter(Boolean)) material.needsUpdate = true;
      });
      renderer.shadowMap.needsUpdate = true;
      appliedQuality = level; appliedDpr = dpr;
      container.dataset.quality = level;
      props.current.onQualityChange?.(level);
    }
    applyQuality(governor.level);
    const reactionPosition = new THREE.Vector3();
    function project(element, x, y, z, bottom = false) {
      if (!element) return;
      const point = new THREE.Vector3(x, y, z).project(camera);
      element.style.visibility =
        point.z < -1 ||
        point.z > 1 ||
        Math.abs(point.x) > 0.96 ||
        Math.abs(point.y) > 0.92
          ? "hidden"
          : "visible";
      element.style.transform = `translate(${(point.x * 0.5 + 0.5) * width}px,${(-point.y * 0.5 + 0.5) * height}px) translate(-50%,${bottom ? '-100%' : '-50%'})`;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastRender = performance.now();
    let metricsTime = lastRender, metricsFrames = 0;
    let renderedFrames = 0, nextFrame = 0;
    function render(time = performance.now()) {
      frame = requestAnimationFrame(render);
      // Keep calls connected in hidden tabs, but stop scene animation/rendering.
      if (document.hidden || props.current.paused) {
        worldAudio.enabled(false);
        lastRender = time; metricsTime = time; metricsFrames = 0;
        governor.reset();
        return;
      }
      const interval=1000/(governor.level==='low'?30:60);
      if(time<nextFrame)return;
      nextFrame=time+interval-((time-nextFrame)%interval);
      governor.setMode(props.current.graphics);
      applyQuality(governor.sample(time, !props.current.transitioning));
      worldAudio.enabled(props.current.soundEnabled);
      geometry.userData.animate?.(time / 1000, reduced);
      const dt = Math.min(Math.max((time - lastRender) / 1000, 0.001), 0.05);
      lastRender = time;
      const p = props.current;
      const local = controls.update(time);
      const seat = nearbySeat(local, p.users);
      nearestSeat.current = seat;
      chairOutline.visible = !!seat;
      if(seat) {
        chairOutline.position.set(seat.x,.022,seat.z);
        project(seatPrompt.current,seat.x,1.25,seat.z);
        seatPrompt.current.textContent = p.tables?.[seat.table]?.private ? 'E · Join private table' : 'E · Sit';
      } else if(seatPrompt.current) seatPrompt.current.style.visibility='hidden';
      const all = p.users.map((user) => (user.id === local?.id ? local : user));
      const ids = new Set(all.map((u) => u.id));
      for (const [id, item] of avatars)
        if (!ids.has(id)) {
          scene.remove(item.mesh);
          item.mesh.traverse((m) => {
            m.geometry?.dispose();
            if (m.material) m.material.dispose();
          });
          avatars.delete(id);
        }
      for (const user of all) {
        const signature = appearanceKey(user);
        let item = avatars.get(user.id);
        if (!item || item.signature !== signature) {
          if (item) {
            scene.remove(item.mesh);
            item.mesh.traverse((m) => {
              m.geometry?.dispose();
              m.material?.dispose();
            });
          }
          const mesh = createAvatar(user);
          const position = user.table
            ? seatPosition(user.table, user.seat, room.id)
            : user;
          mesh.position.set(position.x, 0, position.z);
          mesh.rotation.y = position.rotation || 0;
          scene.add(mesh);
          item = { mesh, signature, motionVersion: user.motionVersion };
          avatars.set(user.id, item);
        }
        const position = user.table
          ? seatPosition(user.table, user.seat, room.id)
          : user;
        const transition = item.motionVersion !== user.motionVersion;
        const previous = item.mesh.position.clone();
        const y = user.table
          ? 0
          : user.id === p.self?.id
            ? user.y || 0
            : remoteJumpHeight(user, time);
        item.mesh.position.lerp(
          new THREE.Vector3(position.x, y, position.z),
          reduced || transition || user.id === p.self?.id
            ? 1
            : 1 - Math.exp(-18 * dt),
        );
        const speed = transition
          ? 0
          : Math.hypot(
              item.mesh.position.x - previous.x,
              item.mesh.position.z - previous.z,
            ) / dt;
        poseAvatar(item.mesh, {
          seated: !!user.table,
          speed,
          airborne: y > 0.025,
          dt,
          reduced,
          gesture:p.reactions[user.id]?.type,
        });
        if(user.id===p.self?.id)worldAudio.step(speed,!!user.table||y>.025,time);
        item.motionVersion = user.motionVersion;
        const difference =
          (((position.rotation || 0) - item.mesh.rotation.y + Math.PI * 3) %
            (Math.PI * 2)) -
          Math.PI;
        item.mesh.rotation.y +=
          difference * (reduced || transition ? 1 : 1 - Math.exp(-16 * dt));
      }
      if (p.self && avatars.has(p.self.id)) {
        ring.visible = false;
        const position = avatars.get(p.self.id).mesh.position;
        ring.position.set(position.x, 0.05, position.z);
      } else ring.visible = false;
      controls.follow(p.self && avatars.get(p.self.id)?.mesh.position);
      if(seat) project(seatPrompt.current,seat.x,1.25,seat.z);
      for (const user of all) {
        const position = avatars.get(user.id).mesh.position;
        project(
          nameLabels.current[user.id],
          position.x,
          position.y + (user.table ? 2 : 2.1),
          position.z,
        );
        if (reactionLabels.current[user.id]) {
          avatars.get(user.id).mesh.userData.rig.head.getWorldPosition(reactionPosition);
          project(reactionLabels.current[user.id], reactionPosition.x,
            reactionPosition.y + .44, reactionPosition.z, true);
        }
      }
      for (const table of roomTables(room.id))
        project(labels.current[table.id], table.x, 1.65, table.z);
      renderer.render(scene, camera);
      // A second frame guarantees the canvas and initial camera were presented.
      if(++renderedFrames===2)props.current.onRoomReady?.(room.id);
      if(import.meta.env.DEV) {
        metricsFrames++;
        if(time-metricsTime>1200) {
          container.dataset.frameMs=((time-metricsTime)/metricsFrames).toFixed(1);
          container.dataset.drawCalls=String(renderer.info.render.calls);
          container.dataset.triangles=String(renderer.info.render.triangles);
          metricsFrames=0;metricsTime=time;
        }
      }
    }
    api.current = { ...controls, zoom: (delta) => controls.zoom(-delta * 5) };
    if(controlRef) controlRef.current = api.current;
    render();
    return () => {
      cancelAnimationFrame(frame);
      worldAudio.dispose();
      observer.disconnect();
      cameraView.current=controls.getView();
      controls.dispose();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(mesh => {
        if(mesh.geometry) geometries.add(mesh.geometry);
        for(const m of [mesh.material].flat().filter(Boolean)) {
          materials.add(m);
          for(const value of Object.values(m)) if(value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(g => g.dispose());materials.forEach(m => m.dispose());textures.forEach(t => t.dispose());
      environmentTarget?.dispose();skyTexture?.dispose();
      renderer.dispose();
      // Room changes own separate renderers; release the old GPU context promptly.
      renderer.forceContextLoss();
      renderer.domElement.remove();
      api.current = null;
      if(controlRef) controlRef.current = null;
    };
  }, [room.id]);
  const visibleUsers = users;
  return (
    <div className="world-scene">
      <div
        className="scene-surface"
        ref={mount}
        aria-label="Interactive 3D coworking office"
      />
      <button ref={seatPrompt} className="chair-prompt" onClick={() => { const seat=nearestSeat.current;if(seat) onSeat(seat.table,seat.seat); }}>E · Sit</button>
      <div className="world-top">
        <div className="live-chip">
          <span className="status-dot" /> LIVE SPACE{" "}
          <span className="chip-divider" /> <Users size={13} /> {users.length}
        </div>
        <button className="scene-help" onClick={onHelp}>
          <Cursor size={15} /> How to move <ArrowUpRight size={13} />
        </button>
      </div>
      <div className="world-labels" aria-label="Workspace tables">
        {roomTables(room.id).map((table) => {
          const occupants = users.filter((u) => u.table === table.id).length;
          const isPrivate = tables?.[table.id]?.private;
          return (
            <button
              ref={(el) => (labels.current[table.id] = el)}
              key={table.id}
              className={`table-label ${selected === table.id ? "selected" : ""}`}
              onClick={() => onSelect(table.id)}
              aria-label={`Select ${table.name}, ${occupants} of ${table.seats} seats occupied`}
            >
              <span
                className="table-color"
                style={{ background: table.color }}
              />
              <span>{table.name}</span>
              {isPrivate ? (
                <LockSimple size={12} />
              ) : (
                <span className="seat-number">
                  {occupants}/{table.seats}
                </span>
              )}
            </button>
          );
        })}
        {visibleUsers.map((user) => (
          <div
            className={`character-label ${self?.id === user.id ? "you" : ""} ${reactions[user.id]?.room === room.id ? 'reacting' : ''}`}
            ref={(el) => (nameLabels.current[user.id] = el)}
            key={user.id}
          >
            <span>
              {user.name}{user.job && self?.id !== user.id ? ` · ${user.job}` : ""}
              {self?.id === user.id && <small>you</small>}
            </span>
            {speaking[user.id] && <i className="speaking-dot" title="Speaking" />}
          </div>
        ))}
      </div>
      <div className="avatar-reactions" aria-live="polite" aria-atomic="false">
        {visibleUsers.map(user => {
          const reaction = reactions[user.id];
          const display = REACTION_DISPLAY[reaction?.type];
          if (!display || reaction.room !== room.id) return null;
          return <div className="avatar-reaction-anchor" key={user.id}
            ref={element => { if (element) reactionLabels.current[user.id] = element; else delete reactionLabels.current[user.id]; }}>
            <div className="avatar-reaction-bubble" key={reaction.key} role="img"
              aria-label={`${user.id === self?.id ? 'You' : user.name}: ${display.label}`}>
              <span aria-hidden="true">{display.glyph}</span>
            </div>
          </div>;
        })}
      </div>
      {error && (
        <div className="scene-error">
          <Cube size={36} />
          <h3>Your browser couldn’t open the 3D view</h3>
          <p>
            You can still join a table using Rooms → Browse tables. Enable hardware
            acceleration to explore the office.
          </p>
        </div>
      )}
      {!error && self && !self.table && (
        <div className="walk-pad" aria-label="Walking controls">
          {[
            ["w", "Walk forward", ArrowUp],
            ["a", "Walk left", ArrowLeft],
            ["s", "Walk backward", ArrowDown],
            ["d", "Walk right", ArrowRight],
          ].map(([key, label, Icon]) => (
            <button
              key={key}
              className={`walk-${key}`}
              aria-label={label}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                api.current?.direction(key, true);
              }}
              onPointerUp={() => api.current?.direction(key, false)}
              onPointerCancel={() => api.current?.direction(key, false)}
              onLostPointerCapture={() => api.current?.direction(key, false)}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  api.current?.direction(key, true);
                }
              }}
              onKeyUp={() => api.current?.direction(key, false)}
              onBlur={() => api.current?.direction(key, false)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      )}
      {!error && self && (
        <button
          className="avatar-action"
          aria-label={self.table ? "Stand up from chair" : "Jump"}
          onClick={() => api.current?.jump()}
        >
          <ArrowUp size={17} />
          {self.table ? "Stand up" : "Jump"}
          <kbd>Space</kbd>
        </button>
      )}
      <div className="world-bottom">
        <div className="scene-caption">
          WASD Move · Drag Look · E Sit · Space Jump
        </div>
        <div className="scene-controls">
          <button
            aria-label="Rotate camera left"
            onClick={() => api.current?.turn(0.35)}
          >
            <ArrowLeft size={16} />
          </button>
          <button
            aria-label="Rotate camera right"
            onClick={() => api.current?.turn(-0.35)}
          >
            <ArrowRight size={16} />
          </button>
          <button aria-label="Zoom out" onClick={() => api.current?.zoom(-0.1)}>
            <Minus size={16} />
          </button>
          <button aria-label="Reset view" onClick={() => api.current?.reset()}>
            <ArrowCounterClockwise size={16} />
          </button>
          <button aria-label="Zoom in" onClick={() => api.current?.zoom(0.1)}>
            <Plus size={16} />
          </button>
          <span />
          <button
            aria-label="Expand office"
            onClick={() =>
              mount.current.parentElement.requestFullscreen?.().catch(() => {})
            }
          >
            <ArrowsOut size={16} />
          </button>
        </div>
      </div>
      <div className="scene-floor-label">
        COMMON GROUND <span> / </span> {room.name.toUpperCase()}
      </div>
    </div>
  );
}
