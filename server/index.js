import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import { WorldState, cleanProfile } from "./state.js";
import { ROOMS } from "../shared/world.js";
import {roomArrival} from '../shared/architecture.js';
import { AuthStore, installAuth, sameOrigin } from "./auth.js";
import { createMailer } from './mail.js';
import { AccessStore, installAccess } from './access.js';
import { rtcConfig, validateProduction, securityHeaders } from './runtime.js';
import { loadEnvFile } from 'node:process';
import { createOperations, tokenBucket, operationalLog } from './operations.js';
import { scheduleBackups } from './backups.js';
import { claimInstance } from './instance-lease.js';
// Local development reads the generated Docker relay settings on startup.
if(process.env.NODE_ENV !== 'production') {
  try {loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.env'));}
  catch(error) {if(error.code!=='ENOENT') throw error;}
}

export function createWorkspaceServer({
  authFile,
  sessionMs,
  authRateLimit,
  mailer = createMailer(),
  requireVerification = process.env.NODE_ENV === 'production' || process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  origin = process.env.APP_ORIGIN,
  maxUsers = Number(process.env.MAX_ONLINE_USERS || 20),
  registrationEmails = process.env.REGISTRATION_EMAILS,
  opsToken = process.env.OPS_TOKEN,
  log = operationalLog,
  backupDir = process.env.BACKUP_DIR,
  singleInstance = process.env.NODE_ENV === 'production',
} = {}) {
  validateProduction();
  if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 100)
    throw new Error('MAX_ONLINE_USERS must be an integer from 1 to 100. Load test before raising it.');
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 64_000 });
  http.requestTimeout = 15000;
  http.headersTimeout = 10000;
  http.keepAliveTimeout = 5000;
  const state = new WorldState();
  const auth = new AuthStore(
    authFile ||
      process.env.AUTH_DB_PATH ||
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../data/accounts.sqlite",
      ),
    { sessionMs },
  );
  let lease;
  try { lease = singleInstance ? claimInstance(auth.db) : null; }
  catch (error) { auth.close(); throw error; }
  const ops = createOperations({ db: auth.db, state, io, maxUsers, token: opsToken, log });
  app.use((req, res, next) => {
    if (lease && !lease.owned()) { ops.drain(); void shutdown(); }
    next();
  });
  app.use(ops.middleware);
  app.disable("x-powered-by");
  if(process.env.TRUST_PROXY) app.set('trust proxy',process.env.TRUST_PROXY.split(',').map(s=>s.trim()));
  app.use(securityHeaders);
  app.use(express.json({ limit: "8kb" }));
  const { requireAuth } = installAuth(app, io, auth, {
    rateLimit: authRateLimit,
    mailer, requireVerification, origin, registrationEmails, reportFailure: code => ops.failure(code),
  });
  const access = new AccessStore(auth.db);
  installAccess(app,io,access,requireAuth,state);
  io.use((socket, next) => {
    if (ops.isDraining()) return next(Object.assign(new Error('The workspace is restarting.'), { data: { code: 'RESTARTING' } }));
    const session = sameOrigin(socket.request) && auth.session(socket.request);
    if (!session) {
      const error = new Error("Sign in to enter your workspace.");
      error.data = { code: "UNAUTHORIZED" };
      return next(error);
    }
    if(requireVerification && !session.user.emailVerified) {
      const error = new Error('Verify your email before entering a workspace.');
      error.data = {code:'EMAIL_UNVERIFIED'};
      return next(error);
    }
    const accountConnections = [...io.sockets.sockets.values()].filter(s => s.data.auth?.user.id === session.user.id).length;
    if (io.sockets.sockets.size >= maxUsers * 2 + 10 || accountConnections >= 2) {
      ops.counters.capacityRejects++;
      return next(Object.assign(new Error('Connection limit reached. Close another workspace tab and try again.'), { data: { code: 'CAPACITY' } }));
    }
    socket.data.auth = session;
    next();
  });
  app.get("/api/health", (_, res) =>
    res.json({ ok: true, service: "Common Ground" }),
  );
  app.get('/api/ready', (_, res) => res.status(ops.ready() ? 200 : 503).set('Cache-Control', 'no-store').json({ ready: ops.ready() }));
  app.get('/api/ops', ops.protectedEndpoint, (_, res) => res.json({ ...ops.snapshot(), backup: backupStatus }));
  const errorRates = new Map();
  app.post('/api/client-errors', requireAuth, (req, res) => {
    if (!sameOrigin(req)) return res.sendStatus(403);
    const code = req.body?.code;
    if (!['render_failed', 'script_failed', 'promise_failed', 'media_failed'].includes(code)) return res.sendStatus(400);
    const now = Date.now();
    for (const [key, expiry] of errorRates) if (expiry <= now) errorRates.delete(key);
    if (errorRates.has(req.account.id) || errorRates.size >= 1000) return res.sendStatus(429);
    errorRates.set(req.account.id, now + 60000);
    ops.counters.clientErrors++;
    res.status(202).json({ reference: ops.failure(code, req.requestId) });
  });
  app.get("/api/rtc-config", requireAuth, (req, res) => {
    res.set('Cache-Control','no-store').json(rtcConfig(req.account.id));
  });
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist",
  );
  app.use(express.static(root, { setHeaders(res, filename) {
    res.setHeader('Cache-Control', filename.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  } }));
  app.use("/api", (_, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.get("/{*splat}", (_, res) => res.sendFile(path.join(root, "index.html")));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.type === "entity.too.large"
        ? 413
        : error.type === "entity.parse.failed"
          ? 400
          : 500;
    const reference = status === 500 ? ops.failure('request_failed', req.requestId) : undefined;
    res.status(status).json({
      reference,
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : "The request body is invalid or too large.",
    });
  });
  // One authoritative snapshot per dirty workspace per tick, regardless of how
  // many people move. Reliable delivery preserves seat/privacy corrections.
  const dirtySpaces = new Set();
  const movingUsers = new Set();
  const publish = space => dirtySpaces.add(space);
  let ticks = 0;
  const broadcastTimer = setInterval(() => {
    // Repair a dropped volatile motion packet even after a person stops moving.
    if (++ticks % 40 === 0) for (const user of state.users.values()) dirtySpaces.add(user.space);
    for (const space of dirtySpaces) {
      const snapshot = state.snapshot(space);
      io.to(`space:${space}`).emit('world', snapshot);
      ops.counters.broadcasts++;
      ops.counters.broadcastBytes += Buffer.byteLength(JSON.stringify(snapshot)) * (io.sockets.adapter.rooms.get(`space:${space}`)?.size || 0);
    }
    const motionGroups = new Map();
    for (const id of movingUsers) {
      const user = state.users.get(id);
      if (!user || dirtySpaces.has(user.space)) continue;
      const key = `motion:${user.space}:${user.room}`;
      if (!motionGroups.has(key)) motionGroups.set(key, []);
      motionGroups.get(key).push({ id: user.id, x: user.x, z: user.z, rotation: user.rotation, motionVersion: user.motionVersion, jumpStartedAt: user.jumpStartedAt });
    }
    for (const [room, users] of motionGroups) {
      const packet = { users, time: Date.now() };
      io.to(room).volatile.emit('motion', packet);
      ops.counters.broadcasts++;
      ops.counters.broadcastBytes += Buffer.byteLength(JSON.stringify(packet)) * (io.sockets.adapter.rooms.get(room)?.size || 0);
    }
    movingUsers.clear();
    dirtySpaces.clear();
  }, 50);
  broadcastTimer.unref();
  const ackSafe = (ack) => (typeof ack === "function" ? ack : () => {});
  function syncChannels(socket, user) {
    for (const room of socket.rooms)
      if (room.startsWith("chat:") || room.startsWith('motion:')) socket.leave(room);
    socket.join(`motion:${user.space}:${user.room}`);
    socket.join(`chat:${state.key(user, null)}`);
    if (user.table) socket.join(`chat:${state.key(user)}`);
    socket.emit("board", {room:user.room,table:user.table,session:user.tableSession, board:state.board(user)});
    socket.emit("history", {
      room: state.messages.get(state.key(user, null)) || [],
      table: user.table ? state.messages.get(state.key(user)) || [] : [],
    });
  }
  io.on("connection", (socket) => {
    const session = socket.data.auth;
    socket.join(`session:${session.key}`);
    socket.join(`account:${session.user.id}`);
    const expire = () => {
      socket.emit("auth-expired");
      socket.disconnect(true);
    };
    const expiryTimer = setTimeout(
      expire,
      Math.max(0, session.expiresAt - Date.now()),
    );
    expiryTimer.unref();
    const allowEvent = tokenBucket(200, 80);
    socket.use((packet, next) => {
      if (lease && !lease.owned()) { ops.drain(); void shutdown(); return; }
      if (ops.isDraining()) return;
      if (!allowEvent()) {
        ops.counters.rejectedEvents++;
        const ack = packet.at(-1);
        if (typeof ack === 'function') ack({ error: 'Too many actions. Please slow down.', code: 'RATE_LIMITED' });
        return;
      }
      if (!auth.session(socket.request)) {
        expire();
        return;
      }
      const user=state.users.get(socket.id);
      if(user && !access.allowed(user.space,session.user.id)) {socket.emit('access-revoked',{message:'Workspace access has been restricted.'}); socket.disconnect(true);return;}
      next();
    });
    const rate = new Map();
    const limited = (event, ms) => {
      const now = Date.now();
      if (now - (rate.get(event) || 0) < ms) return true;
      rate.set(event, now);
      return false;
    };
    socket.on("enter", (data, ack) => {
      ack = ackSafe(ack);
      if (state.users.has(socket.id))
        return ack({ error: "Already connected." });
      if (state.users.size >= maxUsers) {
        ops.counters.capacityRejects++;
        return ack({ error: `All ${maxUsers} places are in use. We will try again shortly.`, code: 'CAPACITY' });
      }
      const space = data?.space || 'common-ground';
      if(typeof space !== 'string' || !access.enter(space,session.user.id)) return ack({error:'A workspace invitation is required.',code:'FORBIDDEN'});
      const user = state.add(socket.id, data || {});
      user.accountId = session.user.id;
      user.username = session.user.username;
      socket.join(`space:${user.space}`);
      syncChannels(socket, user);
      ack({ ok: true, id: socket.id });
      publish(user.space);
    });
    socket.on("profile", (data, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({ error: "Reconnect to the workspace." });
      Object.assign(user, cleanProfile(data));
      publish(user.space);
      ackSafe(ack)({ ok: true });
    });
    socket.on("join-table", (data, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({ error: "Reconnect to the workspace." });
      const result = state.join(user, data || {});
      if (result.ok) {
        syncChannels(socket, user);
        publish(user.space);
      }
      ackSafe(ack)(result);
    });
    socket.on('join-invited', (data, ack) => {
      const user=state.users.get(socket.id);
      if(!user || user.room!==data?.room) return ackSafe(ack)({error:'Enter the invited room first.'});
      const seats=state.snapshot(user.space).users.filter(u=>u.room===user.room&&u.table===data.table);
      const seat=Array.from({length:6},(_,i)=>i).find(i=>!seats.some(u=>u.seat===i));
      if(seat===undefined)return ackSafe(ack)({error:'That table is now full.'});
      const result=state.join(user,{table:data.table,seat,code:data.code});
      if(result.ok){syncChannels(socket,user);publish(user.space);}
      ackSafe(ack)(result);
    });
    socket.on("leave-table", (_, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({ error: "Reconnect to the workspace." });
      state.release(user);
      syncChannels(socket, user);
      publish(user.space);
      ackSafe(ack)({ ok: true });
    });
    socket.on("room", (room, ack) => {
      const user = state.users.get(socket.id);
      if (!user || !ROOMS.some((r) => r.id === room))
        return ackSafe(ack)({ error: "Room not found." });
      state.release(user);
      Object.assign(user, {
        ...roomArrival(room,user.room),
        room,
        jumpStartedAt: null,
        motionVersion: user.motionVersion + 1,
      });
      syncChannels(socket, user);
      publish(user.space);
      ackSafe(ack)({ ok: true });
    });
    socket.on("move", (position = {}) => {
      position ??= {};
      const user = state.users.get(socket.id);
      if (
        !user ||
        user.table ||
        position.motionVersion !== user.motionVersion ||
        limited("move", 40)
      )
        return;
      if (state.move(user, position)) movingUsers.add(user.id);
    });
    socket.on("jump", (data, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({ error: "Reconnect to the workspace." });
      const result = state.jump(user, data?.motionVersion);
      if (result.ok) publish(user.space);
      ackSafe(ack)(result);
    });
    socket.on("privacy", (isPrivate, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({ error: "Reconnect to the workspace." });
      const result = state.privacy(user, isPrivate);
      if (result.ok) publish(user.space);
      ackSafe(ack)(result);
    });
    socket.on("table-code", (_, ack) => {
      const user = state.users.get(socket.id);
      ackSafe(ack)(
        user?.table
          ? { ok: true, code: state.table(user, user.table).code }
          : { error: "Join a table first." },
      );
    });
    socket.on("media", (data = {}) => {
      data ??= {};
      const user = state.users.get(socket.id);
      if (!user || !user.table) return;
      Object.assign(user, {
        mic: !!data.mic,
        camera: !!data.camera,
        sharing: !!data.sharing,
      });
      publish(user.space);
    });
    socket.on("status", (status) => {
      const user = state.users.get(socket.id);
      if (!user || !["available", "focus", "away"].includes(status)) return;
      user.status = status;
      publish(user.space);
    });
    socket.on("chat", (data, ack) => {
      const user = state.users.get(socket.id);
      if (!user || limited("chat", 350))
        return ackSafe(ack)({ error: "Give it a moment, then send again." });
      const result = state.chat(user, data);
      if (result.ok)
        io.to(`chat:${result.key}`).emit("message", result.message);
      ackSafe(ack)({ ok: result.ok, error: result.error });
    });
    socket.on('board-read',(_,ack)=>{if(limited('board-read',1000))return ackSafe(ack)({error:'Please wait before refreshing the board.'});const user=state.users.get(socket.id);ackSafe(ack)({ok:!!user?.table,board:state.board(user)});});
    socket.on('board-edit', (data, ack) => {
      const user=state.users.get(socket.id);
      if (limited('board-edit',120)) return ackSafe(ack)({error:'Please wait a moment before editing again.'});
      const result=state.updateBoard(user,data);
      if(result.ok) io.to(`chat:${state.key(user)}`).emit('board-update',{room:user.room,table:user.table,patch:result.patch});
      ackSafe(ack)(result);
    });
    socket.on('request-join', (targetId, ack) => {
      const user=state.users.get(socket.id);
      if(!user || limited('request-join',10000)) return ackSafe(ack)({error:'Please wait before requesting again.'});
      const result=state.requestJoin(user,targetId);
      if(result.ok) io.to(result.request.host).emit('join-request',{...result.request,name:user.name});
      ackSafe(ack)({ok:result.ok,error:result.error});
    });
    socket.on('answer-join', (data, ack) => {
      const user=state.users.get(socket.id);
      if(!user) return ackSafe(ack)({error:'Reconnect to the workspace.'});
      const result=state.answerJoin(user,data);
      if(result.ok) io.to(result.to).emit('join-answer',{invitation:result.invitation});
      ackSafe(ack)({ok:result.ok,error:result.error});
    });
    socket.on("signal", (data = {}) => {
      data ??= {};
      if (state.canSignal(state.users.get(socket.id), state.users.get(data.to)))
        io.to(data.to).emit("signal", {
          from: socket.id,
          generation: typeof data.generation === 'string' ? data.generation.slice(0,40) : 'initial',
          restart: typeof data.restart === 'string' ? data.restart.slice(0,40) : undefined,
          description: data.description,
          candidate: data.candidate,
          streamIds: data.streamIds,
        });
    });
    socket.on("reaction", (reaction, ack) => {
      const user = state.users.get(socket.id);
      if (!user) return ackSafe(ack)({error:'Reconnect to the workspace.'});
      if (!["wave", "heart", "clap", "coffee", "nod", "stretch"].includes(reaction)) return ackSafe(ack)({error:'Choose an available reaction.'});
      if (limited("reaction", 1000)) return ackSafe(ack)({error:'Give your reaction a moment before sending another.'});
      io.to(`space:${user.space}`).emit("reaction", {
        id: user.id,
        reaction,
        room: user.room,
      });
      ackSafe(ack)({ok:true});
    });
    socket.on("disconnect", () => {
      clearTimeout(expiryTimer);
      const user = state.users.get(socket.id);
      if (user) {
        const space = user.space;
        state.remove(socket.id);
        publish(space);
      }
    });
  });
  const backupStatus = { enabled: !!backupDir, lastSuccess: null, lastFailure: null };
  const backups = backupDir ? scheduleBackups(auth.db, backupDir, {
    onSuccess() { backupStatus.lastSuccess = new Date().toISOString(); log('backup_completed'); },
    onFailure() { backupStatus.lastFailure = new Date().toISOString(); ops.failure('backup_failed'); },
  }) : null;
  const leaseTimer = lease ? setInterval(() => {
    if (!lease.renew()) void shutdown();
  }, 5000) : null;
  leaseTimer?.unref();
  http.once('close', async () => {
    clearInterval(leaseTimer);
    clearInterval(broadcastTimer);
    ops.close();
    await backups?.stop();
    lease?.release();
    auth.close();
  });
  let stopping;
  function shutdown() {
    if (stopping) return stopping;
    ops.drain();
    io.emit('server-restarting');
    stopping = (async () => {
      await backups?.stop();
      // Give the restart notice a chance to reach connected browsers.
      await new Promise(resolve => setTimeout(resolve, 150));
      await new Promise(resolve => io.close(resolve));
    })();
    return stopping;
  }
  return { http, io, state, auth, access, ops, shutdown };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { http, shutdown } = createWorkspaceServer();
  const port = Number(process.env.PORT) || 3001;
  http.listen(port, "0.0.0.0", () =>
    operationalLog('server_ready'),
  );
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 20000);
    deadline.unref();
    void shutdown().then(() => { clearTimeout(deadline); }, () => process.exit(1));
  });
  process.on('uncaughtException', () => { operationalLog('uncaught_exception'); process.exit(1); });
  process.on('unhandledRejection', () => { operationalLog('unhandled_rejection'); process.exit(1); });
}
