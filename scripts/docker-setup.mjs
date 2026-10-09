import { randomBytes } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
const path=new URL('../.env',import.meta.url);
let content='';
try{content=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(!/^TURN_SECRET=.+$/m.test(content)) {
  if(/^TURN_SECRET=/m.test(content)) throw new Error('An empty TURN_SECRET exists in .env. Set it to a random secret of at least 32 characters.');
  await appendFile(path,`\nTURN_SECRET=${randomBytes(32).toString('hex')}\n`);
  console.log('Generated a local TURN secret in .env. No existing settings were changed.');
} else console.log('Local TURN secret already configured.');
if (!/^OPS_TOKEN=.+$/m.test(content)) {
  if (/^OPS_TOKEN=/m.test(content)) throw new Error('An empty OPS_TOKEN exists in .env. Set a random secret of at least 32 characters.');
  await appendFile(path, `\nOPS_TOKEN=${randomBytes(32).toString('hex')}\n`);
  console.log('Generated a local operations token in .env.');
}
