# RELAY UI and interaction specification

> **Update (2026-10-24):** the web app is now Next.js (`web/src`). The current palette, fonts,
> logo ("Baton R") and motion budget are recorded in `docs/design/DECISIONS.md`: ink #0D1B3E,
> canvas #F6F7FB, blue #2E54F0, violet #6B35E8, gold #F5B12E (amber #8A5600 on #FFF3D6 for review
> text), green #11705A; Newsreader + Atkinson Hyperlegible Next. The tokens and "no Node build" note
> below describe the legacy static UI, which FastAPI still serves. The screens, states, privacy and
> motion principles below still apply.

## Visual direction

A calm study studio, not a neon AI dashboard. Dark navy navigation, warm pale background,
white working cards, cobalt for the current action, amber for review, and muted green for
an observable completed step. Always pair colors with words/icons. Never encode individual
student ability by a red/green avatar or publicly visible heatmap.

Tokens in the supplied CSS:
- Background #F4F5F8; text #202837; muted #687486
- Navigation #152237; primary #375CE0; primary tint #EDF1FF
- Positive step #13715B; review text #8A581B
- Card radius 20px; controls 10-12px; broad spacing instead of dense tables
- System sans-serif font stack, avoiding font licensing or download dependencies

The provided UI is HTML/CSS/JavaScript served by FastAPI, so it needs no Node build step.
Keep it for the MVP. Sankalp may later port components to React/Vite and Motion, but that
migration is not a prerequisite to the demo and should not create a second state engine.

## Screens and states

1. Start/join: one short privacy explanation, display name, and a clearly labeled fixture.
2. Lobby: participants, shared-time proposal, approvals, and readiness to start now.
3. Independent attempt: private options, optional confidence/rationale, one lock action.
4. Peer discussion: one useful prompt, source drawer, volunteer explanation, fallback.
5. Fresh application: no old source or answer keys visible in the question panel.
6. Debrief: matched-response denominators, private feedback, and delayed check pending.
7. Item review: pause state, concern, source, host review note, resume or discard.

## Signature graphic

Use a simple relay line connecting participant initials. Animate a short state transition
when a voluntary explanation is submitted; do not show a path as proof that learning happened.
The supplied SVG shows participation, not ability. A future animated baton should indicate a
turn being offered or taken, not imply an invisible cognitive event.

## Motion rules

150-220 ms for card transitions, button feedback, and source drawer. No continuous parallax,
autoplay backgrounds, fake typing loops, or spinning graphics during reading. Respect
prefers-reduced-motion. The supplied CSS disables animation/transition when reduction is requested.
If ported to Motion for React, use its reducedMotion configuration or useReducedMotion hook.

## Privacy is part of UX

The same page can contain a participant's private response. Presentation mode hides that panel;
it is a convenience, not authorization. The API must continue enforcing participant boundaries.
A real public projector board should use a dedicated group-only projection, not the host's full
participant token. That browser/Discord identity integration is still a live-build task.

## Accessibility checks

Visible keyboard focus, labeled fields, buttons with meaningful text, no timer penalizing slow
readers, dismissible source dialog, readable content at 390px width, and no color-only status.
Use plain-language descriptions alongside any graphics. The local browser test checks no horizontal
overflow at 390px; this is not a complete accessibility audit.

## Do not spend time on

3D avatars, a marketing landing-page animation, a giant network graph, public rank badges, or
mock KPI counters. Prefer one flawless interaction over five decorative pages.
