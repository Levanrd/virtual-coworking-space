import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { validateProduction } from '../server/runtime.js';

// Offline validation: never logs configuration values or contacts providers.
const filename = process.argv[2] || '.env.production';
let env;
try { env = { ...parseEnv(await readFile(filename, 'utf8')), NODE_ENV: 'production' }; }
catch { console.error('Configuration file is missing or unreadable. Copy deploy/production.env.example to .env.production and fill it in locally.'); process.exit(1); }
const errors = [];
try { validateProduction(env); } catch (error) { errors.push(error.message); }
if (Object.values(env).some(value => /replace-with|example\.com/.test(value))) errors.push('Replace all template values.');
try { if (new URL(env.APP_ORIGIN).host !== env.APP_DOMAIN || new URL(env.APP_ORIGIN).pathname !== '/') errors.push('APP_DOMAIN must match APP_ORIGIN without a path.'); }
catch { errors.push('Set APP_DOMAIN and APP_ORIGIN.'); }
if (!env.REGISTRATION_EMAILS?.split(',').some(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()))) errors.push('Add your email to REGISTRATION_EMAILS for initial signup.');
if ((env.OPS_TOKEN?.length || 0) < 32) errors.push('OPS_TOKEN needs at least 32 random characters.');
if (env.MAX_ONLINE_USERS !== '20') errors.push('Keep MAX_ONLINE_USERS=20 for this beta.');
if (!env.BACKUP_DIR) errors.push('Set BACKUP_DIR=/app/backups.');
if (isIP(env.PUBLIC_IP || '') !== 4 || /^(0\.|10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(env.PUBLIC_IP)) errors.push('PUBLIC_IP must be your router’s public IPv4 address; private/CGNAT addresses cannot receive forwarded traffic.');
if (env.COMMUNITY_OWNER_ACCOUNT_ID) errors.push('Leave COMMUNITY_OWNER_ACCOUNT_ID empty for the private friends beta.');
if (errors.length) { for (const error of errors) console.error(`FAIL: ${error}`); process.exitCode = 1; }
else console.log('Offline configuration checks passed. Still verify router reachability, DNS, HTTPS, SMTP delivery, TURN and a call from another network before inviting friends.');
