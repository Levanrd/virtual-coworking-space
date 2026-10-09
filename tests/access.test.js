import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthStore} from '../server/auth.js';
import {AccessStore} from '../server/access.js';

test('invites expire, are hashed, cannot bypass restrictions, and lose authority with their creator',async()=>{
  const auth=new AuthStore(':memory:');
  try{
    const accounts=[];
    for(let i=0;i<3;i++) accounts.push((await auth.register({fullName:`Access ${i}`,username:`access${i}`,email:`access${i}@example.test`,age:30,password:'access-test-password'})).user);
    const [owner,mod,guest]=accounts,access=new AccessStore(auth.db);
    assert.ok(access.create('Bad Address!','Bad',owner.id).error);
    assert.equal(access.create('access-test','Access test',owner.id).ok,true);
    assert.ok(access.create('access-test','Duplicate',guest.id).error);
    const invite=access.invite('access-test',owner.id);
    assert.ok(!JSON.stringify(auth.db.prepare('SELECT * FROM workspace_invites').all()).includes(invite.token));
    auth.db.prepare('UPDATE workspace_invites SET expires_at=0').run();
    assert.ok(access.redeem(invite.token,guest.id).error);
    assert.equal(access.redeem(access.invite('access-test',owner.id).token,mod.id).ok,true);
    auth.db.prepare("UPDATE memberships SET role='moderator' WHERE account_id=?").run(mod.id);
    const byMod=access.invite('access-test',mod.id);
    auth.db.prepare("UPDATE memberships SET role='member' WHERE account_id=?").run(mod.id);
    assert.ok(access.redeem(byMod.token,guest.id).error);
    assert.equal(access.redeem(access.invite('access-test',owner.id).token,guest.id).ok,true);
    auth.db.prepare('UPDATE memberships SET kicked_until=? WHERE account_id=?').run(Date.now()+300000,guest.id);
    assert.equal(access.enter('access-test',guest.id),false);
    assert.ok(access.redeem(access.invite('access-test',owner.id).token,guest.id).error);
    auth.db.prepare('UPDATE memberships SET kicked_until=0, banned=1 WHERE account_id=?').run(guest.id);
    assert.equal(access.enter('access-test',guest.id),false);
    // Reconstructing authorization state keeps bans and owners intact.
    const restored=new AccessStore(auth.db);
    assert.equal(restored.allowed('access-test',guest.id),false);
    assert.equal(restored.manager('access-test',owner.id),true);
  }finally{auth.close();}
});
