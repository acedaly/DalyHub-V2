# Today command-centre refinement — August 2026

## Decision

Today opens as a working surface, not a collection of equally weighted widgets.
The existing task, schedule, habit, Goal, capture and reflection authorities stay
unchanged; this pass strengthens the composition around them.

## What changed

- The header now reads in decision order: date, greeting, then an honest count of
  open work. The sentence is derived from the same optimistic task buckets the
  plan renders, so it cannot disagree with a completion made on the page.
- The rolling-week measures form one bounded strip. A quiet tonal surface and
  internal dividers describe one summary with several parts rather than three
  dashboard cards.
- The task plan is the sole strong object: a larger product radius and a single
  accent edge identify the place to act without adding elevation or tinting the
  whole page.
- Supporting desktop sections share a subtle rail divider. They remain plain
  sections and do not compete with the plan as cards.
- Phone composition keeps the task-first DOM order, restores the full-width day
  navigation when it wraps, and reduces summary inset without reducing targets.

## Non-goals

No new schema, focus timer, productivity score, task time, module, dependency or
write path. Existing shared `TaskRow`, capture, schedule and Goal interactions
remain the authorities. The shell search and global capture controls are not
duplicated in the Today header.

## Accessibility

The status sentence is live for optimistic completion changes. Meaning remains
present in text; colour is supplementary. Existing heading order, task-row
keyboard behaviour, drawer focus restoration and coarse-pointer target floors
are unchanged.
