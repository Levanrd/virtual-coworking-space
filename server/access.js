import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { sameOrigin } from './auth.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{2,39}$/.test(value);
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';

export class AccessStore {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memberships (
        space TEXT NOT NULL REFERENCES workspaces(id), account_id TEXT NOT NULL REFERENCES accounts(id),
        role TEXT NOT NULL DEFAULT 'member', banned INTEGER NOT NULL DEFAULT 0, kicked_until INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(space, account_id));
      CREATE TABLE IF NOT EXISTS workspace_invites (
        token_hash TEXT PRIMARY KEY, space TEXT NOT NULL REFERENCES workspaces(id), creator TEXT NOT NULL REFERENCES accounts(id),
        expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY, space TEXT NOT NULL REFERENCES workspaces(id), reporter TEXT NOT NULL REFERENCES accounts(id),
        target TEXT NOT NULL REFERENCES accounts(id), reason TEXT NOT NULL, created_at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS moderation_log (
        id TEXT PRIMARY KEY, space TEXT NOT NULL, actor TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO workspaces VALUES ('common-ground', 'Common Ground', 0);`);
  }
  membership(space, accountId) {
    return this.db.prepare('SELECT * FROM memberships WHERE space = ? AND account_id = ?').get(space, accountId);
  }
  allowed(space, accountId) {
    const m = this.membership(space, accountId);
    return !!m && !m.banned && m.kicked_until <= Date.now();
  }
  enter(space, accountId) {
    if(space==='common-ground' && process.env.NODE_ENV==='production' && !process.env.COMMUNITY_OWNER_ACCOUNT_ID) return false;
    if (space === 'common-ground') this.db.prepare("INSERT OR IGNORE INTO memberships(space, account_id) VALUES ('common-ground', ?)").run(accountId);
    if(space==='common-ground' && accountId===process.env.COMMUNITY_OWNER_ACCOUNT_ID) this.db.prepare("UPDATE memberships SET role='owner', banned=0, kicked_until=0 WHERE space=? AND account_id=?").run(space,accountId);
    return this.allowed(space, accountId);
  }
  create(space, name, accountId) {
    if (!slug(space) || space === 'common-ground') return { error: 'Use 3–40 lowercase letters, numbers, or hyphens for the workspace address.' };
    if (this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(space)) return { error: 'That workspace address is already taken.' };
    if (this.db.prepare("SELECT COUNT(*) AS count FROM memberships WHERE account_id = ? AND role = 'owner'").get(accountId).count >= 20) return { error: 'You can own up to 20 workspaces.' };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO workspaces VALUES (?, ?, ?)').run(space, text(name,80) || space, Date.now());
      this.db.prepare("INSERT INTO memberships(space, account_id, role) VALUES (?, ?, 'owner')").run(space, accountId);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { ok: true, space };
  }
  manager(space, id) { return this.allowed(space,id) && ['owner','moderator'].includes(this.membership(space,id).role); }
  invite(space, id) {
    if (!this.manager(space,id)) return { error: 'Only workspace owners and moderators can create invites.' };
    const token = randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM workspace_invites WHERE expires_at <= ? OR used = 1').run(Date.now());
    this.db.prepare('INSERT INTO workspace_invites VALUES (?, ?, ?, ?, 0)').run(hash(token),space,id,Date.now()+86400000);
    return { ok: true, token, expiresAt: Date.now()+86400000 };
  }
  redeem(token, id) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return { error: 'This invitation is invalid.' };
    const invite = this.db.prepare('SELECT * FROM workspace_invites WHERE token_hash = ? AND used = 0 AND expires_at > ?').get(hash(token),Date.now());
    if (!invite || !this.manager(invite.space,invite.creator)) return { error: 'This invitation has expired or was already used.' };
    const existing = this.membership(invite.space,id);
    if (existing?.banned || existing?.kicked_until > Date.now()) return { error: 'Your workspace access has been restricted.' };
    // Opening your own invitation must not spend the guest's single-use token.
    if (existing) return { ok: true, space: invite.space };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO memberships(space, account_id) VALUES (?, ?)').run(invite.space,id);
      this.db.prepare('UPDATE workspace_invites SET used = 1 WHERE token_hash = ?').run(hash(token));
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    return { ok: true, space: invite.space };
  }
}

export function installAccess(app, io, access, requireAuth, state) {
  const rates = new Map();
  app.use('/api/workspaces', requireAuth, (req,res,next) => {
    res.set('Cache-Control','no-store');
    if (req.method !== 'GET') {
      if (!sameOrigin(req) || !req.is('application/json')) return res.status(403).json({error:'Request could not be verified.'});
      const now=Date.now();
      for(const [key,value] of rates) if(value.until<now) rates.delete(key);
      let r=rates.get(req.account.id);
      if(!r) {r={count:0,until:now+900000};rates.set(req.account.id,r);}
      if(++r.count>100) return res.status(429).json({error:'Too many workspace actions. Try again later.'});
    }
    next();
  });
  const reply = (res, result) => res.status(result.error ? 400 : 200).json(result);
  app.get('/api/workspaces', (req,res) => res.json({workspaces:access.db.prepare(`SELECT w.*, m.role FROM workspaces w JOIN memberships m ON m.space=w.id WHERE m.account_id=? AND m.banned=0 ORDER BY w.created_at DESC`).all(req.account.id)}));
  app.post('/api/workspaces', (req,res) => reply(res,access.create(req.body?.space,req.body?.name,req.account.id)));
  app.post('/api/workspaces/redeem', (req,res) => reply(res,access.redeem(req.body?.token,req.account.id)));
  app.get('/api/workspaces/:space', (req,res) => {
    const {space}=req.params;
    if(!access.enter(space,req.account.id)) return res.status(403).json({error:'You need a workspace invitation, or your access has been restricted.'});
    res.json({workspace:access.db.prepare('SELECT * FROM workspaces WHERE id=?').get(space), membership:access.membership(space,req.account.id)});
  });
  app.post('/api/workspaces/:space/invites', (req,res) => reply(res,access.invite(req.params.space,req.account.id)));
  app.get('/api/workspaces/:space/members', (req,res) => {
    const {space}=req.params;
    if(!access.manager(space,req.account.id)) return res.status(403).json({error:'Only workspace managers can view membership administration.'});
    res.json({members:access.db.prepare(`SELECT a.id, a.username, a.full_name AS name, m.role, m.banned, m.kicked_until AS kickedUntil FROM memberships m JOIN accounts a ON a.id=m.account_id WHERE m.space=? ORDER BY a.username`).all(space)});
  });
  app.post('/api/workspaces/:space/moderate', (req,res) => {
    const {space}=req.params, actor=req.account.id;
    const {target,action}=req.body || {};
    if(!access.manager(space,actor)) return res.status(403).json({error:'Only workspace managers can moderate.'});
    const member=access.membership(space,target);
    const own=access.membership(space,actor);
    if(!member || target===actor || member.role==='owner' || (member.role==='moderator' && own.role!=='owner')) return res.status(403).json({error:'You cannot moderate this member.'});
    const reason=text(req.body?.reason,500);
    if(!reason) return res.status(400).json({error:'Provide a reason for this action.'});
    if(['promote','demote'].includes(action) && own.role!=='owner') return res.status(403).json({error:'Only the owner can change roles.'});
    if(!['kick','ban','unban','promote','demote'].includes(action)) return res.status(400).json({error:'Choose a valid moderation action.'});
    if(action==='kick') access.db.prepare('UPDATE memberships SET kicked_until=? WHERE space=? AND account_id=?').run(Date.now()+300000,space,target);
    if(action==='ban' || action==='unban') access.db.prepare('UPDATE memberships SET banned=?, kicked_until=0 WHERE space=? AND account_id=?').run(action==='ban'?1:0,space,target);
    if(action==='promote' || action==='demote') access.db.prepare('UPDATE memberships SET role=? WHERE space=? AND account_id=?').run(action==='promote'?'moderator':'member',space,target);
    access.db.prepare('INSERT INTO moderation_log VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(),space,actor,target,action,reason,Date.now());
    if(['ban','kick'].includes(action)) for(const socket of io.sockets.sockets.values()) {
      const user=state.users.get(socket.id);
      if(user?.accountId===target && user.space===space) {socket.emit('access-revoked',{message:action==='ban'?'You were banned from this workspace.':'You were removed for five minutes.'});socket.disconnect(true);}
    }
    res.json({ok:true});
  });
  app.post('/api/workspaces/:space/reports', (req,res) => {
    const {space}=req.params, target=req.body?.target, reason=text(req.body?.reason,1000);
    if(!access.allowed(space,req.account.id)) return res.status(403).json({error:'Workspace membership required.'});
    if(!access.membership(space,target) || target===req.account.id || reason.length<5) return res.status(400).json({error:'Choose a coworker and describe what happened (at least 5 characters).'});
    if(access.db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter=? AND created_at>?').get(req.account.id,Date.now()-86400000).n>=10) return res.status(429).json({error:'Daily report limit reached.'});
    access.db.prepare('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, 0)').run(randomUUID(),space,req.account.id,target,reason,Date.now());
    res.json({ok:true});
  });
  app.get('/api/workspaces/:space/reports', (req,res) => {
    if(!access.manager(req.params.space,req.account.id)) return res.status(403).json({error:'Only workspace managers can view reports.'});
    res.json({reports:access.db.prepare(`SELECT r.*, a.username AS targetName, b.username AS reporterName FROM reports r JOIN accounts a ON a.id=r.target JOIN accounts b ON b.id=r.reporter WHERE r.space=? ORDER BY created_at DESC LIMIT 100`).all(req.params.space)});
  });
  app.post('/api/workspaces/:space/reports/:id/resolve', (req,res) => {
    if(!access.manager(req.params.space,req.account.id)) return res.status(403).json({error:'Only workspace managers can resolve reports.'});
    access.db.prepare('UPDATE reports SET resolved=1 WHERE id=? AND space=?').run(req.params.id,req.params.space);
    res.json({ok:true});
  });
  app.get('/api/workspaces/:space/audit', (req,res) => {
    if(!access.manager(req.params.space,req.account.id)) return res.status(403).json({error:'Only workspace managers can view the audit log.'});
    res.json({entries:access.db.prepare('SELECT * FROM moderation_log WHERE space=? ORDER BY created_at DESC LIMIT 100').all(req.params.space)});
  });
}
