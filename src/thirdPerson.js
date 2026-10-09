import * as THREE from "three";
import {
  cameraDirection,
  walkStep,
  jumpHeight,
  JUMP_DURATION,
  JUMP_COOLDOWN,
  isWalkable,
} from "../shared/navigation.js";
import { seatPosition } from "../shared/world.js";
import { nearbySeat, portalAt } from "../shared/campus.js";
import {cameraBoundaryDistance} from './cameraBounds.js';
import {insideFootprint} from '../shared/architecture.js';
import {inPortalApproach} from '../shared/campus.js';

export function createThirdPerson({ camera, element, geometry, getState, view }) {
  const keys = new Set();
  const touchKeys = new Set();
  const pointer = new THREE.Vector2();
  const picker = new THREE.Raycaster();
  const obstruction = new THREE.Raycaster();
  const cameraMeshes = [];
  geometry.traverse(object => { if (object.isMesh && !object.userData.cameraIgnore) cameraMeshes.push(object); });
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const focus = new THREE.Vector3(0, 1.05, 6);
  const offset = new THREE.Vector3();
  let yaw = 0,
    renderYaw = 0,
    pitch = view?.pitch ?? 0.19,
    distance = view?.distance ?? 3.7,
    boom = distance;
  let local = null,
    identity = null,
    destination = null,
    drag = null;
  let previousTime = performance.now(),
    dt = 0,
    lastSent = 0,
    sent = null,
    ready = false;
  let jumpAt = -Infinity,
    jumpPending = false,
    standingPending = false,
    disposed = false,
    portalPending = false,
    portalRetryAt = 0;
  const movementKeys = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    "q",
    "r",
  ]);
  const blockedInput = (target) =>
    getState().transitioning ||
    target?.closest?.('input, textarea, select, [contenteditable="true"]') ||
    document.querySelector('[role="dialog"]');
  function clear() {
    keys.clear();
    touchKeys.clear();
    destination = null;
    drag = null;
  }
  function visibility() {
    if (document.hidden) clear();
  }
  function keydown(event) {
    const key = event.key.toLowerCase();
    if (key === "e" && !event.repeat && !blockedInput(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const p = getState();
      const seat = nearbySeat(local && !p.self?.table ? local : p.self, p.users);
      if (seat) { event.preventDefault(); p.onSeat(seat.table, seat.seat); }
      return;
    }
    if (
      key === " " &&
      !blockedInput(event.target) &&
      !event.target?.closest?.("button, a") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      if (!event.repeat) jump();
      return;
    }
    if (
      !movementKeys.has(key) ||
      blockedInput(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    keys.add(key);
    destination = null;
  }
  function keyup(event) {
    keys.delete(event.key.toLowerCase());
  }
  function aim(event) {
    const rect = element.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    picker.setFromCamera(pointer, camera);
  }
  function hit() {
    return picker.intersectObject(geometry, true)[0];
  }
  function pointerdown(event) {
    if (getState().transitioning || ![0, 2].includes(event.button) || drag) return;
    element.focus({ preventScroll: true });
    element.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      button: event.button,
    };
  }
  function pointermove(event) {
    if (drag?.id === event.pointerId) {
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      drag.moved ||=
        Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) >
        5;
      if (drag.moved) {
        yaw -= dx * 0.006;
        pitch = THREE.MathUtils.clamp(pitch + dy * 0.005, 0.08, 1.05);
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      element.style.cursor = "grabbing";
    } else {
      aim(event);
      element.style.cursor = hit()?.object.userData.table ? "pointer" : "grab";
    }
  }
  function pointerup(event) {
    if (drag?.id !== event.pointerId) return;
    const click = !drag.moved && drag.button === 0;
    drag = null;
    element.releasePointerCapture(event.pointerId);
    element.style.cursor = "grab";
    if (!click) return;
    aim(event);
    const picked = hit();
    const data = picked?.object.userData;
    const p = getState();
    if (data?.table) {
      if (Number.isInteger(data.seat)) p.onSeat(data.table, data.seat);
      else p.onSelect(data.table);
    } else if (
      (!picked || picked.point.y < 0.1) &&
      p.self &&
      !p.self.table &&
      picker.ray.intersectPlane(plane, point)
    ) {
      if (isWalkable(point.x,point.z,p.roomId))
        destination = { x: point.x, z: point.z };
    }
  }
  const cancel = () => {
    drag = null;
  };
  const contextmenu = (event) => event.preventDefault();
  function zoom(delta) {
    distance = THREE.MathUtils.clamp(distance + delta, 2.2, 8);
  }
  function wheel(event) {
    event.preventDefault();
    zoom(Math.sign(event.deltaY) * 0.35);
  }
  function reset() {
    const self = getState().self;
    const rotation = self?.table
      ? seatPosition(self.table, self.seat, self.room).rotation
      : (local?.rotation ?? Math.PI);
    yaw = rotation - Math.PI;
    pitch = 0.19;
    distance = 3.7;
  }
  async function jump() {
    const p = getState(),
      self = p.self;
    if (!self || blockedInput(document.activeElement)) return;
    destination = null;
    if (self.table) {
      if (standingPending) return;
      standingPending = true;
      try {
        await p.onStand();
      } finally {
        standingPending = false;
      }
      return;
    }
    if (
      jumpPending ||
      performance.now() - jumpAt < (JUMP_DURATION + JUMP_COOLDOWN) * 1000
    )
      return;
    const version = self.motionVersion;
    jumpAt = performance.now();
    jumpPending = true;
    try {
      const result = await p.onJump({ motionVersion: version });
      if (
        !disposed &&
        getState().self?.motionVersion === version &&
        !result?.ok
      )
        jumpAt = -Infinity;
    } catch {
      if (!disposed) jumpAt = -Infinity;
    } finally {
      jumpPending = false;
    }
  }
  const listeners = {
    pointerdown,
    pointermove,
    pointerup,
    pointercancel: cancel,
    lostpointercapture: cancel,
    contextmenu,
    wheel,
  };
  for (const [name, callback] of Object.entries(listeners))
    element.addEventListener(name, callback, { passive: false });
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", visibility);
  element.tabIndex = 0;
  element.setAttribute(
    "aria-label",
    "Third-person campus. WASD to walk, E to sit nearby, Space to jump or stand up, drag to look, Q and R to turn, scroll to zoom.",
  );
  element.style.touchAction = "none";
  element.style.cursor = "grab";

  return {
    getView:()=>({pitch,distance}),
    zoom,
    reset,
    jump,
    turn(delta) {
      yaw += delta;
    },
    direction(key, pressed) {
      if (pressed) {
        touchKeys.add(key);
        destination = null;
      } else touchKeys.delete(key);
    },
    update(time) {
      dt = Math.min(Math.max(0, (time - previousTime) / 1000), 0.05);
      previousTime = time;
      const p = getState(),
        self = p.self;
      if (!self) {
        local = null;
        identity = null;
        clear();
        return null;
      }
      const nextIdentity = `${self.id}:${self.table}:${self.seat}:${self.motionVersion}`;
      if (identity !== nextIdentity) {
        const nextPosition = self.table ? seatPosition(self.table, self.seat, self.room) : self;
        const previousPosition = local?.table ? seatPosition(local.table, local.seat, local.room) : local;
        const nearbyTransition = local?.id === self.id && previousPosition && Math.hypot(nextPosition.x-previousPosition.x,nextPosition.z-previousPosition.z)<2.5;
        local = { ...self };
        identity = nextIdentity;
        sent = null;
        jumpAt = -Infinity;
        if(!nearbyTransition) {ready = false;boom = distance;}
        clear();
        yaw =
          (self.table
            ? seatPosition(self.table, self.seat, self.room).rotation
            : (self.rotation ?? Math.PI)) - Math.PI;
      }
      if (blockedInput(document.activeElement)) clear();
      const down = (key) => keys.has(key) || touchKeys.has(key);
      yaw += ((down("q") ? 1 : 0) - (down("r") ? 1 : 0)) * dt * 1.8;
      if (!self.table) {
        const forward =
          Number(down("w") || down("arrowup")) -
          Number(down("s") || down("arrowdown"));
        const right =
          Number(down("d") || down("arrowright")) -
          Number(down("a") || down("arrowleft"));
        let direction = cameraDirection(forward, right, renderYaw);
        if (destination && !forward && !right) {
          const dx = destination.x - local.x,
            dz = destination.z - local.z,
            length = Math.hypot(dx, dz);
          if (length < 0.12) destination = null;
          else direction = { x: dx / length, z: dz / length };
        }
        if (direction.x || direction.z) {
          const next = walkStep(local, direction, dt, p.roomId);
          if (next.x === local.x && next.z === local.z) destination = null;
          local = {
            ...local,
            ...next,
            rotation: Math.atan2(direction.x, direction.z),
          };
        }
        const portal = portalAt(p.roomId, local);
        if (portal && !portalPending && time > portalRetryAt && !blockedInput(document.activeElement)) {
          portalPending = true;
          clear();
          Promise.resolve(p.onRoom(portal.id)).finally(() => { portalPending = false; portalRetryAt = performance.now() + 1800; });
        }
        if (
          time - lastSent >= 60 &&
          (!sent ||
            Math.hypot(local.x - sent.x, local.z - sent.z) > 0.002 ||
            Math.abs(local.rotation - sent.rotation) > 0.01)
        ) {
          sent = {
            x: local.x,
            z: local.z,
            rotation: local.rotation,
            motionVersion: self.motionVersion,
          };
          p.onMove(sent);
          lastSent = time;
        }
      }
      return self.table
        ? self
        : {
            ...self,
            x: local.x,
            z: local.z,
            rotation: local.rotation,
            y: jumpHeight((time - jumpAt) / 1000),
          };
    },
    follow(position) {
      if (!position) return;
      // Aim above the chair back so sitting cannot collapse the camera into it.
      point.set(
        position.x,
        position.y + (getState().self?.table ? 1.35 : 1.1),
        position.z,
      );
      if (!ready) {
        focus.copy(point);
        renderYaw = yaw;
        ready = true;
      } else {
        focus.lerp(point, 1 - Math.exp(-14 * dt));
        const room = getState().roomId;
        if (!insideFootprint(room, focus.x, focus.z, 0) && !inPortalApproach(room, focus.x, focus.z)) focus.copy(point);
      }
      renderYaw += Math.atan2(Math.sin(yaw-renderYaw),Math.cos(yaw-renderYaw))*(1-Math.exp(-18*dt));
      offset.set(
        Math.sin(renderYaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(renderYaw) * Math.cos(pitch),
      );
      obstruction.set(focus, offset);
      obstruction.far = distance + 0.2;
      const self = getState().self;
      const targetDistance = self?.table ? distance * 0.76 : distance;
      const wall = obstruction
        .intersectObjects(cameraMeshes, false)
        .find(
          (hit) =>
            !hit.object.userData.cameraIgnore && !(
              self?.table &&
              hit.object.userData.table === self.table &&
              hit.object.userData.seat === self.seat
            ),
        );
      const boundary = cameraBoundaryDistance(getState().roomId, focus, offset, targetDistance);
      const safe = wall
        ? Math.max(0.08, Math.min(boundary, wall.distance - 0.22))
        : boundary;
      boom =
        safe < boom
          ? safe
          : THREE.MathUtils.lerp(boom, safe, 1 - Math.exp(-8 * dt));
      camera.position.copy(focus).addScaledVector(offset, boom);
      camera.lookAt(focus);
      camera.updateMatrixWorld();
    },
    dispose() {
      disposed = true;
      clear();
      for (const [name, callback] of Object.entries(listeners))
        element.removeEventListener(name, callback);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", visibility);
    },
  };
}
