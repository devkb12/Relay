/** Motion tokens: handoff, settle, hold. Eased tweens only (no springs), transform/opacity/stroke only. */
export const EASE_ENTER = [0.2, 0, 0, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

export const DURATION = {
  press: 0.12,
  card: 0.2,
  drawer: 0.22,
  /** Stage handoff along the track. Exceeds UI_SPEC's 150-220ms by design; see docs/design/DECISIONS.md. */
  handoff: 0.4,
} as const;

export const settle = { duration: DURATION.card, ease: EASE_ENTER };
export const handoff = { duration: DURATION.handoff, ease: EASE_ENTER };
