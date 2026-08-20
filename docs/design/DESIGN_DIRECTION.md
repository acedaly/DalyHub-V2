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

## Reference composition

The approved mockups establish a recognisable DalyHub composition. They are not
pixel-perfect templates, but an implementation that materially departs from
these proportions must explain why.

### Desktop frame

- A quiet navigation rail occupies roughly 14–16% of a 1440px desktop canvas.
  It contains the connected D identity, one prominent Capture action, search,
  grouped destinations and the owner account at the bottom. It is navigation,
  not a second dashboard.
- The top utility bar is compact and aligned to the content origin. Search is
  the dominant utility; help, notifications and creation remain secondary.
- The working canvas uses a readable maximum width rather than stretching rows
  across an ultrawide display. On Today, the useful desktop composition is a
  main action column of approximately two-thirds and a supporting context rail
  of approximately one-third.
- The main column owns tasks and the current decision. The context rail owns
  schedule, habits and light progress context. Supporting content must never
  interrupt the task sequence merely to balance a grid.
- Page headers are shallow. Date, title, one sentence of context and one primary
  action should not consume a quarter of the viewport.
- Vertical rhythm is compact: related controls sit close together; major
  regions receive a clear but not theatrical break. Repeated 24–32px gaps
  between every object are a warning sign.

### Mobile frame

- Mobile is a single-column command surface with no desktop sidebar and no
  squeezed context rail.
- The compact header carries the D mark, date/context, owner identity and one
  creation affordance. It does not repeat the desktop page header verbatim.
- Bottom navigation contains the daily destinations, with Capture as the clear
  central action. Labels remain visible; icon-only primary navigation is not
  acceptable.
- The first viewport answers “what do I do now?” before showing analytics,
  history or broad system status.
- Supporting cards may become a horizontal glance strip only when each card is
  independently understandable and the strip does not hide a required action.
- Sheets, drawers and menus respect one-handed reach. Save/confirm actions stay
  visible above the software keyboard and do not require scrolling to the end
  of a long form.

### Surface and row measurements

These are target bands, not invitations to hard-code values outside the token
system:

| Element | Desktop target | Touch target | Principle |
| --- | --- | --- | --- |
| Navigation destination | 36–40px visual row | At least 44px hit area | Dense navigation without sacrificing access |
| Task/list row | 40–48px when single-line | At least 44px hit area | More work visible, no cramped text |
| Standard control | 36–40px | At least 44px hit area | Compact on pointer, safe on touch |
| Card corner | 10–14px | Same | Moderately rounded, never toy-like |
| Card padding | 14–20px | 16–20px | Enough air, no empty stage |
| Major section gap | 16–24px | 16–20px | Rhythm without fragmentation |
| Row divider | One quiet hairline | One quiet hairline | Structure without table-grid noise |

Shadows are reserved for objects that physically float above the canvas:
menus, popovers, drawers and drag previews. Stationary cards use a subtle border
or a small surface-value change, not both plus a shadow.

## Competitive quality bar

DalyHub competes with mature products, but it should not imitate their skin.

| Reference | Standard to match | What DalyHub must do better |
| --- | --- | --- |
| Todoist | Capture speed, task-list clarity, keyboard fluency and low-friction scheduling | Connect daily action to Goals, Projects, People, Meetings and reflection without slowing capture |
| Notion | Information confidence, flexible content and polished empty/loading states | Provide stronger defaults, less configuration and clearer action hierarchy |
| Griply | Visible goal progress and linkage between goals, habits and tasks | Avoid gamification clutter and keep daily execution faster |
| Things | Restraint, typography, calm grouping and delightful detail | Work across a deeper connected life model and web/PWA environments |
| Apple productivity apps | Platform-quality spacing, focus and touch behaviour | Preserve power-user density and cross-module relationships |

Comparable quality means more than looking polished with seeded data. A screen
must remain composed with an empty account, realistic long titles, overdue work,
ten or more rows, dark appearance, 320px width, keyboard focus and coarse touch.

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

### Repeated-row rule

Every dense row follows the same interaction grammar: primary content owns the
width; metadata is ordered by the decision it supports; secondary actions wait
until engagement on a pointer and remain explicit on touch. Hidden actions stay
keyboard reachable and must not intercept pointer input. A module may specialise
the lead object (completion, time, avatar, entity mark), but may not rebuild hover,
focus, touch or forced-colour behaviour locally.

Task metadata is always **when → where → how important** in both DOM and visual
order. Grouped Task collections use one disclosure/name/count pattern across
Tasks and Plan. These are product semantics, not screenshot styling; a new task
surface inherits them before adding module-specific composition.

### Motion grammar (DHDS-08)

> **Motion explains what changed, where something came from, where it went, or
> what has focus. It is never decoration for its own sake.**

DalyHub should feel responsive, physical and coherent, but never busy. The
target is Things, Todoist, Craft and Apple productivity software — not playful
consumer apps, animated marketing sites, stock Material motion, spring-heavy
interfaces or dashboards whose widgets are always moving. A user should mostly
stop noticing the animation and simply perceive that the product is
exceptionally well made.

**Four levels, and every animation belongs to exactly one.** Level 0 no motion —
text updates, corrections, autosave, background refreshes; *not everything
deserves animation*. Level 1 interaction feedback — hover, press, focus,
selected, checked; very fast and restrained. Level 2 contextual reveal — menus,
popovers, tooltips, inline editors, disclosures, toasts, sheets; these visually
relate to the control that caused them. Level 3 meaningful structural transition
— completing, opening contextual depth, the next Today task taking the Now
position; used sparingly, and never past ~260ms.

**One vocabulary governs it.** Five semantic durations and four curves in
`tokens.css`; one grammar of named behaviours in `app/styles/motion.css`. A
surface *names* a motion; it never authors one. A duration, a curve, a distance
or an entrance written into a module stylesheet is a bug — a second motion system
inside one module is exactly the divergence this sequence exists to end.

**Non-negotiable.** No route or page transitions; navigation is immediate. No
spring physics, no bounce, no confetti, no theatrical completion, no hover that
is a scale transform, no animation added because CSS makes it easy, and no
animation dependency without compelling evidence the existing stack cannot do
the job. Interaction feedback must never introduce layout shift: an affordance
that appears must already occupy its geometry.

**Reduced motion is a positive contract**, not a global multiplier. Structural
travel is *removed* rather than accelerated; opacity is kept so a surface still
reads as arriving; and nothing depends on animation to convey meaning —
completion still completes, panels still open, disclosures still show their
state, progress still updates.

The full specification, the deliberate static exceptions and the deferred work
are in
[`DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md`](DHDS_08_MOTION_AND_INTERACTION_GRAMMAR_2026_08.md).

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

The approved desktop structure is:

1. Compact date, greeting and one-sentence day summary.
2. A restrained progress summary, only when it helps frame the day.
3. **Now** — one recommended task with the strongest hierarchy and a Focus
   action where supported. Never a giant empty hero card.
4. **Next** — a short, ordered working list with inline completion and quick add.
5. **Later** — lighter tasks and events that should not compete with Now.
6. A right rail containing the agenda first, then today's Habits and one compact
   momentum/progress insight.
7. Goals, Projects needing attention, reflection and weekly reporting below the
   decision surface or inside progressive disclosure.

On mobile, Now, Next and Later remain in that order. Agenda becomes an inline
section after the active task plan. Habits and momentum become compact glance
surfaces below it. The phone must not show a miniature two-column desktop.

### Tasks — almost utilitarian

Tasks is the least decorated module. One clean list, clear groups, compact
rows, strong title hierarchy and secondary date/project/recurrence metadata.
Priority uses a small amount of consistent colour. Row actions appear on demand.
Quick Add is immediate and forgiving. The list is the benchmark for density
across every module that renders tasks.

Rows align completion, title, date, project and priority to stable scan axes on
desktop. Metadata order follows the owner's questions: **when → where → how
important**. Completed work recedes or collapses. Bulk selection is a mode, not
permanent checkbox-and-toolbar chrome. Board and calendar views reuse canonical
task semantics rather than inventing visually unrelated task cards.

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

A Project gallery item communicates, in order: identity, name, condition,
meaningful progress and the next action. If no trustworthy progress exists, do
not fabricate a percentage to fill the card. Project detail opens with outcome,
status and next action before activity history or settings. Areas use a quieter
row/list treatment with roll-up counts and momentum; they are contexts, not
finite work packages.

### Goals — connected progress

Goals are aspirational without becoming motivational theatre. A Goal should
quickly communicate its current reading, target, trajectory, status and next
incomplete milestone. Then it shows the Projects, Habits and Tasks driving it.
The useful model is **Goal ← Projects/Habits ← Tasks/actions**, not a Goal page
followed by disconnected fields.

The visual signature is a compact metric and trajectory, not a giant percentage
ring surrounded by empty space. A measurable Goal shows current reading, target,
direction, status and next incomplete milestone together. An unmeasured Goal
uses milestone state and linked work honestly instead of displaying “0%”.

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

Every chart requires a question, comparison and readable annotation. Legends,
axes and tooltips use plain language. Colour series remain distinguishable in
both appearances and are not confused with P1, overdue, warning or success.
Four disconnected KPI cards followed by generic charts do not meet this bar.

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

### Contextual depth surfaces

Drawer, Inspector and Sheet are different behaviours expressed through one
panel grammar. Every host uses the same title hierarchy: one title, at most one
short supporting line, a consistently placed close action, one scrolling body
and an optional pinned commitment region for Save/Confirm actions. Do not place
a second page header, duplicate title or decorative toolbar inside that frame.

The host determines interaction, not appearance:

- a **Drawer** preserves page context, URL history and stacked record depth;
- an **Inspector** keeps the page interactive on desktop and supports docked
  resizing, becoming modal only when the viewport requires it;
- a **Sheet** handles short transient choices and actions, bottom-anchored on a
  phone and presented as a centred dialog on larger screens.

Do not show a drag handle on a centred desktop dialog, imitate a mobile gesture
where none exists or create module-specific panel chrome. Use `PanelHeading`,
the `.dh-panel-*` anatomy and the shared close/action primitives. Content and
behaviour may vary; spacing, hierarchy and interaction affordances may not.

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
