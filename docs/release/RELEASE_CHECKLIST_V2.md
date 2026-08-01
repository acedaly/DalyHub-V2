# DalyHub V2 — Release Checklist

**Version `2.0.0` · 2026-08-01 · closure branch `claude/dalyhub-v2-release-closure-jfhefo`**

> The evidence behind the release verdict. **Nothing is marked ✅ without a
> reference** — a test file, a source file, a PR, or a recorded measurement. Where
> something is true only with a caveat, the caveat is in the row rather than omitted
> to keep the column green.
>
> Legend: ✅ verified · ⚠️ verified with a stated limitation · ⏭️ deferred (with a
> target version) · ⛔ blocking.

---

## 1. Release verdict

| | |
|---|---|
| **Verdict** | **Ready to release, once CI is green on this branch.** |
| **Version** | `2.0.0`, release name `V2`, from [`app/lib/version.ts`](../../app/lib/version.ts) |
| **Blocking issues outstanding** | **0.** Two were found during closure; both fixed (§7). |
| **The one thing V2 knowingly does not do** | Read an export back in. [SET-02 is deferred to V2.1](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21) and is not claimed anywhere in the product. |
| **Production state at time of writing** | Schema `0001`–`0005`, pre-V2 Worker. Deploying V2 is a twenty-migration step. |

---

## 2. V2 roadmap items

| Item | Status | Evidence | Limitation / target |
|---|---|---|---|
| FND-01…09 (kernel, isolation, links, activity, registry, spine, markdown, shell/auth) | ✅ Complete | `test/kernel/entity-*`, `entity-link-*`, `activity-*`, `spine-*`, `markdown-render`, `access-jwt-verification`; ADR-008…016 | — |
| DS-01…13 (tokens, record layout, drawer, cards, timeline, forms, filters, search, palette, inspector, settings layout, a11y baseline, overflow, summary cards) | ✅ Complete | `test/unit/{tokens,record-layout,drawer,card,forms,filters,search,commands,inspector,overflow-menu,summary-cards}`; `e2e/design-foundation.spec.ts` | — |
| PX-02…06 (product frame, navigation, lifecycle, identity, copy convention) | ✅ Complete | `e2e/product-frame.spec.ts`, `e2e/px-03-navigation.spec.ts`, `e2e/record-lifecycle.spec.ts`; ADR-020, ADR-053 | — |
| MOBILE-01 (phone platform) | ✅ Complete | `e2e/mobile-shell.spec.ts`, `mobile-modules.spec.ts`, `mobile-capture-journeys.spec.ts`; ADR-058 | — |
| TODAY-01…08 | ✅ Complete | `e2e/today.spec.ts`, `today-mobile.spec.ts`, `today-keyboard.spec.ts`, `planning.spec.ts`, `waiting.spec.ts` | — |
| TASKS-01, 02, 02b, 03, 04 | ✅ Complete | `e2e/tasks*.spec.ts`, `task-drawer.spec.ts`, `test/kernel/task-*`; ADR-059 | — |
| PROJ-01…06 | ✅ Complete | `e2e/projects*.spec.ts`, `project-health.spec.ts`, `project-activity.spec.ts`, `project-settings.spec.ts` | — |
| AREA-01…05 | ✅ Complete | `e2e/areas.spec.ts`, `area-lifecycle.spec.ts`, `goals.spec.ts`, `goals-alignment.spec.ts` | — |
| NOTES-01A/B/C, 02…07 · REL-01 | ✅ Complete | `e2e/notes.spec.ts`, `notes-knowledge.spec.ts`, `linked-items.spec.ts`; `test/kernel/notes-*` | — |
| MEET-01…04 | ✅ Complete | `e2e/meetings-follow-up.spec.ts`, `meetings-people-history.spec.ts`; ADR-048, ADR-055 | ⚠️ [DEBT-44](../product/PRODUCT_DEBT.md#-debt-44--a-held-meeting-appears-on-the-timeline-of-a-linked-non-attendee--p2): a held meeting shows on a linked non-attendee's history. Presentational; cannot affect the contact signal. |
| PEOPLE-01…03 | ✅ Complete | `e2e/people.spec.ts`, `people-timeline.spec.ts`, `people-relationship.spec.ts`; ADR-052, ADR-056 | — |
| PEOPLE-04 (mobile) | ⏭️ Partly delivered | Layout, quick actions and ADR-060 capture context shipped | **V2.1** — the DEBT-45 capture-context matrix |
| ASSET-01, 02 | ✅ Complete | `e2e/assets.spec.ts`, `assets-ownership.spec.ts`; `test/kernel/asset-history*`; ADR-063 | ⚠️ [DEBT-57](../product/PRODUCT_DEBT.md#-debt-57--asset-obligations-are-tracked-but-nothing-reaches-the-owner-outside-the-app--p2): no notification channel |
| ASSET-03 (mobile) | ⏭️ Partly delivered | Record + history surfaces verified at 320–430px | **V2.1** — phone-first capture of a NEW asset |
| DIARY-01A, 01, 01B, 03 | ✅ Complete | `e2e/diary.spec.ts`; `test/kernel/diary-*`; ADR-041 | — |
| DIARY-02 (day context links) | ⏭️ Not started | — | **V2.1** |
| REVIEWS-01 | ✅ Complete | `e2e/reviews.spec.ts`; `test/kernel/reviews*`; ADR-051. **The 2026-07-27 "not cleanly verified" caveat is cleared** — its cause (DEBT-38) is closed and the spec passes. | ⚠️ [DEBT-34](../product/PRODUCT_DEBT.md#-debt-34--reviews-period-context-and-today-integration-are-bounded-first-cuts--p2): period context is a bounded first cut |
| REVIEW-02 / 03 / 04 | ⏭️ Not started / partly | — | **V2.1** |
| X-01 (global search) | ✅ Complete | `e2e/search.spec.ts`; `test/unit/search/`; `test/kernel/search-route*` | — |
| X-02 (saved views) | ⏭️ Partly delivered | Tasks slice shipped (ADR-059) | **V2.1** — the cross-module contract |
| X-03 (import & sync) | ⏭️ Not started | — | **After V2.1**, deliberately after restore |
| X-04 (export & portability) | ✅ Complete | `e2e/export.spec.ts`; `test/kernel/workspace-export*.test.ts`; `test/unit/export/`; ADR-065 | ⚠️ Export only; not atomic; bounded at 50k rows/64 MiB, both reported |
| THEME-01 · HELP-01 · RELEASE-01 · POLISH-01 · UX-01 | ✅ Complete | `e2e/themes.spec.ts`, `help-about.spec.ts`, `ux-01-daily-driver.spec.ts`; `test/unit/{help,about}` | — |
| SET-01 (settings) | ✅ Complete | `e2e/settings.spec.ts`; `test/kernel/app-preferences.test.ts`; ADR-050 | — |
| **SET-02 (backup & restore)** | ⏭️ **Deferred** | Not implemented. No control exists; Help and Settings say so; a test holds that wording. | **V2.1** — see §12 |
| SET-03 (account & security) | ⏭️ Not started | Identity layer done (FND-09/ADR-016); the surface is not | **V2.1** |
| AI-01…04 | ⏭️ Not started | `/ai` is an honest placeholder | **After V2.1**, last by design |

---

## 3. Primary modules — daily-driver audit

Each row was exercised as a coherent workflow, on desktop **and** at phone widths.

| Journey | Status | Evidence |
|---|---|---|
| **Today loads as the default daily view** | ✅ | `/` resolves the preferred landing server-side and falls back to Today (`test/kernel/home-route.test.ts`); `e2e/today.spec.ts` |
| Quick Capture creates the intended record | ✅ | `e2e/mobile-capture-journeys.spec.ts`, `today.spec.ts` (capture sheet, focus, Escape) |
| Due-today, overdue and daily context are legible | ✅ | `e2e/today.spec.ts`, `planning.spec.ts`, `waiting.spec.ts` |
| Empty / loading / error states are useful | ✅ | `test/unit/empty-state/`, `test/unit/skeleton/`, `e2e/feedback.spec.ts` |
| **Widget and weather behaviour is not placeholder-like** | ✅ | Weather, calendar and the "coming soon" Focus panel are **removed**, not faked ([DEBT-53](../product/PRODUCT_DEBT.md#-debt-53--weather-and-calendar-on-today-were-removed-not-implemented--p3); UX-01). Widget collapse/hide/reorder verified in `e2e/today.spec.ts` |
| Task captured quickly without a Project | ✅ | `e2e/tasks-daily-driver.spec.ts`; `test/kernel/task-inbox-parent.test.ts` |
| Inbox / project-less behaviour | ✅ | `test/kernel/task-inbox-parent.test.ts`; `e2e/tasks-collection.spec.ts` |
| Inline editing is reliable | ✅ | `e2e/tasks-daily-driver.spec.ts`, `tasks-collection.spec.ts` |
| Priority, dates and recurrence understandable | ✅ | `test/unit/tasks/`, `test/kernel/task-recurrence-{storage,route}.test.ts` |
| Complete / reopen / archive / delete consistent | ✅ | `e2e/record-lifecycle.spec.ts`; ADR-053 (one lifecycle vocabulary derived from entity type) |
| Mobile capture and completion are fast | ✅ | `e2e/mobile-capture-journeys.spec.ts`, `today-mobile.spec.ts`, `touch-targets.spec.ts` |
| Area/Goal/Project/Task relationships correct | ✅ | `test/kernel/spine-*.test.ts`; exactly-one-active-parent enforced by a partial unique index |
| **Progress and counts are accurate** | ✅ | Derived from active descendants, never stored (`test/kernel/goals.test.ts`, `project-health.test.ts`, `alignment.test.ts`) |
| **Project-less tasks do not distort project reporting** | ✅ | Rollups traverse `task.belongs_to_project` links; a task with no project is structurally absent from a project's rollup (`test/kernel/spine-*`) |
| Empty states teach the next action | ✅ | Shared `EmptyState` + `app/shared/entity/copy.ts` derives titles from one identity map |
| Archive / restore consistent | ✅ | `e2e/area-lifecycle.spec.ts`, `project-settings.spec.ts`, `record-lifecycle.spec.ts` |
| Notes created, linked, searched, exported | ✅ | `e2e/notes.spec.ts`, `notes-knowledge.spec.ts`, `search.spec.ts`, `export.spec.ts` |
| Backlinks and related records accurate | ✅ | `test/kernel/notes-record-links.test.ts`, `test/unit/references/` |
| Diary retains date context | ✅ | `occurred_at` distinct from `created_at`; backdating covered in `e2e/diary.spec.ts` |
| Meetings connect to People/Projects/Notes/Tasks | ✅ | `e2e/meetings-follow-up.spec.ts`, `meetings-people-history.spec.ts`; `test/kernel/meeting-*.test.ts` |
| Mobile meeting and diary capture usable | ✅ | `e2e/mobile-capture-journeys.spec.ts`, `mobile-modules.spec.ts` |
| People show meaningful linked history | ✅ | `e2e/people-timeline.spec.ts`; ADR-052 |
| **Relationship data derived, not duplicated** | ✅ | No interactions table, no `last_contact_at` column; ADR-056 + `test/kernel/person-relationship-facts.test.ts` (including a query-count test proving no N+1) |
| Asset history, obligations, links accurate | ✅ | `test/kernel/asset-history.test.ts`, `asset-history-scale.test.ts`; `e2e/assets-ownership.spec.ts` |
| **Sensitive info not exposed via search or export** | ✅ | Preview policy by entity type (`test/unit/search/`); export contains no secrets (§6) |
| Global Search covers the V2 entities | ✅ | Ten providers; `test/unit/search/` production-registry test; `e2e/search.spec.ts` |
| Results route to valid records | ✅ | `e2e/search.spec.ts`; the shared `entityDestination` helper |
| Archived/inaccessible records don't appear wrongly | ✅ | Provider projections are workspace-scoped and lifecycle-filtered (`test/kernel/*-route.test.ts`) |
| Command palette predictable | ✅ | `e2e/command-palette.spec.ts`, `keyboard.spec.ts` |
| Reviews compute the correct period | ✅ | Wall-calendar periods honouring first-day-of-week; `test/kernel/reviews*.test.ts` |
| Review creation/navigation on both viewports | ✅ | `e2e/reviews.spec.ts` |
| **Settings contain no placeholder controls** | ✅ | Deferred capabilities are named in prose with no control (`app/modules/settings/routes/index.tsx:534`); `e2e/settings.spec.ts` |
| Theme switching across all five themes | ✅ | `e2e/themes.spec.ts`; `docs/design/THEME_ACCEPTANCE_MATRIX.md` |
| **Help describes current V2 features** | ✅ | `test/unit/help/help-content.test.ts` asserts coverage, the five theme names, the missing-feature list, and no implementation jargon |
| **About shows correct version/release/ownership** | ✅ | One authority pinned to `/health` by `test/unit/about/version.test.ts`; package metadata pinned by `test/unit/about/package-version.test.ts` |
| **Deferred features not presented as available** | ✅ | Help's `not-yet` topic names backup/restore, import, weather, notifications and AI; a test asserts restore stays on that list |
| X-04 export actions clear and functional | ✅ | `e2e/export.spec.ts` (both downloads, ZIP integrity, checksums) |

---

## 4. Mobile usability

| Check | Status | Evidence |
|---|---|---|
| Phone navigation reaches the daily surfaces with one thumb | ✅ | `e2e/mobile-shell.spec.ts` |
| Capture from anywhere in seconds | ✅ | `e2e/mobile-capture-journeys.spec.ts` |
| Records are full screen on a phone, same URL/history/focus contract | ✅ | `e2e/mobile-modules.spec.ts`, `drawer.spec.ts` |
| No horizontal overflow at 320 / 375 / 390 / 430px | ✅ | `e2e/responsive.spec.ts`, `mobile-modules.spec.ts`, per-module responsive tests |
| 44px touch targets | ✅ | `e2e/touch-targets.spec.ts` | 
| Keyboard-safe forms; no mobile zoom on focus | ✅ | `test/unit/viewport/keyboard-inset.test.ts`; the 16px input floor |
| Named remainders | ⏭️ | New-Asset capture, People capture matrix, Review stepper → **V2.1** |

---

## 5. Accessibility

| Check | Status | Evidence |
|---|---|---|
| Keyboard navigation for primary workflows | ✅ | `e2e/keyboard.spec.ts`, `today-keyboard.spec.ts` |
| Visible and correctly restored focus | ✅ | `e2e/drawer.spec.ts`, `record-lifecycle.spec.ts` (Escape → focus returns to the opener) |
| Valid labels and accessible names | ✅ | `eslint-plugin-jsx-a11y` + axe scans; icon-only buttons carry labels |
| No keyboard traps | ✅ | `e2e/keyboard.spec.ts`, `drawer.spec.ts` |
| Meaningful heading order | ✅ | `e2e/accessibility.spec.ts`; DS-02 configurable heading level |
| Dialog focus management | ✅ | `e2e/drawer.spec.ts`, `feedback.spec.ts` |
| Adequate touch targets | ✅ | `e2e/touch-targets.spec.ts` | 
| Usable at common phone widths | ✅ | `e2e/responsive.spec.ts` |
| No important action requires hover | ✅ | DS-04/DS-12 overflow actions are focusable buttons, not hover-only |
| Reduced motion respected | ✅ | `test/unit/shell/`, `prefers-reduced-motion` honoured in tokens |
| No unreadable text or controls in any theme | ✅ | `test/unit/tokens/` asserts AA **per theme**, not sampled; `e2e/themes.spec.ts` |
| Known, non-blocking gaps | ⚠️ | [DEBT-14](../product/PRODUCT_DEBT.md#-debt-14--grouped-rolefeed-interleaves-non-article-children--p3), [DEBT-15](../product/PRODUCT_DEBT.md#-debt-15--listbox-options-wrap-a-focusable-result-control--p3), [DEBT-26](../product/PRODUCT_DEBT.md#-debt-26--rendered-gfm-task-list-checkboxes-have-no-accessible-label--p3), [DEBT-50](../product/PRODUCT_DEBT.md#-debt-50--card-quick-actions-are-28px-on-a-narrow-viewport-with-a-mouse--p3), [DEBT-54](../product/PRODUCT_DEBT.md#-debt-54--border-strong-is-still-below-31-where-it-is-a-decorative-border--p3), [DEBT-56](../product/PRODUCT_DEBT.md#-debt-56--axe-reports-label-title-only-for-one-shared-selectfield-in-the-tasks-drawer-and-the-dom-says-otherwise--p3) — all P3, each with a stated reason |

---

## 6. Data integrity, workspace isolation and export

| Check | Status | Evidence |
|---|---|---|
| **Every query scoped to the authenticated workspace** | ✅ | Repositories are workspace-**bound at construction** (`createEntityRepository(db, context)`) — no module method accepts a `workspaceId`, so a module cannot ask the wrong question. Audited at closure: every route module with a `loader`/`action` goes through `requireAuthenticatedSession` / `resolveAuthenticatedWorkspaceScope` (0 exceptions). |
| **User-supplied ids cannot reach another workspace** | ✅ | Cross-workspace reads/updates/deletes/restores disclose nothing: `test/kernel/entity-repository.test.ts`, `entity-link-repository.test.ts`, `person.test.ts`, `asset.test.ts`, `notes-route.test.ts`, `goals-route.test.ts`, `areas-route.test.ts`, `task-workspace.test.ts` and ~40 more |
| **Relationships cannot cross workspaces** | ✅ | Composite foreign keys `(workspace_id, entity_id) → entities(workspace_id, id)` make it a database error, not a check: `test/kernel/entity-link-integrity.test.ts` |
| Archive / delete affect only intended records | ✅ | `test/kernel/area-lifecycle.test.ts`, `entity-link-archive-guard.test.ts`; endpoint soft-delete **hides but preserves** links |
| **Cascade behaviour deliberate and tested** | ✅ | `ON DELETE RESTRICT` throughout; completion and soft-deletion never cascade (`test/kernel/spine-*`, `entity-link-lifecycle.test.ts`) |
| **Recurring-task generation is idempotent** | ✅ | Gated in-batch, `NOT EXISTS`-checked, backstopped by a uniqueness constraint: `test/kernel/task-recurrence-storage.test.ts`, `task-recurrence-route.test.ts`, `task-completion-route-failure.test.ts` |
| **Progress counts ignore what should not count** | ✅ | Rollups read active descendants only; soft-deleted and unlinked records are excluded structurally |
| **Export includes only the active workspace** | ✅ | `test/kernel/workspace-export-route.test.ts` seeds a second workspace with a distinctly-titled record and asserts it is absent |
| **Export contains no secrets, Access headers, env values or credentials** | ✅ | The snapshot's `application` block is the RELEASE-01 allow-list (name, version, release name, recognised environment, optional hex commit) and nothing else; the snapshot repository has **no mutating method**; `test/unit/export/`, `test/kernel/workspace-export.test.ts` |
| Mutations are atomic with their activity event | ✅ | One `D1Database.batch()`, `changes()`-guarded: `test/kernel/activity-atomic.test.ts`, `activity-concurrency.test.ts` |
| Markdown cannot inject HTML | ✅ | One sanitising pipeline; one `dangerouslySetInnerHTML` in `app/`, enforced by `test/unit/markdown-boundary.test.ts` |
| **Findings requiring a fix** | ✅ | **None.** No data-integrity or isolation defect was found in this audit. |

---

## 7. Release blockers found and resolved

| # | Blocker | Category | Resolution |
|---|---|---|---|
| 1 | `e2e/today.spec.ts:89` asserted a `[data-widget="focus"]` panel that UX-01 (#95) **deliberately removed**. `main` was red from #95 onward for a widget whose absence was the intended outcome. | Consistently failing required test | Retargeted the test at the **rendered** widget catalogue (id + title read from the DOM), so it covers the personalisation behaviour it was written for and stops encoding which widgets exist. `e2e/today.spec.ts` |
| 2 | Playwright shard 4 of 10 hit the 900s `globalTimeout` with **102 passed, 0 failed, 1 never run** — runs 30693899680 and 30698894216. ~79 min of tests against a ten-way split. | Consistently failing required test | Split to **fourteen** shards, the same remedy as the previous three splits. `.github/workflows/ci.yml`. Ceiling untouched; `workers` stays 1 inside a shard. |

**No test was weakened, skipped, quarantined or deleted.** Fix 1 makes the assertion
*less* brittle without reducing what it covers; fix 2 changes only how the suite is
distributed across runners — the union of shards still runs every test exactly once.

---

## 8. Tests and quality gates

Run locally on the closure branch. CI results for the same commit are the
authoritative record.

| Gate | Command | Result |
|---|---|---|
| Formatting | `pnpm run format:check` | ✅ pass |
| Lint | `pnpm run lint` | ✅ pass |
| Type check | `pnpm run typecheck` | ✅ pass |
| Unit & component | `pnpm run test:unit` | ✅ **275 files / 3107 tests** at baseline; new tests added by this closure |
| Kernel (Workers runtime + real D1) | `pnpm run test:kernel` | ✅ **117 files / 1695 tests** at baseline; new migration test added |
| Migration tests | included in the two above | ✅ per-migration `0002`–`0024`, plus the new production-baseline test and the D1-parser-compatibility test |
| Production build | `pnpm run build` | ✅ pass |
| Deploy dry-run | `pnpm run deploy:dry-run` | ✅ pass |
| End-to-end (all shards) | `pnpm run test:e2e` | see §8a |
| Mobile viewport tests | within the E2E suite | ✅ `mobile-*.spec.ts`, `responsive.spec.ts`, `touch-targets.spec.ts` |
| Export tests | `test/kernel/workspace-export*`, `test/unit/export/`, `e2e/export.spec.ts` | ✅ pass |
| Workspace-isolation tests | ~50 kernel/route tests | ✅ pass |

**No flaky test was quarantined.** The two failures found were diagnosed to root
cause and fixed (§7).

---

## 9. Migration and deployment readiness

| Check | Status | Evidence |
|---|---|---|
| Migration numbering and ordering correct | ✅ | New `test/unit/migrations/migration-numbering.test.ts` — naming, no duplicate number, no gap. The one historical `0013` collision is grandfathered **by exact filename as a pair** ([DEBT-40](../product/PRODUCT_DEBT.md#-debt-40--two-migrations-share-the-number-0013--p3)); a third `0013` still fails. Neither live migration was renamed. |
| Migrations idempotent where required | ✅ | `applyD1Migrations` tracks applied names; re-running is a no-op |
| Migration parsing works on the production deploy path | ✅ | `test/unit/migrations/d1-parser-compatibility.test.ts` — no BOM, CRLF, non-ASCII, block comments, semicolons in line comments, or empty statement fragments |
| Builds against the production compatibility date | ✅ | `2026-07-17` in `wrangler.jsonc` and mirrored in `vitest.workers.config.ts`, so tests run the production runtime date |
| No placeholders in configuration | ✅ | `deploy:production` refuses to upload if any placeholder survives flattening (`scripts/deploy-production.mjs`; `test/unit/deploy/`) |
| Environment-specific values outside source control | ✅ | `wrangler.jsonc` commits `AUTH_MODE` only; D1 id, workspace id, Access team domain/AUD and owner email are supplied at deploy time and asserted absent from committed vars |
| Preflight catches missing values | ✅ | `pnpm run deploy:production:preflight`; `checkProductionDeployReadiness` validates every required value and its shape before anything is built |
| Production Worker name and D1 binding correct | ✅ | `dalyhub-v2-production` (never `-production-production`) and binding `DB`; guarded and unit-tested |
| **Deployed production schema migrates to V2 without destructive surprises** | ✅ | **New:** `test/kernel/migration-production-baseline.test.ts` applies `0001`–`0005`, seeds a representative populated workspace, applies the full sequence, and asserts nothing lost/resurrected/rewritten, links (including an explicitly-unlinked one) preserved, Activity + multi-subject associations preserved, every V2 table present, the single `0008` backfill correct, no orphans, and no cross-workspace row invented |
| Origin hardening | ✅ | `workers_dev: false`, `preview_urls: false` committed in `env.production` and verified to survive flattening; deploy refuses otherwise |

---

## 10. Documentation

| Document | Status |
|---|---|
| [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) | ✅ Reconciled and **closed**; scope table added; three stale statuses corrected |
| [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) | ✅ **New** — the V2.1 roadmap and build order |
| [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) | ✅ Closure review added; 7 V1-inherited entries closed with evidence; DEBT-01/02 reclassified P1→P2; DEBT-40/41 updated |
| [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) | ✅ Stale per-PR migration notes replaced with one V2 upgrade section; superseded sections marked |
| Help content | ✅ Accurate; restore stays on the "not here yet" list, asserted by a test |
| About / release info | ✅ `2.0.0` / `V2` from one authority |
| Export documentation | ✅ `EXPORT_AND_PORTABILITY.md` unchanged and still accurate |
| [`RELEASE_NOTES_V2.md`](RELEASE_NOTES_V2.md) | ✅ **New** |
| This checklist | ✅ **New** |
| [`CHANGELOG.md`](../../CHANGELOG.md) | ✅ V2 entry added |
| [`README.md`](../../README.md) · [`docs/README.md`](../README.md) | ✅ Updated for the release and the new documents |
| Architecture decisions | ✅ No ADR needed — no architectural behaviour changed. The closure adds no entity, route, migration, dependency or capability. |

---

## 11. CI status

| | |
|---|---|
| Required check | **CI Gate** — fails if any of `static-quality`, `unit-test`, `kernel-test`, `build` or **any** Playwright shard is not `success` |
| Shards | **14** (raised from 10 by this closure; see §7) |
| `main` before this closure | ❌ Red — runs 30693899680 and 30698894216, both for the two causes in §7 |
| This branch | Must be green before merge. Both causes are fixed; the branch run is the proof. |
| [DEBT-41](../product/PRODUCT_DEBT.md#-debt-41--the-e2e-suite-is-unreliable-on-main-so-ci-is-green-claims-are-unverifiable--p1) | Stays ◐ **deliberately** — its closing condition is `main` itself being green *after* this merges. It must not be closed by the change that hopes to fix it. |

---

## 12. Backup & Restore deferral

| | |
|---|---|
| **Decision** | SET-02 is **moved out of the V2 release scope and into V2.1** |
| **What V2 ships instead** | User-controlled export and data portability through X-04 — a structured versioned archive *and* an Obsidian vault, both from one canonical snapshot |
| **Positioning** | **Downloadable export is the V2 data-safety and portability feature.** It is verifiable without DalyHub, readable anywhere, and includes archived/deleted/unlinked records with their state marked |
| **What is NOT claimed** | Full backup restoration. Restore has never been exercised end to end and is not represented as complete anywhere: no control in `Settings → Privacy & data`, an explicit line in Help's "What is not here yet" topic (test-asserted), and a stated limitation in the release notes |
| **V2.1 commitment** | Validated backup import and restore over the canonical X-04 snapshot format, with **preview, validation, workspace protection, failure safety and a proven end-to-end restoration test** |
| **Nothing built here** | No restore, no import, no scheduled backup, no cloud backup — verified: this closure adds no route, no migration and no capability |
| **Blocking check** | ✅ **No remaining V2 item is blocked by SET-02.** Its only dependant was X-03, itself deferred and correctly sequenced after restore; that wording was corrected |

---

## 13. Post-deployment verification

Run after `pnpm run deploy:production`:

- [ ] `GET /health` returns `{"status":"ok",...,"version":"2.0.0","environment":"production"}`
- [ ] The authenticated shell loads **through Cloudflare Access** (title `DalyHub`, owner email in the header)
- [ ] A request to a protected route **without** a valid Access token is rejected, not served
- [ ] The direct `*.workers.dev` origin still returns 404, and Preview URLs are still disabled
- [ ] `/about` shows version `2.0.0`, release `V2`, environment `Production` — the same version `/health` reports
- [ ] `wrangler d1 migrations list DB --env production --remote` reports **no pending migrations**
- [ ] `/today` loads and shows real data; `/tasks`, `/projects`, `/notes`, `/people`, `/assets`, `/reviews` open
- [ ] Existing Projects still load with no archived/status regression (the `0008` backfill)
- [ ] Settings → Appearance switches a theme, and it survives a reload
- [ ] `Settings → Privacy & data` produces both downloads; `sha256sum -c CHECKSUMS.txt` verifies the archive
- [ ] Delete both export files from any shared machine — they contain the whole workspace
