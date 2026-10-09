import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createAvatar, poseAvatar } from "../src/avatarRig.js";
import { WorldState } from "../server/state.js";
import { cleanProfile } from '../server/state.js';
import { appearanceKey } from '../shared/avatar.js';
import { validProfile } from '../src/storage.js';

test('appearance choices survive server validation and legacy saved characters remain compatible', () => {
  const legacy = { name: 'Worker', job: 'Designer', color: '#8b73c4', skin: '#e5b18c', hair: '#49352e', hairstyle: 'bob' };
  assert.equal(validProfile(legacy), true);
  const profile = cleanProfile({ ...legacy, gender: 'female', outfit: 'shirt', pants: '#32445b' });
  assert.equal(profile.gender, 'female'); assert.equal(profile.outfit, 'shirt'); assert.equal(profile.pants, '#32445b');
  assert.equal(validProfile(profile), true);
  assert.equal(cleanProfile({ ...legacy, gender: 'invalid', outfit: '<script>', pants: 'url(bad)' }).gender, 'male');
  assert.equal(cleanProfile({ pants: 'url(bad)' }).pants, '#4d505d');
  for (const patch of [{ gender: 'female' }, { outfit: 'shirt' }, { pants: '#32445b' }]) assert.notEqual(appearanceKey(legacy), appearanceKey({ ...legacy, ...patch }));
});

test('both avatar choices and outfits preserve rig dimensions and grounded seating', () => {
  for (const gender of ['male', 'female']) for (const outfit of ['hoodie', 'shirt']) {
    const avatar = createAvatar(cleanProfile({ gender, outfit, pants: '#32445b' }));
    const rig = avatar.userData.rig;
    assert.equal(avatar.userData.appearance.gender, gender);
    assert.equal(rig.legs[0].shin.material.color.getHexString(), '32445b');
    poseAvatar(avatar, { seated: true, speed: 0, airborne: false, dt: 1 / 60 });
    avatar.updateMatrixWorld(true);
    for (const leg of rig.legs) assert.ok(new THREE.Box3().setFromObject(leg.shoe).min.y >= 0);
    poseAvatar(avatar, { seated: false, speed: 3.2, airborne: false, dt: .1 });
    assert.ok(Number.isFinite(rig.arms[0].shoulder.rotation.x));
    avatar.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
});

test("avatar limbs swing in opposition while walking and settle when stopped", () => {
  const avatar = createAvatar(new WorldState().add("walker"));
  const rig = avatar.userData.rig;
  for (let i = 0; i < 12; i++)
    poseAvatar(avatar, {
      speed: 3.2,
      seated: false,
      airborne: false,
      dt: 1 / 60,
    });
  assert.ok(Math.abs(rig.legs[0].hip.rotation.x) > 0.1);
  assert.ok(rig.legs[0].hip.rotation.x * rig.legs[1].hip.rotation.x < 0);
  assert.ok(rig.legs[0].hip.rotation.x * rig.arms[0].shoulder.rotation.x < 0);
  for (let i = 0; i < 90; i++)
    poseAvatar(avatar, {
      speed: 0,
      seated: false,
      airborne: false,
      dt: 1 / 60,
    });
  assert.ok(Math.abs(rig.legs[0].hip.rotation.x) < 0.001);
});

test("sitting bends knees with feet above the floor and standing restores leg length", () => {
  const avatar = createAvatar({
    ...new WorldState().add("sitter"),
    table: "design",
  });
  const rig = avatar.userData.rig;
  avatar.updateMatrixWorld(true);
  for (const leg of rig.legs) {
    assert.equal(leg.hip.rotation.x, -Math.PI / 2);
    assert.equal(leg.knee.rotation.x, Math.PI / 2);
    const feet = new THREE.Box3().setFromObject(leg.shoe);
    assert.ok(feet.min.y >= 0 && feet.min.y < 0.04);
  }
  poseAvatar(avatar, { seated: false, speed: 0, airborne: false, dt: 1 / 60 });
  assert.equal(rig.legs[0].shin.scale.y, 1);
  poseAvatar(avatar, { seated: false, speed: 0, airborne: true, dt: 1 / 60 });
  assert.ok(rig.legs[0].knee.rotation.x > 0);
  assert.ok(rig.arms[0].shoulder.rotation.x < 0);
});
