import type { Stage } from './schemas';

/** Human labels. Only the backend values (keys) are ever sent to the API. */
export const STAGE_LABEL: Record<Stage, string> = {
  lobby: 'Gather your group',
  diagnostic: 'Think privately',
  discussion: 'Explain together',
  transfer: 'Try a fresh problem',
  debrief: 'Reflect on learning',
};

export const STAGE_SHORT: Record<Stage, string> = {
  lobby: 'Gather',
  diagnostic: 'Think',
  discussion: 'Explain',
  transfer: 'Fresh problem',
  debrief: 'Reflect',
};

/** The host's single advance action per stage (null at the end). */
export const ADVANCE_LABEL: Record<Stage, string | null> = {
  lobby: 'Start: think privately',
  diagnostic: 'Open: explain together',
  discussion: 'Start: a fresh problem',
  transfer: 'Close and reflect',
  debrief: null,
};

export const STAGE_ORDER: readonly Stage[] = ['lobby', 'diagnostic', 'discussion', 'transfer', 'debrief'];
export const stageIndex = (s: Stage) => STAGE_ORDER.indexOf(s);

/** Landing-page journey names mapped onto backend stages. */
export const JOURNEY = [
  { stage: 'lobby', name: 'Schedule together' },
  { stage: 'diagnostic', name: 'Think privately' },
  { stage: 'discussion', name: 'Explain together' },
  { stage: 'transfer', name: 'Test understanding' },
  { stage: 'debrief', name: 'Reflect' },
] as const satisfies readonly { stage: Stage; name: string }[];

export const PHASE_LABEL = { diagnostic: 'First question', transfer: 'Fresh question', retention: 'Delayed practice' } as const;
