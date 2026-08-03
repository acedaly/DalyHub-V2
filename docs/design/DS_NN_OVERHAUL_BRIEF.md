# DS-NN — visual overhaul brief

> **Commit this file to `docs/design/DS_NN_OVERHAUL_BRIEF.md` before running any
> DS-NN prompt.** Every prompt in the pack cites it by path and section number.
> Replace `DS-NN` throughout with the next free `DS-` number in
> `ROADMAP_V2_1.md`, and rename the file to match.

A restyle of every DalyHub surface to a card-on-tint visual system, with a serif
reading column on prose surfaces. Delivered without adding a theme, without a new
user-facing switch, and without changing what any module does.

This document is the *what*. `AGENTS.md` remains the *how*.

---

## §1 Direction, stated as constraints

Not adjectives. Each of these is checkable in a diff.

1. A tinted page canvas with cards raised above it at `radius-card`.
2. Area identity carried by a small colour dot or pill. Never a filled card
   background, never a tinted row.
3. Sans for all chrome, labels, controls, metadata and collection rows.
4. Serif at a capped measure for prose bodies only.
5. Two density presets keyed to **surface type**, not to module.
6. Status pills, including a neutral variant that states absence in words.
7. One progress component: continuous for goals and projects, discretised for the
   review stepper.
8. Separation carried by surface value and a hairline, not by shadow, except on
   genuinely floating layers.

## §2 Tokens

New semantic tokens, defined per theme, all seven themes, no exceptions:

| Token | Purpose |
|---|---|
| `surface-page` | The tinted page canvas cards sit on |
| `pill-neutral-surface` / `pill-neutral-text` | The absence state |
| `progress-track` / `progress-fill` | The one progress component |
| `area-accent-1 … area-accent-6` | Area identity ramp, each with a tint pair for pill backgrounds |
| `divider-subtle` | Within-card row separation, distinct from the existing border token |

Reused unchanged: `nav-selected-surface`, `nav-selected-text`, the
sunken/bg/card/raised ordinals, and the role tokens for danger, success, warning
and accent.

A theme that omits a token must fail the build, not fall back silently. Do not
add a token only one theme defines.

**Radius scale.** `radius-pill` 999px, `radius-card` 16px, `radius-control` 10px,
`radius-field` 10px. No literal `border-radius` values anywhere after the
foundation PR. Rounded corners only with a full border; a single-sided accent
border stays square.

**Rhythm.** Vertical spacing in rem on a 4px base, component-internal gaps in px.
Two font weights only, 400 and 500. Sentence case everywhere, including headings,
buttons, tabs, labels and empty states.

**Colour discipline.** Role colours (danger, success, warning) are reserved for
state and are never used as an area accent.

## §3 The elevation contract

Every theme must satisfy: `surface-card` is perceptibly lighter than
`surface-page` in **both** light and dark mode, consistent with the existing
ordinal model where the ordinal is absolute lightness in both modes.

Minimum separation: **ΔL\* ≥ 3** in CIELAB between `surface-page` and
`surface-card`, and again between `surface-card` and `raised`. Measured,
asserted by the invariant test in §6, and reported per theme.

At most two floating elevations on screen at once; in-flow cards do not count.

A theme that cannot reach ΔL\* ≥ 3 without its page going muddy needs its neutral
ramp adjusted. That is in scope for the foundation PR, and it is not optional —
no theme is exempted and no per-theme escape hatch is added.

## §4 The two density presets

Keyed to surface type. Not a module property. Not a user setting. Implemented as
a data attribute on a region wrapper resolving to sizing tokens.

| | Reading | Collection |
|---|---|---|
| Body size | 16px | 14px |
| Line height | 1.75 | 1.4 |
| Measure cap | 46ch | none |
| Family | serif (prose body only) | sans |
| Row padding | n/a | 9px vertical, 44px min target |
| Section gap | 24px | 12px |
| Card padding | 24px / 28px | 4px / 18px |
| Numerals | default | tabular |
| Separator | one hairline before linked items | hairline between every row |

The serif applies to the prose body only. Titles, labels, metadata, controls,
pills and every piece of chrome stay sans on both presets.

A single route may contain both regions. That is expected, not a special case.

## §5 Typography budget

Proposal: one variable sans for chrome and collections, one variable serif for
prose bodies. Self-hosted, subset to the Latin range actually used, primary
weight range preloaded, added to the PWA precache.

Hard constraints:

- The precache and performance budgets in `PWA_AND_OFFLINE.md` are fixed. Fonts
  fit inside them, or the font choice changes. Never raise a budget.
- No font request may be made while offline. Not precached means the system stack
  renders and nothing blanks.
- Text is never invisible while a font loads.
- Report actual transferred bytes per family, not estimates.

If both families do not fit: keep the sans, drop the serif, use the system serif
stack for prose bodies, and record the substitution rather than quietly shipping
a stack nobody chose.

## §6 Theme invariant specification

Enumerate the theme registry programmatically — never a hand-written list, so a
future theme is covered automatically. For each registered theme, in both light
and dark resolution, assert:

1. Every token in §2 resolves to a non-empty value.
2. ΔL\* between `surface-page` and `surface-card` ≥ 3, and between
   `surface-card` and `raised` ≥ 3.
3. `text-primary`, `text-secondary` and `text-muted` on `surface-card` ≥ 4.5:1
   wherever they carry meaning rather than placeholder text.
4. Every pill surface/text pairing ≥ 4.5:1 — all six area accents, the neutral
   absence pill, every role pill.
5. `progress-fill` against `progress-track` ≥ 3:1, and `progress-track` against
   `surface-card` ≥ 3:1.
6. Area dot colour against `surface-card` ≥ 3:1.
7. Focus ring against both `surface-card` and `surface-page` ≥ 3:1.
8. `nav-selected-text` on `nav-selected-surface` ≥ 4.5:1.

Failure messages name the theme id, the token pair and the measured value. A
theme that fails cannot be registered. The failing test is the enforcement
mechanism, not a review checklist item.

## §7 Surface classification

**Reading:** note record body, diary entry body, meeting summary body, review
prompt and response, project description, area vision, help pages, release notes.

**Collection:** every list and table, Today, the Eisenhower Matrix, Time Sectors,
search results, the command palette, linked-items lists, people directory, asset
list, activity timeline, settings sections.

**Both, on separate regions:** note record (body reading, metadata and links
collection), meeting record (summary reading, attendees and follow-ups
collection), project record, asset record, review session.

Anything not listed is classified using the rule in `DESIGN_SYSTEM.md` and added
here in the PR that classifies it.

## §8 Absence states

Every field, badge and progress affordance must have a defined rendering when the
underlying value does not exist: the neutral absence pill, stating the absence in
the owner's words — "No date", "No progress metric", "Not linked".

Never an empty slot. Never a zeroed bar. Never a hyphen.

Verified by loading a deliberately empty record of each type, not only a
populated one, with an empty-record screenshot in the acceptance matrix. This is
the most common way a design built on progress bars and status badges regresses.

## §9 Out of scope

**Not changed by any DS-NN PR:** information architecture; the
Area → Goal → Project → Task model; entity fields; routes and deep-link URLs
(Search, Quick Capture and Reviews all emit them); the export snapshot format and
its serialisers; auth; the module registry; owner-facing copy about what is and
is not implemented; the theme CHECK constraint; the number of themes; restore,
weekly review, mobile remainders or any other V2.1 roadmap item.

**Not added by any DS-NN PR:** a new theme; a density, shape, type or measure
switch; a Today widget that does not already exist; a progress metric on Goals
(a separate roadmap item — DS-NN renders absence honestly instead); stored area
colours; an animation system.

## §10 Accessibility baseline

WCAG 2.2 AA is enforced, not aspirational. Colour is never the sole carrier of
meaning: an area dot needs an accessible name, a progress bar needs a text value
beside it, a status pill needs its state in text. Touch targets stay at 44px
minimum on the collection preset. Focus order and visible focus survive the
restyle. Every keyboard path that worked before still works.

Verification widths for every DS-NN PR: 320, 375, 390, 430, 768, 1280, 1440.
Every theme, light and dark.
