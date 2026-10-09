import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { io } from 'socket.io-client';
import { createWorkspaceServer } from '../server/index.js';
import { AuthStore } from '../server/auth.js';
import { WorldState } from '../server/state.js';
import { rtcConfig,validateProduction } from '../server/runtime.js';
import { isWalkable,walkStep,cameraDirection } from '../shared/navigation.js';

test('server rejects teleports, desk penetration and invalid movement without leaking motion bookkeeping',()=>{
  const state=new WorldState(),user=state.add('mover');
  state.move(user,{x:0,z:5.8,motionVersion:0},1000);
  assert.equal(user.z,5.8);
  state.move(user,{x:7,z:-6,motionVersion:0},1100);
  assert.equal(user.z,5.8);assert.equal(user.motionVersion,1);
  user.x=-5.8;user.z=3;
  state.move(user,{x:-5.4,z:3,motionVersion:1},2000);
  assert.equal(user.x,-5.8);assert.equal(user.motionVersion,2);
  assert.equal(state.move(user,{x:NaN,z:3,motionVersion:2}),false);
  assert.equal(state.snapshot(user.space).users[0].lastMoveAt,undefined);
});
test('walk sweeps stay collision-free at varied frame rates along furniture and room edges',()=>{
  for(const fps of [20,30,60,144]) for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI]) {
    let p={x:0,z:6};
    for(let i=0;i<fps*8;i++) {p=walkStep(p,cameraDirection(1,i>fps*4?1:0,yaw),1/fps);assert.ok(isWalkable(p.x,p.z));}
  }
});
test('TURN credentials are scoped, expiring HMAC credentials and production fails closed',()=>{
  const env={TURN_SECRET:'a'.repeat(64),TURN_URLS:'turn:relay.test:3478?transport=udp,turns:relay.test:5349',RTC_RELAY_ONLY:'true'};
  const config=rtcConfig('account-a',env,1000000),relay=config.iceServers[1];
  assert.equal(relay.username,'4600:account-a');
  assert.equal(relay.credential,createHmac('sha1',env.TURN_SECRET).update(relay.username).digest('base64'));
  assert.equal(config.iceTransportPolicy,'relay');
  assert.ok(!JSON.stringify(config).includes(env.TURN_SECRET));
  assert.throws(()=>validateProduction({NODE_ENV:'production'}),/configuration/);
  assert.doesNotThrow(()=>validateProduction({...env,NODE_ENV:'production',APP_ORIGIN:'https://workspace.test',SMTP_HOST:'smtp.test',MAIL_FROM:'hello@workspace.test'}));
});
test('reset tokens expire, are single-use under concurrent requests, and revoke all sessions',async()=>{
  const store=new AuthStore(':memory:');
  try {
    const {user}=await store.register({fullName:'Reset Worker',username:'resetworker',email:'reset@example.test',age:28,password:'original-long-password'});
    const session=store.createSession(user.id);
    const token=store.issueToken(user.id,'reset');
    assert.ok(!JSON.stringify(store.db.prepare('SELECT * FROM account_tokens').all()).includes(token));
    const results=await Promise.all([store.resetPassword(token,'replacement-password-one'),store.resetPassword(token,'replacement-password-two')]);
    assert.equal(results.filter(r=>r.ok).length,1);
    assert.equal(store.session({headers:{cookie:`cg_session=${session.token}`}}),null);
    assert.ok((await store.login({identifier:user.username,password:'original-long-password'})).error);
    const expired=store.issueToken(user.id,'reset');store.db.prepare('UPDATE account_tokens SET expires_at=0').run();
    assert.ok((await store.resetPassword(expired,'another-long-password')).error);
  }finally{store.close();}
});
test('verified accounts, workspace invitations, reconnects, live bans and reports are enforced end to end',{timeout:30000},async t=>{
  const mails=[];
  const server=createWorkspaceServer({authFile:':memory:',requireVerification:true,mailer:async m=>{mails.push(m);}});
  await new Promise(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.http.address().port}`,clients=[];
  t.after(async()=>{clients.forEach(c=>c.disconnect());await new Promise(resolve=>server.io.close(resolve));});
  const api=async(path,body,cookie)=>{
    const response=await fetch(`${base}/api/${path}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],data:await response.json()};
  };
  const accounts=[];
  for(let i=0;i<3;i++) {
    const r=await api('auth/register',{fullName:`Worker ${i}`,username:`ready${i}`,email:`ready${i}@example.test`,age:30,password:'readiness-test-password'});
    assert.equal(r.status,201);accounts.push(r);
    assert.equal((await api('rtc-config',undefined,r.cookie)).status,403);
    const token=mails.at(-1).text.match(/verify=([a-f0-9]{64})/)[1];
    assert.equal((await api('auth/verify-email',{token})).status,200);
    assert.equal((await api('auth/verify-email',{token})).status,400);
  }
  const [owner,member,outsider]=accounts;
  assert.equal((await api('workspaces',{space:'review-team',name:'Review Team'},owner.cookie)).status,200);
  assert.equal((await api('workspaces/review-team',undefined,outsider.cookie)).status,403);
  assert.equal((await api('workspaces/review-team/invites',{},outsider.cookie)).status,400);
  const invitation=await api('workspaces/review-team/invites',{},owner.cookie);
  assert.equal((await api('workspaces/redeem',{token:invitation.data.token},member.cookie)).status,200);
  assert.equal((await api('workspaces/redeem',{token:invitation.data.token},outsider.cookie)).status,400);
  const connect=async account=>{const c=io(base,{autoConnect:false,reconnection:false,transports:['websocket'],extraHeaders:{Cookie:account.cookie}});clients.push(c);const ready=once(c,'connect');c.connect();await ready;return c;};
  const a=await connect(owner),b=await connect(member),c=await connect(outsider);
  assert.equal((await c.emitWithAck('enter',{space:'review-team'})).code,'FORBIDDEN');
  for(const client of [a,b])assert.equal((await client.emitWithAck('enter',{space:'review-team'})).ok,true);
  await a.emitWithAck('join-table',{table:'design',seat:0});await b.emitWithAck('join-table',{table:'design',seat:1});
  const locked=await a.emitWithAck('privacy',true);
  const oldId=b.id;b.disconnect();
  const b2=await connect(member);await b2.emitWithAck('enter',{space:'review-team'});
  assert.equal(server.state.users.has(oldId),false);
  assert.equal(server.state.users.get(b2.id).mic,false);
  assert.equal(server.state.users.get(b2.id).table,null);
  assert.equal((await b2.emitWithAck('join-table',{table:'design',seat:1})).code,'PRIVATE');
  assert.equal((await b2.emitWithAck('join-table',{table:'design',seat:1,code:locked.code})).ok,true);
  assert.equal((await api('workspaces/review-team/reports',{target:owner.data.user.id,reason:'Session test concern'},member.cookie)).status,200);
  assert.equal((await api('workspaces/review-team/reports',undefined,member.cookie)).status,403);
  const reports=await api('workspaces/review-team/reports',undefined,owner.cookie);assert.equal(reports.data.reports.length,1);
  assert.equal((await api(`workspaces/review-team/reports/${reports.data.reports[0].id}/resolve`,{},owner.cookie)).status,200);
  assert.equal((await api('workspaces/review-team/moderate',{target:owner.data.user.id,action:'ban',reason:'Cannot ban owner'},member.cookie)).status,403);
  const disconnected=once(b2,'disconnect');
  assert.equal((await api('workspaces/review-team/moderate',{target:member.data.user.id,action:'ban',reason:'Ban test'},owner.cookie)).status,200);
  await disconnected;
  assert.equal((await api('workspaces/review-team',undefined,member.cookie)).status,403);
  const fresh=await api('workspaces/review-team/invites',{},owner.cookie);
  assert.equal((await api('workspaces/redeem',{token:fresh.data.token},member.cookie)).status,400);
  assert.equal((await api('workspaces/review-team/moderate',{target:member.data.user.id,action:'unban',reason:'Test complete'},owner.cookie)).status,200);
  assert.equal((await api('workspaces/review-team',undefined,member.cookie)).status,200);
  const reset=await api('auth/forgot-password',{email:'ready0@example.test'});
  const unknown=await api('auth/forgot-password',{email:'unknown@example.test'});
  assert.deepEqual(reset.data,unknown.data);
  const resetToken=mails.at(-1).text.match(/reset=([a-f0-9]{64})/)[1];
  const kicked=once(a,'disconnect');
  assert.equal((await api('auth/reset-password',{token:resetToken,password:'new-readiness-password'})).status,200);
  await kicked;
  assert.equal((await api('auth/me',undefined,owner.cookie)).status,401);
});
