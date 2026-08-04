# DalyHub V2 End-to-End Audit — 5 August 2026

> An independent, adversarial end-to-end audit of DalyHub V2. It does not grade
> DalyHub by intent; it grades it by what the code does, what the schema permits,
> what the tests prove, what reproduces, what is visible in the running
> application, and what remains unverified. Green CI, prior audit reports and
> roadmap/debt statuses were all treated as claims to be checked, not as evidence.
>
> **This is a documentation-only audit.** No application code, migration, test, CI
> workflow, deployment script or dependency was changed. The two release-blocking
> defects below were **reproduced but deliberately not fixed** (per the audit's
> scope); their remediation is sequenced in
> [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md).

---

## 1. Executive verdict

**Not ready for normal daily use pending two specified blockers.**

DalyHub V2 is, on the evidence, a genuinely substantial and largely complete
personal-operating-system application — far more complete than a sceptical audit
expects. Sixteen product surfaces render cleanly at desktop and phone widths with
no console errors and no layout overflow; the data kernel, workspace isolation,
authentication, the Markdown sanitisation pipeline and the workspace export are
correctly built and were verified end to end; and 5,378 automated unit and kernel
tests pass locally. That is the supporting evidence for how much *works*.

It is **not** ready for normal daily use because two **confirmed, reproduced,
P1 data-integrity defects sit directly on core daily-use paths**, and both surface
to the user as a generic failure while the database correctly rejects a corrupt
write:

- **[AUDIT-01] Completing a recurring task again after reopening it permanently
  breaks that task.** The second completion violates a `UNIQUE` constraint, the
  whole batch rolls back, and the occurrence can never be completed again without
  direct database surgery. Reproduced against the real schema.
- **[AUDIT-02] Editing a meeting's agenda/decisions/outcomes/actions by removing a
  non-last item and then adding another of the same kind throws an unhandled
  error (HTTP 500).** The item kind stays un-addable until the trailing item is
  also removed. Reproduced against the real schema.

Both are small, localised fixes with a correct precedent already present elsewhere
in the same codebase. Once both are fixed with regression tests, the honest verdict
moves to **"Ready for daily use with known limitations"** — the limitations being
the production-verification gap (§4, §19), the outstanding PWA device testing, and
the multi-device concurrency and CSRF-defence-in-depth gaps below. None of the
remaining findings independently blocks daily use.

**Why green CI did not catch this.** CI is green and trustworthy for what it
covers, but neither defect has a test: the recurrence suite never *re-completes* a
reopened occurrence, and the meeting-item suite never *removes a non-last item and
adds again*. Green CI is therefore true and, for these two flows, uninformative —
which is exactly the claim ("CI proves DalyHub is production ready") this audit set
out to test.

---

## 2. Audited branch and commit

| | |
|---|---|
| **Repository** | `acedaly/DalyHub-V2` |
| **Default branch** | `main` |
| **Audited commit** | `ca3577d05b1dc7ac22282b95bde56b54eb39ada2` |
| **Commit subject** | `POLISH-02: the Today command centre (#110)` |
| **`main` and `origin/main`** | both at `ca3577d` at audit time (verified) |
| **Audit branch (docs only)** | `claude/dalyhub-v2-audit-r4zjhr` |
| **Latest migration on disk** | `0028_create_workspace_members.sql` (dated 2026-08-04) |
| **`package.json` version** | `2.0.1`; `app/lib/version.ts` `APP_VERSION = "2.0.1"`, `APP_RELEASE_NAME = "V2"` |

---

## 3. Audit scope

Every implemented and partially-implemented module was reviewed: Today, Areas,
Goals, Projects, Tasks (incl. Inbox/project-less and recurring tasks), Notes,
Diary, Meetings, People, Assets, Reviews, Search, Command palette, Quick actions,
Activity feeds and actor attribution, Settings, Themes, Branding, Help, About and
version, Export, the AI placeholder, and PWA/offline. For each, CRUD and
archive/restore behaviour, empty/loading/error states, cross-module relationships,
navigation, mobile and desktop layouts, accessibility affordances, workspace
isolation, activity-event creation and automated-test coverage were assessed.

Representative operations were traced end to end through UI → route → service →
repository → D1 schema, rather than by high-level walkthrough alone. Data
integrity was treated as the primary audit stream, with the D1 schema, all 29
migration files, foreign-key/delete/cascade behaviour, archive semantics,
workspace ownership, recurrence generation, activity generation and export/import
fidelity examined directly.

---

## 4. Environment and limitations

The audit ran in an ephemeral Linux sandbox with the repository cloned at
`ca3577d`, Node 22, pnpm 10.33 and the pre-installed Chromium. The following could
be executed and were: dependency install from the lockfile, formatting, lint, type
check, icon-geometry check, the full unit suite, the full kernel/Workers+D1 suite,
the production build, the credential-free deploy dry-run, the dependency audit, a
local D1 migrate+seed, the running application driven in Chromium at desktop
(1280×900) and phone (390×844) widths, the real export endpoint, and a direct
`node:sqlite` reproduction of the two P1 defects against the committed migrations.

**What could not be verified (verification gaps, not passes):**

- **Production.** There is no authorised access to the authenticated production
  environment from this sandbox. The deployed Worker version, the deployed commit,
  the applied production D1 migration state, environment bindings, Cloudflare
  Access behaviour, and every production module were **not** verified. See §19.
- **Full Playwright E2E suite.** Not run here. The suite is 67 spec files sharded
  14 ways for a ~1-hour CI run against two locally-built servers; CI is its
  authoritative home. It was **not** relied upon for any pass in this report, and
  it does **not** cover either P1 defect (§13).
- **PWA on physical hardware.** Never performed — acknowledged in the repository
  itself (the PWA-01 manual device checklist is unrun).

---

## 5. Method

1. Recorded the exact branch/commit and confirmed `main == origin/main`.
2. Read every applicable `AGENTS.md`, the root README, and the canonical roadmap,
   debt register, release checklists/notes, prior audit reports, deployment,
   migration, architecture, identity, PWA and export documentation.
3. Reviewed recent substantial commits and the package scripts and CI workflows.
4. Ran the full repository-provided check suite with the strongest documented
   commands (§6–§7).
5. Mapped the application (routes, kernel, repositories, modules, service worker,
   auth) and audited data integrity, security/privacy, and architecture, tracing
   representative operations through every layer.
6. Drove the running application across all modules at desktop and phone widths;
   exercised the record drawer, export, settings, command palette and search.
7. For the two most serious candidate defects, wrote an independent `node:sqlite`
   reproduction against the real committed migration schema rather than trusting a
   single analysis.
8. Reconciled every roadmap and debt status against the code that is actually on
   `main`.

---

## 6. Commands run

All commands were run at `ca3577d`. Durations are wall-clock in this sandbox.

| Command | Result | Duration | Reproducible |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 | ~21 s | yes |
| `pnpm run format:check` | ✅ exit 0 | ~30 s | yes |
| `pnpm run lint` | ✅ exit 0 | ~33 s | yes |
| `pnpm run typecheck` | ✅ exit 0 | ~42 s | yes |
| `pnpm run icons:check` | ✅ exit 0 | ~11 s | yes |
| `pnpm run test:unit` | ✅ exit 0 | ~134 s | yes |
| `pnpm run test:kernel` | ✅ exit 0 | ~228 s | yes |
| `pnpm run build` | ✅ exit 0 | ~10 s | yes |
| `pnpm run deploy:dry-run` | ✅ exit 0 | ~13 s | yes |
| `pnpm audit --prod` | ⚠️ exit 1 (1 high) | ~1 s | yes |
| `pnpm audit` | ⚠️ exit 1 (3 high) | ~1 s | yes |
| `node ./e2e/setup-dev-auth.mjs && node ./e2e/setup-local-db.mjs` | ✅ migrated + seeded | ~15 s | yes |
| running app driven in Chromium (16 routes × 2 viewports) | ✅ all HTTP 200 | — | yes |
| `node:sqlite` reproduction of AUDIT-01 / AUDIT-02 | ⛔ both defects reproduced | ~1 s | yes |
| `pnpm run test:e2e` (full Playwright) | **not run** (see §4) | — | CI-only here |

---

## 7. Test results

- **Unit / component (`vitest.config.ts`, happy-dom + RTL):** **301 files, 3,600
  tests, 0 failing, 0 skipped.** (Transient `ECONNREFUSED 127.0.0.1:3000` lines
  print at vitest start-up in this sandbox and do not affect the result — the run
  exits 0 with all tests green.)
- **Kernel / integration (`vitest.workers.config.ts`, real Workers runtime +
  Miniflare D1, committed migrations applied to a fresh DB — D1 not mocked):**
  **124 files, 1,778 tests, 0 failing, 0 skipped.**
- **Combined automated pass count executed here: 5,378 tests green.**
- **Build:** production build and credential-free `wrangler deploy --dry-run` both
  succeed.
- **Dependency audit:** `pnpm audit --prod` reports **1 high** — `react-router`
  `8.0.0` (GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass", patched in `8.3.0`). Full
  `pnpm audit` adds two dev-only advisories — `sharp` (via
  `@cloudflare/vite-plugin > miniflare`) and `brace-expansion` (via
  `eslint-plugin-jsx-a11y > minimatch`). See [AUDIT-12].
- **E2E:** not run in this environment; CI is authoritative. Note that CI green is
  not evidence for [AUDIT-01] or [AUDIT-02] — neither flow is covered (§13).

---

## 8. Product completeness assessment

Measured against what is actually built and reachable, not against checkboxes:

- **Genuinely complete and working (verified running + tested):** Today, Tasks
  (collection, drawer, planning, waiting, inbox, saved views), Projects, Areas,
  Goals & alignment, Notes (Markdown editor, backlinks, record links, export),
  Diary, Meetings (record, follow-up→task), People (relationship timeline),
  Assets (history, obligations), Reviews (foundation), Settings, the seven-theme
  system, Search, the Command palette, Help, About/version, and full workspace
  Export. The AI surface is an honest "Coming Soon" placeholder, exactly as the
  roadmap states.
- **Complete but carrying a confirmed release-blocking defect:** **Tasks
  recurrence** ([AUDIT-01]) and **Meetings item editing** ([AUDIT-02]). These two
  items are marked ☑/complete in the roadmap; the code does not support that claim
  for these specific flows.
- **Honestly incomplete, as documented:** backup/restore (SET-02, deferred; the
  in-product "Not available yet" copy is accurate), the AI phase, imports/sync,
  and the named mobile remainders (PEOPLE-04/ASSET-03/REVIEW-04) and cross-module
  saved views (X-02).

**Adversarial claim tested — "All major modules are complete":** *disproved as
stated.* Two modules ship a core workflow that fails on a normal interaction. The
weaker, true statement is: all major modules are *built and mostly work*, with two
specific, reproducible failures.

---

## 9. Module-by-module assessment

Legend: **Built+verified** = rendered running and/or covered by passing tests and
traced through the layers; **Defect** = confirmed failure; **Gap** = unverified.

| Module | State | Notes |
|---|---|---|
| Today | Built+verified | Real seeded data; brief, insights, capture, personalisation; clean at 1280 and 390. Greeting adapts to owner-local hour. |
| Tasks | Built+verified **+ P1 defect** | Collection/drawer/planning/waiting/inbox/saved-views all work. **[AUDIT-01]** breaks recurring-task re-completion. |
| Areas / Goals | Built+verified | Spine projections, alignment, archive/permanent-delete guards (AREA-05) are well-tested. |
| Projects | Built+verified | Overview/health/knowledge/activity/settings/mobile all present. |
| Notes | Built+verified | Markdown editor, backlinks, `dalyhub://` record links, per-note export. Concurrent-save LWW risk [AUDIT-08]. |
| Diary | Built+verified | Chronology-first; deliberately no archive (delete/restore only) and no Activity route — an accepted, documented variance (DEBT-02/DEBT-46). |
| Meetings | Built+verified **+ P1 defect** | Record, follow-up→task, people history all work. **[AUDIT-02]** breaks item editing after a non-last removal. Non-atomic item→task conversion [AUDIT-13]. |
| People | Built+verified | First-class relationship entity, unified timeline. Mobile remainder (PEOPLE-04) open. |
| Assets | Built+verified | Richest module (history, obligations, meters). Permanent delete writes **no tombstone event** and destroys history [AUDIT-03]. Hard-coded Sydney timezone [AUDIT-14]. |
| Reviews | Built+verified | Good empty state. Permanent delete has an event-ordering/idempotency defect [AUDIT-04]. |
| Search / Command palette | Built+verified | Registry-driven providers; palette opens on ⌘K; results resolve to real records. |
| Settings / Themes | Built+verified | Sectioned IA; honest "Not available yet"; seven themes. Help copy contradicts theme count [AUDIT-09]. Multi-device preference LWW [AUDIT-07]. |
| Help / About | Built+verified | Typed content; single version authority. One stale sentence [AUDIT-09]. |
| Export | Built+verified | ZIP with checksums that verify; workspace-scoped; no secrets. Excludes `workspace_members`, so exported actor ids are unresolvable offline [AUDIT-03-adjacent / P3]. |
| AI | Placeholder (honest) | "Coming Soon"; no proposal store, model client or credential — correct state. |
| PWA / Offline | Built, **device-unverified** | Service worker, 15-day-wide snapshot, append-only capture queue. Logout does not clear local data (DEBT-68 / [AUDIT security F2]). Device testing never done. |

---

## 10. Data-integrity assessment

Data integrity is the strongest and the weakest part of the system at once.

**Strong, and verified:**

- **Workspace isolation is real and DB-enforced.** Every repository is
  workspace-bound at construction; every SELECT/UPDATE/DELETE binds `workspace_id`;
  composite foreign keys `(workspace_id, id)` make cross-workspace references
  structurally impossible; workspace selection is server-config-only and never a
  request value. No leakage path was found. ("Workspace isolation cannot leak" —
  *upheld.*)
- **Atomicity discipline is generally excellent.** Domain mutations and their
  Activity event run in one `D1Database.batch()` with the event guarded on the
  domain statement's `changes()`, and fault-injection tests prove rollback.
- **EntityLinks are duplicate-proof and lifecycle-correct**; timestamps are
  uniformly app-generated ISO-8601 UTC; pagination is deterministic keyset
  ordering with tie-breakers; offline capture idempotency is DB-arbitrated.

**Weak, and confirmed:** the failure mode the audit was told to hunt for —
"records that cannot be completed/deleted/edited because a dependent row or a
uniqueness constraint blocks it, surfaced to the user as a generic error" — exists
in **four** places:

- **[AUDIT-01]** recurring-task re-completion (P1, reproduced).
- **[AUDIT-02]** meeting-item remove-then-add (P1, reproduced).
- **[AUDIT-03]** asset permanent deletion writes no audit event and destroys all
  `asset_events`/`asset_obligations` history with no tombstone (P2).
- **[AUDIT-04]** review permanent deletion breaks the activity-recorder ordering
  contract → a non-deterministic or empty tombstone and a non-idempotent
  second-purge that raises an FK error instead of an idempotent no-op (P2).

Both permanent-delete paths (assets, reviews) are also inconsistent with the
**Area** permanent-delete path, which is the correct model: it guards against
dependents at commit time, deletes child-first, retains the append-only
`activities` rows, and writes an `area.deleted` tombstone carrying `{areaId,
title}`. That pattern should be the template for the other two.

"Delete and archive operations preserve integrity" — **partly disproved**:
archive/soft-delete are sound; *permanent* delete is inconsistent and, for assets,
silently un-audited.

---

## 11. Security and privacy assessment

The security posture is, on the whole, strong and fails closed where it matters.

**Verified sound:** Cloudflare Access JWT verification enforces signature (remote
JWKS), issuer, audience, RS256-only, explicit `exp`, service-token rejection and
independent owner-email enforcement; it reads the `Cf-Access-Jwt-Assertion` header
only, never the cookie. Missing/empty Access config **fails closed** (503 on every
protected request). Dev-auth is double-gated (`AUTH_MODE=development` **and**
`ENVIRONMENT∈{development,test}`) and stripped from the build, so it cannot leak to
production. Only `/health` is public. The Markdown pipeline drops raw HTML before
DOM, sanitises against a frozen allowlist, and has exactly one branded
`dangerouslySetInnerHTML` sink guarded by a repository test. No SQL injection was
found (267 prepared statements; interpolated fragments are placeholder strings or
enum-selected literals). No hardcoded secrets; deploy secrets go through a `0600`
temp file removed in `finally`. ("Production deployment safeguards cannot be
bypassed accidentally" — *upheld for the committed tooling*; the safeguards are
well-built and test-guarded.)

**Confirmed gaps:**

- **[AUDIT-05] No application-level CSRF defence (P2).** No `Origin` /
  `Sec-Fetch-Site` / `Referer` check exists on any mutation; the app mints no CSRF
  token and holds no session cookie, relying entirely on the Cloudflare Access
  cookie's `SameSite` attribute (set by Cloudflare, not this code, and not
  asserted anywhere). Ordinary cross-*site* CSRF is blocked under the `Lax`
  default, but a compromised or XSS'd **sibling subdomain of `daly.id.au` is
  same-site** and its requests carry the Access cookie; if Access is ever set
  `SameSite=None`, plain CSRF works. The related dependency advisory [AUDIT-12] is
  in the same problem area.
- **Offline data persists after logout (P2, = DEBT-68).** Note/diary excerpts,
  meeting titles and attendee names live in IndexedDB and are not cleared on
  logout; on a shared/stolen device they remain readable for up to the retention
  window. Acknowledged in-product and in DEBT-68.
- **[AUDIT-10] CSP provides no XSS mitigation (P3)** — only `base-uri`,
  `frame-ancestors`, `object-src`; no `script-src`/`default-src`, so the sanitiser
  is the sole script-injection defence with no second layer.
- **[AUDIT-11] Full production D1 dump stored as a GitHub artifact, 30-day
  retention (P2/P3)** — correct credential handling, but the dump itself is all
  personal data and its exposure scales with who can read the repo's Actions.

No P0 was found. "The application surfaces data only to the owner" holds at the
server boundary; the residual exposure is client-side (offline cache) and
CI-artifact-side, both documented above.

---

## 12. Architecture assessment

The architecture is coherent and matches its ADRs: a small kernel (entities,
EntityLinks, activity, workspaces, module registry) with modular userland,
storage-independent repository contracts with D1 adapters, a self-registering
module registry discovered by glob (no central switch), and one shared design
system. Type safety is strong (no `any` in the kernel), errors are typed, and the
composition boundary is explicit.

**Maintainability observations (P3):** the largest files are very large
(`d1-task-repository.ts` 4,706 lines; `d1-asset-history-repository.ts` 2,184;
`TodayDashboard.tsx` 1,795) and will resist change. A handful of genuine
**dead/duplicate** artefacts exist: `ModulePlaceholder.tsx` is superseded by
`ModuleComingSoon.tsx`; `app/modules/notes/use-online-status.ts` duplicates the
shared `app/shared/linked-items/use-online-status.ts` (the shared one's header
says it was promoted from the Notes copy, which was never removed); and two
different `NewTaskForm.tsx` implementations share the name across the Projects and
Tasks modules. The entity-type list is split-brain: the kernel treats `EntityType`
as `string` while the concrete enum is hand-maintained in `app/shared/entity`.
Calendar-"today" is defined twice — a hard-coded `Australia/Sydney` in the asset
and datetime paths versus the stored timezone preference elsewhere [AUDIT-14].
**Case-sensitivity:** checked the full git index for lowercase-collision paths —
**none** (safe on default macOS filesystems). Two migrations share the number
`0013` — known, frozen (DEBT-40), order-independent, and guarded by a test.

---

## 13. Testing assessment

The automated suite is large, real (kernel tests use the actual Workers runtime
and D1, not mocks), and green. It is also where the two P1 defects hid, which is
the important finding of this section: **coverage is broad but has specific
negative-path holes on exactly the flows that fail.**

- **[AUDIT-01] has no test.** `test/kernel/task-recurrence-storage.test.ts`
  exercises the withdraw/retain outcomes of *reopen* but never *completes the
  reopened occurrence again* — the step that collides. The correct guard pattern
  (`NOT EXISTS (series, sequence)`) already exists in the asset-obligation
  successor insert, so the codebase knows the shape of the fix but the task path
  neither applies it nor tests for its absence.
- **[AUDIT-02] has no test.** `test/kernel/meeting-follow-up.test.ts` adds items
  repeatedly but never removes a non-last item and adds again.
- **Permanent-delete audit/idempotency (AUDIT-03/04) are under-asserted:** the
  asset and review purge tests assert row deletion but never count the tombstone
  event or race two concurrent purges.
- **Multi-device concurrency (AUDIT-07/08) is untested** — the preference and
  note-content repositories have no lost-update test.

The three-layer accessibility strategy (jsx-a11y, contrast unit tests, an axe-core
Playwright gate) is a real strength, though the gate globally disables four axe
rules (`color-contrast`, `landmark-unique`, `nested-interactive`,
`aria-required-children`), each for a documented, ADR-backed reason tracked as open
P3 debt (DEBT-14/15/…); "the application is accessible" is **well-supported but not
fully proven** — the disabled rules and the never-run screen-reader/device pass are
honest gaps, not silent ones.

---

## 14. UX and accessibility assessment

Directly observed in the running application (desktop 1280×900, phone 390×844):

- **Visual consistency is high.** The card-on-tint system is applied uniformly;
  the Today command centre, task drawer, collections, empty states and settings
  all share one chrome. No layout gaps, overflow, or broken responsive transitions
  were seen at either width across all 16 surfaces (measured: `scrollWidth` never
  exceeded `clientWidth`).
- **Empty states teach the next action** (e.g. Reviews: "No Reviews yet" + "New
  Review" + "What Reviews are for") — no dead ends observed.
- **The record drawer is genuinely complete** (Details/Linked/Activity tabs,
  scheduling shortcuts, waiting, priority, description, edit).
- **Honesty in copy is a deliberate strength** — the AI placeholder, the Settings
  "Not available yet" group, and the export "an export is not a restore" caveat
  are all accurate. The **one** contradiction found is [AUDIT-09] (Help says
  "choose from the five [themes]" while seven ship).
- **Accessibility affordances** (skip link, landmarks, keyboard-operable controls,
  focus management on the drawer) are present and the automated gate is enforced.
  Screen-reader semantics and contrast-in-practice were **not** independently
  verified beyond the automated gate.

Directly observed / demonstrated-by-tests / inferred-from-source / not-verified are
distinguished throughout; the running-app claims here are *directly observed*.

---

## 15. PWA and offline assessment

The offline milestone (PWA-01/PWA-11) is built: a first-party service worker with
an allow-listed cache strategy and one cacheable HTML document, a namespaced
IndexedDB snapshot spanning the previous seven calendar days + today + next seven
(fifteen days wide), and an append-only capture queue for Inbox tasks, quick notes
and diary entries with DB-level idempotency. The code is careful and the offline
boot-loop hardening (PWA-11) is thorough.

**It is not production-ready by the repository's own standard:** physical-device
testing has never been performed (the manual checklist is unrun), and hydrated
offline rendering from the production bundle is not covered by automation
(DEBT-70). Logout does not clear local data (DEBT-68). "Offline support works end
to end" — **not verifiable**; treat it as built and automatically tested at the
unit/kernel layer, but device-unverified.

---

## 16. Deployment and operational assessment

The deploy tooling is unusually careful: two entry points only (credential-free
dry-run for CI; a guarded `deploy:production`), a preflight that refuses to upload
while any committed placeholder survives, atomic secret upload via a temp
`--secrets-file`, a worker-name guard against the historical
`-production-production` double-suffix, a post-deploy health assertion, and a
daily automated production-D1 **export** workflow. Rollback is Worker-only and
forward-only for migrations, documented honestly, with the service worker called
out as the one thing that outlives a rollback.

**Operational gaps:** restore does not exist and is honestly deferred (SET-02); the
production-D1 backup is a readable copy, not a tested recovery path; and the audit
found **documentation drift about production state itself** ([AUDIT-06]) that an
operator would trip over — see §17 and §19.

---

## 17. Documentation accuracy assessment

Documentation quality is high and, unusually, mostly honest about its own gaps. The
drift that exists is concentrated and worth correcting:

- **[AUDIT-06] Production state is described inconsistently.** `README.md` states
  "Current release: DalyHub V2 (`2.0.1`)" and "deployed to Cloudflare Workers and
  used daily", while `docs/development/DEPLOYMENT.md` in places reads "Next: the
  V2.0.1 hotfix" and fixes production at the `0001`–`0025` schema, and the
  migration-count prose drifts across `0025`/`0027`/`0028` in one section.
  Migrations `0026`–`0028` (Modern themes, offline capture receipts, identity) are
  **not recorded anywhere as applied to production.** From this environment none of
  it can be confirmed either way; the point is that the docs disagree with each
  other.
- **[AUDIT-09] Help contradicts itself on theme count** — "Seven themes" in the
  lead and body, but the "What is not here yet" list still says "choose from the
  five; you cannot yet make a sixth."
- **AUDIT-IDENTITY-01** is marked **RESOLVED 2026-08-04** in `PRODUCT_DEBT.md`
  (via IDENT-01 / migration 0028), but `ROADMAP_V2.md`'s closure log still records
  it as "carried forward as outstanding", and the fix is a code/`main` claim that
  is **not production-verified** (0028 not recorded as applied to production).
- **README "Status" section** still describes pre-closure work ("wiring Today's
  Quick Capture", "Asset history and renewals", "Full export … then backup") as if
  in progress, though those shipped — mildly contradicting README's own "roadmap is
  closed" header.
- The **7-day vs 15-day** snapshot naming and the **five vs seven** theme count are
  used loosely across several docs; both are reconcilable but read as contradictions.

"The roadmap accurately reflects implementation" and "the debt register is complete
and current" — **partly disproved**: the roadmap marks TASKS-04 and the meeting
module complete despite the two P1 defects, and neither the register nor the
roadmap carried the four data-integrity defects or the CSRF gap until this audit.
This report's companion updates to `ROADMAP_V2_1.md` and `PRODUCT_DEBT.md` close
that gap.

---

## 18. Findings by severity

Full detail for each finding — evidence, files/symbols, reproduction, expected vs
actual, impact, why tests missed it, recommended fix, required regression test,
size, and blocking status — is in [Appendix A](#appendix-a--detailed-findings).
Summary:

**P0 (immediate security / data-loss / outage):** none.

**P1 (release-blocking / serious user-impacting) — 2, both confirmed & reproduced:**

| ID | Title | Module | Blocks daily use |
|---|---|---|---|
| AUDIT-01 | Recurring task cannot be completed again after reopen (UNIQUE rollback) | Tasks | Yes (recurring-task users) |
| AUDIT-02 | Meeting item remove-then-add of same kind throws HTTP 500 | Meetings | Yes (meeting editing) |

**P2 (material defect / significant risk) — 5:**

| ID | Title | Status |
|---|---|---|
| AUDIT-03 | Asset permanent delete writes no audit event; destroys history untombstoned | Confirmed (code) |
| AUDIT-04 | Review permanent delete: nondeterministic/empty tombstone, non-idempotent under race | Confirmed (code) |
| AUDIT-05 | No application-level CSRF defence (relies on Access cookie SameSite) | Confirmed (absent) |
| AUDIT-06 | Production-state documentation drift; production unverifiable from here | Confirmed (docs) + verification gap |
| AUDIT-11 | Daily full production-D1 dump stored as GitHub artifact (30-day retention) | Confirmed |

**P3 (minor defect / inconsistency / polish) — 9:**

| ID | Title | Status |
|---|---|---|
| AUDIT-07 | Multi-device preference lost-update (`version` never enforced) | Confirmed (code) |
| AUDIT-08 | Concurrent note-content saves are blind last-write-wins (links DEBT-47) | Confirmed (code) |
| AUDIT-09 | Help "choose from the five themes" contradicts the seven that ship | Confirmed |
| AUDIT-10 | CSP has no `script-src`/`default-src` (no XSS defence-in-depth) | Confirmed |
| AUDIT-12 | `react-router@8.0.0` advisory GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF; patched 8.3.0) | Confirmed (RSC-specific) |
| AUDIT-13 | Non-atomic cross-repository flows (meeting→task, obligation→task) | Confirmed (code) |
| AUDIT-14 | Two "owner today" definitions (hard-coded Sydney vs stored tz) | Confirmed (code) |
| AUDIT-15 | Soft-deleted Inbox (parentless) task cannot be restored — latent (no delete UI) | Confirmed (code), latent |
| AUDIT-16 | Dead/duplicate code (`ModulePlaceholder`, dup `use-online-status`, dup `NewTaskForm`) | Confirmed |

**Verification gaps — 5:** VG-01 production environment; VG-02 PWA device testing;
VG-03 offline hydrated rendering not automated; VG-04 identity fix not
production-verified; VG-05 full E2E suite not run here. See §19.

Totals: **P0 = 0, P1 = 2, P2 = 5, P3 = 9, verification gaps = 5.**

---

## 19. Required local and production verification

Because production could not be reached, the following is a precise, **read-only**
checklist an owner with authorised access must complete before any "production
verified" claim. Do not paste credentials into source or logs.

**Deployment identity**
- [ ] `GET https://hub.daly.id.au/health` returns `{"status":"ok","name":"DalyHub","environment":"production","version":"<expected>"}` (direct, redirects disabled — an Access redirect means the probe hit the gated origin).
- [ ] Deployed Worker is `dalyhub-v2-production` (never `-production-production`).
- [ ] Deployed build commit (About / `BUILD_COMMIT`) matches the intended release commit.
- [ ] `pnpm run db:production:list` shows the expected applied migration set, and whether `0026`, `0027`, `0028` are applied (see [AUDIT-06]).

**Access / auth / isolation**
- [ ] An unauthenticated request to a protected route is rejected (fail-closed), not served.
- [ ] `*.workers.dev` origin returns 404 and Preview URLs are disabled.
- [ ] The authenticated owner shell loads; a non-owner Access identity is refused.
- [ ] Workspace resolves to the provisioned production workspace id.

**Every primary module (production data)**
- [ ] Today, Tasks, Projects, Areas, Goals, Notes, Diary, Meetings, People, Assets, Reviews, Settings, Search, Command palette each load and show real data.
- [ ] **Recurring task:** complete → reopen → complete again (this is [AUDIT-01]; expected to FAIL today).
- [ ] **Meeting items:** add three agenda items, remove the first, add a fourth (this is [AUDIT-02]; expected to FAIL today).
- [ ] Actor-name attribution shows the real person (not "Someone"/"Unknown user") on recent and historical events; run `pnpm run identity:report:production` (dry-run) to confirm 0028 + repair state ([VG-04]).
- [ ] Activity feeds render with no "Unrecognised event".

**Layout / PWA / offline / data**
- [ ] Desktop and phone layouts have no overflow on production data.
- [ ] PWA installs; offline launch renders the shell (not a crash loop); offline capture queues and re-syncs; reconnection works — the unrun PWA-01 device checklist ([VG-02]).
- [ ] Export downloads; `sha256sum -c CHECKSUMS.txt` passes; then delete the export file.
- [ ] Browser console shows no errors and no failed network calls on the primary routes.
- [ ] Backup workflow has at least one successful artifact; rollback path (Worker rollback + SW unregister) is understood.

Every unchecked item above is a **verification gap**, not a pass.

---

## 20. Recommended remediation sequence

Ordered by the audit's required priority. Grouped into safely-shippable PRs; each
is scoped, not a mixed grab-bag. Full PR specs are in
[`ROADMAP_V2_1.md` → Immediate blockers / Near-term remediation](../roadmap/ROADMAP_V2_1.md).

1. **PR-A — Recurring-task re-completion (AUDIT-01).** Delete the withdrawn
   successor's `task_recurrence_rules` row inside the withdraw batch, **or** guard
   `#planSuccessor`/the successor insert with `NOT EXISTS (series_id, sequence)`
   (mirroring the asset-obligation path). Regression test: complete → reopen →
   complete a recurring occurrence and assert the second completion succeeds and no
   duplicate series row exists. Risk: low. Blocks release: yes.
2. **PR-B — Meeting item positioning (AUDIT-02).** Derive `position` as
   `MAX(position)+1` for the kind (or renumber on remove), and wrap the raw
   `Error` in a typed, user-legible failure. Regression test: add-remove-add of the
   same kind. Risk: low. Blocks release: yes.
3. **PR-C — Permanent-delete integrity (AUDIT-03, AUDIT-04).** Bring asset and
   review purge onto the Area purge pattern: guarded child-first delete, retained
   `activities`, a subject-less tombstone with `{id, title}`, idempotent
   second-purge. Regression tests: tombstone presence + double-purge idempotency +
   active-link handling. Risk: medium.
4. **PR-D — CSRF defence-in-depth + dependency bump (AUDIT-05, AUDIT-12).** Add an
   `Origin`/`Sec-Fetch-Site` allowlist at the mutation boundary; bump
   `react-router` to ≥ 8.3.0. Regression test: authenticated cross-origin mutation
   is rejected. Risk: medium (routing bump needs the full suite).
5. **PR-E — Documentation truth pass (AUDIT-06, AUDIT-09, README status).** This
   audit report already lands roadmap/debt updates; PR-E reconciles README status,
   the Help theme sentence, DEPLOYMENT production-state prose, and the
   AUDIT-IDENTITY-01 roadmap/production wording. Risk: none (docs).
6. **PR-F — Concurrency & observability debt (AUDIT-07, AUDIT-08, AUDIT-13).**
   Optimistic `version`/`updated_at` preconditions on preferences and note content;
   atomicity or compensation notes on the cross-repo flows. Risk: medium.
7. **PR-G — Security/ops hardening (AUDIT-10, AUDIT-11).** A `script-src` CSP;
   encrypt or tighten retention on the production-D1 artifact.
8. **PR-H — Cleanup (AUDIT-14, AUDIT-16).** One owner-timezone source; remove
   dead/duplicate modules.

Verification gaps (§19) are worked through by the owner in parallel; they gate the
"production verified" claim, not the code PRs.

---

## 21. Release recommendation

**Do not cut a release that is represented as production-ready until AUDIT-01 and
AUDIT-02 are fixed with regression tests (PR-A, PR-B).** They are release-blocking
by the plain definition: a core, documented feature fails on a normal interaction
and the failure is unrecoverable in-product (AUDIT-01) or a raw 500 (AUDIT-02).
PR-C (permanent-delete integrity) and PR-D (CSRF + dependency) should ship in the
same release train given they are P2 data-integrity/security items with small
blast radius. Everything else is post-release.

---

## 22. Daily-driver recommendation

**Not yet, for a user who relies on recurring tasks or on editing meeting notes** —
the two P1 defects will be hit by ordinary use and one of them permanently bricks a
task. For a user who avoids those two specific flows, the product is already a
capable daily driver: capture, planning, projects/areas/goals, notes, diary,
people, assets and export all work and are pleasant. After PR-A and PR-B, the
honest recommendation becomes **"daily-driver-ready with known limitations"** — the
limitations being production verification (§19), PWA device testing, and the
multi-device concurrency edges (AUDIT-07/08), none of which blocks a single-device
daily user.

---

## 23. Known limitations of the audit

- **Production was not accessed or verified** (no authorised access from this
  sandbox). Every production claim in the repository remains a claim; §19 is the
  checklist to close it.
- **The full Playwright E2E suite was not run here** (CI-only, ~1 h, 14 shards). It
  was not relied upon for any pass, and it does not cover the two P1 defects.
- **P2/P3 findings marked "confirmed (code)" were confirmed by reading the exact
  code path and schema, not always by runtime reproduction.** The two P1 defects
  *were* reproduced against the real committed migrations via `node:sqlite`; the
  reproduction is deterministic and repeatable.
- **Screen-reader, real-device touch, and contrast-in-practice** were not
  independently tested beyond the automated axe/keyboard gate.
- This audit changed **no application code**; the two blockers were reproduced and
  left for the sequenced remediation PRs.

---

## Appendix A — Detailed findings

Each finding: severity · module · status · evidence (files/symbols) · reproduction
· expected vs actual · user impact · data/security impact · why tests missed it ·
recommended resolution · required regression test · size · blocks release · blocks
daily use · related roadmap/debt.

### AUDIT-01 — Recurring task cannot be completed again after reopen — P1

- **Module:** Tasks (TASKS-04 recurrence). **Status:** Confirmed (reproduced).
- **Evidence:** `app/platform/storage/d1/d1-task-repository.ts` —
  `completeTask` (`:3347`) plans a successor unconditionally via `#planSuccessor`
  (`:3372`, `:3468` returns `sequence: series.sequence + 1`); the reopen path's
  `#withdrawSuccessorStatement` (`:3993`) soft-deletes only the successor's
  `entities` row and never its `task_recurrence_rules` row;
  `#insertRecurrenceStatement` (`:1104`) uses `ON CONFLICT (workspace_id,
  entity_id)` which does not cover the `UNIQUE (workspace_id, series_id, sequence)`
  constraint from `migrations/0024_tasks04_daily_driver.sql:57`. The completion
  batch (`#runCompleteBatch`, `:3678`) throws `TaskStorageError` on constraint
  failure and rolls back.
- **Reproduction (deterministic, against the committed migrations via
  `node:sqlite`):** create a recurring task (series root, seq 0) → complete
  (successor at seq 1 created) → reopen (successor entity soft-deleted; its
  recurrence row at seq 1 survives) → complete again → `UNIQUE constraint failed:
  task_recurrence_rules.workspace_id, series_id, sequence`. UI path: the task
  checkbox posts `intent=complete`/`reopen` (`TasksWorkspace.tsx:374`,
  `TaskRecordDrawer.tsx:196`).
- **Expected:** re-completing a reopened recurring occurrence succeeds and yields
  exactly one successor. **Actual:** the completion is rejected; the occurrence can
  never be completed again (there is no in-product path to remove the orphaned
  recurrence row).
- **User impact:** a recurring task that is checked, unchecked, then checked again
  becomes permanently un-completable — silent, unrecoverable data-workflow loss on
  a headline feature. **Data impact:** no corruption written (the batch rolls
  back), but the record is wedged.
- **Why tests missed it:** `test/kernel/task-recurrence-storage.test.ts` tests
  reopen outcomes but never re-completes the reopened occurrence.
- **Fix:** delete the successor's recurrence row inside the withdraw batch, or add
  `NOT EXISTS (series_id, sequence)` to the successor insert (the
  asset-obligation path at `d1-asset-history-repository.ts:1568` already does
  this). **Regression test:** complete→reopen→complete asserts success + single
  series row. **Size:** small. **Blocks release:** yes. **Blocks daily use:** yes
  (recurring-task users). **Roadmap:** reopen TASKS-04. **Debt:** testing gap.

### AUDIT-02 — Meeting item remove-then-add of same kind throws HTTP 500 — P1

- **Module:** Meetings. **Status:** Confirmed (reproduced).
- **Evidence:** `app/platform/storage/d1/d1-meeting-repository.ts` — `addItem`
  (`:428`) computes `position = meeting.items.filter(kind).length` (`:439`);
  `removeItem` (`:457`) deletes a row and never renumbers; the `UNIQUE
  (workspace_id, meeting_id, kind, position)` constraint is
  `migrations/0021_ux01_tasks_meetings_usability.sql:31`. The route
  `app/modules/meetings/routes/mutate.tsx:62` calls `removeItem`; the raw `Error`
  is unwrapped.
- **Reproduction (`node:sqlite`, committed migrations):** three agenda items at
  positions 0,1,2 → remove position 0 (remaining 1,2) → `addItem` computes
  `position = count = 2` → `UNIQUE constraint failed: meeting_items … position`.
  UI path: `onRemoveItem` (`meetings/routes/detail.tsx:435`) + the add-item control.
- **Expected:** adding an item after removing a non-last one succeeds. **Actual:**
  raw error → HTTP 500; that item kind stays un-addable until the trailing item is
  also removed. Concurrent same-kind adds also race to one position.
- **User impact:** editing a meeting's agenda/decisions/outcomes/actions — the core
  meetings workflow — fails with an opaque error after an ordinary edit sequence.
- **Why tests missed it:** `test/kernel/meeting-follow-up.test.ts` never removes a
  non-last item and adds again.
- **Fix:** `position = MAX(position)+1` per kind (or renumber on remove); wrap the
  error in a typed failure. **Regression test:** add-remove-add of one kind.
  **Size:** small. **Blocks release:** yes. **Blocks daily use:** yes (meetings).
  **Roadmap:** reopen MEET-01 item editing.

### AUDIT-03 — Asset permanent delete writes no audit event and destroys history — P2

- **Module:** Assets. **Status:** Confirmed (code).
- **Evidence:** `app/platform/storage/d1/d1-asset-repository.ts:842` —
  `permanentlyDelete` batch (`:930`) is six DELETEs with **no `activities`
  insert**; `asset_events`/`asset_obligations` are hard-deleted in the same batch,
  and `activity_subjects` pointers are removed, so the workspace feed keeps no
  tombstone that the asset (and its entire service/financial history) ever existed.
  Contrast the Area purge (`d1-spine-repository.ts:1481`) which writes an
  `area.deleted` event with `{areaId, title}`.
- **Impact:** irreversible loss of an asset's history with no audit trail that a
  destruction occurred — weakens the "Activity is the audit trail" guarantee.
- **Why tests missed it:** the asset purge test asserts row deletion only, never
  counts events. **Fix:** add a guarded `asset.deleted` tombstone to the purge
  batch. **Regression test:** count the tombstone event after purge. **Size:**
  small. **Blocks release:** no. **Blocks daily use:** no. **Debt:** new.

### AUDIT-04 — Review permanent delete: nondeterministic/empty tombstone, non-idempotent — P2

- **Module:** Reviews. **Status:** Confirmed (code).
- **Evidence:** `app/platform/storage/d1/d1-review-repository.ts:538` — the purge
  batch orders the append-activity statements before the deletes and lets the
  batch's own `deleteSubjects` remove the event's subject row; the event payload is
  `{}` (`:544`), so a surviving tombstone cannot name the deleted review. The
  recorder contract (`d1-activity-recorder.ts:44`) requires the guarded event
  insert to directly follow its domain statement (guard `WHERE changes() > 0`); a
  raced second purge fails on the subject-insert FK → `ReviewStorageError` instead
  of an idempotent `{deleted:false}`. Active links are silently destroyed (unlike
  the asset purge, which refuses while active links exist).
- **Impact:** unreliable audit trail on review deletion; a concurrent double-delete
  errors instead of no-op'ing. **Fix:** adopt the Area purge ordering + `{id,
  title}` payload + idempotent guard. **Regression test:** tombstone presence +
  double-purge idempotency. **Size:** medium. **Blocks release:** no. **Debt:** new.

### AUDIT-05 — No application-level CSRF defence — P2

- **Module:** Security (request boundary). **Status:** Confirmed (absent).
- **Evidence:** no `Origin`/`Sec-Fetch-Site`/`Referer` check on any mutation;
  `app/platform/request/request-boundary.ts:61` authenticates but performs no
  origin check; no CSRF token is minted or verified anywhere; there is no app
  session cookie (auth rides the Cloudflare Access `CF_Authorization` cookie).
  ADR-016's CSRF reasoning only addresses token *forgery*, not session-riding CSRF,
  and nothing asserts the Access cookie's SameSite.
- **Impact:** a compromised/XSS'd sibling subdomain of `daly.id.au` is same-site
  and can drive authenticated mutations (delete a note, run a command); a future
  `SameSite=None` Access config opens plain cross-site CSRF. **Fix:** an
  `Origin`/`Sec-Fetch-Site` allowlist at the mutation boundary (cheap;
  complements Access). **Regression test:** authenticated cross-origin mutation is
  rejected. **Size:** small. **Blocks release:** no (defence-in-depth), but ship
  with the P1s. **Debt:** new; related to AUDIT-12.

### AUDIT-06 — Production-state documentation drift; production unverifiable here — P2

- **Module:** Docs / Ops. **Status:** Confirmed (docs) + verification gap.
- **Evidence:** `README.md` "Current release … `2.0.1` … used daily" vs
  `docs/development/DEPLOYMENT.md` places reading "Next: the V2.0.1 hotfix" and
  fixing production at `0001`–`0025`; migration-count prose drifts `0025`/`0027`/
  `0028`; migrations `0026`–`0028` not recorded as applied to production;
  AUDIT-IDENTITY-01 "RESOLVED 2026-08-04" in the debt register vs "carried forward
  as outstanding" in the roadmap closure log. **Impact:** an operator cannot tell
  what production runs. **Fix:** one authoritative production-state statement (PR-E)
  + the §19 verification. **Size:** small (docs). **Blocks release:** no.

### AUDIT-07 — Multi-device preference lost-update — P3

- **Status:** Confirmed (code). `d1-app-preferences-repository.ts:89` — `update`
  reads, merges, and upserts **every** column from the merged snapshot; `version =
  version + 1` (`:131`) is never used as a precondition. Two devices saving
  different fields from stale reads → one clobbers the other. **Fix:** optimistic
  `version`/`updated_at` precondition, or per-column upsert (as `updateTask` does).
  **Size:** small. **Debt:** new.

### AUDIT-08 — Concurrent note-content saves are blind last-write-wins — P3

- **Status:** Confirmed (code). `d1-note-details-repository.ts:128` — full-content
  overwrite guarded only against identical content; no base-version precondition.
  Two tabs/devices editing one note silently lose one side's content. Offline note
  *editing* is not shipped (PWA-02 deferred), so today's trigger is concurrent
  online editing. Links **DEBT-47**. **Fix:** base-version/`updated_at`
  precondition + reconciliation. **Size:** medium.

### AUDIT-09 — Help contradicts the shipped theme count — P3

- **Status:** Confirmed. `app/modules/help/help-content.ts:588` "Seven themes" and
  `:592` lists all seven, but `:662` still says "You can choose from the five; you
  cannot yet make a sixth." **Fix:** correct the sentence. **Size:** trivial.

### AUDIT-10 — CSP has no script-src/default-src — P3

- **Status:** Confirmed. `app/platform/request/security-headers.ts` sets only
  `base-uri 'none'; frame-ancestors 'none'; object-src 'none'`. No second layer
  behind the Markdown sanitiser. **Fix:** add a hash/nonce `script-src`. **Size:**
  medium (needs hydration-safe nonce). **Debt:** new.

### AUDIT-11 — Production D1 dump stored as a GitHub artifact — P2/P3

- **Status:** Confirmed. `.github/workflows/production-backup.yml` exports the
  whole production DB daily to a workflow artifact with 30-day retention;
  credentials are handled correctly but the dump is all personal data. **Fix:**
  encrypt the artifact or tighten retention/environment protection. **Size:**
  small. **Debt:** new.

### AUDIT-12 — react-router 8.0.0 dependency advisory — P3

- **Status:** Confirmed (RSC-mode-specific). `pnpm audit --prod` → GHSA-qwww-vcr4-
  c8h2, "RSC Mode CSRF Bypass", `>=7.12.0 <8.3.0`, patched `8.3.0`. DalyHub runs
  framework mode (not RSC), so the specific exploit likely does not apply, but it
  is on a direct production dependency and pairs with AUDIT-05. **Fix:** bump to ≥
  8.3.0 and run the full suite. **Size:** small–medium. **Debt:** new.

### AUDIT-13 — Non-atomic cross-repository flows — P3

- **Status:** Confirmed (code, documented in-code). Meeting item→task conversion
  (`app/modules/meetings/follow-up-operations.ts:32`) and obligation→task
  completion (`d1-asset-history-repository.ts:1468`, task completed in a separate
  transaction before the obligation batch) can leave inconsistent state / orphans
  on a mid-way failure. **Fix:** compensation or a single batch where feasible;
  otherwise a documented idempotent retry. **Size:** medium. **Debt:** new.

### AUDIT-14 — Two "owner today" definitions — P3

- **Status:** Confirmed (code). Task paths resolve the stored timezone
  (`tasks/routes/task-detail.tsx:375`); asset history/obligations and the
  obligation→task gateway hard-code `Australia/Sydney`
  (`app/shared/datetime/index.ts:18`). A non-Sydney owner gets day-shifted
  recurrence anchors/due-state between modules. Recurrence math is calendar-date
  (DST-immune); the risk is "which day is today". Adjacent to **DEBT-52**. **Fix:**
  one owner-timezone source. **Size:** medium.

### AUDIT-15 — Soft-deleted Inbox task cannot be restored (latent) — P3

- **Status:** Confirmed (code), latent. `spine.restore`
  (`d1-spine-repository.ts:1279`) requires an active structural parent for tasks;
  a parentless Inbox task (valid since TASKS-04) would throw
  `SpineParentUnavailableError` on restore. Latent because no task delete/restore
  UI exposes it today. **Fix:** allow restoring a parentless task to Inbox.
  **Size:** small. **Blocks:** no.

### AUDIT-16 — Dead/duplicate code — P3

- **Status:** Confirmed. `app/shared/shell/ModulePlaceholder.tsx` superseded by
  `ModuleComingSoon.tsx`; `app/modules/notes/use-online-status.ts` duplicates
  `app/shared/linked-items/use-online-status.ts`; `app/modules/projects/NewTaskForm.tsx`
  and `app/modules/tasks/NewTaskForm.tsx` share a name with different bodies.
  **Fix:** delete the superseded copies. **Size:** small. **Debt:** existing
  DEBT-01 family (duplicate implementations).

---

*Prepared as an independent, evidence-based audit. It grades DalyHub by what
reproduces, not by what is claimed. The two P1 blockers were reproduced and left
unfixed by design; their remediation and every finding above are sequenced in
[`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) and recorded in
[`PRODUCT_DEBT.md`](PRODUCT_DEBT.md).*
