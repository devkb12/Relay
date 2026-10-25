import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthMe, ErrorBody, MySessions, PresentationView, SessionView } from '@/lib/schemas';

const dir = resolve(__dirname, '../../src/fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

function schemaFor(name: string) {
  if (name.startsWith('presentation-')) return PresentationView;
  if (name.startsWith('error-')) return ErrorBody;
  if (name.startsWith('auth-me')) return AuthMe;
  if (name === 'me-sessions.json') return MySessions;
  return SessionView;
}

describe('every fixture parses through its schema', () => {
  it.each(files)('%s', (file) => {
    const result = schemaFor(file).safeParse(load(file));
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
  });

  it('covers all 18 committed fixtures', () => expect(files.length).toBe(18));
});

describe('fixture copies match contracts/fixtures (no drift, never hand-edited)', () => {
  const source = resolve(__dirname, '../../../contracts/fixtures');
  it.runIf(existsSync(source)).each(files)('%s', (file) => {
    const canonical = JSON.stringify(JSON.parse(readFileSync(join(source, file), 'utf8')), null, 2) + '\n';
    expect(readFileSync(join(dir, file), 'utf8')).toBe(canonical);
  });
});

describe('presentation fixtures cannot carry private fields', () => {
  it.each(files.filter((f) => f.startsWith('presentation-')))('%s', (file) => {
    const data = load(file);
    for (const key of ['me', 'my_answer', 'my_results', 'approved_by_me', 'is_host']) expect(data).not.toHaveProperty(key);
    expect(PresentationView.safeParse({ ...data, my_results: {} }).success).toBe(false);
  });
});
