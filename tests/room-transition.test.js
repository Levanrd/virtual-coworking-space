import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomTransition} from '../src/roomTransition.js';

function setup(reduced=false) {
  const timers=new Map(),states=[];let id=0,time=0,timeouts=0;
  const navigator=createRoomTransition({onChange:s=>states.push(s),reduced:()=>reduced,onTimeout:()=>timeouts++,
    schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},cancel:id=>timers.delete(id)});
  const advance=async ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}await Promise.resolve();};
  return {navigator,advance,states,timers,get timeouts(){return timeouts;}};
}
test('room transitions cover before committing and wait for both ACK and a destination frame',async()=>{
  const t=setup();let commits=0,ack;
  const change=t.navigator.start('lounge','studio',()=>{commits++;return new Promise(resolve=>ack=resolve);});
  assert.equal(commits,0);assert.equal(t.states.at(-1).phase,'covering');
  assert.ok((await t.navigator.start('terrace','studio',()=>{throw Error('duplicate');})).error);
  await t.advance(260);assert.equal(commits,1);assert.equal(t.states.at(-1).phase,'loading');
  t.navigator.ready('focus');assert.equal(t.states.at(-1).phase,'loading');
  t.navigator.ready('lounge');assert.equal(t.states.at(-1).phase,'loading');
  ack({ok:true});await change;assert.equal(t.states.at(-1).phase,'revealing');
  await t.advance(340);assert.equal(t.states.at(-1),null);t.navigator.dispose();
});
test('late rendering, failed navigation and reduced-motion transitions never strand the cover',async()=>{
  const t=setup(true);
  const success=t.navigator.start('focus','studio',async()=>({ok:true}));
  await t.advance(0);await success;assert.equal(t.states.at(-1).phase,'loading');
  t.navigator.ready('focus');await t.advance(0);assert.equal(t.states.at(-1),null);
  const failed=t.navigator.start('lounge','focus',async()=>({error:'Disconnected'}));
  await t.advance(0);await failed;await t.advance(0);assert.equal(t.states.at(-1),null);
  const stalled=t.navigator.start('terrace','focus',async()=>({ok:true}));
  await t.advance(0);await stalled;await t.advance(10000);await t.advance(0);
  assert.equal(t.states.at(-1),null);assert.equal(t.timeouts,1);t.navigator.dispose();
});
test('unmount cancels delayed navigation before it can change rooms',async()=>{
  const t=setup();let committed=false;
  const change=t.navigator.start('lounge','studio',async()=>{committed=true;return {ok:true};});
  t.navigator.dispose();assert.ok((await change).error);await t.advance(300);
  assert.equal(committed,false);assert.equal(t.timers.size,0);
});
