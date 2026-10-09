const origin = process.env.OPS_ORIGIN || 'http://127.0.0.1:3001';
if (!process.env.OPS_TOKEN) throw new Error('OPS_TOKEN is required.');
const response = await fetch(`${origin}/api/ops`, { headers: { Authorization: `Bearer ${process.env.OPS_TOKEN}` }, signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error(`Status request failed (${response.status}).`);
const state = await response.json();
console.log(JSON.stringify(state, null, 2));
const backupStale = state.backup.enabled && (!state.backup.lastSuccess || Date.now() - Date.parse(state.backup.lastSuccess) > 26 * 3600000);
if (!state.ready || backupStale || state.eventLoopP95Ms > 100 || state.memoryBytes > 768 * 1024 * 1024) process.exitCode = 1;
