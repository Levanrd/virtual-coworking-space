import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const template = await readFile(new URL('../deploy/production.env.example', import.meta.url), 'utf8');
const contents = template.replace(/^(OPS_TOKEN|TURN_SECRET)=.*$/gm, (_, key) => `${key}=${randomBytes(32).toString('hex')}`);
try {
  await writeFile(new URL('../.env.production', import.meta.url), contents, { flag: 'wx', mode: 0o600 });
  console.log('Created .env.production with unique secrets. Fill in the remaining settings locally, then run npm run deploy:check. Nothing was published.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env.production already exists; no settings were changed.');
}
