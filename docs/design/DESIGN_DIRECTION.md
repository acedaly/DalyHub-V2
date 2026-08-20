# DalyHub design direction

> **The rule above all others:** DalyHub should feel like a finished product,
> not a collection of components. A screen must not visibly announce Material
> 3, shadcn, Radix, Tailwind or any other underlying toolkit. Those may provide
> machinery. What the owner sees is DalyHub.

This is the product-level visual and interaction brief for every human and
coding agent working on DalyHub. It defines the intended experience. The
mechanics remain in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), while
[`DALYHUB_DESIGN_SYSTEM.md`](DALYHUB_DESIGN_SYSTEM.md) defines the tokens,
primitives and enforceable design policy.

If a screenshot, historical implementation note or framework convention
conflicts with this direction, this direction wins unless the proposed change
would break functionality, accessibility, truthful data presentation or an
architecture decision. Existing concept images are evidence of this direction,
not a substitute for understanding it.

## What DalyHub is

DalyHub is a calm, premium personal operating system: Todoist's clarity,
Apple's restraint and the useful parts of a modern productivity dashboard. It
is not enterprise software, a stock component library or a database app with
nice cards. It is one coherent place for running a life.

**Your life is complicated. DalyHub shouldn't be.**

The primary user returns every day. Optimise for the hundredth use, not the
first demo. Familiar actions should become almost automatic.

## Personality

Calm. Personal. Intelligent. Connected. Precise. Modern. Fast.

Not corporate. Not playful SaaS. Not sterile minimalism. DalyHub carries enough
colour, iconography and identity — including the connected D logo and its own
icon language — to be recognisable without turning every surface into branding.

## Governing experience rule

Every common flow should favour:

**scan → understand → act**

Avoid:

**open → inspect → configure → save → close**

Resolve design decisions in this order:

1. Content
2. Hierarchy
3. Interaction
4. Decoration

When two approaches remain plausible, prefer the one that makes the next useful
action more obvious, removes a step, preserves context and works better on an
iPhone.

## Visual direction

Clean and dense enough to be useful, never busy. Use strong typography,
deliberate spacing and alignment before adding a container. Most of the screen
stays neutral and quiet so colour means something when it appears.

Avoid:

- cards around every section, especially nested rounded containers;
- excessive pills, chips, badges and permanent action buttons;
- decorative gradients outside approved brand assets;
- widgets competing for attention;
- large empty cards holding very little information;
- dashboard metrics placed above the work they supposedly explain;
- page-specific styling that creates a second design system.

Prefer:

- flat or lightly bounded groups of rows;
- one clear dominant region, or no dominant region when the content itself is
  sufficient;
- subtle hairlines, moderate corners and almost no shadow;
- secondary metadata that recedes but remains legible;
- one expressive moment per page rather than colour everywhere;
- consistent alignment from page title through controls and content.

Whitespace is useful only when it clarifies grouping or priority. Large blank
regions inside sparse cards are not premium; they are wasted space.

## Interaction model

Todoist is the strongest interaction reference. DalyHub's best interactions are
fast and reversible:

- adding a task does not feel like completing a form;
- changing priority, date or project is available inline;
- moving an item does not require navigating through several screens;
- hover or tap reveals secondary actions instead of displaying them permanently;
- optimistic mutations offer Undo where practical;
- keyboard and pointer paths operate on the same underlying action;
- opening a record preserves the collection, filters and scroll context.

Desktop may expose more context. Mobile is a deliberately recomposed,
thumb-driven daily interface — never a desktop layout squeezed into a narrow
viewport. Primary actions must remain reachable and touch targets must retain
their accessibility floor.

## System-wide semantics

Priority colour and language are identical everywhere:

| Priority | Colour | Meaning |
| --- | --- | --- |
| P1 | Red | Urgent / highest priority |
| P2 | Orange | High priority |
| P3 | Blue | Medium priority |
| P4 | Neutral | Low / default priority |

Colour never carries status alone. It is paired with a word, icon, position or
shape. Decorative accent colour must not impersonate priority, overdue, warning
or success.

## Module direction

### Today — the centre of the system

Today is editorial, not a dashboard. It answers, in order: **What matters
today? What should I do next? Am I moving towards what I care about?**

The expected hierarchy is date and greeting, the current/next action, today's
short task plan and schedule, then lighter supporting context. Goals, Projects,
Habits, attention items, reflection and weekly measures are shown only when
they help make a decision. They must not become an endless equal-weight widget
grid. Weekly reporting belongs below or behind disclosure, not above today's
work.

### Tasks — almost utilitarian

Tasks is the least decorated module. One clean list, clear groups, compact
rows, strong title hierarchy and secondary date/project/recurrence metadata.
Priority uses a small amount of consistent colour. Row actions appear on demand.
Quick Add is immediate and forgiving. The list is the benchmark for density
across every module that renders tasks.

### Plan and Schedule — time made legible

Plan connects commitments, capacity and task placement without becoming a
calendar administration tool. Schedule is a scan-first agenda: time is aligned,
current and next events are clear, and source/context is secondary. Both should
make temporal conflicts and unplaced work obvious without filling the page with
controls.

### Projects and Areas — spatial

Projects may use a restrained gallery because recognition, identity, progress
and the next action matter together. They should feel actively pursued, not like
CRUD records. Areas are more permanent and quieter; their row-led presentation
teaches the taxonomy without explanation. Do not make Areas and Projects
visually identical merely for component reuse.

### Goals — connected progress

Goals are aspirational without becoming motivational theatre. A Goal should
quickly communicate its current reading, target, trajectory, status and next
incomplete milestone. Then it shows the Projects, Habits and Tasks driving it.
The useful model is **Goal ← Projects/Habits ← Tasks/actions**, not a Goal page
followed by disconnected fields.

### Habits — routines without gamification

Habits should make today's check-ins and weekly cadence obvious. Use completion,
consistency and history as information, not pressure. No manufactured streak
urgency, celebration clutter or guilt language. Checking in must be one tap.

### Notes — disappear into the writing

Notes are document-like: minimal chrome, excellent typography, fast linking and
a comfortable writing measure. Metadata, backlinks and relationships belong in
a contextual rail or panel rather than polluting the document. The reference is
closer to Craft or Apple Notes than block-heavy Notion.

### Diary and Reviews — reflective, not administrative

Diary prioritises capture and reading. Reviews guide reflection with clear
prompts and a visible sense of completion, but should not look like a long
settings form. Past entries become calm documents; active review controls remain
secondary to the owner's words.

### Meetings — outcomes over minutes

Meetings should surface agenda, decisions, commitments and follow-up. Structured
items use compact rows and direct conversion to Tasks. The interface should help
the owner leave a meeting knowing what changed and what happens next.

### People and Assets — recognisable collections

People feel warm: avatar, relationship, useful context and recent interaction.
Assets are more structured and information-heavy, with due obligations and risk
easy to scan. They share DalyHub primitives but not identical density or card
anatomy. Consistency does not mean every module looks the same.

### Analytics — genuinely visual

Analytics is the expressive zone: strong charts, meaningful comparisons,
annotations and narrative insight with minimal borders. Prefer “27 tasks
completed, 18% more than last week” plus a trend and explanation over isolated
metric cards. It should explain the system back to the owner without pretending
that every upward number is good.

### Views, Search and Inbox — operational utilities

These surfaces are fast, compact and low-chrome. Filters communicate scope
without dominating the result set. Empty states explain the next useful action.
Saved Views feel like lenses over canonical data, never separate copies.

### Settings — quiet and predictable

Settings uses clear groups, plain language and conservative controls. Avoid a
wall of slabs. Destructive actions are unmistakable and confirmed; ordinary
changes are immediate where safe. Settings should feel part of DalyHub, not a
component catalogue.

## The design system underneath

Think in a small set of product primitives rather than assembling every screen
from Card + Chip + Button + Container:

- **Canvas** — the almost invisible page background;
- **Surface** — separation used only when content genuinely needs it;
- **Row** — the fundamental productivity interaction;
- **Panel** — contextual information and record detail;
- **Gallery item** — selected collections such as Projects, People and Assets;
- **Metric** — Goals and Analytics;
- **Timeline** — Today, Schedule, history and activity;
- **Editor** — Notes, Diary and rich descriptions.

Typography and spacing carry most hierarchy. Corners are moderately rounded,
never cartoonish. Shadows are rare. Borders are subtle. Icons are consistent
and purposeful.

Generic primitives provide behaviour and accessibility; product components own
domain meaning. Never bend a generic Button, Card or Field around one module's
semantics. Never create a private module primitive when a shared product pattern
already exists.

## Coding-agent acceptance check

Before declaring a UI change complete, verify:

- The screen's primary question is answerable within a few seconds.
- The next useful action is obvious without reading every panel.
- Removing any new card, chip or colour would not improve the screen.
- Repeated rows align and scan consistently.
- Desktop and mobile were considered as different compositions.
- Priority, state and entity colour retain their system-wide meanings.
- The change uses shared tokens and primitives rather than hard-coded values.
- Empty, loading, error, long-content and realistic-data states still work.
- Keyboard, focus, touch targets and reduced-motion behaviour remain correct.
- A representative screenshot was inspected at desktop and phone width.

If the implementation technically passes but still looks like a component
library demo, it is not finished.
