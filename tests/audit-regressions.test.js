import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldState} from '../server/state.js';
import {AuthStore} from '../server/auth.js';
import {AccessStore} from '../server/access.js';
import {readSaved, save, validProfile, validSettings, validEvents} from '../src/storage.js';

test('each table visit has a new capture identity, while changing chairs preserves the call', () => {
  const state = new WorldState(), user = state.add('capture');
  state.join(user,{table:'design',seat:0});
  const original=user.tableSession;
  assert.equal(typeof original,'string');
  state.join(user,{table:'design',seat:1});
  assert.equal(user.tableSession,original);
  state.release(user);
  assert.equal(user.tableSession,null);
  state.join(user,{table:'design',seat:0});
  assert.notEqual(user.tableSession,original);
  const next=user.tableSession;
  state.join(user,{table:'builders',seat:0});
  assert.notEqual(user.tableSession,next);
});

test('members can preview an invitation without consuming the guest admission', async () => {
  const auth=new AuthStore(':memory:');
  try {
    const accounts=[];
    for(let i=0;i<3;i++) accounts.push((await auth.register({fullName:`Audit ${i}`,username:`audit${i}`,email:`audit${i}@example.test`,age:30,password:'audit-regression-password'})).user);
    const access=new AccessStore(auth.db),[owner,guest,outsider]=accounts;
    access.create('audit-team','Audit team',owner.id);
    const {token}=access.invite('audit-team',owner.id);
    assert.equal(access.redeem(token,owner.id).ok,true);
    assert.equal(access.redeem(token,owner.id).ok,true);
    assert.equal(access.redeem(token,guest.id).ok,true);
    assert.ok(access.redeem(token,outsider.id).error);
  }finally{auth.close();}
});

test('malformed saved profiles, settings, schedules and unavailable storage recover safely', () => {
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  let stored;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:()=>{throw new Error('Quota exceeded');}}});
  try {
    for(const [validate,invalid] of [[validProfile,{name:42}],[validSettings,{theme:{}}],[validEvents,{}],[validEvents,[null]],[validEvents,[{id:'a',title:'bad date',time:1e20,room:'studio'}]]]) {
      stored=JSON.stringify(invalid);
      const fallback={safe:true};
      assert.equal(readSaved('test',fallback,validate),fallback);
    }
    stored='{broken';assert.deepEqual(readSaved('test',[]),[]);
    stored='{"theme":"dark"}';assert.deepEqual(readSaved('test',{},validSettings),{theme:'dark'});
    assert.equal(save('test',{}),false);
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
