/**
 * Zod schemas for every documented FastAPI response, derived from contracts/fixtures and
 * docs/API_CONTRACT.md. The API returns dicts whose fields are withheld or null by stage and
 * role, so every such field is nullable/optional here. A mismatch must surface as a visible
 * error (see SchemaMismatch in relay-api.ts), never as a silent blank.
 */
import { z } from 'zod';

export const STAGES = ['lobby', 'diagnostic', 'discussion', 'transfer', 'debrief'] as const;
export const Stage = z.enum(STAGES);
export type Stage = z.infer<typeof Stage>;

const Concept = z.object({ id: z.string(), title: z.string() });
const Window = z.object({ start: z.string(), end: z.string() });

export const MemberState = z.enum(['waiting', 'responded', 'missing', 'withdrawn', 'present']);
export const Member = z.object({
  name: z.string(),
  responded: z.boolean(),
  state: MemberState,
  is_me: z.boolean(),
  is_host: z.boolean(),
});

export const Plan = z.object({
  start: z.string(),
  end: z.string(),
  minutes: z.number(),
  shorter_alternative: z.boolean(),
  start_local: z.string().optional(),
  timezone: z.string().optional(),
});
export type Plan = z.infer<typeof Plan>;

export const Source = z.object({ source_id: z.string(), source_title: z.string(), source_text: z.string() });
export const Question = z.object({ id: z.string(), prompt: z.string(), options: z.record(z.string(), z.string()) }).strict();
export type Question = z.infer<typeof Question>;

export const Confidence = z.enum(['unsure', 'somewhat', 'confident']);
export const MyAnswer = z.object({ choice: z.string(), confidence: Confidence });

export const Hint = z.object({
  discussion_question: z.string(),
  possible_misconception: z.string().optional(),
  mode: z.string(),
  feedback_source: z.enum(['live_model', 'reviewed_fallback']).optional(),
  fallback_reason: z.string().optional(),
  evidence_quote: z.string().optional(),
  source_id: z.string().optional(),
});

const Outcomes = z.object({ correct: z.number(), incorrect: z.number(), skipped: z.number(), missing: z.number() });
export const Group = z.object({
  paired_responses: z.number(),
  initial_correct: z.number(),
  fresh_correct: z.number(),
  active_participants: z.number().optional(),
  withdrawn: z.number().optional(),
  initial_outcomes: Outcomes.optional(),
  fresh_outcomes: Outcomes.optional(),
  warning: z.string(),
});
export type Group = z.infer<typeof Group>;

export const ResultStatus = z.enum(['correct', 'incorrect', 'skipped', 'missing', 'invalidated']);
export const MyResult = z.object({
  status: ResultStatus,
  choice: z.string().nullable(),
  correct: z.boolean().nullable(),
  explanation: z.string(),
  question_id: z.string(),
});
export type MyResult = z.infer<typeof MyResult>;

export const Challenge = z.object({
  id: z.string().nullable().optional(),
  reason: z.string(),
  pending: z.boolean(),
  stage: z.string().nullable().optional(),
  resolution: z.object({ decision: z.enum(['resume', 'discard']), host_note: z.string() }).nullable().optional(),
});

export const Explanation = z.object({ author: z.string(), text: z.string(), source_fallback: z.boolean() });

const PlanCancelled = z.object({ version: z.number(), start: z.string(), at: z.number() }).nullable();

/** What this viewer may do now, with the server's reason when not (relay/core.py _allowed). */
const Action = z.object({ allowed: z.boolean(), reason: z.string().nullable() });
export const AllowedActions = z.object({
  answer: Action, explain: Action, source_fallback: Action, challenge: Action, resolve: Action, advance: Action, close_round: Action,
});
export type AllowedActions = z.infer<typeof AllowedActions>;

const ReceiptPart = z.object({
  question_id: z.string(),
  prompt: z.string(),
  status: z.enum(['correct', 'incorrect', 'skipped', 'missing', 'invalidated']),
  choice: z.string().nullable(),
  choice_text: z.string().nullable(),
  reviewed_answer: z.string().nullable(),
});
export type ReceiptPart = z.infer<typeof ReceiptPart>;

/** Evidence-linked recap for one participant (relay/core.py _receipt, policy receipt-v1). */
export const Receipt = z.object({
  concept: Concept,
  source: z.object({ source_id: z.string(), source_title: z.string() }),
  pack_hash: z.string(),
  initial: ReceiptPart,
  fresh: ReceiptPart,
  explanations: z.object({ shared: z.number(), mine: z.number(), source_fallback: z.boolean() }),
  next_step: z.object({
    kind: z.enum(['try_later', 'revisit_source', 'no_fresh_answer', 'discarded']),
    text: z.string(),
    policy: z.string(),
    evidence: z.array(z.string()),
  }),
  delayed_check: z.object({ opted_in: z.boolean(), answered: z.boolean() }),
  limits: z.array(z.string()),
});
export type Receipt = z.infer<typeof Receipt>;

export const SessionView = z.object({
  id: z.string(),
  concept: Concept,
  stage: Stage,
  revision: z.number(),
  pack_hash: z.string(),
  is_host: z.boolean(),
  members: z.array(Member),
  me: z.object({
    name: z.string(),
    reminders: z.boolean(),
    availability: z.array(Window),
    timezone: z.string().optional(),
    withdrawn: z.boolean().optional(),
  }),
  plan: Plan.nullable(),
  plan_version: z.number(),
  approved_count: z.number(),
  approved_by_me: z.boolean(),
  plan_cancelled: PlanCancelled.optional(),
  needs_reproposal: z.boolean().optional(),
  schedule_confirmed: z.boolean(),
  paused: z.boolean().optional(),
  source: Source.nullable(),
  question: Question.nullable(),
  my_answer: MyAnswer.nullable(),
  group: Group.nullable(),
  challenge: Challenge.nullable(),
  invalidated: z.boolean(),
  explanations: z.array(Explanation),
  hint: Hint.nullable(),
  discussion_signal: z.string().nullable().optional(),
  my_results: z.partialRecord(z.enum(['diagnostic', 'transfer', 'retention']), MyResult),
  receipt: Receipt.nullable(),
  allowed_actions: AllowedActions,
  waiting_on: z.number(),
  notice: z.string(),
  retention_due_at: z.number().optional(),
  retention_note: z.string().optional(),
});
export type SessionView = z.infer<typeof SessionView>;

/** GET /presentation: by construction has none of me / my_answer / my_results. */
export const PresentationView = z
  .object({
    id: z.string(),
    concept: Concept,
    stage: Stage,
    revision: z.number(),
    members: z.array(Member.omit({ is_me: true })),
    plan: Plan.pick({ start: true, end: true, minutes: true, shorter_alternative: true }).nullable(),
    plan_version: z.number(),
    approved_count: z.number(),
    schedule_confirmed: z.boolean(),
    plan_cancelled: PlanCancelled.optional(),
    paused: z.boolean().optional(),
    invalidated: z.boolean(),
    source: Source.nullable(),
    question: Question.nullable(),
    explanations: z.array(Explanation),
    hint: Hint.nullable(),
    discussion_signal: z.string().nullable().optional(),
    group: Group.nullable(),
    notice: z.string(),
    retention_note: z.string().nullable().optional(),
    challenge: z.object({ pending: z.literal(true), reason: z.string() }).nullable(),
    view: z.literal('presentation'),
  })
  .strict();
export type PresentationView = z.infer<typeof PresentationView>;

export const Credentials = z.object({ session_id: z.string(), token: z.string(), member_id: z.string() });
export type Credentials = z.infer<typeof Credentials>;

export const ProposeResult = z.object({
  options: z.array(Plan),
  state: SessionView,
  notice: z.string().nullable(),
});
export type ProposeResult = z.infer<typeof ProposeResult>;

export const ConceptList = z.array(Concept);
export const Health = z.object({ ok: z.boolean(), live_model: z.boolean(), delivery_enabled: z.boolean() });
export type Health = z.infer<typeof Health>;

export const AuthMe = z.union([
  z.object({ authenticated: z.literal(false), login_available: z.boolean(), demo_mode: z.boolean() }),
  z.object({
    authenticated: z.literal(true),
    user: z.object({ name: z.string() }),
    csrf_token: z.string(),
    expires_at: z.number(),
    demo_mode: z.boolean(),
  }),
]);
export type AuthMe = z.infer<typeof AuthMe>;

export const MySessions = z.array(
  z.object({ id: z.string(), concept: Concept, stage: Stage, is_host: z.boolean(), created_at: z.number(), paused: z.boolean() }),
);
export type MySessions = z.infer<typeof MySessions>;

/** GET /review (host only, open challenge): item + reviewed key + source; no classmates' reasoning. */
export const ReviewPacket = z.object({
  challenge: z.object({ id: z.string().nullable().optional(), reason: z.string(), stage: z.string().nullable().optional(), item_id: z.string().nullable().optional() }),
  item: z.object({ id: z.string(), prompt: z.string(), options: z.record(z.string(), z.string()), correct: z.string(), explanation: z.string() }),
  source: Source,
  pack_hash: z.string(),
});
export type ReviewPacket = z.infer<typeof ReviewPacket>;

export const Withdrawn =z.object({ withdrawn: z.literal(true), notice: z.string() });
export const Deleted = z.object({ deleted: z.literal(true), notice: z.string() });

export const ErrorBody = z.object({
  detail: z.union([z.string(), z.array(z.object({ loc: z.array(z.union([z.string(), z.number()])).optional(), msg: z.string() }).passthrough())]),
  request_id: z.string().nullable().optional(),
});
