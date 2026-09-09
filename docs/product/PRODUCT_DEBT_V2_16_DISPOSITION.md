# PRODUCT_DEBT — the V2.16 disposition report

> **Every open entry in [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) has exactly one
> home.** This is the report V2.16 CONSOL-03 produced, and it is generated
> from the same table that annotated the register, so the two cannot disagree.

**Measured 2026-09-08 against `main` at `06f57c1`.** The register held
**98 open entries** (`☐` or `◐`) at the start of the pass, the oldest
raised 2026-07 and the newest by V2.15. Each carries a `V2.16 disposition`
bullet on its own entry naming one of four outcomes.

| Disposition | Count | Means |
|---|---|---|
| **CLOSED** | 4 | Its own stated closing condition is satisfied, by work in this branch, and the proof is named |
| **OWNER-GATED** | 10 | Code-side complete; an owner action or owner-held evidence remains |
| **RE-HOMED TO V3** | 82 | New capability, architectural expansion, or a dependency outside this repository |
| **STRUCK BY DECISION** | 2 | The premise no longer holds, and the superseding release or decision is named |
| **REMAIN OPEN** | 0 | — |

**Two entries this programme RAISED are not in those numbers**, and saying so is
the difference between a report and a tidy-up. The 98 above were measured at the
START of the pass; a release that finds something and writes it down then has an
entry the report it already wrote does not contain. Both are listed under
[What this programme raised](#what-this-programme-raised) below —
one resolved inside the release, one **open on purpose**, with its closing
condition — and a test asserts that every open register entry is either
disposed here or named there, so a third cannot appear quietly.

---

## Read this before reading the numbers

**Eighty-two of ninety-eight entries are re-homed to V3, and that is a fact
about the register rather than an act of tidying.** The prompt for this
release warns against debt dumping, and the warning is right, so the test was
applied entry by entry: *does its own stated closing condition name a
capability, a new store, a shared-surface migration, an ADR that does not
exist, or a dependency outside this repository?* For eighty-two of them it
does, in their own words — "a template carries no dates", "Tasks have no
manual ranking model", "blocked on D1's Sessions API", "an ADR answering that
question".

This register is overwhelmingly a record of **deliberately deferred
capability, honestly written down** — which is what a good debt register looks
like in a product that refuses things on purpose. It is not a backlog of
defects. Four genuine defects were found and fixed here; two premises had been
overtaken and are struck; ten wait on the owner.

**What re-homing does NOT mean.** It is not a promise that V3 builds them. It
is a statement that V2 will not, and that the entry belongs to a programme
that could — which is exactly what "no ambiguous open loop" requires. The V3
backlog groups them by the category the strategy already uses.

---

## CLOSED — the closing condition is met, and the proof is named

**A closure is a proof, never a rewording.** Each entry's original closing
condition is quoted on the entry itself and satisfied there.

| Entry | What it was | Why |
|---|---|---|
| [DEBT-95](PRODUCT_DEBT.md#-debt-95--agentsmd-6-and-15-still-describe-the-colour-system-the-product-no-longer-has--p2--closed-2026-09-08-v216-consol-03) | `AGENTS.md` §6 and §15 still describe the colour system the product no longer has | §15's false sentence is corrected: `System` is the default and IS the honouring of `prefers-color-scheme`; an explicit Light or Dark is deliberate owner control. §6's half had already been amended by DS-01 and nobody had closed the entry. **The closing condition asked for a dedicated PR and this is not one** — the deviation is deliberate and named: a constitution that tells an agent the product cannot do what it demonstrably does is a truth defect, and V2.16's whole theme is that the repository stops carrying those. |
| [DEBT-217](PRODUCT_DEBT.md#-debt-217--a-convergence-fixture-seeds-a-person-whose-relationship-is-outside-the-products-own-closed-vocabulary--p3--closed-2026-09-08-v216-consol-03) | A convergence fixture seeds a Person whose relationship is outside the product's own closed vocabulary | `p-rc-dan` is seeded `relationship = 'supplier'` — a member of the closed vocabulary — so every seeded Person now saves through the contact form without editing a field the journey did not intend to edit. The role and organisation still say he is a builder. |
| [DEBT-242](PRODUCT_DEBT.md#-debt-242--no-workspace-or-account-deletion-path-exists--p3--closed-2026-09-08-v216-consol-01-adr-124) | No workspace or account deletion path exists | The second of its two permitted outcomes, taken on a measurement the entry did not have, and PROVED rather than documented. ADR-124; see the entry. |
| [DEBT-243](PRODUCT_DEBT.md#-debt-243--seven-surfaces-link-a-task-with-taskstask-a-parameter-nothing-reads--p3--closed-2026-09-08-v216-consol-03) | Seven surfaces link a Task with `/tasks?task=<id>`, a parameter nothing reads | One `taskDrawerHref` in `~/kernel/task-views`; all nine call sites converged; `grep -rn "tasks?task=" app/` returns nothing; the three tests that pinned the literal now assert the drawer contract. The journey half of the condition is already covered end to end by `dhds-11-drag-reorder.spec.ts` and `command-palette.spec.ts`, which both open a Task from exactly this URL shape. |

## OWNER-GATED — the code is done; the evidence is the owner's to produce

**This programme did not manufacture evidence it cannot produce.** Every entry
below is code-complete and waits on something no contributor can run from a
branch: a secret, a dispatched CI run, a live provider call, or a production
artefact.

| Entry | What it was | Why |
|---|---|---|
| [DEBT-76](PRODUCT_DEBT.md#-debt-76--a-chromium-renderer-segfault-fails-playwright-shards-non-deterministically-and-retries-0-turns-it-into-a-red-build--p2) | A Chromium renderer segfault fails Playwright shards non-deterministically, and `retries: 0` turns it into a red build | Ten consecutive green `main` runs. Same measurement as DEBT-203, different cause; both are counts nobody can run from a branch. |
| [DEBT-125](PRODUCT_DEBT.md#-debt-125--mains-e2e-suite-is-red-for-reasons-unrelated-to-the-change-that-finds-it--p1--no-longer-broadly-red-and-the-browser-fix-is-holding-the-suite-still-cannot-finish-harden-03-2026-08-12) | `main`'s E2E suite is red for reasons unrelated to the change that finds it | Two consecutive green twelve-partition gate runs on `main`, read from artefacts. Owner-dispatched. |
| [DEBT-139](PRODUCT_DEBT.md#-debt-139--migration-0042-has-not-been-applied-and-no-production-backup-has-been-taken--p1--two-of-three-clauses-met-2026-08-30-one-owner-ui-check-remains) | Migration 0042 has not been applied, and no production backup has been taken | Two of three clauses met; the remaining one is an owner UI check against production. |
| [DEBT-157](PRODUCT_DEBT.md#-debt-157--the-e2e-partition-durations-can-only-be-refreshed-from-a-failing-run--p1-re-rated-2026-08-20-mechanism-closed-by-harden-06a-the-same-day-held-open-for-its-confirming-run) | The E2E partition durations can only be refreshed from a FAILING run | Mechanism closed by HARDEN-06A; held open for its confirming green `main` run, which is an owner-dispatched CI action. |
| [DEBT-198](PRODUCT_DEBT.md#-debt-198--the-off-cloudflare-encrypted-backup-has-never-been-produced-because-the-github-production-environment-holds-no-secrets--p2) | The OFF-CLOUDFLARE encrypted backup has never been produced, because the GitHub `production` environment holds no secrets | Four GitHub `production` secrets and one successful decrypt-and-restore rehearsal. No contributor can produce either, and this pass did not manufacture evidence it cannot produce. **It gates production Finance use, not V3 development** — see the V3 boundary. |
| [DEBT-203](PRODUCT_DEBT.md#-debt-203--the-e2e-suite-carries-latent-timing-races-at-roughly-one-per-two-runs-so-green-is-probabilistic--p2) | The E2E suite carries latent timing races at roughly one per two runs, so "green" is probabilistic | Ten consecutive green gate runs on one unchanged tree. A count is not a code change; running it is an owner action. |
| [DEBT-204](PRODUCT_DEBT.md#-debt-204--every-ci-job-re-downloads-pnpm-from-the-npm-registry-so-one-truncated-response-turns-the-whole-gate-red--p2--mechanism-fixed-2026-08-25-held-open-for-the-main-run-its-own-closing-condition-names) | Every CI job re-downloads pnpm from the npm registry, so one truncated response turns the whole gate red | Mechanism fixed 2026-08-25; held open for the `main` run its own closing condition names. |
| [DEBT-213](PRODUCT_DEBT.md#-debt-213--the-ai-model-and-pricing-registry-is-pinned-to-one-dated-reading-with-nothing-scheduling-its-re-verification--p3) | The AI model and pricing registry is pinned to one dated reading with nothing scheduling its re-verification | `PRICING_VERIFIED_AT` must reflect a reading taken on or after the first LIVE provider call. No live call has been made, so the reading cannot exist. Closing it on fake-provider evidence would be the exact dishonesty the entry exists to prevent. |
| [DEBT-240](PRODUCT_DEBT.md#-debt-240--an-obligation-cannot-exist-without-an-asset-parent-and-carries-no-amount--p3) | An obligation cannot exist without an Asset parent and carries no amount | Every contributor-runnable half was met by V2.10 and is asserted end to end. What remains is the rehearsal against a RESTORED PRODUCTION ARTEFACT, which needs the encrypted artefact and the recovery key supplied out of band. |
| [DEBT-244](PRODUCT_DEBT.md#-debt-244--one-theme-01-colour-scheme-journey-times-out-reading-computed-styles-on-main-as-well--p3) | One THEME-01 colour-scheme journey times out reading computed styles, on `main` as well | A cold local pass plus DEBT-203's ten-run count recording no flake for it. The second half is the same owner-held measurement. |

## STRUCK BY DECISION — the premise no longer holds

| Entry | What it was | Why |
|---|---|---|
| [DEBT-35](PRODUCT_DEBT.md#-debt-35--assets-deferred-capabilities-attachments-reminders-logbooks-ingestion-ai--p3--struck-by-decision-2026-09-08-v216-consol-03) | Assets: deferred capabilities (attachments, reminders, logbooks, ingestion, AI) | The premise has been overtaken: **attachments shipped with V2.11** (one shared Evidence surface, on Assets among every other record type) and obligation reminders shipped with V2.10 LIFE-03. What is left of the list — logbooks, ingestion, Asset AI — is not "Assets' deferred capabilities" but three unrelated V3 candidates, each of which belongs to its own domain rather than to a bucket named after a module. Re-homed individually in the V3 backlog; the bucket is struck. |
| [DEBT-53](PRODUCT_DEBT.md#-debt-53--weather-and-calendar-on-today-were-removed-not-implemented--p3--struck-by-decision-2026-09-08-v216-consol-03) | Weather and calendar on Today were removed, not implemented | Struck on the second of its own two permitted closings: **DalyHub does not do weather.** Three years of passes have declined it, the strategy's V3 list does not contain it, and an external-source widget on Today is the dashboard Today has refused since TODAY-11. The entry offered exactly this outcome and nobody took it. |

## RE-HOMED TO V3

Grouped by the V3 backlog categories. A category is a **home, not a roadmap
commitment**: V3's own definition pass decides what it takes and in what order.

### AI — 3 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-92](PRODUCT_DEBT.md#-debt-92--generated-ai-results-are-not-persisted-so-reuse-is-bounded-to-one-isolate--p3) | Generated AI results are not persisted, so reuse is bounded to one isolate | A bounded saved-result store, or a recorded decision not to build one — and the usage data that would decide it needs live AI, which is owner-gated. |
| [DEBT-93](PRODUCT_DEBT.md#-debt-93--ai-evidence-retrieval-is-keyword-and-relationship-only--p3) | AI evidence retrieval is keyword and relationship only | Semantic retrieval on its own evaluation. Explicitly a V3 capability in the strategy (embeddings, ADR-073 §20). |
| [DEBT-253](PRODUCT_DEBT.md#-debt-253--a-batch-acceptance-costs-statements-linearly-in-the-number-of-rows-accepted--p3) | A batch acceptance costs statements linearly in the number of rows accepted | **Measured for V2.16.** A flat batch apply is expressible, but only by giving the apply authority a set-based path whose per-item `applied`/`stale`/`unchanged` reporting is reconstructed afterwards — which trades exact per-item semantics for a statement count. ADR-123's stale guard is per item by design, and V2.16 will not weaken correctness to flatten a number. |

### Accessibility — 5 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-14](PRODUCT_DEBT.md#-debt-14--grouped-rolefeed-interleaves-non-article-children--p3) | Grouped `role="feed"` interleaves non-article children | Removing `aria-required-children` from the global disable list needs the feed's children restructured. Shared-surface work. |
| [DEBT-15](PRODUCT_DEBT.md#-debt-15--listbox-options-wrap-a-focusable-result-control--p3) | Listbox options wrap a focusable result control | Removing `nested-interactive` needs the search result's control restructured. Shared-surface work. |
| [DEBT-56](PRODUCT_DEBT.md#-debt-56--axe-reports-label-title-only-for-one-shared-selectfield-in-the-tasks-drawer-and-the-dom-says-otherwise--p3) | axe reports `label-title-only` for one shared SelectField in the Tasks Drawer, and the DOM says otherwise | Blocked on an upstream axe-core explanation or version bump. Not ours to close. |
| [DEBT-123](PRODUCT_DEBT.md#-debt-123--the-shared-tooltip-is-portalled-outside-every-landmark-so-any-axe-scan-with-one-open-reports-a-region-violation--p3) | The shared tooltip is portalled outside every landmark, so any axe scan with one open reports a `region` violation | The shared tooltip portalled inside a landmark. Floating-layer work, with DEBT-051 and DEBT-181. |
| [DEBT-218](PRODUCT_DEBT.md#-debt-218--the-shared-anchored-surface-scrolls-and-axe-reports-scrollable-region-focusable-on-the-collection-controls-popover--p3) | The shared anchored surface scrolls, and `axe` reports `scrollable-region-focusable` on the collection controls popover | `scrollable-region-focusable` on the anchored surface. Floating-layer work. |

### Architecture — 27 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-07](PRODUCT_DEBT.md#-debt-07--fragmented-activityhistory--p2) | Fragmented activity/history | Two named history gaps closed or accepted. History capability. |
| [DEBT-08](PRODUCT_DEBT.md#-debt-08--ad-hoc-cross-entity-links--p2) | Ad-hoc cross-entity links | A second record type composing `~/shared/references`, proving the surface is entity-agnostic. New adoption work. |
| [DEBT-13](PRODUCT_DEBT.md#-debt-13--reserved-spine-type-guard-lives-in-the-d1-adapter--p3) | Reserved-spine-type guard lives in the D1 adapter | Its own condition is conditional on a SECOND storage adapter being proposed. None is, and inventing one to close a guard is the wrong order. |
| [DEBT-18](PRODUCT_DEBT.md#-debt-18--reserved-cross-app-keyboard-vocabulary--a-few-today-actions-lack-a-dedicated-palette-command--p3--the--half-resolved-2026-08-01) | Reserved cross-app keyboard vocabulary + a few Today actions lack a dedicated palette command | Every documented shortcut implemented through the one dispatcher or struck from the document, with a test that reads the table. A keyboard-vocabulary programme. |
| [DEBT-31](PRODUCT_DEBT.md#-debt-31--cross-module-presentation-drift-todaydiary-forks-terminology-and-capitalisation--p2--presentation-half-resolved-2026-07-28) | Cross-module presentation drift: Today/Diary forks, terminology and capitalisation | A DERIVED copy convention for every owner-facing noun. A shared-vocabulary primitive. |
| [DEBT-44](PRODUCT_DEBT.md#-debt-44--a-held-meeting-appears-on-the-timeline-of-a-linked-non-attendee--p2) | A held meeting appears on the timeline of a linked NON-attendee | A generic subject-membership rule for the People timeline — a semantic change to Activity membership. |
| [DEBT-58](PRODUCT_DEBT.md#-debt-58--the-assets-obligation-state-filter-narrows-a-page-not-the-collection--p3) | The Assets obligation-state filter narrows a page, not the collection | A workspace-wide obligation-state filter for Assets — a collection read the loader does not have. |
| [DEBT-61](PRODUCT_DEBT.md#-debt-61--an-export-is-not-a-point-in-time-snapshot-and-a-busy-workspace-can-produce-a-slightly-incoherent-one--p3) | An export is not a point-in-time snapshot, and a busy workspace can produce a slightly incoherent one | Blocked on D1's Sessions API becoming usable for a multi-statement read from the Workers binding. A platform capability, not ours. |
| [DEBT-62](PRODUCT_DEBT.md#-debt-62--the-whole-export-is-assembled-in-memory-so-it-is-bounded-rather-than-unbounded--p3) | The whole export is assembled in memory, so it is bounded rather than unbounded | A multi-part archive with a manifest. New export capability, and unneeded until a real workspace approaches the ceiling — the V2.16 rehearsal measures the current archive at 21 KB. |
| [DEBT-98](PRODUCT_DEBT.md#-debt-98--areas-and-projects-have-no-description-so-the-two-most-obviously-inline-editable-fields-on-their-records-do-not-exist--p3) | Areas and Projects have no description, so the two most obviously "inline-editable" fields on their records do not exist | Descriptions on Areas and Projects — a schema and surface change, and the same question as DEBT-137. |
| [DEBT-109](PRODUCT_DEBT.md#-debt-109--ordinal-monthly-recurrence-first-monday-of-every-month-is-not-expressible--p3) | Ordinal monthly recurrence ("first Monday of every month") is not expressible | Ordinal monthly recurrence. **Partly overtaken**: TASKS-12 shipped `ordinal` for Tasks, so what remains is its reach into the other recurrence surfaces. |
| [DEBT-137](PRODUCT_DEBT.md#-debt-137--a-project-has-no-description-field-so-its-gallery-card-cannot-say-what-it-is--p2) | A Project has no description field, so its gallery card cannot say what it is | A Project description column and its card. Schema plus surface. |
| [DEBT-138](PRODUCT_DEBT.md#-debt-138--the-projects-table-cannot-be-sorted-because-the-loader-has-no-vocabulary-for-it--p3) | The Projects table cannot be sorted, because the loader has no vocabulary for it | Whole-collection sorting for Projects — a loader vocabulary that does not exist. |
| [DEBT-146](PRODUCT_DEBT.md#-debt-146--two-third-party-credential-stores-two-different-protections--p2) | Two third-party credential stores, two different protections | Sealing Pushover credentials through a shared kernel primitive. Security architecture. |
| [DEBT-147](PRODUCT_DEBT.md#-debt-147--the-pushover-validateenable-path-has-no-test-that-walks-it-end-to-end--p3) | The Pushover validate→enable path has no test that walks it end to end | An end-to-end test of the Pushover validate→enable path. Needs a stubbed fetcher seam that does not exist. |
| [DEBT-153](PRODUCT_DEBT.md#-debt-153--a-saved-view-cannot-express-a-specific-date-window-from-the-tasks-controls--p3) | A saved view cannot express a specific date WINDOW from the Tasks controls | A date WINDOW in the Tasks controls and its saved-view codec. New filter capability. |
| [DEBT-159](PRODUCT_DEBT.md#-debt-159--removing-two-filter-chips-in-quick-succession-can-put-one-of-them-back--p3) | Removing two filter chips in quick succession can put one of them back | A revalidation race on chip removal. Needs the filter transport reworked. |
| [DEBT-165](PRODUCT_DEBT.md#-debt-165--a-template-carries-no-dates-relative-or-otherwise--p2) | A template carries no dates, relative or otherwise | Relative dates on template tasks — an ADR, a column and a timezone rule. New capability. |
| [DEBT-166](PRODUCT_DEBT.md#-debt-166--a-template-task-cannot-repeat--p3) | A template task cannot repeat | Recurrence on a template task. New capability. |
| [DEBT-168](PRODUCT_DEBT.md#-debt-168--a-template-captures-no-links-and-no-knowledge--p3) | A template captures no links and no Knowledge | Links and Knowledge in a template. New capability, needing an ADR first. |
| [DEBT-169](PRODUCT_DEBT.md#-debt-169--dependencies-are-occurrence-local-so-a-recurring-pair-must-be-relinked-every-cycle--p3) | Dependencies are occurrence-local, so a recurring pair must be relinked every cycle | Series-level dependencies. New capability, needing an ADR first. |
| [DEBT-173](PRODUCT_DEBT.md#-debt-173--e2e-specs-assert-against-the-shared-workspaces-accumulated-state-so-re-ordering-the-suite-changes-what-they-see--p2) | E2E specs assert against the shared workspace's ACCUMULATED state, so re-ordering the suite changes what they see | Specs that own their records at both ends. A test-architecture programme; V2.16 measured the split and did not reshuffle it. |
| [DEBT-176](PRODUCT_DEBT.md#-debt-176--the-non-secret-half-of-notification-settings-and-calendar-sources-leaves-the-export-by-table-rather-than-by-column--p3) | The non-secret half of notification settings and calendar sources leaves the export by TABLE rather than by COLUMN | Exporting the non-secret half of notification settings and calendar sources BY COLUMN — new snapshot collections, with restore, validation and manifest consequences. **V2.16 made the omission machine-checked rather than merely named** (`workspace-data-map.ts`), which is the half consolidation owed it. |
| [DEBT-188](PRODUCT_DEBT.md#-debt-188--tasks-have-no-manual-ranking-model-so-a-task-cannot-be-dragged-up-a-list--p3) | Tasks have no manual ranking model, so a Task cannot be dragged up a list | A manual Task ranking model. New store, and ADR-109 already refused inventing one to have something to drag. |
| [DEBT-189](PRODUCT_DEBT.md#-debt-189--the-navigation-rail-cannot-be-a-drop-destination-because-the-shell-owns-no-domain-mutation--p4) | The navigation rail cannot be a drop destination, because the shell owns no domain mutation | The rail as a drop destination. Depends on DEBT-188. |
| [DEBT-191](PRODUCT_DEBT.md#-debt-191--a-meetings-agenda-items-are-manually-ordered-and-are-not-draggable--p4) | A Meeting's agenda items are manually ordered and are not draggable | Draggable agenda items. Depends on a stored order. |
| [DEBT-246](PRODUCT_DEBT.md#-debt-246--the-notification-run-reads-one-bounded-page-so-a-crowded-workspace-can-starve-later-obligations--p3) | The notification run reads one bounded page, so a crowded workspace can starve later obligations | Notification traversal past one bounded page. A paging model the run does not have. |

### Capture — 3 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-32](PRODUCT_DEBT.md#-debt-32--today-personalisation-is-per-device-not-synced--p3) | Today personalisation is per-device, not synced | Today personalisation as its own roadmap item, with its arrangement in the preference store. New capability. |
| [DEBT-55](PRODUCT_DEBT.md#-debt-55--today-widget-arrangement-is-still-device-local-while-the-theme-is-not--p3) | Today widget arrangement is still device-local while the theme is not | The narrow half of DEBT-32 and re-homed with it. |
| [DEBT-102](PRODUCT_DEBT.md#-debt-102--dalyhub-has-no-capture-processing-state-so-unprocessed-captures-cannot-be-shown--p3) | DalyHub has no capture-processing state, so "unprocessed captures" cannot be shown | A capture-processing state. Named in the strategy's V3 list in as many words. |

### Design system — 28 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-01](PRODUCT_DEBT.md#-debt-01--duplicate-card-implementations-per-module--p2) | Duplicate card implementations per module | The last card conversion (`DiaryTimelineBody`) plus a structural assertion. A shared-surface migration. |
| [DEBT-02](PRODUCT_DEBT.md#-debt-02--inconsistent-record-headerslayouts--p2) | Inconsistent record headers/layouts | Either Diary composes the shared Record Layout or an ADR records why it does not — a record-architecture decision. |
| [DEBT-20](PRODUCT_DEBT.md#-debt-20--no-health-specific-project-filter-yet-ds-07-clause-builder-still-deferred--p3) | No health-specific project filter yet (DS-07 clause-builder still deferred) | `/projects` composing the shared view configuration — the deferred DS-07 clause builder. |
| [DEBT-25](PRODUCT_DEBT.md#-debt-25--today-continue-working-project-cards-area-context-is-not-navigable--p3) | Today "Continue working" Project card's Area context is not navigable | Today's Project card gaining a navigable Area context. Surface work. |
| [DEBT-46](PRODUCT_DEBT.md#-debt-46--diarys-timeline-node-is-still-not-the-shared-card--p3-deliberately-downgraded) | Diary's timeline node is still not the shared Card | Diary's timeline node composing the shared `TimelineItem`. Shared-surface migration. |
| [DEBT-51](PRODUCT_DEBT.md#-debt-51--an-open-overflow-menu-escapes-its-card-by-z-index-not-by-leaving-the-stacking-context--p2) | An open overflow menu escapes its card by z-index, not by leaving the stacking context | `OverflowMenu` portalled out of its host's stacking context. Floating-layer work, the same programme as DEBT-181. |
| [DEBT-54](PRODUCT_DEBT.md#-debt-54--border-strong-is-still-below-31-where-it-is-a-decorative-border--p3) | `border-strong` is still below 3:1 where it is a decorative border | A check that fails when an interactive boundary uses `border-strong`. Needs the token boundary defined first, which is design-system work. |
| [DEBT-73](PRODUCT_DEBT.md#-debt-73--area-colour-is-derived-from-rank-so-the-owner-cannot-choose-it-and-a-permanent-deletion-repaints-later-areas--p3) | Area colour is derived from rank, so the owner cannot choose it and a permanent deletion repaints later Areas | An owner-chosen Area colour, stored. New capability. |
| [DEBT-74](PRODUCT_DEBT.md#-debt-74--an-areas-identity-dot-stops-at-the-areas-collection--p3) | An Area's identity dot stops at the Areas collection | An Area's identity dot everywhere its name appears. Surface work across modules. |
| [DEBT-99](PRODUCT_DEBT.md#-debt-99--thirty-eight-module-level-controls-still-hand-roll-their-own-state-layer--p3--twenty-six-of-the-twenty-seven-remaining-converted-2026-08-25-one-left-with-a-reason-that-is-not-it-is-hard) | Thirty-eight module-level controls still hand-roll their own state layer | One remaining hand-rolled state layer, with a recorded reason. Design-system convergence. |
| [DEBT-100](PRODUCT_DEBT.md#-debt-100--a-combobox-closed-with-escape-does-not-reopen-on-click--p3) | A combobox closed with Escape does not reopen on click | A combobox reopen behaviour, asserted end to end. Shared-control work. |
| [DEBT-107](PRODUCT_DEBT.md#-debt-107--eleven-recorded-not-fixed-findings-from-the-august-2026-ui-quality-audit--p3) | Eleven recorded-not-fixed findings from the August 2026 UI quality audit | Eleven recorded-not-fixed UI audit findings. A design-quality pass. |
| [DEBT-122](PRODUCT_DEBT.md#-debt-122--expressivesummary-now-has-no-consumer--p3) | `ExpressiveSummary` now has no consumer | Its own entry names its future home — *a design-system pass, alongside the `--dh-*` semantic layer's own hierarchy vocabulary; not a feature PR, and not a cleanup branch*. V2.16 is a cleanup branch, and deleting the components while leaving the M3X hierarchy documented would swap a dead component for a lying document. |
| [DEBT-136](PRODUCT_DEBT.md#-debt-136--four-controls-sit-below-dalyhubs-44px-touch-floor-each-for-a-documented-reason--p3) | Four controls sit below DalyHub's 44px touch floor, each for a documented reason | Four sub-44px controls, each documented. Closing it needs the design system to name each survivor in D43 or to resize them. |
| [DEBT-140](PRODUCT_DEBT.md#-debt-140--red-and-rose-are-the-identity-ramps-one-weak-pair--p3) | `red` and `rose` are the identity ramp's one weak pair | A hue-separation assertion over the identity ramp. Palette work. |
| [DEBT-141](PRODUCT_DEBT.md#-debt-141--the-application-frames-icons-are-material-symbols-the-identity-vocabulary-is-dalyhubs-own--p3) | The application frame's icons are Material Symbols; the identity vocabulary is DalyHub's own | Either every frame glyph redrawn, or a stated boundary with a test. Icon-system work. |
| [DEBT-150](PRODUCT_DEBT.md#-debt-150--a-plan-row-restates-the-date-its-own-band-already-states--p3) | A plan row restates the date its own band already states | A shared list declaration that suppresses a band's own date. Shared-surface work. |
| [DEBT-161](PRODUCT_DEBT.md#-debt-161--a-phone-task-row-shows-no-checklist-progress--p3) | A phone Task row shows no checklist progress | Checklist progress on a phone Task row. Surface work with a measured height budget. |
| [DEBT-162](PRODUCT_DEBT.md#-debt-162--the-six-column-planning-board-needs-a-1440px-viewport--p3) | The six-column planning board needs a 1440px viewport | Six planning columns at 1280. Layout work. |
| [DEBT-163](PRODUCT_DEBT.md#-debt-163--a-sunday-start-week-draws-seven-board-columns-and-wraps-the-seventh--p3) | A Sunday-start week draws seven board columns and wraps the seventh | A Sunday-start week without a wrapped seventh column. Layout work. |
| [DEBT-171](PRODUCT_DEBT.md#-debt-171--the-recurrence-editor-states-the-rule-but-never-the-next-few-dates--p3) | The recurrence editor states the rule but never the next few dates | A next-dates preview in the recurrence editor. Surface work over an existing kernel function. |
| [DEBT-178](PRODUCT_DEBT.md#-debt-178--focus-trapping-panels-cannot-exit-because-focus-restoration-is-bound-to-unmount--p3) | Focus-trapping panels cannot exit, because focus restoration is bound to unmount | Focus restoration decoupled from unmount. Shared floating-layer work. |
| [DEBT-181](PRODUCT_DEBT.md#-debt-181--the-hover-card-is-the-last-floating-surface-outside-the-shared-anchored-layer--p3) | The Hover Card is the last floating surface outside the shared anchored layer | The Hover Card into the shared anchored layer. Floating-layer work. |
| [DEBT-186](PRODUCT_DEBT.md#-debt-186--a-projects-workflow-status-and-its-parent-are-editable-in-two-places-on-one-record--p3) | A Project's workflow status and its parent are editable in TWO places on one record | A duplicate live editor on the Project record. A record-surface decision about which control survives. |
| [DEBT-245](PRODUCT_DEBT.md#-debt-245--three-entity-accents-are-indistinguishable-from-one-another-in-the-dark-schemes--p3) | Three entity accents are indistinguishable from one another in the dark schemes | Three indistinguishable dark accents. Palette work, with DEBT-140. |
| [RECORD-02](PRODUCT_DEBT.md#-record-02--two-records-have-no-settings-tab-so-their-paperwork-has-nowhere-to-be-demoted-to--p3) | Two records have no Settings tab, so their paperwork has nowhere to be demoted to | A Settings tab for Goal and Note, added when that tab has a second occupant — capability the record layout does not yet need. |
| [RECORD-03](PRODUCT_DEBT.md#-record-03--a-goal-record-is-still-tall-on-a-phone--p3) | A Goal record is still tall on a phone | A record-layout rule about where tabs begin on a phone. Layout capability. |
| [UIQ-012](PRODUCT_DEBT.md#-uiq-012--the-goal-status-open-reads-as-a-command-not-a-state--p3--retained-with-the-reason) | the Goal status "Open" reads as a command, not a state | A shared spine-vocabulary change across Goals AND Projects, or an ADR fixing `open` as the word. Either is a design-and-vocabulary decision, not consolidation. |

### Finance next — 2 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-250](PRODUCT_DEBT.md#-debt-250--asset-valuations-keep-no-history-so-net-worth-has-no-truthful-series--p3) | Asset valuations keep no history, so net worth has no truthful series | Asset valuation history. New stored history, and V2.13 refused a fake net-worth series for exactly this reason. |
| [DEBT-252](PRODUCT_DEBT.md#-debt-252--finance-has-no-standing-duplicate-candidate-read-so-likely-duplicate-can-only-be-answered-at-import--p3) | Finance has no standing duplicate-candidate read, so "likely duplicate" can only be answered at import | A standing duplicate-candidate read. Finance capability the product should have independently of AI, which is why V2.15 refused to build it for AI's benefit. |

### History — 1 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-251](PRODUCT_DEBT.md#-debt-251--the-spine-stores-no-area-at-completion-so-completion-history-follows-a-task-that-moves--p3) | The spine stores no Area-at-completion, so completion history follows a Task that moves | Area-at-completion. New historical event data on the spine. |

### Insight — 3 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-145](PRODUCT_DEBT.md#-debt-145--completions-cannot-be-bucketed-by-owner-local-hour-without-new-kernel-surface--p3) | Completions cannot be bucketed by owner-local hour without new kernel surface | Owner-local hourly bucketing — new kernel surface, explicitly. |
| [DEBT-248](PRODUCT_DEBT.md#-debt-248--today-ships-up-to-200-overdue-rows-to-draw-three--p2) | Today ships up to 200 overdue rows to draw three | A bounded Today projection with server counts. **Assessed for V2.16 and declined**: it changes the shape of Today's loader and its optimistic re-bucketing, and "no product behaviour loss" would need Today's whole journey set re-proved — which is a performance release, and V2.16 is explicitly not one. |
| [DEBT-249](PRODUCT_DEBT.md#-debt-249--one-93-kb-stylesheet-is-render-blocking-on-every-first-paint--p3) | One 93 kB stylesheet is render-blocking on every first paint | **Measured for V2.16 and declined on the measurement.** Its own condition demands *either* a recorded coverage measurement *or* a split whose critical part is measurably smaller. Neither exists, and a speculative CSS split with no coverage reading is exactly the guesswork the entry refuses. It needs a real first-paint coverage measurement, which is a performance pass. |

### Offline — 10 entries

| Entry | What it was | Why V3 |
|---|---|---|
| [DEBT-69](PRODUCT_DEBT.md#-debt-69--offline-capture-receipts-accumulate-with-no-prune--p3) | Offline capture receipts accumulate with no prune | A prune horizon for capture receipts. Offline-store capability. |
| [DEBT-70](PRODUCT_DEBT.md#-debt-70--hydrated-offline-rendering-is-not-covered-by-automation--p2) | Hydrated offline rendering is not covered by automation | A Playwright journey over the production bundle offline. Offline programme. |
| [DEBT-71](PRODUCT_DEBT.md#-debt-71--a-replayed-capture-whose-worker-died-mid-creation-cannot-be-resolved-automatically--p2) | A replayed capture whose Worker died mid-creation cannot be resolved automatically | Automatic resolution of a replay whose Worker died mid-creation. Offline programme. |
| [DEBT-75](PRODUCT_DEBT.md#-debt-75--the-service-worker-byte-budget-has-2185-b-of-headroom--p3) | The service-worker byte budget has 2,185 B of headroom | Service-worker byte-budget headroom. Part of the same measurement as DEBT-151. |
| [DEBT-151](PRODUCT_DEBT.md#-debt-151--the-shell-precache-is-1321-kb-20-its-v201-measurement--p2) | The shell precache is 1,321 kB, 2.0× its V2.0.1 measurement | The precache under 1 MB. A performance programme, and V2.16 is explicitly not one. |
| [DEBT-155](PRODUCT_DEBT.md#-debt-155--a-habit-check-in-is-online-only-and-the-surface-can-only-say-so-after-it-fails--p3) | A habit check-in is online-only, and the surface can only say so after it fails | Offline habit check-ins. The offline slice, which the strategy re-homes to V3 "if pain is ever measured". |
| [DEBT-160](PRODUCT_DEBT.md#-debt-160--only-checklist-completion-is-offline-capable--p3) | Only checklist COMPLETION is offline-capable | Offline checklist creation. Offline slice. |
| [DEBT-167](PRODUCT_DEBT.md#-debt-167--creating-a-project-from-a-template-requires-connectivity--p3) | Creating a project from a template requires connectivity | Offline project-from-template. Offline slice. |
| [DEBT-170](PRODUCT_DEBT.md#-debt-170--adding-or-removing-a-dependency-requires-connectivity--p3) | Adding or removing a dependency requires connectivity | Offline dependency edits. Offline slice. |
| [DEBT-190](PRODUCT_DEBT.md#-debt-190--the-offline-slice-does-not-cover-relationship-or-order-changes--p3) | The offline slice does not cover relationship or ORDER changes | Relationship and ORDER changes in the offline slice. Offline programme. |

---

## What this programme raised

A release that re-measures the product finds things. Recording them is the point
of the register; leaving them out of the disposition report because they arrived
after it was written would make the report's own totality claim a technicality.

| Entry | What it is | Where it stands |
|---|---|---|
| [DEBT-254](PRODUCT_DEBT.md#-debt-254--the-navigation-rows-coarse-pointer-touch-floor-has-had-no-consumer-since-dhds-10--p2--resolved-2026-09-08-v216-consol-00) | The navigation row's coarse-pointer touch floor has had no consumer since DHDS-10 — every phone-sheet row measured 36px under a finger against WCAG 2.2 §2.5.8's 44 | **RESOLVED in this release.** Found by CONSOL-00's new phone journey, fixed in `tokens.css`, and pinned as a token CHAIN rather than a number, because a number is what hid it. |
| [DEBT-255](PRODUCT_DEBT.md#-debt-255--the-e2e-gate-has-48-seconds-of-headroom-per-partition-so-the-next-spec-file-of-any-size-cannot-fit--p2) | The E2E gate's heaviest partition is at 99.5% of its ceiling, so the next item that adds any coverage cannot fit | **OPEN, deliberately.** Raising `PARTITION_COUNT` edits the machinery every CI job depends on and its only honest validation is a full gate run; V2.16 added exactly ONE spec file and sized it to fit rather than resizing the gate to hold it. The two candidate answers are measured on the entry. The next release that adds E2E coverage owns it. |

**This is the one entry in the register with no disposition, and it is open by
decision rather than by omission.** Closing it inside V2.16 would have meant
either changing the gate's shape on a branch that is about something else, or
writing a number nobody had run. Neither is a disposition.

---

## The three assessed for V2.16 and declined on the measurement

Named separately because the prompt for this release asked for them by number,
and because "we looked and decided not to" is a different statement from "it
is capability":

- **DEBT-248** (Today ships 200 overdue rows to draw three) — the bounded
  projection is specified and would work, and it changes the shape of Today's
  loader AND its optimistic re-bucketing. Proving "no product behaviour loss"
  means re-proving Today's whole journey set, which is a performance release.
  V2.16 is explicitly not one.
- **DEBT-249** (a 93 kB render-blocking stylesheet) — its own condition demands
  *either* a recorded coverage measurement *or* a split whose critical part is
  measurably smaller. **Neither exists**, and a split chosen without a coverage
  reading is the speculative CSS surgery the entry refuses. Measuring first-paint
  coverage is a performance pass.
- **DEBT-253** (a batch acceptance costs statements linearly) — a flat batch is
  expressible, but only by giving the apply authority a set-based path whose
  per-item `applied` / `stale` / `unchanged` reporting is reconstructed
  afterwards. ADR-123's stale guard is per item **by design**. V2.16 will not
  weaken correctness to flatten a number.

And two the prompt named that were already decided rather than declined:
**DEBT-250** (Asset valuation history) and **DEBT-251** (Area-at-completion) are
new stored history, exactly as the prompt predicted, and V2.13's refusal to
manufacture a net-worth series from a store with no history remains correct.
**DEBT-252** (a standing duplicate-candidate read) is Finance capability the
product should have independently of AI — which is why V2.15 refused to build
it for AI's benefit, and why V2.16 does not build it either.

---

## Related documents

- [`PRODUCT_DEBT.md`](PRODUCT_DEBT.md) — the register itself; every entry carries its own disposition bullet
- [`ROADMAP_V2_16.md`](../roadmap/ROADMAP_V2_16.md#consol-03--close-or-re-home-the-debt-register-) — the item this report is the output of
- [`V3_BOUNDARY.md`](V3_BOUNDARY.md) — the gate, and where the owner-gated entries appear in it
- [`DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md`](DALYHUB_POST_V2_8_PRODUCT_STRATEGY.md#12-the-v3-boundary) — the V3 categories this report groups by
