import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { io } from 'socket.io-client';
import { createWorkspaceServer } from '../server/index.js';
import { AuthStore } from '../server/auth.js';
import { AccessStore } from '../server/access.js';
import { backupDatabase, verifyBackup } from '../server/backups.js';
import { tokenBucket } from '../server/operations.js';
import { claimInstance } from '../server/instance-lease.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('single authority lease blocks replicas and fences an expired owner', () => {
  const db = new DatabaseSync(':memory:');
  let now = 1000;
  try {
    const first = claimInstance(db, () => now);
    assert.throws(() => claimInstance(db, () => now), /Another app instance/);
    now += 31000;
    const second = claimInstance(db, () => now);
    assert.equal(first.owned(), false); assert.equal(first.renew(), false);
    first.release(); assert.equal(second.owned(), true);
    second.release(); assert.equal(second.owned(), false);
  } finally { db.close(); }
});

test('event budget absorbs bursts, refills and does not grow with clock reversal', () => {
  let now = 1000;
  const allow = tokenBucket(2, 2, () => now);
  assert.equal(allow(), true); assert.equal(allow(), true); assert.equal(allow(), false);
  now += 500; assert.equal(allow(), true); assert.equal(allow(), false);
  now -= 100; assert.equal(allow(), false);
});

test('online WAL backup preserves identities and memberships; retention never deletes other files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cg-recovery-'));
  const store = new AuthStore(path.join(dir, 'live.sqlite'));
  try {
    const access = new AccessStore(store.db);
    const { user } = await store.register({ fullName: 'Recovery Test', username: 'recoverytest', email: 'recovery@example.test', age: 25, password: 'recovery-test-password' });
    access.create('restore-test', 'Restore Test', user.id);
    const snapshots = path.join(dir, 'backups');
    const first = await backupDatabase(store.db, snapshots, 1);
    await writeFile(path.join(snapshots, 'keep.sqlite'), 'unrelated');
    const second = await backupDatabase(store.db, snapshots, 1);
    assert.deepEqual(verifyBackup(second.filename), { accounts: 1, memberships: 1 });
    assert.equal((await readdir(snapshots)).includes(path.basename(first.filename)), false);
    assert.equal((await readdir(snapshots)).includes('keep.sqlite'), true);
    const recovered = new AuthStore(second.filename);
    try { assert.equal((await recovered.login({ identifier: user.username, password: 'recovery-test-password' })).user.id, user.id); }
    finally { recovered.close(); }
    const script = fileURLToPath(new URL('../scripts/backup.mjs', import.meta.url));
    const recoveryCopy = path.join(dir, 'recovered.sqlite');
    execFileSync(process.execPath, [script, 'restore-copy', second.filename, recoveryCopy], { stdio: 'pipe' });
    assert.deepEqual(verifyBackup(recoveryCopy), { accounts: 1, memberships: 1 });
    assert.throws(() => execFileSync(process.execPath, [script, 'restore-copy', second.filename, recoveryCopy], { stdio: 'pipe' }));
    assert.deepEqual(verifyBackup(recoveryCopy), { accounts: 1, memberships: 1 });
    const invalid = new DatabaseSync(path.join(dir, 'invalid.sqlite')); invalid.close();
    assert.throws(() => verifyBackup(path.join(dir, 'invalid.sqlite')), /missing/);
  } finally {
    store.close();
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(dir, { recursive: true, force: true });
  }
});

test('capacity, private telemetry, admission allowlist, motion coalescing and graceful drain', { timeout: 20000 }, async () => {
  const token = 'local-ops-test-secret-'.repeat(3), logs = [], clients = [];
  const server = createWorkspaceServer({ authFile: ':memory:', maxUsers: 2, opsToken: token,
    registrationEmails: 'allowed@example.test', mailer: async () => { throw new Error('SMTP-SECRET-DO-NOT-LOG'); }, log: (event, fields) => logs.push({ event, fields }) });
  await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.http.address().port}`;
  try {
    const denied = await fetch(`${url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'outsider@example.test' }) });
    assert.equal(denied.status, 403);
    const admitted = await fetch(`${url}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'allowed@example.test', fullName: 'Allowed Friend', username: 'allowedfriend', age: 25, password: 'allowed-friend-password' }) });
    assert.equal(admitted.status, 201);
    assert.equal((await admitted.json()).emailSent, false);
    assert.ok(logs.some(entry => entry.event === 'mail_verification_failed'));
    assert.equal(JSON.stringify(logs).includes('SMTP-SECRET-DO-NOT-LOG'), false);
    assert.equal((await fetch(`${url}/api/ops`)).status, 404);
    assert.equal((await fetch(`${url}/api/ready`)).status, 200);
    for (let i = 0; i < 3; i++) {
      const { user } = await server.auth.register({ fullName: `Operations ${i}`, username: `ops${i}`, email: `ops${i}@example.test`, age: 25, password: 'operations-test-password' });
      const { token: session } = server.auth.createSession(user.id);
      const client = io(url, { autoConnect: false, transports: ['websocket'], extraHeaders: { Cookie: `cg_session=${session}` } });
      clients.push(client);
      await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); });
      const result = await client.timeout(2000).emitWithAck('enter', {});
      assert.equal(i < 2 ? result.ok : result.code, i < 2 ? true : 'CAPACITY');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    const [a, b, c] = clients;
    const motion = [];
    b.on('motion', data => motion.push(data));
    const before = server.ops.counters.broadcasts;
    for (let i = 0; i < 8; i++) {
      for (const client of [a, b]) {
        const user = server.state.users.get(client.id);
        client.emit('move', { x: user.x, z: user.z, rotation: i / 10, motionVersion: user.motionVersion });
      }
      await new Promise(resolve => setTimeout(resolve, 55));
    }
    assert.ok(motion.length > 0);
    assert.ok(server.ops.counters.broadcasts - before <= 11, 'movement batches both clients');
    await b.timeout(2000).emitWithAck('room', 'focus');
    await new Promise(resolve => setTimeout(resolve, 100));
    motion.length = 0;
    const user = server.state.users.get(a.id);
    a.emit('move', { x: user.x, z: user.z, rotation: 1, motionVersion: user.motionVersion });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(motion.length, 0, 'motion is isolated by room');
    a.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await c.timeout(2000).emitWithAck('enter', {})).ok, true);
    const cookie = c.io.opts.extraHeaders.Cookie;
    const report = await fetch(`${url}/api/client-errors`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'render_failed', message: 'DO-NOT-LOG-SECRET' }) });
    assert.equal(report.status, 202);
    const response = await fetch(`${url}/api/ops`, { headers: { Authorization: `Bearer ${token}` } });
    const metrics = await response.json();
    assert.equal(metrics.users, 2); assert.equal(metrics.counters.clientErrors, 1);
    assert.equal(JSON.stringify(logs).includes('DO-NOT-LOG-SECRET'), false);
    let restart = false;
    c.on('server-restarting', () => { restart = true; });
    const closing = server.shutdown();
    assert.equal(server.ops.ready(), false);
    assert.equal((await fetch(`${url}/api/ready`)).status, 503);
    await closing;
    assert.equal(restart, true);
  } finally {
    clients.forEach(client => client.disconnect());
    await server.shutdown();
  }
});
