/**
 * Copy the backend's synthetic fixtures (../contracts/fixtures) into web/src/fixtures so the Vercel
 * build never reads outside web/. Never edit the copies; rerun this after Rithik regenerates them.
 *   npm run sync-fixtures          write copies
 *   npm run sync-fixtures -- --check  exit 1 if any copy drifted
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const source = resolve(root, '..', 'contracts', 'fixtures');
const target = join(root, 'src', 'fixtures');
const check = process.argv.includes('--check');

const normalize = (text: string) => JSON.stringify(JSON.parse(text), null, 2) + '\n';

if (!existsSync(source)) {
  console.error(`No fixtures at ${source}. Run from a full repo checkout.`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
let drift = 0;
for (const name of readdirSync(source).filter((f) => f.endsWith('.json')).sort()) {
  const wanted = normalize(readFileSync(join(source, name), 'utf8'));
  const path = join(target, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (current === wanted) continue;
  drift++;
  if (check) console.error(`drift: ${name}`);
  else writeFileSync(path, wanted);
}
console.log(check ? (drift ? `${drift} fixture(s) drifted` : 'fixtures in sync') : `synced (${drift} updated)`);
process.exit(check && drift ? 1 : 0);
