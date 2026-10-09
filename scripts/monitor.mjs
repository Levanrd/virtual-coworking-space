// Independent process so a blocked/crashed app can still be detected. This is
// host-local monitoring, not an external uptime guarantee or notification service.
let previous = '', failures = 0;
async function check() {
  const issues = [];
  try {
    const response = await fetch(`${process.env.OPS_ORIGIN}/api/ops`, {
      headers: { Authorization: `Bearer ${process.env.OPS_TOKEN}` }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('unavailable');
    const state = await response.json();
    if (!state.ready) issues.push('not_ready');
    if (state.eventLoopP95Ms > 100) issues.push('event_loop_slow');
    if (state.memoryBytes > 768 * 1024 * 1024) issues.push('memory_high');
    if (state.backup.enabled && (!state.backup.lastSuccess || Date.now() - Date.parse(state.backup.lastSuccess) > 26 * 3600000)) issues.push('backup_overdue');
    if (state.recentErrors.some(error => Date.now() - Date.parse(error.time) < 5 * 60000)) issues.push('recent_errors');
    failures = 0;
  } catch { if (++failures >= 2) issues.push('unreachable'); else return; }
  const status = issues.join(',') || 'healthy';
  if (status !== previous) console.log(JSON.stringify({ time: new Date().toISOString(), event: 'monitor_state', status }));
  previous = status;
}
await check();
setInterval(check, 30000);
