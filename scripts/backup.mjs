import { DatabaseSync } from 'node:sqlite';
import { backupDatabase, verifyBackup } from '../server/backups.js';
import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const [command = 'create', source, target] = process.argv.slice(2);
if (command === 'create') {
  const filename = source || process.env.AUTH_DB_PATH || 'data/accounts.sqlite';
  await access(filename); // Never silently create an empty source database.
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const result = await backupDatabase(db, target || process.env.BACKUP_DIR || 'backups');
    console.log(JSON.stringify({ backup: result.filename, bytes: result.bytes }));
  } finally { db.close(); }
} else if (command === 'verify') {
  if (!source) throw new Error('Usage: node scripts/backup.mjs verify <snapshot.sqlite>');
  console.log(JSON.stringify({ ok: true, ...verifyBackup(source) }));
} else if (command === 'restore-copy') {
  if (!source || !target || path.resolve(source) === path.resolve(target))
    throw new Error('Usage: node scripts/backup.mjs restore-copy <snapshot.sqlite> <NEW-database.sqlite>');
  verifyBackup(source);
  // Explicitly refuse replacement, including SQLite sidecar files. The operator
  // stops the app and selects the new path after inspecting the recovery copy.
  for (const filename of [target, `${target}-wal`, `${target}-shm`]) {
    try { await access(filename); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('Recovery destination already exists; choose a new path.');
  }
  await copyFile(source, target, constants.COPYFILE_EXCL);
  console.log(JSON.stringify({ restored: path.resolve(target), ...verifyBackup(target) }));
} else throw new Error('Commands: create, verify, restore-copy');
