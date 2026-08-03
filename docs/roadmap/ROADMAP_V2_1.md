# ROADMAP_V2_1.md — What comes after DalyHub V2

> The work that is **deliberately not in V2**, in the order it should be built.
>
> [`ROADMAP_V2.md`](ROADMAP_V2.md) is the record of what V2 *is*, and it is now
> closed: every item in it is either delivered or explicitly listed here. This file
> is where the remaining work lives so the V2 record can stop growing.
>
> The rules are unchanged: [`AGENTS.md`](../../AGENTS.md) tells you *how* to build;
> this tells you *what*. One item per PR. Status is updated in the PR that changes
> it. No time estimates.

Legend: **☐** not started **◐** in progress **◑** partly delivered **☑** done

---

## What V2.0.1 did, and did not, take from this file

**Nothing in this roadmap moved into V2.0.1.** The
[V2.0.1 hotfix](../release/RELEASE_NOTES_V2_0_1.md) fixed confirmed V2 defects
and hardened release operations; it started no item below, and no item's status
changed because of it. It is recorded here only so a reader does not have to
wonder whether it quietly consumed part of V2.1.

Two entries are worth reading *alongside* it, because V2.0.1 touched adjacent
ground without doing their work:

- **[SET-02](#-set-02--backup--restore-v21) is untouched.** V2.0.1 added a
  scheduled workflow that **exports** production D1 to a retained artifact.
  That is the automated half of a backup and nothing more: there is still **no
  import, no restore and no proven end-to-end restoration test**, which is the
  entirety of what SET-02 owes. The rule this file already states applies
  unchanged — *an untested restore is not a backup* — and a scheduled export is
  not partial credit for SET-02 any more than X-04's on-demand export was. The
  workflow, its retention and its explicit "restore is V2.1 SET-02" statement
  are documented in
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md#automated-production-backups-v201).
  - One genuine input for SET-02, recorded rather than lost:
    [DEBT-61](../product/PRODUCT_DEBT.md) already named scheduled backups as the
    thing that would hit the export's read-consistency window more often than a
    hand-pressed export does. A daily unattended export now exists, so that
    entry has a real consumer to be evaluated against when SET-02 is built.
- **[DIARY-02](#-diary-02--day-context-links) is untouched.** V2.0.1 repaired a
  **broken link Reviews already emitted** to Diary, by adopting the canonical
  Diary deep-link URL that Search and Quick Capture already used. It added no
  linking affordance to the Diary surface and made Diary no more a Linked Items
  consumer than it was — which is DIARY-02's actual scope.

## How an item got here

Nothing was moved into this file to make V2 look finished. An item is here for one
of exactly three reasons, and each entry says which:

1. **It was never in V2's scope** (the AI phase, imports, account/security surface).
2. **It was in V2's scope and is being deferred deliberately**, with the reason
   stated — currently only [SET-02](#-set-02--backup--restore-v21).
3. **Its module shipped, and a named remainder did not** — the three `◐` mobile
   items and the cross-module half of `X-02`.

The V2 roadmap keeps every one of these items' original entry and history. This
file does not restate it; it records the target release and the sequence.

---

## Delivered after V2.0.1

*Work that landed against this file rather than against ROADMAP_V2, recorded here so
the V2 record stays closed.*

### ☑ THEME-02 — The Modern visual system

- **Why it exists.** V2 shipped five curated themes, but the light/dark story was
  "Daly Light, or the Daly Dark that `system` pairs it with". THEME-02 adds the one
  thing the registry did not have: a **matched pair** designed together, so the owner
  can move between a bright and a dimmed treatment of the *same* visual system by time
  of day and have nothing about the application move.
- **What shipped.**
  - **Modern Light** (`modern-light`) — a warm cream page, near-white panels,
    genuinely white cards, teal as the primary accent and blue as the informational
    one, with green/orange/red held back for meaning. Soft realistic shadows, quiet
    borders, and a near-white navigation surface so the rail sits inside the
    application rather than beside it.
  - **Modern Dark** (`modern-dark`) — deep charcoal with four clearly separated
    elevations (`sunken < bg < card < raised`), a controlled indigo accent, violet
    confined to the waiting state and one chart series, and no glow on ordinary
    interactive elements.
  - **Two new semantic tokens, in every theme:** `nav-selected-surface` and
    `nav-selected-text` — the selected-navigation treatment, split out of the generic
    `accent-surface` tint so a theme can control "you are here" without moving every
    tinted panel with it. The sidebar and the Settings section list both consume them.
  - **A shell refinement that applies to all seven themes:** the rail is separated by
    the divider token rather than the full border token, and the selected row gains a
    leading indicator bar (shape, mirroring the phone bar's top indicator) alongside
    its existing `aria-current`, weight and tint.
  - **Migration `0026`** widens the `owner_app_preferences.theme` CHECK so the two new
    ids can be persisted. A rebuild, because SQLite cannot alter a CHECK in place —
    additive in effect, copied by explicit column list, no stored value rewritten.
- **What it deliberately did not do.** It did not redesign the information
  architecture, replace working functionality, restructure a module, change the type
  or spacing scales, or add a Today widget the product does not already have. It is a
  visual-system and theme change applied to the existing product.
- **Evidence.**
  [`THEME_ACCEPTANCE_MATRIX.md → section 8`](../design/THEME_ACCEPTANCE_MATRIX.md#8-theme-02--the-modern-pair)
  records what was verified and how, including the screenshot pass in
  [`docs/design/assets/theme-02-2026-08/`](../design/assets/theme-02-2026-08).
- **Recommended follow-up, not done here.** The registry is now seven themes plus
  `system`, which is more choice than one person needs. A consolidation
  recommendation is recorded as **DEBT-67** in
  [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) rather than acted on, because
  removing a theme takes a choice away from an owner who may already be on it and
  that is not a decision to make inside a change that was meant to add one.

---

## V2.1 — Recoverability

*The one thing V2 knowingly does not give the owner: a way to get their data back
IN. Everything else in this file can wait behind it.*

### ☐ SET-02 — Backup & restore (V2.1)

- **Original entry.** [`ROADMAP_V2.md → SET-02`](ROADMAP_V2.md#-set-02--backup--restore).
- **Deferred from V2 on 2026-08-01, by the V2 release closure.** Not because it is
  low value — it is the highest-value remaining item in the product — but because
  the honest state of it is *nothing of the write side exists*, and a release that
  claimed backup and restore on the strength of X-04 would be claiming something
  DalyHub cannot do.
- **What V2 actually ships in this space, stated precisely.**
  [X-04](ROADMAP_V2.md#-x-04--export--data-portability) is ☑: the owner can
  download their entire workspace, on demand, as a structured versioned archive
  (`manifest.json` + `dalyhub-snapshot.json` + `SCHEMA.md` + `README.md` +
  `CHECKSUMS.txt`) **and** as a ready-to-open Obsidian vault, both derived from the
  one canonical `DalyHubWorkspaceSnapshotV1`. **Downloadable export is V2's
  data-safety and portability feature**, and it is a real one: it is verifiable
  without DalyHub (`sha256sum -c CHECKSUMS.txt`), it is readable in any text
  editor, and it includes archived, soft-deleted and unlinked records with their
  state marked.
- **What V2 does NOT ship, and must never be described as shipping.** Full backup
  restoration. **Restore has not been proven and is not implemented.** There is no
  import path, no scheduled backup, no automatic cloud backup, and no second copy
  of the owner's data held on their behalf. `/settings`, `/help` and the release
  notes all say so in the owner's own words, and tests hold that wording.
- **What V2.1 owes.** Validated backup **import and restore**, reading the
  canonical X-04 snapshot format as its input contract — the format exists, is
  versioned, and states its compatibility policy in
  [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) and
  [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it).
  Restore must include, at minimum:
  - a **preview** of what a restore would change, before anything is written;
  - **validation** of the archive against the schema and against the target
    workspace, refusing an incompatible or tampered snapshot rather than
    half-applying it;
  - **workspace protection** — a restore is scoped to one workspace, cannot write
    across the isolation boundary, and cannot silently overwrite a populated
    workspace without an explicit, informed decision;
  - a deliberate, documented **merge-versus-replace** answer;
  - **failure safety** — a failed or interrupted restore leaves the workspace in a
    defined state, never partially written;
  - a **proven end-to-end restoration test**: export a populated workspace, restore
    it into an empty one, and assert the result is equivalent. Until that test
    exists and passes, this item is not done.
- **Still true, and still the rule.** Cloudflare or D1 platform durability does
  **not** satisfy this item. An untested restore is not a backup, and
  infrastructure the owner cannot invoke or verify is not recoverability. **This
  item must not be marked ☑ on the strength of Cloudflare or D1 capabilities, and
  X-04 having shipped is not partial credit for it.**
- **Dependencies.** FND-02, X-04 (both ☑ — satisfied).
- **Priority.** P1. First item of V2.1.

---

## V2.1 — Named remainders from shipped V2 modules

*Each of these has a module that shipped and a specific, named piece that did not.
They are small and well-understood; none of them blocks the V2 release.*

### ◐ PEOPLE-04 — Mobile People

- **Original entry.** [`ROADMAP_V2.md → PEOPLE-04`](ROADMAP_V2.md#-people-04--mobile).
- **Delivered in V2.** The phone record layout, the compact Card preset, the tab
  overflow, real quick actions, and context-aware Quick Capture through ADR-060.
- **Outstanding.** The broader
  [DEBT-45](../product/PRODUCT_DEBT.md#-debt-45--a-captured-record-is-not-linked-to-the-context-it-was-captured-from--p2)
  closure matrix — every record entry point, full-form hand-off, and the
  mobile/E2E/a11y proof.
- **Priority.** P3.

### ◐ ASSET-03 — Mobile Assets

- **Original entry.** [`ROADMAP_V2.md → ASSET-03`](ROADMAP_V2.md#-asset-03--mobile).
- **Delivered in V2.** The phone record layout and the ASSET-02 history/obligation
  surfaces, verified at 320/375/390/430px with no overflow and 44px targets.
- **Outstanding.** Phone-first capture of a NEW Asset and the type/subtype picker at
  narrow widths. It was sequenced after ASSET-02, which has now shipped, so it can
  finally be designed against the history surface it was waiting for.
- **Priority.** P3.

### ◐ REVIEW-04 — Mobile Reviews

- **Original entry.** [`ROADMAP_V2.md → REVIEW-04`](ROADMAP_V2.md#-review-04--mobile).
- **Delivered in V2.** The writing surface, full-width choices, a real share of the
  viewport for reflection editors, and the shared phone record chrome.
- **Outstanding.** The one-prompt-at-a-time stepper. It is a Review-flow feature,
  not a layout adjustment, so it belongs with REVIEW-02 and is sequenced with it.
- **Priority.** P3.

### ◑ X-02 — Saved views & cross-module filters

- **Original entry.** [`ROADMAP_V2.md → X-02`](ROADMAP_V2.md#-x-02--saved-views--cross-module-filters).
- **Delivered in V2.** Real, persisted, workspace- and owner-scoped saved views for
  Tasks over a validated declarative configuration (TASKS-03, ADR-059).
- **Outstanding — exactly the word "cross-module".** Generalising the declarative
  configuration beyond Task dimensions
  ([DEBT-49](../product/PRODUCT_DEBT.md#-debt-49--two-filter-models-coexist-ds-07-expressions-and-the-tasks-declarative-configuration--p3)),
  adopting it in other collections
  ([DEBT-20](../product/PRODUCT_DEBT.md#-debt-20--no-health-specific-project-filter-yet-ds-07-clause-builder-still-deferred--p3)),
  and a cross-entity query contract that does not exist yet. **Do not mark this ☑
  because Tasks has saved views.**
- **Priority.** P3.

---

## V2.1 — Module completion

### ☐ REVIEW-02 — Weekly review

- **Original entry.** [`ROADMAP_V2.md → REVIEW-02`](ROADMAP_V2.md#-review-02--weekly-review).
- **Already in place from REVIEWS-01, do not rebuild:** the weekly type, wall-calendar
  weekly periods honouring the first-day-of-week preference, the versioned
  `review.weekly.v1` template and its prompts, duplicate protection, and the
  draft → in progress → completed lifecycle with reopen.
- **What it owes.** The guided *flow*: an ordered, resumable step sequence; inbox to
  zero over the `/tasks` inbox sector without leaving the Review; a project check
  (the period-context loader reads Tasks, Diary and Meetings but not Projects); goal
  alignment reading the AREA-03 evaluator; and a close-out that hands the next period
  its focus. Ship REVIEW-04's stepper with it.
- **Priority.** P2.

### ☐ REVIEW-03 — Insights & alignment

- **Original entry.** [`ROADMAP_V2.md → REVIEW-03`](ROADMAP_V2.md#-review-03--insights--alignment).
- Nothing of this exists today. Keep it derived and non-persisted, mirroring
  PROJ-02/AREA-03 — no stored score, no cached classification, no streaks. It is the
  accepted home for
  [DEBT-24](../product/PRODUCT_DEBT.md#-debt-24--no-alignment-history--trend-is-stored--p3)
  and the richer period facts in
  [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2).
- **Priority.** P3.

### ☐ DIARY-02 — Day context links

- **Original entry.** [`ROADMAP_V2.md → DIARY-02`](ROADMAP_V2.md#-diary-02--day-context-links).
- Diary entries are first-class entities and FND-04 EntityLinks are available, but
  the Diary surface offers no linking affordance and Diary is not yet a Linked Items
  consumer. Keep the DIARY-01A principle intact — chronology first, structure
  optional — so a link is always an offer, never a required field on capture.
- **Priority.** P3.

### ☐ SET-03 — Account & security

- **Original entry.** [`ROADMAP_V2.md → SET-03`](ROADMAP_V2.md#-set-03--account--security).
- The identity layer beneath it is done and accepted (FND-09, ADR-016): DalyHub *is*
  authenticated, so this is not blocking safety. What is missing is the owner-facing
  surface — visible session/identity state, sign-out-everywhere, and a
  security-relevant audit view. Related:
  [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3).
- **Priority.** P2.

---

## V2.5 and later — never in V2's scope

*Recorded so the decisions are not re-litigated, and deliberately not started.*

### ☐ X-03 — Import & sync (Todoist, Notion, calendar)

- **Original entry.** [`ROADMAP_V2.md → X-03`](ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar).
- **Deliberately last among the platform items, and the reason is unchanged.**
  Imported content is untrusted input that must be validated at the boundary, and a
  sync that writes without review would violate the same "never silently mutate the
  owner's data" principle that governs AI. Export exists (X-04 ☑); restore does not
  until SET-02 ships. Build SET-02 first, so importing a large external dataset is a
  recoverable decision.
- **Priority.** P3. After SET-02.

### ☐ AI-01 … AI-04 — The AI phase

- **Original entries.** [`ROADMAP_V2.md → Phase 11`](ROADMAP_V2.md#phase-11--ai-ai).
- **The architectural principle is non-negotiable and unchanged:** AI may propose
  structured changes; the user must review, edit, accept or reject them; AI must not
  silently mutate DalyHub data. Ship
  [AI-04](ROADMAP_V2.md#-ai-04--privacy-controls)'s consent boundary **together
  with** AI-01, not after it.
- `/ai` remains an honest placeholder that says so. No proposal store, no model
  client, no provider credential and no prompt exists — which is the correct state.
- **Priority.** AI-01 P2, AI-04 P2, AI-02/AI-03 P3. Last, by design.

### ☐ Not planned, recorded so they are not mistaken for oversights

None of the following exists, none is scheduled, and each is written down here
because a reader would otherwise wonder whether it was forgotten:

- two-way Obsidian sync (V2 exports a vault; it does not read one back);
- email ingestion, webhook capture and Pushover or any other notification channel
  ([DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2)
  records the honest consequence for Asset obligations);
- transcription and advanced analytics;
- ~~offline mode~~ — **this changed.** A first offline milestone has shipped: an
  installable PWA, a service worker, a read-only seven-day snapshot and an
  append-only capture queue. See
  [PWA-02 below](#-pwa-02--offline-editing-and-the-rest-of-the-offline-story)
  for what it deliberately did NOT do, and
  [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md) for what it did;
- collaboration, multi-user permissions and roles;
- subscriptions and billing;
- file attachments and R2 storage
  ([DEBT-35](../product/PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3));
- weather and calendar widgets on Today
  ([DEBT-53](../product/PRODUCT_DEBT.md#-debt-53--weather-and-calendar-on-today-were-removed-not-implemented--p3)
  — when a real source exists, weather returns as an OPTIONAL widget that is off
  until configured, never as reserved space).

## Shipped after V2.0.1 — the first offline milestone

### ☑ PWA-01 — Installable PWA, icon system and offline foundation

- **Not in the original V2 roadmap.** "Offline mode" was in the *not planned*
  list above. It was brought forward deliberately, and the list has been
  corrected rather than quietly edited.
- **Delivered.** A standards-compliant web app manifest and device metadata; a
  first-party, generated icon system with a canonical parametric vector source
  and a deterministic `--check`-able build; a service worker with an allow-listed
  cache strategy, a small precache set and a wait-then-offer update model; a
  read-only, minimised, identity- and workspace-namespaced fifteen-day IndexedDB
  snapshot; an append-only offline capture queue for Inbox tasks, quick notes and
  diary entries, replayed through the modules' own create routes with
  database-level idempotency; a shared connection/sync state model derived from
  real request outcomes; an Offline & app Settings section with three separate,
  individually-explained destructive controls; an explicit offline schema ladder
  with real recovery paths; automated coverage across unit, Workers-runtime and
  Playwright layers; and enforced performance/storage budgets.
- **Documented.** [`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md),
  [ADR-066](../decisions/ARCHITECTURE_DECISIONS.md#adr-066-a-read-only-offline-snapshot-an-append-only-capture-queue-and-a-service-worker-that-caches-exactly-one-html-document).
- **Not production-verified.** Physical-device testing (iPhone/iPad Safari,
  installed desktop) has NOT been performed. The manual checklist is written and
  must be worked through before this is called production-ready.

### ☑ PWA-11 — Offline launch stability on an installed iPhone

- **Not planned. Reported from production.** An installed DalyHub opened with no
  connection rendered the offline shell and was then replaced by WebKit's
  *"A problem repeatedly occurred on https://hub.daly.id.au/"*. This item exists
  because PWA-01's foundation was, in one specific way, wrong — and an unverified
  foundation is exactly what the PWA-02 note above warns against building on.
- **Root cause, stated once.** The manifest's `start_url` is `/`, so an offline
  launch is a document navigation to `/`. The service worker answered it with the
  `/offline` document's HTML, leaving a document server-rendered for one route
  under a different url. React Router hydrated against `/`, lazily imported the
  route modules for `/` — deliberately not precached — and, when that import
  failed with no network, called `window.location.reload()` from inside
  `loadRouteModule`. The reload re-entered the same path until iOS terminated
  the app.
- **Delivered.** The navigation fallback now redirects a non-`/offline`
  navigation to `/offline` rather than serving its body there; the fallback is
  restricted to genuine GET document navigations by `mode` **and** `destination`;
  every non-document request fails cleanly (empty `504 text/plain`) so no script,
  module, stylesheet, image, font, manifest or API request can receive HTML; a
  bounded offline-boot loop breaker serves a script-free safe-mode page if the
  shell is served more than four times in sixty seconds; every IndexedDB
  operation is on a deadline, so the five local-storage outcomes always resolve
  and no indefinite loading state remains; stored rows are sanitised before
  render, so corrupt data cannot blank the page; the service-worker update reload
  is a one-shot guard at module scope; reconnecting on the offline shell offers a
  sync instead of performing one; concurrent sync passes are deduplicated; and a
  redacted, bounded diagnostics channel distinguishes the seven failure modes
  that could not be told apart when this was first reported.
- **Documented.** [`PWA_AND_OFFLINE.md §4.5`](../development/PWA_AND_OFFLINE.md),
  and the iPhone offline-stability acceptance test in the same file.
- **Still not device-verified.** The acceptance test is written and has **not**
  been run on physical hardware. PWA-01's checklist remains the gate before
  PWA-02.

### ☐ PWA-02 — Offline editing, and the rest of the offline story

- **What PWA-01 deliberately did not do, and why.** Offline **editing,
  completion and deletion** of existing records need a conflict model, and a
  milestone that shipped last-write-wins would have quietly corrupted the
  owner's data. This item owns that design: which mutations are safe, how a
  concurrent server change is detected, what the owner sees when two versions
  disagree, and what "resolve" means in a product whose principle is that
  DalyHub never silently mutates the owner's data.
- **The named remainders**, each already recorded honestly:
  - editing a queued capture before retrying it;
  - full note and diary bodies offline (excerpts only today);
  - a pinning capability for records outside the seven-day window;
  - [DEBT-68](../product/PRODUCT_DEBT.md) — logout does not clear local data;
  - [DEBT-69](../product/PRODUCT_DEBT.md) — capture receipts are never pruned;
  - [DEBT-70](../product/PRODUCT_DEBT.md) — hydrated offline rendering is not
    covered by automation.
- **Still out of scope, and still deliberately so.** Collaborative or real-time
  sync, background/periodic sync, push notifications, attachment
  synchronisation, cross-device queue transfer, storing credentials on a device,
  encrypting local storage, native wrappers and app-store distribution.
- **Priority.** P3. **Do not start it before the manual device verification of
  PWA-01 is done** — an editing model built on an unverified foundation inherits
  every unverified assumption.

---

---

## Build order

1. **[SET-02](#-set-02--backup--restore-v21)** — restore. The one gap V2 knowingly
   leaves, and the reason a bad day is still unrecoverable.
2. **[REVIEW-02](#-review-02--weekly-review)** + REVIEW-04's stepper — the flagship
   weekly flow, and the mobile ergonomic that belongs with it.
3. **[ASSET-03](#-asset-03--mobile-assets)**, **[PEOPLE-04](#-people-04--mobile-people)** —
   the two named mobile remainders, now unblocked.
4. **[DIARY-02](#-diary-02--day-context-links)**, **[REVIEW-03](#-review-03--insights--alignment)**,
   **[SET-03](#-set-03--account--security)** — module completion.
5. **[X-02](#-x-02--saved-views--cross-module-filters)** — the cross-module half.
6. **[X-03](#-x-03--import--sync-todoist-notion-calendar)** — imports, after restore
   exists.
7. **[AI-01 … AI-04](#-ai-01--ai-04--the-ai-phase)** — last, by design.

Ahead of all of them, and not a numbered item because it is verification rather
than construction: **work through the PWA-01 manual device checklist** in
[`PWA_AND_OFFLINE.md`](../development/PWA_AND_OFFLINE.md#manual-device-checklist).
Offline support that has never been opened on a real phone in a real dead spot
is not finished, and nothing in this file should be built on top of it until it
has been.

---

## Related documents

- [`ROADMAP_V2.md`](ROADMAP_V2.md) — what V2 is, and the full history of every item
  above.
- [`RELEASE_NOTES_V2.md`](../release/RELEASE_NOTES_V2.md) — what shipped, its known
  limitations, and what is deferred.
- [`RELEASE_CHECKLIST_V2.md`](../release/RELEASE_CHECKLIST_V2.md) — the evidence
  behind the release verdict.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — the debt register, with each
  entry's target release.
- [`AGENTS.md`](../../AGENTS.md) — how to build any of it.
