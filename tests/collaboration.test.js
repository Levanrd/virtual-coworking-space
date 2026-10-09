import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldState} from '../server/state.js';
import {safeLink,blankBoard,applyBoardPatch} from '../shared/collaboration.js';
import {connectionQuality,cameraBudget} from '../src/mediaQuality.js';

test('board operations are scoped to the current table session and preserve concurrent contributions',()=>{
  const state=new WorldState(),a=state.add('a'),b=state.add('b'),outsider=state.add('c');
  state.join(a,{table:'design',seat:0});state.join(b,{table:'design',seat:1});
  const edit=(user,operation)=>state.updateBoard(user,{...operation,session:user.tableSession});
  assert.ok(state.updateBoard(outsider,{type:'note',text:'intrusion'}).error);
  assert.ok(state.updateBoard(b,{type:'note',text:'intrusion',session:a.tableSession}).error);
  assert.equal(edit(a,{type:'note',text:'First idea'}).ok,true);
  assert.equal(edit(b,{type:'note',text:'Second idea'}).ok,true);
  assert.equal(state.board(a).notes.length,2);
  const first=state.board(a).notes[0];
  assert.ok(edit(b,{type:'remove',list:'notes',id:first.id}).error);
  assert.ok(edit(b,{type:'goal',text:'Take over'}).error);
  assert.equal(edit(a,{type:'goal',text:'Ship our project'}).ok,true);
  assert.equal(edit(b,{type:'stroke',points:[[0,.5],[1,1]],color:'#426950'}).ok,true);
  assert.ok(edit(b,{type:'stroke',points:[[0,NaN],[1,1]]}).error);
  assert.ok(edit(b,{type:'stroke',points:[[0,0],[2,1]]}).error);
  assert.equal(JSON.stringify(state.snapshot(a.space)).includes('First idea'),false,'Private board must never enter public snapshots');
  const old=b.tableSession;state.release(b);state.join(b,{table:'builders',seat:0});
  assert.ok(state.updateBoard(b,{session:old,type:'note',text:'Late packet'}).error);
  assert.equal(state.board(b).notes.length,0);
  state.release(a);state.join(a,{table:'design',seat:0});assert.equal(state.board(a).notes.length,0,'Empty tables forget private content');
});

test('resources reject executable URLs and drawings stay bounded',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','file:///secret','https://user:pass@example.test'])assert.equal(safeLink(url),null);
  assert.equal(safeLink('https://example.test/docs'),'https://example.test/docs');
  const state=new WorldState(),a=state.add('a');state.join(a,{table:'design',seat:0});
  for(let i=0;i<24;i++) assert.equal(state.updateBoard(a,{session:a.tableSession,type:'note',text:'A note'}).ok,true);
  assert.ok(state.updateBoard(a,{session:a.tableSession,type:'note',text:'Overflow'}).error);
  assert.ok(state.updateBoard(a,{session:a.tableSession,type:'stroke',points:Array.from({length:161},()=>[.1,.2])}).error);
});

test('joining a friend needs host approval, respects focus, expires, and never broadcasts a private code',()=>{
  const state=new WorldState(),a=state.add('a'),b=state.add('b'),c=state.add('c',{space:'elsewhere'});
  state.join(a,{table:'design',seat:0});const code=state.privacy(a,true).code;
  assert.ok(state.requestJoin(c,a.id).error);
  a.status='focus';assert.ok(state.requestJoin(b,a.id).error);a.status='available';
  const request=state.requestJoin(b,a.id,1000).request;
  assert.ok(request);assert.ok(state.requestJoin(b,a.id,2000).error);
  assert.ok(state.answerJoin(b,{id:request.id,accept:true},3000).error);
  assert.ok(state.answerJoin(a,{id:request.id,accept:true},62000).error);
  const next=state.requestJoin(b,a.id,63000).request;
  const result=state.answerJoin(a,{id:next.id,accept:true},64000);
  assert.equal(result.to,b.id);assert.equal(result.invitation.code,code);
  assert.equal(b.table,null,'Approval never automatically moves or activates devices');
  assert.ok(state.answerJoin(a,{id:next.id,accept:true},65000).error,'Approval is single use');
  assert.ok(!JSON.stringify(state.snapshot(a.space)).includes(code));
});

test('camera budgets respect peer fanout and respond to poor network conditions',()=>{
  assert.equal(connectionQuality({state:'connected',rtt:.7}),'poor');
  assert.equal(connectionQuality({state:'connected',loss:.04}),'fair');
  assert.equal(connectionQuality({state:'connecting'}),'connecting');
  assert.equal(connectionQuality({state:'connected',rtt:.05,loss:0}),'good');
  assert.ok(cameraBudget('good',5).maxBitrate*5<=1800000);
  assert.ok(cameraBudget('poor',5).maxBitrate<cameraBudget('good',5).maxBitrate);
  assert.equal(cameraBudget('poor').scaleResolutionDownBy,2);
});

test('incremental board updates converge without resending historical strokes',()=>{
  const state=new WorldState(),user=state.add('artist');state.join(user,{table:'design',seat:0});
  let client=blankBoard();
  for(let i=0;i<100;i++) {
    const result=state.updateBoard(user,{session:user.tableSession,type:'stroke',points:[[.123456,.56789],[.9,.8]],color:'#8765b5'});
    assert.ok(JSON.stringify(result.patch).length<240);
    client=applyBoardPatch(client,result.patch);
  }
  assert.deepEqual(client,state.board(user));
  assert.equal(applyBoardPatch(client,{revision:102,type:'clear'}),null,'Missing revisions trigger a scoped refresh');
});
