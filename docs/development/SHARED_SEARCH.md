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

## Bounds (performance and safety)

Every edge is bounded ([`limits.ts`](../../app/shared/search/limits.ts)): query
length, provider count, results per provider, total results, and each display
field. Empty or invalid queries never execute a provider. The browser sends only
the bounded query and receives only bounded results — never a workspace dataset.

Repository-backed providers must perform bounded database queries over canonical
data or a dedicated read projection. They must not load a whole collection and
filter in JavaScript, and they must not enrich results by calling one repository
method per hit. The D1 search projections added for Areas, Goals, Projects, Tasks
and Diary are query-count tested: one matching record and fifty matching Tasks use
the same single statement.

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

## Recent results

When Search opens with no query, the surface shows a calm **Recent** group of the
last opened Search results. This is device-local UI history in `localStorage`, not
workspace domain data: maximum eight entries, newest first, deduped by target
identity, and clearable from the Search surface. The storage helper catches
`localStorage`/JSON failures, so server rendering and privacy-restricted browsers
degrade to the normal idle hint.

Recent entries store only safe presentation metadata. Subtitles are stripped for
Diary, People, Meetings, Assets and Reviews so Diary prose, contact data, meeting
notes, asset identifiers/prices and review reflections are never persisted in
browser history.

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
| Tasks | `tasks.search` | Task title | Parent Project/Area plus generic priority/urgency signals from one bounded projection. |
| Notes | `notes.search` | Title, Markdown body/headings, tags | Existing syntax-free match source/excerpt; deleted excluded, archived labelled. |
| Diary | `diary.search` | Diary title only | Title, entry type and owner-local occurrence time; body prose is not selected. |
| Meetings | `meetings.search` | Meeting title and location, across **upcoming and recent** meetings (archived and deleted excluded) | No private notes or agenda content by default. Until V2.0.1 this provider queried the recent-only collection view, so a meeting starting in the future was unfindable; it now uses a dedicated `searchMeetings` projection with no time window, ordered upcoming-soonest-first then past-newest-first. |
| People | `people.search` | Name plus accepted safe structured fields | No email, phone or private notes in snippets. |
| Assets | `assets.search` | Title/type/tags and accepted safe fields | No serial/reference numbers, prices or private notes. |
| Reviews | `reviews.search` | Review title/type/period metadata | No section/reflection content in previews. |

---

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
`searchMeetings` — plus EntityLinks and the spine. **No second search index was
built for AI, and embeddings were deliberately not introduced**: keyword and
relationship retrieval satisfy the first release, and a vector store is a separate
decision with its own cost, storage and staleness questions.

A model never queries. DalyHub retrieves first, bounds what it found, applies the
privacy filter, and only then assembles a prompt. Nothing is recursive and nothing
expands on the model's say-so. See [`AI_PLATFORM.md`](AI_PLATFORM.md) §14.
