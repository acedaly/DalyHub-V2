# DalyHub V2.0.1 — Release Checklist & Runbook

**Version `2.0.1` · Hotfix and release hardening · 2026-08-02**

> The evidence behind every V2.0.1 claim, and the exact sequence for deploying
> it. Nothing is marked ✅ without a reference. Where something is an OWNER
> action that has not happened yet, it is marked ⏳ rather than claimed.
>
> Legend: ✅ verified · ⚠️ verified with a stated limitation · ⏳ owner action
> still required · ⏭️ out of scope for this release.

---

## 1. Scope

V2.0.1 closes the confirmed V2 defects below and hardens release operations. It
is **not** V2.1; the [V2.1 roadmap](../roadmap/ROADMAP_V2_1.md) is unchanged and
nothing was moved out of it except as explicitly noted there. **No new D1
migration** — the sequence is unchanged at `0025`, so deploying V2.0.1 is a
Worker-only deploy.

## 2. Fixes, each mapped to its evidence

| Fix | Change | Evidence |
|---|---|---|
| Asset permanent deletion fails for any Asset with history events or obligations (`ON DELETE RESTRICT` rows never purged; UI said "try again" for an unwinnable retry) | `permanentlyDelete` now deletes `asset_events` and `asset_obligations` (including soft-deleted rows, which still hold the constraint) inside the SAME atomic `D1Database.batch()`, before the entity row. Foreign keys unchanged; link guard unchanged; archive/soft-delete unchanged. | `app/platform/storage/d1/d1-asset-repository.ts`; `test/kernel/asset.test.ts` — the six-table purge proof (no rows remain in `asset_events`, `asset_obligations`, `asset_details`, `entity_links`, `activity_subjects`, `entities`), the blocked-purge-removes-nothing proof, and the cross-workspace fail-closed proof |
| An Area referenced by `asset_details.area_id` could be permanently deleted (the guard only checked EntityLinks; Assets record their Area as a plain column with no FK) | The Area purge guard now also refuses while any `asset_details` row (including a soft-deleted Asset's) names the Area. | `app/platform/storage/d1/d1-spine-repository.ts`; `test/kernel/area-lifecycle.test.ts` — blocked while an active AND a soft-deleted Asset references the Area, then deletable once the Asset is purged |
| Meeting global search used the recent-only view (`starts_at < now`), so upcoming meetings were unfindable | New dedicated `searchMeetings` repository projection (the same pattern six other modules already use): one bounded query, no time window, archived/deleted excluded, title+location match only, deterministic upcoming-soonest / past-newest ordering, no window overlap so no duplicates. Provider now calls it. | `app/kernel/meetings/`, `app/platform/storage/d1/d1-meeting-repository.ts`, `app/modules/meetings/search.ts`; `test/kernel/search-projections.test.ts` (clock-relative seeds, ordering, lifecycle, isolation, bounded input); `e2e/search.spec.ts` — a future meeting found by title and opened |
| Review period context emitted dead `/diary?entry=<id>` links (the Diary route reads no such param) | Links now use the canonical Diary deep link — `?mode=day&date=<entry day>&inspector=view:<id>` — the same Inspector convention Search and Quick Capture already emit, with the entry's own day for correct positioning. No second URL convention introduced. | `app/modules/reviews/review-period-context.ts`; `e2e/reviews.spec.ts` — full click-through from a Review's Diary tab to the correct entry on the correct day, and Back returning to the Review |
| Quick-edit Repeat SelectField misrepresented custom recurrence (`week:3` leaked as a raw token with a false "no longer available" note; `week:1`+weekdays displayed as plain "Every week", and any interaction flattened the rule) | The current rule is offered as its own option labelled by the shared `taskRecurrenceLabel`; re-committing it is a guaranteed no-op; predefined choices and removal still post. The recurrence model is unrestricted. | `app/shared/task-record/TaskQuickEditPanel.tsx`, `task-view.ts`; `test/unit/tasks/TaskQuickEditPanel.test.tsx` — truthful display of `week:3` and weekday rules, no-op preservation, deliberate replace and remove |
| Projects, Areas, Goals and Diary contributed no command-palette commands | `commands.ts` per module using the existing DS-09 contract. **Every create command targets a surface that actually renders:** `/projects?drawer=new-project` and `/areas?drawer=new-area` (the DS-03 create Drawers, the `notes.new` convention) — **not** `/projects/new` or `/areas/new`, which are action-only resource routes that render a blank page. **Goals contributes no create command at all**, because a Goal is created only from an Area record (`NewGoalForm`'s sole host) and any workspace-level "New Goal" would be a fake control; `goals.open` carries `new`/`create` keywords instead. Diary: open / today (`?mode=day`) / capture (`?inspector=new`, the existing Inspector deep link). No duplicate contributions — no other layer auto-contributes navigation commands. | `app/modules/{projects,areas,goals,diary}/commands.ts` + manifests; `test/unit/module-registry/discovery.test.ts` (exact ordered catalogue); `e2e/command-palette.spec.ts` — 4 tests: each collection command navigates, the create commands open the real Drawer form, **no create-Goal command is offered**, and both Diary commands open their real surfaces. The first draft of these commands pointed at the action-only routes; the e2e test caught it (URL correct, page empty), which is why the create-Drawer assertion asserts the FORM and not just the URL. |

## 3. Release hardening, each mapped to its evidence

| Item | Change | Evidence |
|---|---|---|
| Deploy could ship any local state | Release preflight refuses: dirty tree · non-`main` branch · HEAD ≠ `origin/main` (after a real fetch) · missing/red/pending **CI Gate** · unacknowledged pending migrations. Overrides are individually named and logged (`--allow-dirty-tree`, `--allow-non-main`, `--skip-ci-check`, `--acknowledge-pending-migrations`); no `--force`. Checking migrations ≠ applying ≠ deploying — the deploy never applies one. | `scripts/deploy-production.mjs`; `test/unit/deploy/release-preflight.test.ts` — a refusal test per condition, override tests (each bypasses exactly one check, loudly), and the all-green dry-run; all external commands/APIs injected, nothing real touched |
| No post-deploy verification existed | The deploy (and standalone `pnpm run deploy:production:verify`) asserts `/health` answers **directly** (a Cloudflare Access redirect fails — `/health` is public by design), with `status:"ok"`, `name:"DalyHub"`, `environment:"production"` and `version` exactly `2.0.1` (from `package.json`, test-pinned to `app/lib/version.ts`). Commit identity is asserted only if the payload ever carries it — the public payload deliberately does not, and no metadata extension was needed for the assertion to be meaningful. | `scripts/deploy-production.mjs` (`assertProductionHealth`); `test/unit/deploy/release-preflight.test.ts` — success, Access-redirect refusal, wrong version/environment/name/status, non-JSON, unreachable, commit-mismatch and retry cases |
| No automated backups | `.github/workflows/production-backup.yml`: daily 16:30 UTC + `workflow_dispatch`, exports via the audited `production-d1.mjs` wrapper, dated commit-stamped artifact with `metadata.json`, 30-day retention, fails on a missing/empty/schema-less export, least-privilege (`contents: read`), secrets via the `production` GitHub environment, nothing printed, nothing committed. **Not restore** — SET-02 remains V2.1. | The workflow file; documented in [`DEPLOYMENT.md → Automated production backups`](../development/DEPLOYMENT.md#automated-production-backups-v201) |
| CI comment misdescribed run 30698894216; Today header claimed fixture-backed sections; Meeting search docs omitted the recent-only scope | Each corrected in place with the correction recorded, not silently rewritten. | `.github/workflows/ci.yml`, `app/modules/today/TodayDashboard.tsx`, `docs/development/SHARED_SEARCH.md`, `docs/development/MEETINGS_MODULE.md` |
| Reviews e2e spec pinned the then-current calendar week, guaranteeing a red gate on the next Monday rollover | Assertions retargeted at the SHAPE of the computed period (a range of two dated days; a "Weekly Review — …" default title); period arithmetic remains kernel-tested. Found because it would have broken this release's own gate. | `e2e/reviews.spec.ts` |
| DEBT-41 (P1) closing condition met | `main` @ `a06e41c` ran the full 14-shard gate green (run 30726027912) after the V2 closure merged; entry closed with the run as evidence. The register now carries no open P1. | [`PRODUCT_DEBT.md → DEBT-41`](../product/PRODUCT_DEBT.md) |

## 4. Branch protection (governance — owner action)

| | |
|---|---|
| Desired rule | **`CI Gate` required before merge to `main`**; no merging while failing, cancelled or pending; no routine bypass |
| Can it be applied from the codebase? | **No.** No checked-in ruleset mechanism exists and repository settings are not writable from application code or this session's tooling. |
| Owner instructions | [`SETUP_AND_CI.md → Enabling it (owner action — exact steps)`](../development/SETUP_AND_CI.md#enabling-it-owner-action--exact-steps) |
| Status | ⏳ **NOT yet verified as enabled.** This row is the release-checklist item: before (or at) the V2.0.1 release, the owner enables the rule and confirms an open PR shows `CI Gate` as **Required**. Do not mark the governance item complete until observed. |

## 5. Stale pull requests

| PR | State | Decision |
|---|---|---|
| #89 "Codex/tasks 04 daily driver" | Superseded — TASKS-04 shipped to `main` via #92 (`0024_tasks04_daily_driver.sql` is in the migration sequence) | Closed as superseded with an explanatory comment. Branch **not** deleted (not authorised). |
| #46 "feat(ops): add safe production roadmap project runner" (draft) | Superseded — V2.0.1's release preflight, release-check/verify commands and backup workflow cover the guarded-operations ground; the draft predates the V2 release process | Closed as superseded with an explanatory comment. Branch **not** deleted (not authorised). |

## 6. Quality gates (this branch)

Recorded from the actual runs on the release branch; the authoritative record is
the CI run on the PR, which must be fully green (every shard + **CI Gate**)
before merge.

| Gate | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ✅ |
| Formatting | `pnpm run format:check` | ✅ |
| Lint | `pnpm run lint` | ✅ |
| Types | `pnpm run typecheck` | ✅ |
| Unit & component | `pnpm run test:unit` | ✅ (see PR description for counts) |
| Kernel (Workers + real D1) | `pnpm run test:kernel` | ✅ (see PR description for counts) |
| Build | `pnpm run build` | ✅ |
| New/affected Playwright specs | `reviews.spec.ts`, `search.spec.ts`, `command-palette.spec.ts` (new tests) | ✅ run locally; full suite is CI's job |

## 7. Deployment runbook — V2.0.1

No migration ships in this release, so the sequence is shorter than V2's — but
the backup still comes first, and every step stops the release if it fails.
**Do not start until the release PR is merged and `main`'s CI Gate is green.**

Load the production environment exactly as in
[`RELEASE_CHECKLIST_V2.md` §14 steps 1–3](RELEASE_CHECKLIST_V2.md#14-production-deployment-commands)
(clean `main`, locked install, `~/.dalyhub/production.env`), then:

```bash
git fetch origin main && git checkout main && git pull --ff-only origin main
git log --oneline -1
```

1. Confirm the printed commit is the green release commit, and
   `git status --porcelain` is empty.
2. **Preflight** (config): `pnpm run deploy:production:preflight`
3. **Release check** (git/CI/migrations, no build, no upload):
   `pnpm run deploy:production:release-check`
   — needs `GITHUB_TOKEN` (read-only) exported to verify the CI Gate.
4. **Back up**:
   `pnpm run db:production:export -- --output "$HOME/dalyhub-production-backup-$(date -u +%Y%m%dT%H%M%SZ).sql"`
   then `ls -lh` the file and confirm it exists and is non-empty. Also confirm
   the **Production D1 backup** workflow has produced at least one successful
   artifact — or record explicitly that this manual export is the release
   backup.
5. **Migrations**: `pnpm run db:production:list` must report **no pending
   migrations** (V2.0.1 adds none; anything pending is unexpected — stop and
   investigate; apply only reviewed migrations with
   `pnpm run db:production:apply`, then re-list to confirm none remain).
6. **Deploy**: `pnpm run deploy:production` — runs every check above again,
   deploys once, then asserts `/health` itself.
7. **Verify**: `curl -fsS https://hub.daly.id.au/health` →
   `"status":"ok"`, `"version":"2.0.1"`, `"environment":"production"` (or
   `pnpm run deploy:production:verify`). Open `/about` through Access: version
   `2.0.1`, release `V2`, build commit matching
   `git rev-parse --short=7 HEAD`.
8. **Smoke test behind Access**: `/today` loads real data; open `/tasks`,
   `/projects`, `/meetings`, `/assets`, `/reviews`, `/diary`; search an
   upcoming meeting by title; open a Review's Diary-tab entry; confirm existing
   production data is visible and intact. Confirm the direct
   `*.workers.dev` origin still returns 404.
9. **Tag and publish**:
   `git tag -a v2.0.1 -m "DalyHub V2.0.1 — hotfix and release hardening" && git push origin v2.0.1`,
   then publish the GitHub release from
   [`RELEASE_NOTES_V2_0_1.md`](RELEASE_NOTES_V2_0_1.md).

**Stop immediately and report if any backup, migration, deployment, health or
smoke-test step fails.** Rollback is a Worker rollback (no migration shipped);
the schema is never rolled back.

## 8. Related documents

- [`RELEASE_NOTES_V2_0_1.md`](RELEASE_NOTES_V2_0_1.md) — the owner-facing notes.
- [`RELEASE_CHECKLIST_V2.md`](RELEASE_CHECKLIST_V2.md) — the V2.0.0 record this
  release builds on (environment setup, Access, origin hardening).
- [`DEPLOYMENT.md`](../development/DEPLOYMENT.md) — the deploy machinery,
  preflight flags, health assertion and backup workflow.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — DEBT-41 closed; DEBT-65 and
  DEBT-66 opened by this release's findings.
