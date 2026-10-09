import test from 'node:test';
import assert from 'node:assert/strict';
import {createReactionFeed,REACTION_DURATION} from '../src/reactions.js';

test('repeated reactions restart their lifetime without an older expiry removing them', () => {
  let shown = {}, now = 0, next = 0;
  const jobs = new Map(), oldCallbacks = [];
  const feed = createReactionFeed(value => shown = value, callback => {
    const id = ++next; jobs.set(id,{at:now+REACTION_DURATION,callback}); oldCallbacks.push(callback); return id;
  }, id => jobs.delete(id));
  const advance = ms => { now += ms; for (const [id,job] of [...jobs]) if (job.at <= now) { jobs.delete(id); job.callback(); } };
  feed.receive({id:'you',reaction:'wave',room:'studio'});
  const original = shown.you.key;
  advance(1500); feed.receive({id:'you',reaction:'wave',room:'studio'});
  assert.notEqual(shown.you.key,original,'A repeated emoji gets a new animation');
  assert.equal(jobs.size,1);
  oldCallbacks[0](); assert.ok(shown.you,'A stale callback cannot remove a newer reaction');
  advance(2001); assert.ok(shown.you,'New reaction lasts beyond the original expiry');
  advance(1499); assert.deepEqual(shown,{}); assert.equal(jobs.size,0);
});

test('room changes, departures and disconnects clear reactions and their timers', () => {
  let shown = {}; const jobs = new Set();
  const feed = createReactionFeed(value => shown = value, fn => {jobs.add(fn);return fn;}, fn => jobs.delete(fn));
  feed.receive({id:'a',reaction:'heart',room:'studio'});
  feed.receive({id:'b',reaction:'coffee',room:'focus'});
  feed.receive({id:'c',reaction:'not-a-reaction',room:'studio'});
  assert.deepEqual(Object.keys(shown),['a','b']);
  feed.prune([{id:'a',room:'lounge'},{id:'b',room:'focus'}]);
  assert.deepEqual(Object.keys(shown),['b']); assert.equal(jobs.size,1);
  feed.prune([]); assert.deepEqual(shown,{}); assert.equal(jobs.size,0);
  feed.receive({id:'a',reaction:'clap',room:'lounge'});
  feed.clear(); assert.deepEqual(shown,{}); assert.equal(jobs.size,0);
});
