import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoungeMusic} from '../src/loungeMusic.js';

function setup() {
  const intervals=new Map(),timeouts=new Map(),sources=[],gains=[],states=[];let id=0;
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelAndHoldAtTime(){}});
  const node=()=>({connect(){},disconnect(){},frequency:param(),gain:param(),start(at){this.started=at;sources.push(this);},stop(){this.stopped=true;}});
  const context={currentTime:0,state:'suspended',sampleRate:100,destination:{},
    createGain(){const n=node();gains.push(n);return n;},createBiquadFilter:node,createOscillator:node,createBufferSource:node,
    createBuffer:()=>({getChannelData:()=>new Float32Array(100)}),addEventListener(){},removeEventListener(){},
    async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){this.state='closed';}};
  const music=createLoungeMusic(context,{onState:s=>states.push(s),every:fn=>{intervals.set(++id,fn);return id;},stopEvery:id=>intervals.delete(id),later:fn=>{timeouts.set(++id,fn);return id;},stopLater:id=>timeouts.delete(id)});
  return {music,context,sources,gains,states,intervals,timeouts};
}

test('lounge music fades, ducks for conversation, pauses and releases audio resources',async()=>{
  const t=setup();await t.music.play();
  assert.equal(t.states.at(-1),true);assert.ok(t.sources.length>4);assert.equal(t.intervals.size,1);
  t.music.setVolume(.4);assert.equal(t.gains[0].gain.value,.4);
  t.music.setDucked(true);assert.ok(Math.abs(t.gains[0].gain.value-.112)<.00001);
  t.music.setVolume(8);assert.equal(t.gains[0].gain.value,.28);
  t.music.pause();assert.equal(t.gains[0].gain.value,0);assert.equal(t.intervals.size,0);assert.equal(t.states.at(-1),false);
  for(const fn of t.timeouts.values())fn();
  assert.equal(t.context.state,'suspended');assert.ok(t.sources.every(s=>s.stopped));
  await t.music.play();t.music.dispose();assert.equal(t.intervals.size,0);assert.equal(t.timeouts.size,0);assert.equal(t.context.state,'closed');
});

test('quick re-entry cancels a pending fade and background throttling skips missed notes',async()=>{
  const t=setup();await t.music.play();t.music.pause();await t.music.play();
  assert.equal(t.timeouts.size,0);assert.equal(t.intervals.size,1);
  const before=t.sources.length;t.context.currentTime=300;
  for(const fn of t.intervals.values())fn();
  assert.ok(t.sources.length-before<12,'No five-minute backlog of notes');
  assert.ok(t.sources.slice(before).every(s=>s.started>=300));t.music.dispose();
});

test('autoplay refusal remains paused and leaving during resume never starts a scheduler',async()=>{
  const t=setup();t.context.resume=async()=>{throw Error('Gesture required');};
  await t.music.play();assert.equal(t.states.at(-1),false);assert.equal(t.intervals.size,0);
  let resolve;t.context.resume=()=>new Promise(done=>resolve=done);
  const pending=t.music.play();t.music.pause();resolve();await pending;
  assert.equal(t.intervals.size,0);assert.equal(t.context.state,'suspended');t.music.dispose();
});
