import { backup, DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, rename, unlink, stat, chmod } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function verifyBackup(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Backup integrity check failed.');
    for (const table of ['accounts', 'sessions', 'account_tokens', 'workspaces', 'memberships'])
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table))
        throw new Error('Backup is missing required application tables.');
    return { accounts: db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count,
      memberships: db.prepare('SELECT COUNT(*) AS count FROM memberships').get().count };
  } finally { db.close(); }
}

export async function backupDatabase(db, directory, retain = 7) {
  if (!Number.isInteger(retain) || retain < 1 || retain > 100) throw new Error('Backup retention must be 1–100.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `accounts-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`;
  const destination = path.join(directory, name), temporary = `${destination}.partial`;
  try {
    await backup(db, temporary);
    await chmod(temporary, 0o600);
    verifyBackup(temporary);
    await rename(temporary, destination);
  } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  // Only our own complete snapshots are pruned, after the replacement verifies.
  const files = (await readdir(directory)).filter(f => /^accounts-\d{4}-.*-[a-f0-9-]{36}\.sqlite$/.test(f)).sort().reverse();
  for (const file of files.slice(retain)) await unlink(path.join(directory, file));
  return { filename: destination, bytes: (await stat(destination)).size };
}

export function scheduleBackups(db, directory, { onSuccess = () => {}, onFailure = () => {}, intervalMs = 86400000 } = {}) {
  let active = null, stopped = false;
  const run = () => {
    if (active || stopped) return active;
    active = backupDatabase(db, directory).then(onSuccess, onFailure).finally(() => { active = null; });
    return active;
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return { run, async stop() { stopped = true; clearInterval(timer); await active; } };
}
