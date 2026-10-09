// Isolated signaling/state benchmark. No production accounts or live host used.
// Does not measure GPU rendering, ISP bandwidth, or WebRTC audio/video quality.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { createWorkspaceServer } from '../server/index.js';

const duration = Number(process.env.LOAD_SECONDS || 20);
if (!Number.isFinite(duration) || duration < 5 || duration > 300) throw new Error('LOAD_SECONDS must be 5–300.');
const server = createWorkspaceServer({ authFile: ':memory:', maxUsers: 20, requireVerification: false, backupDir: '', log: () => {} });
const clients = [], latencies = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.http.address().port}`;
let timer;
try {
  for (let i = 0; i < 21; i++) {
    const { user } = await server.auth.register({ fullName: `Load Worker ${i}`, username: `load${i}`, email: `load${i}@example.test`, age: 28, password: 'isolated-load-test-password' });
    const session = server.auth.createSession(user.id);
    const client = io(url, { autoConnect: false, transports: ['websocket'], extraHeaders: { Cookie: `cg_session=${session.token}` } });
    client.on('world', data => { client.position = data.users.find(u => u.id === client.id); });
    client.on('motion', data => { const own = data.users.find(u => u.id === client.id); if (own) client.position = { ...client.position, ...own }; });
    clients.push(client);
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); });
    const result = await client.timeout(2000).emitWithAck('enter', {});
    assert.equal(i < 20 ? result.ok : result.code, i < 20 ? true : 'CAPACITY');
  }
  const excess = clients.pop(); excess.disconnect();
  await sleep(100);
  const base = server.ops.snapshot(), started = performance.now();
  let ticks = 0, movePackets = 0;
  timer = setInterval(() => {
    ticks++;
    for (const [i, client] of clients.entries()) {
      const p = client.position;
      if (!p) continue;
      // All twenty move in the open central aisle, a worst case shared room.
      client.emit('move', { x: Math.sin(ticks / 25 + i / 20) * 0.3, z: 6 + Math.cos(ticks / 25 + i / 20) * 0.3, rotation: ticks / 30, motionVersion: p.motionVersion });
      movePackets++;
    }
  }, 50);
  for (let second = 0; second < duration; second++) {
    await sleep(1000);
    await Promise.all(clients.map(async (client, i) => {
      const start = performance.now();
      const result = await client.timeout(2000).emitWithAck('profile', { name: `Load ${i}` });
      assert.equal(result.ok, true);
      latencies.push(performance.now() - start);
    }));
  }
  clearInterval(timer);
  const elapsed = (performance.now() - started) / 1000;
  const metrics = server.ops.snapshot();
  // Simultaneous chair claims must still have exactly one winner under load.
  const claims = await Promise.all(clients.map(client => client.timeout(2000).emitWithAck('join-table', { table: 'design', seat: 0 })));
  assert.equal(claims.filter(r => r.ok).length, 1);
  for (const client of clients.slice(0, 5)) client.disconnect();
  await sleep(150);
  assert.equal(server.state.users.size, 15);
  for (const client of clients.slice(0, 5)) {
    await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); client.connect(); });
    assert.equal((await client.timeout(2000).emitWithAck('enter', {})).ok, true);
  }
  assert.equal(server.state.users.size, 20);
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const result = { timestamp: new Date().toISOString(), node: process.version, users: 20, durationSeconds: Number(elapsed.toFixed(2)),
    movePackets, ackSamples: latencies.length, ackP95Ms: Number(p95.toFixed(2)), eventLoopP95Ms: metrics.eventLoopP95Ms,
    processMemoryMiB: Number((metrics.memoryBytes / 1024 / 1024).toFixed(1)),
    estimatedStateOutboundMbps: Number(((metrics.counters.broadcastBytes - base.counters.broadcastBytes) * 8 / elapsed / 1e6).toFixed(3)),
    capacityEnforced: true, exclusiveSeat: true, fiveReconnects: true,
    passed: p95 < 250 && metrics.eventLoopP95Ms < 100,
    scope: 'Loopback state/signaling only; process memory includes simulated clients. No media, rendering or cross-network certification.' };
  await mkdir('output', { recursive: true });
  await writeFile('output/load-test.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally { clearInterval(timer); clients.forEach(client => client.disconnect()); await server.shutdown(); }
