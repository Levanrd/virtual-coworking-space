import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const COOKIE = "cg_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const text = (value) => (typeof value === "string" ? value.trim() : "");
const publicAccount = (row) => ({
  id: row.id,
  fullName: row.full_name,
  username: row.username,
  email: row.email,
  age: row.age,
  emailVerified: !!row.email_verified,
});

export function registrationFields(body = {}) {
  body ??= {};
  const fullName = text(body.fullName).replace(/\s+/g, " ");
  const username = text(body.username).toLowerCase();
  const email = text(body.email).toLowerCase();
  const age =
    typeof body.age === "number"
      ? body.age
      : /^\d{1,3}$/.test(body.age || "")
        ? Number(body.age)
        : NaN;
  const password = typeof body.password === "string" ? body.password : "";
  const fields = {};
  if (
    fullName.length < 2 ||
    fullName.length > 100 ||
    /[\u0000-\u001f\u007f]/.test(fullName)
  )
    fields.fullName = "Enter your full name (2–100 characters).";
  if (!/^[a-z0-9_]{3,30}$/.test(username))
    fields.username = "Use 3–30 letters, numbers, or underscores.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fields.email = "Enter a valid email address.";
  if (!Number.isInteger(age) || age < 1 || age > 120)
    fields.age = "Enter an age between 1 and 120.";
  if (password.length < 12 || password.length > 128)
    fields.password = "Use a password with 12–128 characters.";
  return { values: { fullName, username, email, age, password }, fields };
}

export class AuthStore {
  constructor(filename, { sessionMs = SESSION_MS } = {}) {
    if (filename !== ":memory:")
      mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.sessionMs = sessionMs;
    this.db
      .exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, full_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        age INTEGER NOT NULL CHECK(age BETWEEN 1 AND 120),
        password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      ); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
    if (!this.db.prepare('PRAGMA table_info(accounts)').all().some(c => c.name === 'email_verified'))
      this.db.exec('ALTER TABLE accounts ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
    this.db.exec(`CREATE TABLE IF NOT EXISTS account_tokens (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL, expires_at INTEGER NOT NULL
    ); CREATE INDEX IF NOT EXISTS account_tokens_account ON account_tokens(account_id, purpose);`);
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
  }
  async register(body) {
    const { values, fields } = registrationFields(body);
    if (Object.keys(fields).length)
      return {
        status: 400,
        error: "Please check the highlighted fields.",
        fields,
      };
    const { fullName, username, email, age, password } = values;
    const salt = randomBytes(16).toString("hex");
    const hash = (await derive(password, salt, 64, SCRYPT)).toString("hex");
    // Recheck after hashing: simultaneous signups cannot claim the same identity.
    if (
      this.db
        .prepare("SELECT id FROM accounts WHERE username = ? OR email = ?")
        .get(username, email)
    )
      return {
        status: 409,
        error: "An account with that username or email already exists.",
      };
    const id = randomUUID();
    try {
      this.db
        .prepare("INSERT INTO accounts (id, full_name, username, email, age, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, fullName, username, email, age, hash, salt, Date.now());
    } catch (error) {
      if (String(error.message).includes("UNIQUE constraint"))
        return {
          status: 409,
          error: "An account with that username or email already exists.",
        };
      throw error;
    }
    return {
      user: publicAccount(
        this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id),
      ),
    };
  }
  async login(body = {}) {
    body ??= {};
    const identifier = text(body.identifier).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (
      !identifier ||
      identifier.length > 254 ||
      !password ||
      password.length > 128
    )
      return { status: 401, error: "Incorrect username, email, or password." };
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE username = ? OR email = ?")
      .get(identifier, identifier);
    // Unknown accounts do the same expensive work as an incorrect password.
    const hash = await derive(
      password,
      row?.password_salt || "00000000000000000000000000000000",
      64,
      SCRYPT,
    );
    const expected = row
      ? Buffer.from(row.password_hash, "hex")
      : Buffer.alloc(64);
    if (!timingSafeEqual(hash, expected) || !row)
      return { status: 401, error: "Incorrect username, email, or password." };
    return { user: publicAccount(row) };
  }
  createSession(accountId) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + this.sessionMs;
    this.db
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
      .run(hashToken(token), accountId, expiresAt);
    return { token, expiresAt };
  }
  issueToken(accountId, purpose) {
    const token = randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM account_tokens WHERE expires_at <= ? OR (account_id = ? AND purpose = ?)').run(Date.now(), accountId, purpose);
    this.db.prepare('INSERT INTO account_tokens VALUES (?, ?, ?, ?)').run(hashToken(token), accountId, purpose, Date.now() + (purpose === 'reset' ? 30 * 60_000 : 24 * 60 * 60_000));
    return token;
  }
  validToken(token, purpose) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
    return this.db.prepare('SELECT * FROM account_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?').get(hashToken(token), purpose, Date.now());
  }
  verifyEmail(token) {
    const row = this.validToken(token, 'verify');
    if (!row) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE accounts SET email_verified = 1 WHERE id = ?').run(row.account_id);
      this.db.prepare("DELETE FROM account_tokens WHERE account_id = ? AND purpose = 'verify'").run(row.account_id);
      this.db.exec('COMMIT');
      return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async resetPassword(token, password) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      return { error: 'Use a password with 12–128 characters.' };
    if (!this.validToken(token, 'reset')) return { error: 'This reset link has expired or was already used.' };
    const salt = randomBytes(16).toString('hex');
    const hash = (await derive(password, salt, 64, SCRYPT)).toString('hex');
    // Recheck after asynchronous hashing so two simultaneous requests cannot reuse a token.
    const row = this.validToken(token, 'reset');
    if (!row) return { error: 'This reset link has expired or was already used.' };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, row.account_id);
      this.db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.account_id);
      this.db.prepare('DELETE FROM account_tokens WHERE account_id = ?').run(row.account_id);
      this.db.exec('COMMIT');
      return { ok: true, accountId: row.account_id };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  tokenFrom(request) {
    const cookie = request.headers.cookie || "";
    const token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(token || "") ? token : null;
  }
  session(request) {
    const token = this.tokenFrom(request);
    if (!token) return null;
    const row = this.db
      .prepare(
        `SELECT accounts.*, sessions.expires_at FROM sessions
      JOIN accounts ON accounts.id = sessions.account_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
      )
      .get(hashToken(token), Date.now());
    return row
      ? {
          user: publicAccount(row),
          expiresAt: row.expires_at,
          key: hashToken(token),
        }
      : null;
  }
  revoke(request) {
    const token = this.tokenFrom(request);
    if (!token) return null;
    const key = hashToken(token);
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(key);
    return key;
  }
  cookie(response, session, secure) {
    response.cookie(COOKIE, session?.token || "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: session ? this.sessionMs : 0,
    });
  }
  close() {
    this.db.close();
  }
}

export function sameOrigin(request) {
  if (!request.headers.origin) return true;
  const protocol =
    request.secure || request.socket.encrypted ? "https" : "http";
  try {
    const expected = process.env.APP_ORIGIN
      ? new URL(process.env.APP_ORIGIN).origin
      : `${protocol}://${request.headers.host}`;
    return new URL(request.headers.origin).origin === expected;
  } catch {
    return false;
  }
}

export function installAuth(app, io, store, { rateLimit = 30, mailer, origin = process.env.APP_ORIGIN || 'http://localhost:5173', requireVerification = false, registrationEmails = process.env.REGISTRATION_EMAILS, reportFailure = () => {} } = {}) {
  // In production, no allowlist means registration is closed. Email ownership
  // still needs verification; an allowlisted address is not authentication.
  const allowedEmails = new Set((registrationEmails || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const restrictedRegistration = registrationEmails !== undefined || process.env.NODE_ENV === 'production';
  const attempts = new Map();
  const windowMs = 15 * 60 * 1000;
  let hashing = 0;
  function allowAttempt(key, max) {
    const now = Date.now();
    for (const [k, record] of attempts)
      if (record.until <= now) attempts.delete(k);
    if (!attempts.has(key)) {
      if (attempts.size >= 10000) return false;
      attempts.set(key, { count: 0, until: now + windowMs });
    }
    return ++attempts.get(key).count <= max;
  }
  const disconnectSession = (key) => {
    if (key) io.in(`session:${key}`).disconnectSockets(true);
  };
  const secureCookie = (req) =>
    !!req.secure ||
    process.env.NODE_ENV === "production" ||
    process.env.APP_ORIGIN?.startsWith("https:");
  app.use("/api/auth", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/auth/me", (req, res) => {
    const session = store.session(req);
    if (!session)
      return res
        .status(401)
        .json({ error: "Sign in to enter your workspace." });
    res.json({ user: { ...session.user, requiresVerification: requireVerification } });
  });
  app.use("/api/auth", (req, res, next) => {
    if (!sameOrigin(req) || !req.is("application/json"))
      return res
        .status(403)
        .json({
          error:
            "This request could not be verified. Reload the page and try again.",
        });
    next();
  });
  const sendLink = async (user, purpose) => {
    if (!mailer) throw new Error('Email delivery is not configured.');
    const token = store.issueToken(user.id, purpose);
    const url = new URL(origin);
    // Fragments are never sent in HTTP requests or referrer headers.
    url.hash = `${purpose}=${token}`;
    await mailer({ to: user.email,
      subject: purpose === 'reset' ? 'Reset your Common Ground password' : 'Verify your Common Ground email',
      text: `${purpose === 'reset' ? 'Reset your password (valid for 30 minutes)' : 'Verify your email (valid for 24 hours)'}:\n\n${url}\n\nIf you did not request this, ignore this email.` });
  };
  app.post('/api/auth/forgot-password', async (req, res, next) => {
    if (!allowAttempt(`recovery-ip:${req.ip}`, 10)) return res.status(429).json({ error: 'Too many requests. Try again in 15 minutes.' });
    if (!mailer) return res.status(503).json({ error: 'Email delivery is not configured yet.' });
    const email = text(req.body?.email).toLowerCase().slice(0,254);
    const row = store.db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
    // Do not let SMTP response time reveal whether this email has an account.
    if (row && allowAttempt(`recovery-user:${hashToken(email)}`, 3))
      void sendLink(publicAccount(row), 'reset').catch(()=>reportFailure('mail_reset_failed'));
    res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
  });
  app.post('/api/auth/reset-password', async (req, res, next) => {
    if (!allowAttempt(`reset-ip:${req.ip}`, 10) || hashing >= 4) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    hashing++;
    try {
      const result = await store.resetPassword(req.body?.token, req.body?.password);
      if (result.error) return res.status(400).json({ error: result.error });
      io.in(`account:${result.accountId}`).disconnectSockets(true);
      store.cookie(res, null, secureCookie(req));
      res.json({ ok: true });
    } catch (error) { next(error); } finally { hashing--; }
  });
  app.post('/api/auth/verify-email', (req, res) => {
    if (!allowAttempt(`verify-ip:${req.ip}`, 30)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    if (!store.verifyEmail(req.body?.token)) return res.status(400).json({ error: 'This verification link has expired or was already used.' });
    res.json({ ok: true });
  });
  app.post('/api/auth/resend-verification', async (req, res, next) => {
    const session = store.session(req);
    if (!session) return res.status(401).json({ error: 'Sign in first.' });
    if (!allowAttempt(`verify-user:${session.user.id}`, 3) || !allowAttempt(`verify-send-ip:${req.ip}`, 10)) return res.status(429).json({ error: 'Please wait before requesting another email.' });
    if (session.user.emailVerified) return res.json({ ok: true });
    if (!mailer) return res.status(503).json({ error: 'Email delivery is not configured yet.' });
    try { await sendLink(session.user, 'verify'); res.json({ ok: true }); } catch { reportFailure('mail_verification_failed'); res.status(503).json({ error: 'Email could not be sent. Please try again shortly.' }); }
  });
  for (const endpoint of ["register", "login"]) {
    app.post(`/api/auth/${endpoint}`, async (req, res, next) => {
      if (endpoint === 'register' && restrictedRegistration && !allowedEmails.has(text(req.body?.email).toLowerCase()))
        return res.status(403).json({ error: 'This is a friends-only workspace. Ask the host to add your email before signing up.' });
      const identifier = text(req.body?.identifier).toLowerCase().slice(0, 254);
      if (
        !allowAttempt(`ip:${req.ip}`, rateLimit) ||
        (endpoint === "login" &&
          !allowAttempt(`login:${hashToken(identifier)}`, 10))
      ) {
        res.set("Retry-After", "900");
        return res
          .status(429)
          .json({
            error: "Too many attempts. Please try again in 15 minutes.",
          });
      }
      if (hashing >= 4)
        return res
          .status(503)
          .json({ error: "Sign-in is busy. Please try again in a moment." });
      hashing++;
      try {
        const result = await store[endpoint](req.body);
        if (result.error)
          return res
            .status(result.status)
            .json({ error: result.error, fields: result.fields });
        const session = store.createSession(result.user.id);
        disconnectSession(store.revoke(req));
        store.cookie(res, session, secureCookie(req));
        let emailSent = false;
        if (endpoint === 'register' && mailer) {
          try { await sendLink(result.user, 'verify'); emailSent = true; }
          catch { reportFailure('mail_verification_failed'); }
        }
        res
          .status(endpoint === "register" ? 201 : 200)
          .json({ user: { ...result.user, requiresVerification: requireVerification }, emailSent });
      } catch (error) {
        next(error);
      } finally {
        hashing--;
      }
    });
  }
  app.post("/api/auth/logout", (req, res) => {
    disconnectSession(store.revoke(req));
    store.cookie(res, null, secureCookie(req));
    res.json({ ok: true });
  });
  const requireAuth = (req, res, next) => {
    const session = store.session(req);
    if (!session)
      return res
        .status(401)
        .json({ error: "Sign in to enter your workspace." });
    req.account = session.user;
    if (requireVerification && !session.user.emailVerified) return res.status(403).json({ error: 'Verify your email before entering a workspace.', code: 'EMAIL_UNVERIFIED' });
    next();
  };
  return { requireAuth };
}
