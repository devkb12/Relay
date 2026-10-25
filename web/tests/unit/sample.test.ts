import { describe, expect, it } from 'vitest';
import pack from '@/fixtures/sample-pack.json';
import paths from '@/fixtures/sample-paths.json';
import { SampleEngine, freshState, presentation } from '@/lib/sample';
import { PresentationView, SessionView } from '@/lib/schemas';
import { RelayError } from '@/lib/errors';

type Op = (string | null)[] | null;
type Step = { op: Op; view: unknown };

/** Replay one exported path through the browser engine, with the exporter's clock. */
function replay(steps: Step[]) {
  const engine = new SampleEngine(freshState(), () => pack.now);
  const views = [engine.view()];
  for (const { op } of steps.slice(1)) {
    const [kind, a, b] = op as string[];
    const v = engine.view();
    if (kind === 'advance') engine.advance(v.stage, (a as 'wait' | 'mark_missing') ?? 'wait');
    else if (kind === 'answer') engine.answer({ question_id: v.question!.id, choice: a!, confidence: b as 'unsure', rationale: '' });
    else if (kind === 'explain') engine.explain(a!);
    else if (kind === 'challenge') engine.challenge(a!);
    else if (kind === 'resolve') engine.resolve(a as 'resume', b!);
    else if (kind === 'peers') for (const e of engine.pendingPeers()) engine.peer(e.name);
    else if (kind === 'peer') engine.peer(a!);
    views.push(engine.view());
  }
  return views;
}

describe('sample engine reproduces the real backend, view for view', () => {
  it.each(Object.entries(paths as Record<string, Step[]>))('%s', (_name, steps) => {
    const views = replay(steps);
    steps.forEach((step, i) => {
      expect(SessionView.parse(step.view)).toBeTruthy();
      expect(views[i], `after ${JSON.stringify(step.op)}`).toEqual(step.view);
    });
  });
});

describe('sample engine boundaries', () => {
  it('peers arrive in script order and the host can close a round without waiting', () => {
    const e = new SampleEngine(freshState(), () => pack.now);
    e.advance('lobby');
    expect(e.pendingPeers().map((p) => p.name)).toEqual(['Ari', 'Bea', 'Cy']);
    e.answer({ question_id: 'sample-d1', choice: 'B', confidence: 'unsure', rationale: '' });
    e.peer('Ari');
    expect(e.view().allowed_actions.close_round.allowed).toBe(true);
    expect(e.view().allowed_actions.advance.reason).toBe('Waiting for 2 more answers.');
  });

  it('refuses what the server refuses, with the server words', () => {
    const e = new SampleEngine(freshState(), () => pack.now);
    expect(() => e.advance('diagnostic')).toThrow(RelayError);
    e.advance('lobby');
    e.answer({ question_id: 'sample-d1', choice: 'A', confidence: 'confident', rationale: '' });
    expect(() => e.answer({ question_id: 'sample-d1', choice: 'B', confidence: 'confident', rationale: '' })).toThrow(/already locked/);
  });

  it('the shared-screen projection carries nothing private', () => {
    const e = new SampleEngine(freshState(), () => pack.now);
    e.advance('lobby'); e.answer({ question_id: 'sample-d1', choice: 'A', confidence: 'confident', rationale: 'mine' });
    const shared = presentation(e.view());
    expect(PresentationView.parse(shared)).toBeTruthy();
    expect(JSON.stringify(shared)).not.toContain('confident');
  });

  it('the sample pack is not a live concept and is labeled as sample material', () => {
    expect(pack.concept.id).toMatch(/^sample-/);
    expect(pack.notice).toMatch(/not in the live question bank/);
  });
});
