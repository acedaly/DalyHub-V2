# SETTINGS_MODULE.md — Application settings and preferences (SET-01)

> Status: SET-01 core shell and persisted preferences are implemented. The shared
> Settings layout remains documented separately in
> [`SETTINGS_LAYOUT.md`](SETTINGS_LAYOUT.md); this document covers the product
> route, authority boundary and persistence contract.
>
> Related: [ADR-050](../decisions/ARCHITECTURE_DECISIONS.md#adr-050-ownerworkspace-application-preferences--one-typed-record-per-owner-per-workspace-with-device-local-appearance-preserved) ·
> [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) ·
> [`DATA_KERNEL.md`](DATA_KERNEL.md) ·
> [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md) ·
> [`TASKS_MODULE.md`](TASKS_MODULE.md) ·
> [`DIARY_MODULE.md`](DIARY_MODULE.md).

## What shipped

`/settings` is a first-class authenticated route composed from the shared
`~/shared/settings` primitives. It has six sections:

| Section | Controls |
|---|---|
| General | default landing page, default Tasks view, default Task capture parent, default Diary mode |
| Date & time | owner timezone, date display, first day of week |
| Appearance | the THEME-01 theme picker: five curated themes plus Match system, with previews |
| Navigation | optional module visibility and reset |
| Privacy & data | current handling, the two **workspace exports** (X-04), and explicitly deferred data tools |
| About | stable app information already available to the app |

The route is responsive from 320px upward. Section navigation is URL-backed with
`?section=...`, so browser Back/Forward works between sections.

## Preference authority

Do not put every preference into one global row. SET-01 establishes this boundary:

| Preference | Authority | Persistence |
|---|---|---|
| owner timezone | owner inside workspace | D1 `owner_app_preferences` |
| date display format | owner inside workspace | D1 `owner_app_preferences` |
| first day of week | owner inside workspace | D1 `owner_app_preferences` |
| default landing page | owner inside workspace | D1 `owner_app_preferences` |
| default Tasks view | owner inside workspace | D1 `owner_app_preferences` |
| default Task capture parent | owner inside workspace | D1 `owner_app_preferences` |
| default Diary mode | owner inside workspace | D1 `owner_app_preferences` |
| optional navigation visibility | owner inside workspace | D1 `owner_app_preferences.navigation_config` |
| appearance theme | owner inside workspace | D1 `owner_app_preferences.theme` (the `dh_theme` cookie is now only the first-paint mirror) |
| Today widget arrangement | device/local browser | existing `localStorage` model |
| transient UI state | device/session | URL or component state |
| application defaults | code | `DEFAULT_APP_PREFERENCES` |

**Appearance moved into D1 in THEME-01 (2026-07-31).** SET-01 deliberately kept the
theme device-local, and that was right for three appearance modes: it was a cosmetic
device setting and keeping it out of the preference record avoided coupling a nicety
to the security boundary. With five curated themes it is a real personal choice, and
a personal choice that does not follow the owner to their phone is a broken one. The
theme is now `owner_app_preferences.theme` (migration `0023`, additive, existing
owners default to `system`); the cookie survives only so a document that never
reaches the authenticated shell loader still gets the right first byte. Updates go
through `/preferences/theme`, which writes the record AND refreshes the mirror, then
redirects — so the change applies immediately with no page reload. Invalid or removed
values fall back to `system`. See [ADR-061](../decisions/ARCHITECTURE_DECISIONS.md#adr-061-the-curated-theme-system--five-complete-palettes-over-one-semantic-token-set-persisted-per-owner).

Today widget layout remains per-device in `localStorage`. That is now the only
personalisation surface that does not follow the owner, which makes it inconsistent
rather than merely deferred — recorded as [DEBT-55](../product/PRODUCT_DEBT.md#-debt-55--today-widget-arrangement-is-still-device-local-while-the-theme-is-not--p3).
THEME-01 has proven the migration shape end to end, so the remaining work is the
seam swap in `useTodayLayout`, not a design question.

## Persistence contract

The storage-independent contract lives in `app/kernel/preferences`. The D1
adapter lives in `app/platform/storage/d1/d1-app-preferences-repository.ts` and
is exposed through `WorkspaceScope.appPreferences`.

Migration `0017_create_owner_app_preferences.sql` creates one typed row per
`(workspace_id, owner_id)`:

| Column | Meaning |
|---|---|
| `workspace_id` | trusted workspace scope, FK to `workspaces` |
| `owner_id` | authenticated subject, not email |
| `timezone` | validated IANA timezone |
| `date_format` | stable enum: `dmy_slash`, `d_mmm_yyyy`, `iso` |
| `first_day_of_week` | `monday` or `sunday` |
| `default_landing_destination` | stable destination key |
| `default_tasks_view` | existing Tasks primary view |
| `default_task_capture_parent_id` / `default_task_capture_parent_kind` | optional active Area or non-archived Project used by fast Task capture |
| `default_diary_mode` | existing Diary mode |
| `navigation_config` | validated versioned representation for hidden modules only |
| `version` | monotonically incremented optimistic version |
| `created_at`, `updated_at` | storage timestamps |

Core behavioural preferences use explicit typed columns. There is no arbitrary
JSON dumping ground for core settings. `navigation_config` is the one versioned
structured field because its valid values come from the module registry and must
forward-normalise as modules are added.

Migration `0021_ux01_tasks_meetings_usability.sql` adds the default Task capture
parent columns. The Settings action validates the selected id through the existing
bounded Task parent authority before saving, and the Tasks loader safely ignores a
stored parent that later becomes invalid or unavailable.

Reads are deterministic when no row exists: the repository returns
`DEFAULT_APP_PREFERENCES` with version `0`. Writes are parameterised, workspace-
and owner-scoped, atomic, and idempotent when the patch does not change the
resolved preferences.

Invalid stored values degrade safely to defaults at the contract boundary. The
database also CHECK-constrains the closed enums it can know locally; timezone
validity remains application-side because D1 cannot store a full IANA catalogue.

## Date and time authority

The owner timezone is a user preference scoped to the active workspace. It
defaults to `Australia/Sydney`, preserving the original single-owner behaviour.

Validation accepts only valid IANA timezone names. In Workers-compatible
JavaScript, validation uses `Intl.supportedValuesOf("timeZone")` when available
and falls back to constructing `Intl.DateTimeFormat` with the candidate timezone.
Browser-provided timezone strings are never trusted until they pass the same
validator.

Date-only values stay date-only strings (`YYYY-MM-DD`). They are not converted
into UTC instants. The preference affects:

- owner-calendar day derivation through `ownerCalendarIso(now, timezone)`;
- Today’s date grouping and derived facts;
- due-date and scheduled-date interpretation where a server owner-calendar day is
  needed;
- Diary default grouping and day/timeline windows.

Date display is intentionally a small fixed set, not a custom formatting
language.

## Routing defaults

The root route (`/`) resolves the owner/workspace default landing page
server-side after authentication and workspace resolution. Direct deep links are
unaffected. Invalid, unavailable or future stored destinations fall back to
`/today`, and route composition remains governed by the module registry.

`/tasks` uses `defaultTasksView` only when `?view=` is absent or invalid. A valid
explicit `?view=` always wins.

`/diary` uses `defaultDiaryMode` only when `?mode=` is absent. Explicit
`?mode=day` or `?mode=timeline` remains authoritative, preserving Diary’s
URL-backed state model.

## Navigation preferences

Navigation visibility is resolved against `getPrimaryNavigation()` from the
module registry. Saved unknown module ids are discarded; mandatory modules
(`today`, `settings`) cannot be hidden; if a saved config would hide every
optional module it resets to defaults. New modules appear by default in canonical
registry order.

Hidden modules are hidden only from desktop and mobile primary navigation. They
remain reachable through direct URLs and global search/navigation commands unless
a future product decision changes that.

## Activity and privacy

Preference values are not telemetry. Settings Activity payloads, when added,
must carry structural metadata only: category changed, timezone changed, defaults
reset. They must not include tokens, AI keys, email content, private record
content, browser fingerprints or arbitrary before/after dumps.

SET-01 does not currently append Settings Activity rows because the accepted
shared Activity model is entity-subject based. A workspace/owner-scoped audit
event shape should be added deliberately before recording non-entity preference
changes.

## Export (X-04)

`Settings → Privacy & data` now carries the product's only bulk data-export
surface. Full detail lives in
[`EXPORT_AND_PORTABILITY.md`](EXPORT_AND_PORTABILITY.md); what matters for
Settings is:

| Control | Route | What it downloads |
|---|---|---|
| Download full DalyHub export | `GET /settings/export/full` | `manifest.json` + `dalyhub-snapshot.json` + `SCHEMA.md` + `README.md` + `CHECKSUMS.txt` |
| Download Obsidian vault | `GET /settings/export/obsidian` | a ready-to-open Markdown vault, one file per record |

Both are built from ONE canonical `DalyHubWorkspaceSnapshotV1`, so they can never
describe different data.

**Three decisions worth not re-litigating.**

1. **A sensitivity statement sits BEFORE the actions.** It names People, Diary,
   Meetings, Reviews and archived/deleted records, and says the file is generated
   on demand, never stored by DalyHub and never sent anywhere else. An export is
   the one action that puts the whole workspace in a file the owner then has to
   look after.
2. **No typed destructive confirmation.** The action is deliberate and
   authenticated, but it **changes no DalyHub data**. A typed phrase here would
   be ceremony, and ceremony that is not earned teaches the owner to ignore the
   ones that are.
3. **Buttons that `fetch`, not `<a download>`.** Building a whole-workspace
   archive takes real time. An anchor gives no pending state and no way to
   distinguish success from a server error, because the browser navigates to
   whatever comes back. The controls wait for the response, check it, and only
   then save the file — so the pending state is honest and success is never
   claimed before a download response exists.

The route resolves the owner and workspace server-side, takes **no** workspace
parameter, sets `no-store` + `private` + `nosniff` and an ASCII-safe filename,
persists nothing, and never exposes SQL, a binding name or a stack trace on
failure.

## Deferred scope

No dead controls are shipped for: import, backup/restore, file attachments/R2,
AI-provider credentials, integrations, notifications, reminders, workspace
deletion, multi-user roles/permissions, billing or advanced themes. **Export is
no longer in that list** — see above. Restore in particular is still absent, and
Privacy & data says so plainly rather than letting the new export imply it.

## Verification

Coverage added for SET-01:

- unit tests for preference default resolution, validation, timezone validation,
  navigation reconciliation, landing fallback, Tasks/Diary defaults, theme cookie
  persistence and reset behaviour;
- kernel/D1 tests for no-row reads, first write, update, no-op, isolation,
  rollback, invalid stored values, migration checks and Activity privacy;
- Playwright journey for opening Settings from navigation, persisted timezone/date
  preferences, root landing, invalid landing fallback, Tasks/Diary defaults,
  appearance, navigation hide/reset, Back/Forward, mobile widths, no horizontal
  overflow and axe in light/dark.

---

## Status (2026-07-27 reconciliation)

**Current status.** [SET-01](../roadmap/ROADMAP_V2.md#-set-01--app--workspace-settings--core-preferences) is ☑ (shipped as SETTINGS-01A). [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) is ☑ (2026-08-01) and added the export controls to Privacy & data. [SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore) and [SET-03](../roadmap/ROADMAP_V2.md#-set-03--account--security) are ☐.

**Delivered capabilities.** `/settings` as a first-class authenticated route on the shared Settings layout, with General, Date & time, Appearance, Navigation, Privacy & data and About sections. (Appearance now hosts the THEME-01 five-theme picker, and About reads the RELEASE-01 version authority and links to the full `/about` screen.) Owner/workspace behavioural preferences persist through the storage-independent `app/kernel/preferences` contract and its D1 adapter (`owner_app_preferences`, migration `0017`): timezone, date format, first day of week, default landing page, default Tasks view, default Diary mode and validated navigation visibility. Timezone is the shared owner-calendar authority for Today, date-derived loaders, Tasks urgency and Diary grouping. Appearance stays device-local through the existing theme cookie; Today widget arrangement stays device-local in `localStorage`. Navigation visibility resolves against the module registry, always keeps Today and Settings reachable, discards unknown module ids and shows new modules by default.

**No dead controls.** Every control on `/settings` maps to real behaviour. Privacy & data now ships two REAL export actions and still states plainly that import, backup, restore, file attachments, AI-provider credentials, integrations, notifications, reminders, workspace deletion, roles, billing and advanced themes are deferred. That honesty was preserved as export landed — the deferred list shrank by exactly one entry, and restore is named separately so the new export cannot be mistaken for it.

**Known limitations.**

- **Export shipped (2026-08-01); import did not.** [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) is ☑ — both a structured archive and an Obsidian vault, from one canonical snapshot. Import from external tools remains [X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar) and is unstarted.
- **No backup or restore.** [SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore) is unstarted, now **unblocked rather than blocked**: X-04's versioned snapshot is its documented input contract. **Cloudflare or D1 infrastructure still does not satisfy it**, and neither does export — the item requires a restore that has actually been exercised end to end. An untested restore is not a backup, and being able to download a copy is not being able to put it back.
- **No Account or Security section.** The identity layer is done and accepted (FND-09 / [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing): Cloudflare Access with in-Worker JWT validation and independent `OWNER_EMAIL` enforcement), so the product is authenticated — but there is no owner-facing session/identity surface, sign-out-everywhere, or security audit view. [SET-03](../roadmap/ROADMAP_V2.md#-set-03--account--security).
- **Preference changes append no Activity**, so a settings change leaves no audit trail — [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3). A future Security section would want exactly this.
- Today widget arrangement was deliberately **not** migrated into the new preference store; it remains per-device — [DEBT-32](../product/PRODUCT_DEBT.md#-debt-32--today-personalisation-is-per-device-not-synced--p3).

**Deferred work.** Import; backup and restore; account and security; file attachments and R2; AI-provider credentials ([AI-01](../roadmap/ROADMAP_V2.md#-ai-01--proposal-architecture--review-ui)/[AI-04](../roadmap/ROADMAP_V2.md#-ai-04--privacy-controls)); integrations ([X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar)); notifications and reminders; workspace deletion, roles and billing; synced Today arrangement; saved views ([X-02](../roadmap/ROADMAP_V2.md#-x-02--saved-views--cross-module-filters)), for which this preference store is the natural home.

**Relevant roadmap items.** [SET-01](../roadmap/ROADMAP_V2.md#-set-01--app--workspace-settings--core-preferences) ☑ · [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) ☑ (unblocks SET-02) · [SET-02](../roadmap/ROADMAP_V2.md#-set-02--backup--restore) ☐ · [SET-03](../roadmap/ROADMAP_V2.md#-set-03--account--security) ☐ · [X-02](../roadmap/ROADMAP_V2.md#-x-02--saved-views--cross-module-filters) ☐ · [X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar) ☐.

**Relevant product-debt items.** [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3) · [DEBT-32](../product/PRODUCT_DEBT.md#-debt-32--today-personalisation-is-per-device-not-synced--p3).
