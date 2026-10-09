import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// Only fixed event names and explicitly selected numeric fields enter logs.
// Never pass request bodies, cookies, URLs, emails, SDP, or Error.message here.
export function operationalLog(event, fields = {}) {
  const entry = { time: new Date().toISOString(), event };
  for (const key of ['requestId', 'reference', 'status', 'durationMs', 'count', 'code'])
    if (fields[key] !== undefined) entry[key] = fields[key];
  console.log(JSON.stringify(entry));
}

export function tokenBucket(capacity, perSecond, now = Date.now) {
  let tokens = capacity, previous = now();
  return () => {
    const time = now();
    tokens = Math.min(capacity, tokens + Math.max(0, time - previous) * perSecond / 1000);
    previous = time;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

export function createOperations({ db, state, io, maxUsers, token = process.env.OPS_TOKEN, log = operationalLog }) {
  const started = Date.now();
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const counters = { requests: 0, serverErrors: 0, clientErrors: 0, rejectedEvents: 0, capacityRejects: 0, broadcasts: 0, broadcastBytes: 0 };
  const recentErrors = [];
  let draining = false;
  function failure(code, requestId) {
    const reference = randomUUID();
    const item = { reference, code, time: new Date().toISOString() };
    recentErrors.push(item);
    if (recentErrors.length > 50) recentErrors.shift();
    log(code, { reference, requestId });
    return reference;
  }
  function ready() {
    if (draining) return false;
    try { return db.prepare('SELECT 1 AS ok').get().ok === 1; } catch { return false; }
  }
  function snapshot() {
    return { ready: ready(), draining, uptimeSeconds: Math.floor((Date.now() - started) / 1000),
      users: state.users.size, connections: io.engine.clientsCount, maxUsers,
      memoryBytes: process.memoryUsage().rss,
      eventLoopP95Ms: Number((delay.percentile(95) / 1e6).toFixed(2)),
      counters: { ...counters }, recentErrors: [...recentErrors] };
  }
  function protectedEndpoint(req, res, next) {
    const supplied = req.headers.authorization || '';
    if (!token || token.length < 32 || supplied.length > 512 ||
        !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(`Bearer ${token}`).digest()))
      return res.status(404).json({ error: 'Endpoint not found.' });
    res.set('Cache-Control', 'no-store');
    next();
  }
  return { counters, failure, ready, snapshot, protectedEndpoint,
    isDraining: () => draining,
    drain() { draining = true; log('server_draining'); },
    close() { delay.disable(); },
    middleware(req, res, next) {
      req.requestId = randomUUID();
      res.set('X-Request-Id', req.requestId);
      const start = performance.now();
      res.on('finish', () => {
        counters.requests++;
        if (res.statusCode >= 500) counters.serverErrors++;
        if (res.statusCode >= 500 || performance.now() - start > 1000)
          log('http_request', { requestId: req.requestId, status: res.statusCode, durationMs: Math.round(performance.now() - start) });
      });
      if (draining && req.path !== '/api/health' && req.path !== '/api/ready')
        return res.status(503).set('Retry-After', '10').json({ error: 'The workspace is restarting. Please try again shortly.' });
      next();
    },
  };
}
