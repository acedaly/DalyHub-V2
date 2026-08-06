# M3 visual polish — handover

**Branch:** `claude/m3-visual-polish-6oq9z2` · **PR:** [#121](https://github.com/acedaly/DalyHub-V2/pull/121), open and unmerged
**Resume from this branch.** Do not open a second PR and do not repeat the audit — it is done and committed.

The design direction, the surface tones, the shell anatomy, the icon architecture, the Today
composition and the gate list are all in [`M3_POLISH_AUDIT.md`](M3_POLISH_AUDIT.md), Appendix A. The
authoritative reference mock-up is at
[`assets/m3-polish-2026-08/reference/dalyhub-dashboard-reference.png`](assets/m3-polish-2026-08/reference/dalyhub-dashboard-reference.png).
This document is the *state of the work*, not the specification.

---

## 1. What is on the branch

| Commit | Delivered |
|---|---|
| `ab3122e` | The whole-product visual audit after PR #120, plus 86 current-state captures and `measurements.json`. Gate A. |
| `71b083f` | **Pre-existing fix.** Pinned the recurrence route's clock — the test's successor date depended on the wall clock and had started failing on `main`. |
| `880502c` | Dropped an unused import that the clock fix left behind (caught by CI, not locally). |
| `d3b8162` | **Gate B.** Generated app-neutral surfaces; the desktop top app bar; the compact drawer; the expanded `PaneHeader`; 15 new structural tokens and 3 renames; 5 new surface tests. |
| `3aa1e45` | Gate B review changes: `primary-container` selected navigation, appearance indicator removed, and the **banner moved to the top app bar** (which fixed a real axe `region` failure on Help and About). |
| `115f5f8` | **Pre-existing fix.** `export.spec.ts` asserted `snapshotSchemaVersion === 1`; ADR-074 bumped it to 2 and missed this. |
| `b94d79d` | The reference mock-up checked in, renamed and linked from the audit and the docs index. |
| `24471c6` | **Gate C.** The shared card family: `DashboardCard`, `MetricTile`/`MetricRow`, `RecordRow`/`RecordRowList`, `EntityCard`/`EntityCardGrid`, `Timeline`/`TimelineItem`, and `app/styles/card-family.css`. |
| `8675bf8` | The icon-key foundation (migration, vocabulary, catalogue, resolver, tests); the card-family fixture moved to its own route; the narrow-container grid fix; a fourth pre-existing fix (`data-density` → `data-card-density`). |

### Four pre-existing failures found and fixed

None were caused by this branch. All four were PR #120 leftovers, and all four are fixed here on
their own commits so they are separable from the visual work.

1. `task-recurrence-route.test.ts` — wall-clock-dependent successor date.
2. `product-frame.spec.ts:57` — asserted a "Daly Light" theme button ADR-074 deleted. **Inverted**
   rather than removed, so the account menu cannot quietly grow a theme picker back.
3. `export.spec.ts:120` — stale `snapshotSchemaVersion`.
4. `cards-filters.spec.ts:70` — asserted `data-density`; `Card` emits `data-card-density`.

---

## 2. Gate status

| Gate | State |
|---|---|
| A — audit | **Complete and approved.** |
| B — surfaces and shell | **Complete and approved**, including the review changes. |
| C — shared components | **Foundation complete and approved.** The five components exist, are tested and are demonstrated. **No module consumes them yet.** |
| Icons | **Foundation only** — see §4. |
| D — entity collections | Not started. |
| E — records and forms | Not started. |
| F — remaining modules | Not started. |
| G — Today | Not started. |
| H — responsive, a11y, docs | Not started. |

**Nothing in the product's real modules has been migrated to the new card family.** Tasks,
Projects, Areas, Goals, Notes, Diary, Meetings, People, Assets, Reviews, AI, Settings and Help all
still render exactly as the audit describes them. That is deliberate: a half-migrated product is
worse than a consistently old one, so the migration was stopped at a coherent point rather than
spread thin.

---

## 3. Where things live

### Shared card family
`app/shared/card/` — `DashboardCard.tsx`, `MetricTile.tsx`, `RecordRow.tsx`, `EntityCard.tsx`,
`TimelineItem.tsx`, exported from `app/shared/card/index.ts`. Styles in
`app/styles/card-family.css` (imported by `app/app.css`). Fixture at
`app/routes/design-card-family.tsx`, route `/design/card-family`, dev-only.

**Do not put the fixture back on `/design/cards-filters`.** That route's spec asserts against the
cards it renders; a second set broke five of its assertions.

### Icons
| Thing | Location |
|---|---|
| Migration | `migrations/0032_add_entity_icon_keys.sql` — **current migration number is 0032**; the next is 0033 |
| Columns | `area_details.icon_key` and `project_details.icon_key`, both `TEXT NULL` |
| Vocabulary + validation | `app/kernel/entities/entity-icon-keys.ts` — `ENTITY_ICON_KEYS` (34 keys), `isEntityIconKey`, `normaliseEntityIconKey`, `isRejectedEntityIconKey` |
| Catalogue | `app/shared/entity/entity-icon-catalogue.tsx` — key → component, label, category, search terms |
| Resolver | `app/shared/entity/RecordIcon.tsx` |
| Tests | `test/unit/entity-icons/catalogue.test.ts` — 16 tests |

The vocabulary is bounded by the **icon set**: every key resolves to an icon already exported
through `createIcon`. Adding `fitness` means adding the glyph first. `people` was dropped because
there is no `PeopleIcon`. The catalogue test fails if the kernel list and the UI catalogue disagree.

Migrations must be **ASCII-only** — `test/unit/migrations/d1-parser-compatibility.test.ts` rejects
non-ASCII as a remote-D1 statement-splitting hazard. An em-dash in a comment is enough to fail it.

---

## 4. Icon persistence — what is NOT done

The migration, vocabulary, catalogue and resolver exist. **Nothing reads or writes the column.**
Every path below is outstanding:

| Path | State | Where |
|---|---|---|
| Repository read | not done | `app/platform/storage/d1/d1-area-settings-repository.ts`, `d1-project-settings-repository.ts` — both already `INSERT … ON CONFLICT DO UPDATE`, so an upsert of `icon_key` fits naturally |
| Repository write | not done | a `setIcon(id, key)` on each settings repository |
| Kernel domain type | not done | `AreaSettings` in `app/kernel/area-settings/area-settings.ts` is `{ archivedAt }` only; the Project equivalent is in `app/kernel/project-settings/` |
| Repository interface | not done | `app/kernel/area-settings/area-settings-repository.ts` and the Project equivalent |
| Create commands | not done | `app/modules/projects/routes/new.tsx`, the Area equivalent |
| Update commands | not done | the `:id/mutate` route in each module |
| Validation at the boundary | not done | use `isRejectedEntityIconKey` to REFUSE a bad key rather than silently storing null |
| Route actions | not done | Area and Project create/edit |
| Forms | not done | `app/modules/projects/NewProjectForm.tsx` and the Area equivalent |
| Loaders | not done | must pass the serialisable KEY only, never a component |
| Test fixtures | not done | `e2e/seed-tasks.sql` has no `icon_key` values |
| Import | not done | `app/platform/export/` |
| Export | not done | `app/platform/export/build-snapshot.ts`, `manifest.ts` |
| Workspace snapshots | not done | `app/kernel/export/workspace-snapshot.ts` — **bumping the snapshot schema version means updating `export.spec.ts:120` in lockstep**; that mismatch is one of the four pre-existing failures above |
| Vault export | not done | `app/platform/export/vault/build-vault.ts` |
| Clone / duplicate | not done | wherever a Project or Area is duplicated |
| Activity metadata | not done | only where the module already records attribute changes |

**Do not silently discard icon keys during export/import.** A round-trip that loses the owner's
choice is a data-loss bug that no test currently catches.

### Picker — not started

One shared `EntityIconPicker` used by both Areas and Projects. Requirements (Appendix A.3):

- desktop: accessible popover or dialog using the existing shared patterns
- mobile: accessible bottom sheet or modal using the existing shared infrastructure
- current icon preview, search, category groups, icon grid, visible icon names, selected state
- reset to default, cancel, apply where the form pattern requires it
- 44px targets, visible focus, accessible labels
- selected state conveyed by check/shape **and** ARIA, never colour alone
- keyboard selection, Escape closes, focus returns to the trigger
- search results announced where appropriate

`searchEntityIcons`, `entityIconOptionsByCategory` and `ENTITY_ICON_CATEGORIES` already exist and are
tested; the picker is presentation over them.

---

## 5. Test and CI status at this head

Recorded in §7 of this document at the time of writing. Re-run before trusting them.

### Known local-only artefact

`e2e/activity-actor.spec.ts:76` — "desktop and mobile render the actor identically" — fails on this
development machine and **passes in CI**. The test requires a `System`-actor event to be present in
the *bounded* Recent activity window on Today. The local Miniflare workspace has had hundreds of
test-created activities pushed through it across repeated suite runs, so that event has aged out of
the window; CI seeds a fresh database for every run and does not have the problem.

**The test is deliberately unchanged.** It is asserting something true and useful. If it ever fails
in CI, that is a real regression and should be investigated normally — do not reach for this
explanation first.

To clear it locally: re-run `node ./e2e/setup-local-db.mjs` against a reset `.wrangler/state`.

---

## 6. The next implementation sequence

Do these in order. Do not broaden the scope, and do not start the later module groups before
Areas, Projects, Tasks and Today are complete and approved.

**1. Finish Area and Project icon persistence.** Repository reads and writes; create and edit
actions; import/export and snapshots; fixtures and tests. Every row in §4's table.

**2. Build the shared icon picker.** Accessible desktop dialog/popover and mobile sheet/modal;
search and categories; keyboard selection; reset to default; integrated into create and edit for
both Areas and Projects.

**3. Migrate Areas and Projects.** `EntityCard`; responsive 3/2/1-column grids; selected icons;
Area accent inheritance; progress and concise metadata; record identity headers using
`PaneHeader density="identity"`. Gate D screenshots and approval.

**4. Migrate Tasks.** `RecordRow`; remove the four-row control stack; one compact toolbar;
grouping; eliminate the duplicated state indicators (the check glyph beside the checkbox, the
status chip competing with the overdue pill); mobile layout. Gate D screenshots and approval.

**5. Rebuild Today.** Real aggregate reads FIRST, then the composition. Exact or explicitly
bounded totals; owner-local timezone and first-day-of-week; the actual owner display name (it
currently renders "Good afternoon, Local."); the 12-column reference-led composition; charts and
the calendar. Gate G screenshots and approval.

Then the remaining modules in logical groups — Goals, Notes/Diary/Meetings,
People/Assets/Reviews, AI/Settings/Help — followed by Gate H (responsive, accessibility) and the
documentation commit.

### Screenshot gates still outstanding

**D** entity collections · **E** records and forms · **F** remaining modules · **G** Today ·
**H** final sweep. Gates A, B and C are approved. Capture harness: any dev-only route renders
inside the real shell; the existing pattern is `e2e/m3-screenshots.spec.ts` (opt-in via
`CAPTURE_SCREENSHOTS=1`). Captures live under `docs/design/assets/m3-polish-2026-08/`.

### Practical notes for the next session

- Playwright's second `webServer` builds the production bundle; on a loaded machine the 120s
  timeout is not enough. Run `pnpm run build` first, then `PLAYWRIGHT_SKIP_BUILD=1 pnpm exec
  playwright test …`.
- Do not `pkill -f "playwright test"` while your own run is in flight — it matches both.
- Pushing while a CI run is in flight cancels it, and a cancelled shard is reported as a **failed**
  CI Gate. Three "failures" during this work were cancellations, not defects.
- `test/unit/tokens/tokens.test.ts` scans `app/styles` for the retired `--dh-` vocabulary,
  **including inside comments**.
