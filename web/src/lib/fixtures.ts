/**
 * Synthetic fixtures (copies of contracts/fixtures, synced by scripts/sync-fixtures.ts).
 * Original teaching material and invented participants. Never mixed with live data.
 */
import lobby from '@/fixtures/lobby.json';
import scheduleConfirmed from '@/fixtures/schedule-confirmed.json';
import diagnostic from '@/fixtures/diagnostic.json';
import participantDiagnostic from '@/fixtures/participant-diagnostic.json';
import discussion from '@/fixtures/discussion.json';
import challengePaused from '@/fixtures/challenge-paused.json';
import transfer from '@/fixtures/transfer.json';
import debrief from '@/fixtures/debrief.json';
import participantDebriefSkipped from '@/fixtures/participant-debrief-skipped.json';
import presentationDiscussion from '@/fixtures/presentation-discussion.json';
import presentationDebrief from '@/fixtures/presentation-debrief.json';
import { PresentationView, SessionView } from './schemas';

const v = (data: unknown) => SessionView.parse(data);
const p = (data: unknown) => PresentationView.parse(data);

export const FIXTURES = {
  lobby: v(lobby),
  'schedule-confirmed': v(scheduleConfirmed),
  diagnostic: v(diagnostic),
  'participant-diagnostic': v(participantDiagnostic),
  discussion: v(discussion),
  'challenge-paused': v(challengePaused),
  transfer: v(transfer),
  debrief: v(debrief),
  'participant-debrief-skipped': v(participantDebriefSkipped),
} as const;
export type FixtureName = keyof typeof FIXTURES;

export const PRESENTATION_FIXTURES = {
  'presentation-discussion': p(presentationDiscussion),
  'presentation-debrief': p(presentationDebrief),
} as const;

/** The synthetic walkthrough, in session order. `as` names whose point of view the fixture is. */
export const DEMO_STEPS: { id: string; label: string; host: FixtureName; participant?: FixtureName }[] = [
  { id: 'gather', label: 'Gather', host: 'lobby' },
  { id: 'schedule', label: 'Schedule', host: 'schedule-confirmed' },
  { id: 'think', label: 'Think privately', host: 'diagnostic', participant: 'participant-diagnostic' },
  { id: 'explain', label: 'Explain together', host: 'discussion' },
  { id: 'hold', label: 'Challenge hold', host: 'challenge-paused' },
  { id: 'fresh', label: 'Fresh problem', host: 'transfer' },
  { id: 'reflect', label: 'Reflect', host: 'debrief', participant: 'participant-debrief-skipped' },
];
