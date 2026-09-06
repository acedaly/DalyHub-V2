# SHARED_SEARCH.md — The Shared Search system (DS-08)

> How global Search works in DalyHub: a registry-driven, entity-agnostic search
> surface that returns grouped results from every module and opens records in the
> DS-03 Drawer. Decision record: [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation).

---

## What it is

One reusable Search system that any module contributes to by registering a
**search provider** — there is no per-module search UI and no central switch. It
lives in [`app/shared/search`](../../app/shared/search) and knows nothing about
Tasks, Projects, Notes, D1, workspaces, routes or Drawer keys.

Global search:

1. sends only a **bounded query** to the server;
2. runs every **registry-discovered** provider under a trusted, server-derived
   workspace scope;
3. returns **bounded, grouped, display-ready** results;
4. opens the chosen record in the existing **DS-03 Drawer** over its home surface,
   preserving unrelated URL state.

---

## The layers

| Layer | Location | Imports | Responsibility |
|---|---|---|---|
| **Model** (pure) | [`~/shared/search/model`](../../app/shared/search/model.ts) | kernel *types* only — no React/D1/bindings (import-guard tested) | normalisation, validation, ranking, grouping, dedup, limits, match ranges, selection maths |
| **Orchestrator** (runtime) | [`orchestrator.ts`](../../app/shared/search/orchestrator.ts) | kernel types + model | run providers, isolate failures, assemble the bounded outcome |
| **Endpoint** | [`app/routes/search.ts`](../../app/routes/search.ts) | worker `env`, registry, orchestrator | auth, trusted workspace scope, JSON `GET /search` |
| **Controller** (React) | [`useSearchController.ts`](../../app/shared/search/useSearchController.ts) | model + transport | debounce, abort, stale rejection, states |
| **Surface** (React) | [`SearchSurface.tsx`](../../app/shared/search/SearchSurface.tsx) | controller + DS-03 hooks + PX-02 identity | combobox/listbox UI, keyboard, highlighting, Drawer opening |

Separating them keeps the model and orchestrator React-free (reusable by a server
or a provider) and the UI server-free.

---

## The provider contract (FND-06, refined by DS-08)

A module registers a provider in its manifest:

```ts
export default defineModule({
  id: "tasks",
  // …
  searchProviders: [tasksSearchProvider],
});
```

A provider returns `SearchResultItem`s from a workspace-scoped executor:

```ts
type SearchResultItem = {
  readonly id: string;              // unique within the provider
  readonly title: string;
  readonly subtitle?: string;       // concise subtitle / preview
  readonly target: SearchResultTarget;
  readonly entityType?: EntityType; // groups the result
  readonly signals?: readonly SearchResultSignal[];
  readonly score?: number;          // optional; a normalised tie-breaker only
};

type SearchResultSignal = {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly value?: string;
  readonly tone?: "neutral" | "muted" | "accent" | "success" | "warning" | "danger";
  readonly icon?: string;
  readonly accessibleLabel?: string;
};

type SearchResultTarget =
  | { kind: "drawer"; drawerKey: string; canonicalPath?: string }
  | { kind: "route"; to: string };
```

**Why `target` replaced `navigateTo`.** FND-06 modelled navigation as an opaque
string, which would force Search to parse a product path to guess how a result
opens — the central-switch coupling ADR-013 forbids. The typed
`SearchResultTarget` lets the **module own how its result opens**; Search dispatches
on `kind` and never parses product ids. Targets are validated at the boundary:
in-app paths must be app-relative, and `javascript:`, protocol-relative `//…`,
external URLs, backslashes and control characters are rejected (the result is
dropped).

`signals` is the generic, serialisable slot for compact metadata such as Task
priority/urgency. It carries no React nodes and imports no module-specific types.
The Search surface may translate known generic signals into shared presentation
components (`PriorityIndicator`, `UrgencyChip`); malformed signal objects are
dropped by both the server validator and browser decoder.

The executor receives a trusted `SearchRuntimeContext` (the workspace scope, the
authenticated owner id when available, and a cancellation `signal`) and never
searches across workspaces:

```ts
const search: SearchExecutor = async (query, context) => {
  // query.text is normalised; query.limit is the per-provider bound.
  // context.workspace is the trusted, server-derived scope.
  // context.signal is aborted on the deadline or when the search is cancelled;
  // a repository-backed provider should pass it to its data layer and bail early.
  return matches.slice(0, query.limit);
};
```

Every provider runs under a **bounded deadline** (`DEFAULT_PROVIDER_TIMEOUT_MS`),
so a hung provider can never stall healthy results: at the deadline the runtime
aborts the provider's `signal` and treats it as a failure, and any late
resolution/rejection of the abandoned work is safely consumed.

---

## Ranking and grouping

Ranking is **tiered and deterministic** so a provider's own score range can never
dominate global ordering:

1. exact title match
2. title prefix
3. title token (word-boundary) prefix
4. subtitle / preview match
5. fuzzy title (subsequence)
6. normalised provider score — tie-breaker only, then title, then id

Results **group primarily by entity type**; a result with no entity type falls
back to its owning module. Groups appear in **first-seen order** over the ranked
list, so the most relevant group leads without a hard-coded entity order.

A result's global identity is **`moduleId::providerId::itemId`**. A provider-local
`itemId` is unique only *within its provider*, so the provider is part of the
identity — two providers in one module may return the same `itemId` and both
survive. Deduplication is by the full identity only (same provider + same `itemId`
→ one kept); it never dedupes on title, subtitle, Drawer key, route or entity
type, because provider-local identity does not establish cross-provider record
equivalence.

**Active-selection lifecycle.** Every meaningful query change clears the active
selection immediately. While a new query loads, the prior results may stay visible
but are not current: no active option, no `aria-activedescendant`, and the rows
render as inert text (not links), so neither Enter nor a plain/modified click can
open a stale result. New results arrive with no default selection; Arrow keys
begin selection explicitly.

Highlighting comes from **match ranges** (code-point indices) rendered as `<mark>`
from plain text segments — there is no `dangerouslySetInnerHTML` and no provider
HTML.

---

## What a provider may never put in a result

A result list is the surface most likely to be read over someone's shoulder, so
three providers hold an explicit line on what they match and what they show, and
each holds it in a test rather than in a comment.

| Provider | Matches | Never matches, and never shows |
| --- | --- | --- |
| **Assets** (ASSET-03) | title, type, tags | serial number, reference/policy number |
| **Obligations** (V2.10) | title, category label, subject title | any amount |
| **Finance** (V2.12) | account name; transaction **display payee** | any amount, any balance, the bank's raw `source_description`, any memo |

Finance is the strictest of the three, and it is worth saying why each omission
is there rather than only that it is:

- an **amount** is the most private fact a transaction carries, and a **balance**
  is the whole of an account;
- `source_description` is raw bank text the owner never chose — terminal ids,
  card fragments, suburb codes — so matching it would put `EFTPOS 4821` in front
  of a query for `4821`;
- a **memo** is body content, and reaching body content is governed by the
  explicit-query boundary;
- an **empty query returns nothing at all** from Finance, and
  `finance_transaction` is in `RECENCY_EXCLUDED_TYPES` besides, so a transaction
  is never volunteered before the owner has typed something. An *account* is
  listable there, for the same reason a Person is: a name is not a confession.

`test/unit/finance/search-privacy.test.ts` asserts this against the provider's
own source with comments stripped, so a rule written in a comment cannot pass for
a rule enforced in code — and `test/kernel/search-route.test.ts` seeds a real
account with a real opening balance and asserts the figure does not appear in the
response payload in any shape.

---

## Bounds (performance and safety)

Every edge is bounded ([`limits.ts`](../../app/shared/search/limits.ts)): query
length, provider count, results per provider, total results, and each display
field. Empty or invalid queries never execute a provider — they are answered
from the recency read instead (see [The empty query](#the-empty-query--recent-records-find-01)),
which is one bounded statement and no provider at all. The browser sends only
the bounded query and receives only bounded results — never a workspace dataset.

Repository-backed providers must perform bounded database queries over canonical
data or a dedicated read projection. They must not load a whole collection and
filter in JavaScript, and they must not enrich results by calling one repository
method per hit. The D1 search projections added for Areas, Goals, Projects, Tasks
and Diary are query-count tested: one matching record and fifty matching Tasks use
the same single statement. RECALL-01 extended the same proof to every
content-searching provider — Meetings (title, location, agenda, notes and an
`EXISTS` over captured items), Tasks (description), Diary (body), Reviews
(section bodies) and Notes — each still ONE statement whether it matches a title,
a metadata field or a body.

---

## Incremental search (no arbitrary timeouts)

The controller has one clear lifecycle: a meaningful query change **immediately**
advances an authoritative generation and aborts the in-flight request (before the
debounce fires), then debounces a fresh request under the reserved generation;
only that generation may update state. So a slower earlier response can never
display results for a query the input has already moved past (the abort is
best-effort; the generation guard is authoritative). Empty input returns to idle,
loading keeps valid prior results as stale content, a partial failure still shows
healthy results, clearing and retry both invalidate any pending request, aborted
requests never surface an error, and nothing updates state after unmount.

The browser also treats the endpoint's JSON as **untrusted**: `fetchSearch` runs
it through `decodeSearchOutcome`, which rebuilds a bounded outcome from validated
pieces (reusing `validateTarget`, `validateEntityType` and the shared limits).
Malformed JSON or a structurally-invalid outcome becomes a generic, retryable
failure rather than a crashed UI.

---

## Opening a result in the Drawer

A `drawer` target navigates to the route hosting that module's `DrawerProvider`
(its `canonicalPath`, or the current path) with the Drawer key appended via the
DS-03 pure URL helper, **preserving unrelated query parameters** — so opening a
result never discards filters or other state. Result rows are real links, so
modified/middle-click open in a new tab; a plain click/Enter opens in-app and
closes Search. There is **no second Drawer or record viewer**.

## The empty query — recent records (FIND-01)

Opening Search with no query lists the workspace's **recently worked-on records**,
newest first, in the same rows the results use. It is one keystroke and one Enter
to open one. This replaced a sentence that restated the input's own placeholder
and offered nothing to open, which is what
[DEBT-195](../product/PRODUCT_DEBT.md) recorded.

### The recency rule, stated once

> A record's recency is the timestamp of the **most recent Activity event the
> record is a subject of**. Newest first; an exact tie breaks by the more
> recently created record, then by entity id. All three keys descend.

It lives in [`app/kernel/recent-records/`](../../app/kernel/recent-records/) and
nowhere else. Three properties follow, each asserted by a test:

- **It is a maximum, never a count.** A record touched fifty times last month
  ranks below one touched once this morning. Recency is a date, not a
  prediction, and [ADR-112](../decisions/ARCHITECTURE_DECISIONS.md#adr-112-retrieval-and-capture-velocity--one-tag-vocabulary-a-recency-source-that-is-not-activity-and-the-ai-gate-that-is-not-yet-runnable)
  decision 5 forbids frequency weighting, learned ordering, personalisation and
  engagement signals anywhere in retrieval.
- **It is derived, never stored.** No table, no column, no migration and no write
  path — [ADR-110](../decisions/ARCHITECTURE_DECISIONS.md#adr-110-follow-through-is-derived-from-the-activity-stream-never-stored--one-period-account-no-adherence-score-and-no-snapshot-table-for-a-plan-or-a-goal)'s
  standing posture applied to a new question.
- **It reads mutations, never views.** Activity records what the owner *changed*.
  DalyHub has never stored what the owner *looked at*, and FIND-01 did not start:
  a stored "recently opened" ledger was the more expensive option ADR-112 asked
  to be disproven first, and adding a view event to the append-only audit stream
  is refused outright.

### Why the Activity stream and not `entities.updated_at`

`entities.updated_at` looks like the obvious authority and is not one: it is
maintained **inconsistently** across the detail tables. Some repositories bump it
when a detail row changes and some do not — which is why
[`d1-area-repository.ts`](../../app/platform/storage/d1/d1-area-repository.ts)
already carries an `EFFECTIVE_PROJECT_UPDATED_AT_EXPR`, a `CASE` folding
`project_details.updated_at` over `entities.updated_at`, to compensate. A recency
source built on it would silently under-report every edit that touched only a
detail table, and would need one such `CASE` per entity type to be honest.

The Activity stream has no such gap: ADR-005 and ADR-012 make every meaningful
change to any entity append exactly one event, atomically with the mutation,
uniformly for every module. It is the only source in the product that already
answers this question the same way for all ten record types.

### What a recent row carries, and what it deliberately does not

An identity, a type, a title and the date the rule selected it by — **no
subtitle, no preview, no body excerpt and no per-type signal**. That is two
decisions in one field list. It keeps the read to a single statement (a subtitle
would mean joining ten detail tables or one read per type, which is the N+1 the
bound forbids), and it makes the privacy property *structural* rather than
conditional: this list cannot leak a record's contents because it never carries
any.

The rows are the existing `SearchOption`, in one group headed **"Recently worked
on"** — not grouped by entity type, because a recency list has exactly one
meaningful order and splitting it per type would scramble the one fact it exists
to show. No fourth Task anatomy: a Task here is the row Search already draws,
opening the Task Drawer it already opens.

### Only what can actually be opened, and why the QUERY decides it

The read selects **only record types that have a real destination**, derived from
`DESTINATION_ENTITY_TYPES` in
[`~/shared/entity/destination`](../../app/shared/entity/destination.ts) minus the
exclusion below. It is an allow-list in SQL rather than a filter afterwards, and
that distinction is a defect fix rather than a preference.

The `LIMIT` is applied by the database. A row selected here that the surface
cannot open would be dropped afterwards in JavaScript **having already spent its
place in that limit** — so a workspace whose newest touched records were all of
such a type rendered the *empty state* while holding plenty of openable history,
with the openable records sitting just behind the limit and never reached.

That is not hypothetical. `habit` had a record page (`/habits/:habitId`, since
HABITS-01) and **no entry in the shared destination map**; the Habits search
provider had worked around the gap by hard-coding its own route, which is exactly
the per-module route table that file's contract forbids, so the omission stayed
invisible until something consulted the map for a Habit. Ten Habits and one Area
produced eight SQL rows and **zero** rendered results. `habit` gained its entry,
and the allow-list makes the whole class impossible rather than fixing the one
instance: a future entity type with no record page is simply never selected.

A test asserts every registered entity type is either listable or deliberately
excluded, so a new type cannot be neither.

### The one exclusion, and why

**Diary, and only Diary.** The reasoning is about *when* this list renders, not
about who may read it: every other Search surface appears because the owner typed
something, and this one appears because they opened Search. A query for
"therapy" is a deliberate act; `⌘K` on a shared screen is not. A Diary entry
stays fully findable the moment the owner types — nothing is hidden, one unbidden
surface declines to volunteer it — and the surface says so in a standing line.

People are deliberately *not* excluded: a name is not a confession, People are
among the most valuable records to re-find, and the stronger protection is the
structural one above.

### The cost

**One D1 statement**, flat in workspace size and constant in bound parameters.
The statement bounds the *scan* before it aggregates: it walks at most
`RECENT_ACTIVITY_SCAN_LIMIT` (600, the same figure as FOLLOW-01's
`MAX_WINDOW_EVENTS`) rows of the existing `activities_workspace_occurred_idx`
newest-first, expands those to their subjects, joins `entities` for the title and
type, groups to each record's newest event and takes eight. A workspace with ten
records and one with ten thousand cost the same.

The consequence is a stated **horizon** rather than a silent approximation: a
record whose newest event is older than the workspace's newest 600 events is not
"recent", which is what the word means. It cannot mis-order anything —
everything inside the horizon is exact — it can only decline to fill the list.

### What this replaced

Until FIND-01 the empty state showed a **device-local** list built in the
browser: the results the owner had activated from inside Search, in
`localStorage`, with its own encoder, decoder, sensitive-subtitle rule and Clear
button. It could not answer the question the empty query asks — it was empty on
first use, on a new device and after clearing site data; it knew only what had
been opened *through Search*; and it was per-browser rather than
workspace-scoped. DEBT-195 was open the whole time it existed, which is the
evidence that it did not close it. Only its storage key survives, so signing out
still purges the data from browsers that hold it
([`recent.ts`](../../app/shared/search/recent.ts)).

---

## Accessibility and modal behaviour

The surface reuses the DS-03/PX-02 modal machinery
(`useDrawerFocus`/`useBodyScrollLock`/`useInertBackground`) — **no second
focus-trap, scroll-lock or inertness system**. `useInertBackground` is anchored to
the **modal root** (which contains both the scrim and the panel), not the panel, so
the background app becomes inert while the **scrim stays interactive** (clicking it
closes Search). Search sits above the Drawer in the z-order, so opening it over an
open Drawer renders on top; selecting a result closes Search before its Drawer
opens. It is a WAI-ARIA combobox
controlling a `listbox`: opening focuses the input, Tab is contained, Escape
closes and restores focus to the trigger, ↑/↓ wrap, Home/End jump, Enter opens the
active option, `aria-activedescendant` tracks it, and a polite status region
announces count/state. Touch targets meet 44px; usable at 200% zoom and 320px, in
light/dark, with reduced motion. Search claims the **`/`** shortcut only — never
`⌘K` (reserved for the DS-09 Command Palette).

---

## Server composition

`GET /search` ([`app/routes/search.ts`](../../app/routes/search.ts)) is the
deployed composition boundary — the **same path the kernel tests cover**:

1. `requireAuthenticatedSession(context)` — a missing session is a **401**, never a
   Search result.
2. `resolveAuthenticatedWorkspaceScope(env, session)` — the trusted FND-03/FND-09
   resolver derives the scope from `env.DEFAULT_WORKSPACE_ID` and **verifies it
   exists in D1**. There is no `workspaceContextFromId` shortcut and no second
   resolver on the route; the client cannot supply or influence the workspace id.
3. `discoverModuleRegistry().listSearchProviders()` → `executeSearch(...)` → JSON.

It **fails closed**: a missing/invalid `DEFAULT_WORKSPACE_ID`, a nonexistent
configured workspace, or a D1 failure all resolve to the calm, retryable Search
failure — no internal detail leaks and no provider runs. (For dev/e2e, the local
D1 is migrated and the configured workspace seeded by `e2e/setup-local-db.mjs` so
the real resolver succeeds there too.)

---

## Provider coverage and preview policy

Today is a derived dashboard, not an entity collection, and registers **no Search
provider**. It remains reachable through navigation and command-palette commands,
but it never manufactures records from fixtures.

Current production providers are all registry-discovered and repository-backed:

| Entity | Provider | Match source | Safe preview policy |
|---|---|---|---|
| Areas | `areas.search` | Area title | Structural counts only: open Goals, active Projects, direct Tasks. |
| Goals | `goals.search` | Goal title | Parent Area, open/completed state, target date and contribution counts. |
| Projects | `projects.search` | Project title | Area/Goal context, workflow/completion state and Task progress. |
| Tasks | `tasks.search` | Task title, checklist-item titles, **Task description** (RECALL-01) | `Title`/`Checklist`/`Description` source, parent Project/Area, completion state, and a bounded excerpt for a description hit. Priority/urgency signals from the same bounded projection. |
| Notes | `notes.search` | Title, Markdown body/headings, tags | Existing syntax-free match source/excerpt; deleted excluded, archived labelled. The reference implementation for the shared excerpt contract. |
| Diary | `diary.search` | Diary title, **entry body** — under a non-empty explicit query only (RECALL-01, ADR-114 decision 2) | `Title`/`Entry` source, entry type and owner-local occurrence time, plus a bounded excerpt around an explicit body match. Never listed for the empty query; never a preview or first paragraph. |
| Meetings | `meetings.search` | Meeting title and location, **agenda Markdown, notes Markdown and captured agenda/decision/outcome item bodies** (RECALL-01), across **upcoming and recent** meetings (archived and deleted excluded) | `Title`/`Location`/`Agenda`/`Notes`/`Decision`… source with a bounded excerpt for a body hit. Captured items are an `EXISTS` semi-join, so a meeting with ten matching items appears once. Until V2.0.1 this provider queried the recent-only collection view, so a meeting starting in the future was unfindable; it now uses a dedicated `searchMeetings` projection with no time window, ordered upcoming-soonest-first then past-newest-first. |
| People | `people.search` | Name plus accepted safe structured fields | No email, phone or private notes in snippets. **Free-text `notes` are deliberately unmatched** — asserted, not intended (see the privacy boundary below). |
| Assets | `assets.search` | Title/type/tags and accepted safe fields | No serial/reference numbers, prices or private notes. |
| Reviews | `reviews.search` | Review title, **authored section/reflection bodies** (RECALL-01); type/period remain displayed metadata rather than match fields | `Title` or the matching section's own name (e.g. `Lessons`), the type and period, and a bounded excerpt. Several matching sections still return ONE Review. Reads a dedicated `searchReviews` projection — it used to call `list`, which read every result's sections in a second statement. |

---

## The excerpt contract (RECALL-01) — one grammar, five providers

Until V2.7, Notes was the only provider that searched a record's BODY, and the
mechanism it used — a SQL-cut excerpt window plus an honest match source — was a
Notes convention. **RECALL-01 promoted it to the product rule**
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
decision 3) and applied it to Meetings, Tasks, Diary and Reviews. There is one
mechanism, not five.

### Who generates the excerpt: the repository projection, in SQL

[`app/platform/storage/d1/search-excerpt.ts`](../../app/platform/storage/d1/search-excerpt.ts)
is the one implementation. A body source contributes three projected columns —
the 1-based hit offset from `instr(lower(col), ?)`, a bounded window from
`substr(col, max(1, instr(…) - W/2), W)`, and the window's own start — so **a
matching 1 MiB body ships a few hundred bytes and the record never crosses the
repository boundary**. Nothing reads a body column into application code to cut
an excerpt afterwards, and no provider issues a second "now load the bodies"
statement.

A body that lives in a CHILD table (a Meeting's captured items, a Review's
sections) uses the same three columns resolved through correlated `LIMIT 1`
sub-queries, while the predicate that admits the parent is an **`EXISTS`
semi-join**. That combination is what makes "one result per record" structural
rather than a de-duplication pass: a Meeting with ten matching items cannot
multiply into ten rows.

### Normalisation: one analyser, no forks

The window is raw Markdown. It is passed through the shared analyser
(`excerptAroundMatch` in
[`note-document.ts`](../../app/platform/markdown/note-document.ts)), which strips
syntax, collapses whitespace and truncates deterministically — so no result ever
shows `##`, `**` or half a code fence. A window that began mid-line has its
partial first line dropped first, so a truncated line is never misread as a
heading. **Providers return plain text and never HTML.**

### Where it renders: the existing subtitle, in one grammar

```
match source · state/metadata · excerpt
```

composed by [`app/shared/search/subtitle.ts`](../../app/shared/search/subtitle.ts)
and bounded by the existing `MAX_SUBTITLE_LENGTH` (300). There is **no new
`SearchResultItem` shape, no per-module excerpt component and no extra row**: at
phone width this stays the one-line, `text-overflow: ellipsis` subtitle the row
has always had, and `e2e/recall-01-search-content.spec.ts` asserts the row's
`white-space: nowrap` and single-line height at 1440 / 393 / 320 rather than
assuming it.

Highlighting is unchanged: the surface renders `<mark>` from match ranges over
plain text.

### Match source, when several fields match

**One result per record**, labelled by a fixed precedence:

```
title  >  metadata  >  body
```

so a Task whose title and description both match is labelled `Title` and carries
no excerpt — the reason it is there is already visible in the row. Within the
body sources each provider states a deterministic order of its own: Meetings read
`agenda`, then `notes`, then the first captured item in `(kind, position, id)`
order; Reviews take the first matching section in `section_id` order. A title hit
never carries a body excerpt at all.

Ranking is untouched: subtitle matches already rank below title matches (tier 4),
which is the right relevance order for a body hit.

### The privacy boundary: solicitation, not existence

ADR-114 decision 2 generalises the line FIND-01 drew rather than moving it. **A
record's body may be matched and excerpted only in answer to a query the owner
typed.** Concretely:

- **Diary bodies ARE matchable** under a non-empty explicit query — Diary entries
  were already returned for title matches, so what changed is match depth, not
  exposure class. The repository returns before preparing a statement when the
  query is empty, so the boundary is structural rather than a convention.
- **Diary stays excluded from the empty-query recent list**, with its standing
  line, unchanged. A body excerpt is only ever the window around what the owner
  typed — never a preview, a first paragraph or a summary.
- **AI evidence retrieval is unchanged.** Body-search excerpts are a
  Search-surface artefact; `evidence-retrieval.ts` composes named fields from the
  same projections and ADR-073's People/Diary exclusion stands untouched. No
  Diary excerpt reaches an AI input.
- **People free-text `notes` stay unmatched.** People remain findable by their
  structured fields only.
- **Nothing is logged with content**, test fixtures use synthetic distinctive
  phrases rather than realistic private prose, and no diagnostic or failure
  message prints a record body — the 100 KiB proof compares lengths and boolean
  containment for exactly that reason.

Both boundaries are TESTS, not intentions:
`test/kernel/recall-01-search-content.test.ts` (People notes find nobody; the
empty query cannot reach Diary), `test/kernel/recent-records.test.ts` (a Diary
body that MATCHES is still absent from the unbidden list) and
`e2e/recall-01-search-content.spec.ts` (both, through the real surface).

### The cost, per provider

Each content-searching provider remains **ONE workspace-scoped statement**, with
filtering, ordering, the excerpt projection and the limit all in SQL, inside
D1's 100-bind ceiling — and the statement count is identical for one match and
fifty. `test/kernel/recall-01-search-content.test.ts` pins that per provider with
a counting D1, including a Meeting whose captured items match fifty times over.

`LIKE` remains the answer at DalyHub's scale, unchanged by the extra columns: the
candidate set is already narrowed by the workspace+type index before any body
scan, the shared 50-byte pattern bound and ASCII case rule still apply, and FTS5
stays refused for the reason below (a second, derived representation of canonical
Markdown). Revisit on MEASURED single-owner pain, not on principle.

## The Notes provider (NOTES-03) — full-content search

The Notes module registers a real, repository-backed provider
([`app/modules/notes/search.ts`](../../app/modules/notes/search.ts)) over
`NoteQueryRepository.search`. It is the first provider that searches a record's
**body**, not just its header fields, so it is worth stating exactly what it
does and what it costs.

**What is matched.** A Note's TITLE, its full Markdown BODY (headings included,
since a heading is body text), and its TAGS. There is no alias concept — a Note
has one title — and entity names referenced from the body are matched simply
because `[[Their Title]]` is body text. The same holds for a `dalyhub://` record
link: its visible LABEL is body text and is matched, while its `dalyhub://…`
destination is matched only as the literal characters it is — searching for a
record's id is not a supported way to find the notes that link to it, and the
Backlinks tab is where that question is answered.

**What a result shows.** The Note icon and title, an honest **match source**
("Title", "Tag", "Heading: Risks", or "Under 'Risks'" for a body hit under a
heading), the archive state when archived, and a **readable excerpt** around the
match. The excerpt is never raw Markdown: the shared analyser
(`note-document.ts`) strips syntax and truncates deterministically, so a result
never shows `##` or half a code fence. Highlighting is the shared match-range
`<mark>` infrastructure — the provider supplies plain text and no HTML.

**Lifecycle.** Deleted Notes are excluded **always**, by the repository, not by
the caller. Archived Notes ARE returned and are labelled "Archived": archiving
means "out of the way", not "unfindable". Results are workspace-scoped in SQL —
the executor binds the trusted, server-derived scope and cannot widen it.

### The indexing strategy, and its trade-off

The search is **D1-native SQLite**: a bounded, workspace-scoped, parameterised
`lower(col) LIKE ? ESCAPE '\'` over `entities.title` joined to
`note_details.content`/`tags`, with the excerpt window cut **in SQL** by
`substr(...)` around `instr(...)` so a matching 1 MiB note transfers a few
hundred bytes rather than its whole body. Ordering is total and deterministic
(exact title → title prefix → title contains → other, then most recently updated,
then id), and every result set is limit-bounded.

This is the same mechanism People, Assets, Meetings, Reviews and Tasks already
use, which is the main reason to keep it: one search mechanism in the product,
not two.

**The trade-off, stated plainly.** A leading-wildcard `LIKE` cannot use a B-tree
index, so the body match is a scan **of the workspace's note rows** — after the
candidate set has already been narrowed by the existing
`entities_active_workspace_type_created_idx` (workspace + type + not deleted) and
the `note_details` partial indexes for active/archived. Nothing is scanned in
application code: filtering, ordering, excerpting and the relationship count all
happen in the one statement. **FTS5 was considered and deferred**: D1 supports
it, but keeping a shadow virtual table in sync requires triggers and creates a
SECOND, DERIVED representation of the canonical Markdown source — precisely what
[ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline)
exists to prevent. Revisit when a workspace holds enough notes for the scan to be
*measurable*, and then behind the same repository contract so no caller changes.
Recorded in [`migrations/0019_notes_knowledge.sql`](../../migrations/0019_notes_knowledge.sql)
and [ADR-054](../decisions/ARCHITECTURE_DECISIONS.md#adr-054-note-knowledge--a-wiki-link-is-a-persisted-reference-and-knowledge-relationships-stay-entitylinks) §7.

**Two D1 specifics every repository-backed search must respect.**

1. **A LIKE pattern is capped at 50 bytes.** A longer pattern fails the WHOLE
   statement with `LIKE or GLOB pattern too complex` — not just that predicate.
   A search box is exactly where an over-long value arrives, so the Notes
   repository bounds the escaped needle itself and a long query degrades to
   matching its opening characters instead of erroring. The shared
   `like-pattern.ts` helper is used by repository-backed Search providers so this
   behaviour is consistent.

   **One bounded needle per query, and this is load-bearing.** Because the
   pattern matches on a PREFIX, everything else in the same statement that
   reasons about the query must reason about that same prefix:
   `likeContainsNeedle(query)` returns the raw text `likeContains(query)` will
   actually match on, and it is what the excerpt `instr()`, the match-source
   `includes()` checks and the excerpt analyser bind. Binding the whole query to
   `instr()` beside a bounded `LIKE` makes the statement disagree with itself —
   the row is admitted by the prefix, then reported as having no body hit, so a
   body match comes back labelled "Title" with no excerpt and nothing to
   highlight. (The exact-title ranking arm still compares the WHOLE query, which
   is the one place the full text is the right question.) Raised by review on the
   RECALL-01 PR; asserted in `test/kernel/like-pattern.test.ts` and, end to end
   over three providers, in `test/kernel/recall-01-search-content.test.ts`.
2. **`lower()` folds ASCII only.** Matching and the excerpt offsets are therefore
   ASCII-case-insensitive, consistently across every DalyHub search.

## Development demonstration

A development-only route (`/design/search`, excluded from production by the
`NODE_ENV` guard in `app/routes.ts`) drives the real surface against in-memory fake
providers through the real orchestrator, demonstrating multiple providers/entity
types, exact/prefix/fuzzy matches, highlighting, grouping, no-results, partial and
complete failure, duplicates, long content, keyboard navigation and real Drawer
opening. The real Product Frame Search (sidebar `/`) uses the live `/search`
endpoint and the Today provider.
endpoint and the production registry-backed providers.

---

## What DS-08 deliberately does NOT do

No command execution, record creation, Quick Actions, `⌘K`, Inspector/Settings,
product CRUD, AI/vector/embedding search, background indexing, remote search
tracking or workspace-persisted search history. Search exposes a clean API the
DS-09 Command Palette can launch or incorporate.

FIND-01 did not change that list. The empty query is answered from Activity the
product already writes; **no search term, no click and no view is recorded
anywhere** by Search, and the one place device-local history used to live is
retired.

---

## Related documents
- [ADR-023](../decisions/ARCHITECTURE_DECISIONS.md#adr-023-shared-search--registry-driven-providers-runtime-orchestration-and-safe-navigation) — the decision record.
- [`MODULES.md`](MODULES.md) — the module registry and the provider contract.
- [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md) — the Today module and its Drawer keys.
- [`DESIGN_SYSTEM.md → Search`](../design/DESIGN_SYSTEM.md#search) — the pattern.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — the open-source assessment.


## AI evidence retrieval builds on this (AI-01, 2026-08-05)

The AI platform's bounded evidence-retrieval service composes the search
projections documented above — Notes `search`, Tasks `searchTasks`, Meetings
`searchMeetings` — plus EntityLinks and the spine. **RECALL-01 deepened those
projections and deliberately changed nothing here**: `evidence-retrieval.ts`
builds each candidate's text from NAMED fields, so the new `matchSource` and
`excerpt` fields are simply not read, Diary is not composed at all, and ADR-073's
People/Diary exclusion is untouched. That is the concrete sense in which
deterministic retrieval got deeper without embeddings coming any closer
([DEBT-93](../product/PRODUCT_DEBT.md)). **No second search index was
built for AI, and embeddings were deliberately not introduced**: keyword and
relationship retrieval satisfy the first release, and a vector store is a separate
decision with its own cost, storage and staleness questions.

A model never queries. DalyHub retrieves first, bounds what it found, applies the
privacy filter, and only then assembles a prompt. Nothing is recursive and nothing
expands on the model's say-so. See [`AI_PLATFORM.md`](AI_PLATFORM.md) §14.
