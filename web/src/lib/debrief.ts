/**
 * Debrief rules as pure functions (unit-tested). Two different immediate items with the same
 * people are not a before/after measurement, so nothing here may phrase a difference as growth.
 */
import type { Group, MyResult, SessionView } from './schemas';
import { PHASE_LABEL } from './stages';

export const WITHHELD = 'Group results stay hidden until at least 3 people have answered both questions.';

export function groupLines(group: Group | null): string[] | null {
  if (!group) return null;
  const n = group.paired_responses;
  return [`First question: ${group.initial_correct} of ${n} correct`, `Fresh question: ${group.fresh_correct} of ${n} correct`];
}

export const STATUS_TEXT: Record<MyResult['status'], string> = {
  correct: 'Correct',
  incorrect: 'Not correct',
  skipped: 'Skipped',
  missing: 'No response recorded',
  invalidated: 'Item discarded',
};

/** Topics to try again: only from the viewer's own results that aren't correct. */
export function retryTopics(view: Pick<SessionView, 'my_results' | 'concept'>): string[] {
  const misses = (Object.entries(view.my_results) as [keyof typeof PHASE_LABEL, MyResult][]).filter(([, r]) => r.status === 'incorrect' || r.status === 'skipped');
  return misses.map(([phase]) => `${view.concept.title}: ${PHASE_LABEL[phase].toLowerCase()}`);
}

export function followUpLine(view: Pick<SessionView, 'me' | 'retention_due_at'>, format: (ms: number) => string): string {
  if (view.me.reminders && view.retention_due_at) return `Follow-up check planned for ${format(view.retention_due_at * 1000)}.`;
  return 'No follow-up reminder. You can opt in from Schedule.';
}

/** Words that would claim measured growth. The debrief UI must never render these. */
export const FORBIDDEN_CLAIMS = /\b(improv\w*|gain\w*|grew|growth|mastery|mastered|learned more|better than before)\b/i;
