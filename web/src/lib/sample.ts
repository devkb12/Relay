/**
 * The public sample round: one session played entirely in this browser tab with fictional peers.
 * An explicit adapter, not a second backend: it reproduces relay/core.py's projection and rules for
 * this one scripted session, and tests/unit/sample.test.ts replays the real backend's exported paths
 * (contracts/fixtures/sample-paths.json) through it and requires identical views. The pack is
 * sample-only (data/sample_round.json): it is not in the live question bank, so shipping its keys is
 * safe. Nothing here touches the network.
 */
import pack from '@/fixtures/sample-pack.json';
import { RelayError } from './errors';
import type { PresentationView, SessionView, Stage } from './schemas';

type Choice = { choice: string; confidence: Confidence; rationale: string; correct: boolean | null; question_id: string; at: number };
type Confidence = 'unsure' | 'somewhat' | 'confident';
type Phase = 'diagnostic' | 'transfer' | 'retention';
type Item = { id: string; prompt: string; options: Record<string, string>; correct: string; explanation: string };
type Explanation = { author: string; author_id: string; text: string; source_fallback: boolean; withdrawn?: boolean };
type ChallengeState = { id: string; reason: string; pending: boolean; stage: Stage; item_id: string; resolution: { decision: 'resume' | 'discard'; host_note: string } | null };

export type SamplePack = typeof pack;
export type SampleState = {
  stage: Stage;
  revision: number;
  members: { id: string; name: string }[];
  answers: Record<Phase, Record<string, Choice>>;
  missing: Record<'diagnostic' | 'transfer', string[]>;
  explanations: Explanation[];
  history: { from: Stage; to: Stage; at: number }[];
  challenge: ChallengeState | null;
  invalidated: boolean;
  closed_at: number | null;
  plan_version: number;
  /** Scripted peer events already applied, as "name:stage". */
  done: string[];
};

const STAGES: Stage[] = ['lobby', 'diagnostic', 'discussion', 'transfer', 'debrief'];
const DAY = 86400;
const YOU = 'you';
export const SAMPLE_ID = 'sample-round';
const CHALLENGE_ID = 'sample-challenge';
const NOTICE = 'Original demonstration material. No grade or mastery prediction.';
const fail = (message: string, status = 400) => new RelayError('http', message, status);

const c = pack.concept as unknown as {
  id: string; title: string; source_id: string; source_title: string; source_text: string; hint: string;
  diagnostic: Item; transfer: Item; retention: Item;
};
const peerId = (name: string) => `peer:${name}`;

export function freshState(): SampleState {
  // Mirrors create() + one join per peer: revision 1, then +1 and a plan invalidation per join.
  return {
    stage: 'lobby', revision: 1 + pack.peers.length,
    members: [{ id: YOU, name: pack.you }, ...pack.peers.map((p) => ({ id: peerId(p.name), name: p.name }))],
    answers: { diagnostic: {}, transfer: {}, retention: {} }, missing: { diagnostic: [], transfer: [] },
    explanations: [], history: [], challenge: null, invalidated: false, closed_at: null,
    plan_version: pack.peers.length, done: [],
  };
}

/** A scripted peer event still to happen in the current stage, with its delay. */
export type PeerEvent = { name: string; after_ms: number };

export class SampleEngine {
  constructor(public s: SampleState = freshState(), private now: () => number = () => Date.now() / 1000) {}

  private save() { this.s.revision += 1; }
  private active() { return this.s.members.map((m) => m.id); } // fictional peers never leave
  private paused() { return !!this.s.challenge?.pending; }

  advance(expected: Stage, nonresponders: 'wait' | 'mark_missing' = 'wait'): SessionView {
    const s = this.s;
    if (this.paused()) throw fail('A participant challenged this item. Resolve the review before advancing.', 409);
    if (s.stage !== expected) throw fail('The stage changed. Refresh before continuing.', 409);
    if (s.stage === 'debrief') throw fail('This session is complete.', 409);
    const active = this.active();
    if (s.stage === 'diagnostic' || s.stage === 'transfer') {
      const answered = new Set(Object.keys(s.answers[s.stage]));
      const missing = active.filter((m) => !answered.has(m));
      if (missing.length && nonresponders === 'wait') throw fail(`${missing.length} participant(s) have not responded. Wait, or explicitly close the round and record them as missing (not incorrect).`, 409);
      if (missing.length && active.filter((m) => answered.has(m)).length < 2) throw fail('At least two responses are needed before closing the round.', 409);
      s.missing[s.stage] = [...missing].sort();
    }
    if (s.stage === 'discussion' && !s.explanations.some((e) => !e.withdrawn)) throw fail('Invite a voluntary peer explanation or explicitly record a source-based fallback.', 409);
    const from = s.stage;
    s.stage = STAGES[STAGES.indexOf(from) + 1]!;
    s.history.push({ from, to: s.stage, at: this.now() });
    if (s.stage === 'debrief') s.closed_at = this.now();
    this.save();
    return this.view();
  }

  answer(body: { question_id: string; choice: string; confidence: Confidence; rationale: string }, who = YOU): SessionView {
    const s = this.s;
    let phase: string = s.stage;
    if (s.invalidated || this.paused()) throw fail('This item is paused or discarded; no answer is being graded.', 409);
    if (phase === 'debrief') {
      phase = 'retention';
      if (this.now() < (s.closed_at ?? 0) + DAY) throw fail('The delayed check is not due. Do not present an immediate check as retention.', 409);
    }
    if (!(phase in s.answers)) throw fail('Answers are not accepted in this stage.', 409);
    const item = c[phase as Phase];
    if (item.id !== body.question_id) throw fail('Wrong or stale question.', 409);
    if (!(body.choice in item.options) && body.choice !== 'SKIP') throw fail('Select a valid option or SKIP.');
    if (!['unsure', 'somewhat', 'confident'].includes(body.confidence)) throw fail('Invalid confidence choice.');
    const rationale = String(body.rationale).slice(0, 600);
    const previous = s.answers[phase as Phase][who];
    if (previous) {
      if (previous.choice === body.choice && previous.confidence === body.confidence && previous.rationale === rationale) return this.view();
      throw fail('This answer is already locked. A changed resubmission is rejected, not applied.', 409);
    }
    s.answers[phase as Phase][who] = { choice: body.choice, confidence: body.confidence, rationale, correct: body.choice === 'SKIP' ? null : body.choice === item.correct, question_id: body.question_id, at: this.now() };
    this.save();
    return this.view();
  }

  explain(text: string, sourceFallback = false, who = YOU): SessionView {
    const s = this.s;
    if (s.stage !== 'discussion') throw fail('Peer explanations belong in the discussion stage.', 409);
    if (this.paused()) throw fail('The item is paused for review. Share explanations after the host resolves it.', 409);
    if (sourceFallback) {
      if (who !== YOU) throw fail('Only the session host may do this.', 403);
      text = 'No volunteer explanation. Group reviewed the provided teaching note.';
    }
    text = String(text).trim();
    if (!sourceFallback && !(text.length >= 12 && text.length <= 1200 && text.split(/\s+/).length >= 3)) throw fail('Explain the idea in at least a short sentence (12-1200 characters).');
    if (s.explanations.some((e) => e.author_id === who && e.text === text)) return this.view();
    s.explanations.push({ author: this.s.members.find((m) => m.id === who)!.name, author_id: who, text, source_fallback: sourceFallback });
    this.save();
    return this.view();
  }

  challenge(reason: string): SessionView {
    reason = String(reason).trim();
    if (reason.length < 5 || reason.length > 500) throw fail('Explain the issue in 5-500 characters.');
    const s = this.s;
    if (!['diagnostic', 'discussion', 'transfer'].includes(s.stage)) throw fail('Challenge an item during an active learning round.', 409);
    if (this.paused()) throw fail('An item review is already open.', 409);
    const item = c[s.stage === 'discussion' ? 'diagnostic' : (s.stage as Phase)].id;
    s.challenge = { id: CHALLENGE_ID, reason, pending: true, stage: s.stage, item_id: item, resolution: null };
    this.save();
    return this.view();
  }

  resolve(decision: 'resume' | 'discard', note: string, challengeId?: string | null): SessionView {
    note = String(note).trim();
    if (!['resume', 'discard'].includes(decision) || note.length < 10 || note.length > 500) throw fail('Choose resume/discard and provide a review note (10-500 characters).');
    const s = this.s;
    if (!s.challenge?.pending) throw fail('There is no open item review.', 409);
    if (challengeId && challengeId !== s.challenge.id) throw fail('This review was already resolved or replaced. Refresh first.', 409);
    s.challenge = { ...s.challenge, pending: false, resolution: { decision, host_note: note } };
    if (decision === 'discard') { s.invalidated = true; s.stage = 'debrief'; s.closed_at = this.now(); }
    this.save();
    return this.view();
  }

  /** Scripted fictional-peer events still due in the current stage, soonest first. */
  pendingPeers(): PeerEvent[] {
    const s = this.s;
    if (this.paused() || s.invalidated) return [];
    let events: PeerEvent[] = [];
    if (s.stage === 'diagnostic' || s.stage === 'transfer') {
      const stage = s.stage;
      events = pack.peers.map((p) => ({ name: p.name, after_ms: p[stage].after_ms }));
    } else if (s.stage === 'discussion') {
      events = pack.explanations.map((e) => ({ name: e.by, after_ms: e.after_ms }));
    }
    return events.filter((e) => !s.done.includes(`${e.name}:${s.stage}`)).sort((a, b) => a.after_ms - b.after_ms);
  }

  /** Apply one fictional peer's scripted action for the current stage (no-op if already done). */
  peer(name: string): SessionView {
    const s = this.s; const stage = s.stage; const key = `${name}:${stage}`;
    if (s.done.includes(key)) return this.view();
    s.done.push(key);
    const p = pack.peers.find((x) => x.name === name);
    if (p && (stage === 'diagnostic' || stage === 'transfer')) {
      const step = p[stage];
      return this.answer({ question_id: c[stage].id, choice: step.choice, confidence: step.confidence as Confidence, rationale: '' }, peerId(name));
    }
    if (stage === 'discussion') {
      for (const e of pack.explanations) if (e.by === name) this.explain(e.text, false, peerId(name));
    }
    return this.view();
  }

  view(): SessionView { return project(this.s, this.now()); }
  presentation(): PresentationView { return presentation(this.view()); }
}

type Outcome = 'correct' | 'incorrect' | 'skipped' | 'missing' | 'invalidated';
const outcome = (a: Choice | undefined, invalidated = false): Outcome =>
  invalidated ? 'invalidated' : !a ? 'missing' : a.choice === 'SKIP' ? 'skipped' : a.correct ? 'correct' : 'incorrect';

const publicQuestion = (item: Item) => ({ id: item.id, prompt: item.prompt, options: item.options });

/** relay/core.py Relay._project, for "You" (always the host in the sample). */
export function project(s: SampleState, now: number): SessionView {
  const stage = s.stage;
  const paused = !!s.challenge?.pending;
  const result: SessionView = {
    id: SAMPLE_ID, concept: { id: c.id, title: c.title }, stage, revision: s.revision, pack_hash: pack.pack_hash, is_host: true, members: [],
    me: { name: pack.you, reminders: false, availability: [], timezone: 'America/Phoenix', withdrawn: false },
    plan: null, plan_version: s.plan_version, approved_count: 0, approved_by_me: false, plan_cancelled: null, needs_reproposal: false, schedule_confirmed: false,
    paused, source: null, question: null, my_answer: null, group: null,
    challenge: s.challenge ? { id: s.challenge.id, reason: s.challenge.reason, pending: s.challenge.pending, stage: s.challenge.stage, resolution: s.challenge.resolution } : null,
    invalidated: s.invalidated,
    explanations: s.explanations.map((e) => ({ author: e.author, text: e.text, source_fallback: e.source_fallback })),
    hint: null, my_results: {}, receipt: null, allowed_actions: allowed(s, now), waiting_on: waiting(s), notice: NOTICE,
  };
  const missingNow = new Set((s.missing as Record<string, string[]>)[stage] ?? []);
  const answersNow = (s.answers as Record<string, Record<string, Choice>>)[stage] ?? {};
  for (const m of s.members) {
    const state = m.id in answersNow ? 'responded' : missingNow.has(m.id) ? 'missing' : stage === 'diagnostic' || stage === 'transfer' ? 'waiting' : 'present';
    result.members.push({ name: m.name, responded: state === 'responded', state, is_me: m.id === YOU, is_host: m.id === YOU });
  }
  if (stage === 'diagnostic' || stage === 'transfer') {
    result.question = publicQuestion(c[stage]);
    const a = s.answers[stage][YOU];
    result.my_answer = a ? { choice: a.choice, confidence: a.confidence } : null;
  }
  if (stage === 'discussion' || stage === 'debrief' || paused) result.source = { source_id: c.source_id, source_title: c.source_title, source_text: c.source_text };
  if (stage === 'discussion') {
    result.hint = { discussion_question: c.hint, possible_misconception: 'Use the source to examine the reasoning.', mode: 'curated fallback', feedback_source: 'reviewed_fallback' };
    const highWrong = Object.values(s.answers.diagnostic).filter((a) => a.correct === false && a.confidence === 'confident').length;
    result.discussion_signal = highWrong >= 2 ? 'Check the shared assumption' : 'Compare the reasoning';
  }
  if (stage === 'debrief') {
    const invalid = s.invalidated;
    result.group = invalid ? null : group(s);
    const froms = s.history.map((h) => h.from as string);
    for (const phase of ['diagnostic', 'transfer', 'retention'] as const) {
      const a = s.answers[phase][YOU];
      if (phase === 'retention' && !a) continue;
      if (!a && !froms.includes(phase)) continue;
      result.my_results[phase] = { status: outcome(a, invalid), choice: a ? a.choice : null, correct: invalid || !a ? null : a.correct, explanation: c[phase].explanation, question_id: c[phase].id };
    }
    const due = (s.closed_at ?? 0) + DAY;
    result.retention_due_at = due;
    result.retention_note = 'Delayed practice is separate evidence from the immediate items and opens after 24 hours.';
    if (now >= due && !(YOU in s.answers.retention) && !invalid) result.question = publicQuestion(c.retention);
    result.receipt = receipt(s);
  }
  return result;
}

function waiting(s: SampleState) {
  if (s.stage !== 'diagnostic' && s.stage !== 'transfer') return 0;
  const answered = s.answers[s.stage];
  return s.members.filter((m) => !(m.id in answered)).length;
}

/** relay/core.py Relay._allowed for the host. */
function allowed(s: SampleState, now: number): NonNullable<SessionView['allowed_actions']> {
  const stage = s.stage; const paused = !!s.challenge?.pending; const invalid = s.invalidated;
  const ok = () => ({ allowed: true, reason: null });
  const no = (reason: string) => ({ allowed: false, reason });
  const answering = stage === 'diagnostic' || stage === 'transfer';
  const answered = new Set(answering ? Object.keys(s.answers[stage]) : []);
  const waitingIds = answering ? s.members.filter((m) => !answered.has(m.id)) : [];
  const held = paused ? 'The item is paused for review.' : invalid ? 'This item was discarded after review.' : null;
  const answer = held ? no(held) : answering ? (answered.has(YOU) ? no('Your answer is locked.') : ok())
    : stage === 'debrief' && now >= (s.closed_at ?? 0) + DAY && !(YOU in s.answers.retention) ? ok() : no('Answers open in Think privately and Fresh problem.');
  const explain = stage === 'discussion' && !paused ? ok() : no(held ?? 'Explanations belong in Explain together.');
  const challenge = ['diagnostic', 'discussion', 'transfer'].includes(stage) && !paused ? ok() : no(held ?? 'Challenge an item during an active round.');
  const resolve = paused ? ok() : no('There is no open item review.');
  const advance = paused ? no('Resolve the review before moving on.') : stage === 'debrief' ? no('This session is complete.')
    : waitingIds.length ? no(`Waiting for ${waitingIds.length} more ${waitingIds.length === 1 ? 'answer' : 'answers'}.`)
    : stage === 'discussion' && !s.explanations.some((e) => !e.withdrawn) ? no('Needs one shared explanation, or the host records the source fallback.') : ok();
  const close = paused || !answering || !waitingIds.length ? no(held ?? (answering ? 'Everyone has answered.' : 'Only answering rounds can be closed.'))
    : answered.size < 2 ? no('At least two responses are needed before closing the round.') : ok();
  return { answer, explain, source_fallback: explain, challenge, resolve, advance, close_round: close };
}

function group(s: SampleState): SessionView['group'] {
  const active = s.members.map((m) => m.id);
  const matched = active.filter((u) => s.answers.diagnostic[u]?.correct != null && s.answers.transfer[u]?.correct != null);
  if (matched.length < 3) return null;
  const tally = (phase: 'diagnostic' | 'transfer') => {
    const out = { correct: 0, incorrect: 0, skipped: 0, missing: 0 };
    for (const u of active) out[outcome(s.answers[phase][u]) as Exclude<Outcome, 'invalidated'>] += 1;
    return out;
  };
  return {
    paired_responses: matched.length,
    initial_correct: matched.filter((u) => s.answers.diagnostic[u]!.correct).length,
    fresh_correct: matched.filter((u) => s.answers.transfer[u]!.correct).length,
    active_participants: active.length, withdrawn: 0,
    initial_outcomes: tally('diagnostic'), fresh_outcomes: tally('transfer'),
    warning: 'Two different immediate items, same participants. Not causal evidence of learning or lasting mastery. Small groups can still infer individual results.',
  };
}

/** relay/core.py Relay._receipt (policy receipt-v1). */
function receipt(s: SampleState): NonNullable<SessionView['receipt']> {
  const invalid = s.invalidated;
  const part = (phase: 'diagnostic' | 'transfer') => {
    const q = c[phase]; const a = s.answers[phase][YOU];
    const picked = a && a.choice !== 'SKIP' ? a.choice : null;
    return { question_id: q.id, prompt: q.prompt, status: outcome(a, invalid), choice: picked, choice_text: picked ? q.options[picked] ?? null : null, reviewed_answer: invalid ? null : q.options[q.correct]! };
  };
  const shared = s.explanations.filter((e) => !e.withdrawn && !e.source_fallback);
  const initial = part('diagnostic'); const fresh = part('transfer');
  const step: [NonNullable<SessionView['receipt']>['next_step']['kind'], string] = invalid ? ['discarded', 'This item was withdrawn after review, so nothing in this round counts. Start a new session when the group is ready.']
    : fresh.status === 'correct' ? ['try_later', 'Try a different application later. One correct answer right after a discussion does not show lasting understanding.']
    : fresh.status === 'incorrect' ? ['revisit_source', `Reread “${c.source_title}”, then try a different problem on the same idea.`]
    : ['no_fresh_answer', 'No fresh answer was recorded, so this round says little about you. Try a different problem on the same idea when you are ready.'];
  return {
    concept: { id: c.id, title: c.title }, source: { source_id: c.source_id, source_title: c.source_title }, pack_hash: pack.pack_hash,
    initial, fresh,
    explanations: { shared: shared.length, mine: shared.filter((e) => e.author_id === YOU).length, source_fallback: s.explanations.some((e) => e.source_fallback) },
    next_step: { kind: step[0], text: step[1], policy: 'receipt-v1', evidence: [initial.question_id, fresh.question_id, c.source_id] },
    delayed_check: { opted_in: false, answered: YOU in s.answers.retention },
    limits: [
      'Two different items right after one discussion: practice evidence, not a grade or a measure of lasting understanding.',
      'Answers were checked against the reviewed source, which can still be wrong. Anyone could challenge it.',
    ],
  };
}

/** relay/api.py presentation_view: the shared-screen allowlist. */
export function presentation(v: SessionView): PresentationView {
  return {
    id: v.id, concept: v.concept, stage: v.stage, revision: v.revision,
    members: v.members.map(({ name, state, responded, is_host }) => ({ name, state, responded, is_host })),
    plan: null, plan_version: v.plan_version, approved_count: v.approved_count, schedule_confirmed: v.schedule_confirmed,
    plan_cancelled: v.plan_cancelled ?? null, paused: v.paused, invalidated: v.invalidated, source: v.source, question: v.question,
    explanations: v.explanations, hint: v.hint, discussion_signal: v.discussion_signal ?? null, group: v.group, notice: v.notice,
    retention_note: v.retention_note ?? null,
    challenge: v.challenge?.pending ? { pending: true, reason: v.challenge.reason } : null,
    view: 'presentation',
  };
}
