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
| Appearance | a group inside **General**: System / Light / Dark over the one generated light/dark pair. The same control the account menu renders (ADR-075). |
| Navigation | optional module visibility and reset |
| Privacy & data | current handling, the two **workspace exports** (X-04), **restore from a backup** (SET-02), and explicitly deferred data tools |
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
| appearance | owner inside workspace | D1 `owner_app_preferences.appearance` (the `dh_appearance` cookie is only the first-paint mirror) |
| Today widget arrangement | device/local browser | existing `localStorage` model |
| transient UI state | device/session | URL or component state |
| application defaults | code | `DEFAULT_APP_PREFERENCES` |

**Appearance lives in D1 (migration `0033`, 2026-08-06).** SET-01 kept it
device-local; THEME-01 moved it into the preference record; M3-01 removed the theme
feature and the choice with it; ADR-075 restored the choice — three values, not eight
palettes — on the same architecture. `owner_app_preferences.appearance` is additive
with a CHECK, existing owners default to `system` (exactly the pre-existing
behaviour), and the `dh_appearance` cookie survives only so a document that never
reaches the authenticated shell loader still gets the right first byte. Updates go
through `POST /preferences/appearance`, which writes the record AND refreshes the
mirror; the fetcher submission revalidates, so the change applies with no navigation
and no reload. Invalid or removed values fall back to `system`. See
[ADR-075](../decisions/ARCHITECTURE_DECISIONS.md#adr-075-the-appearance-preference-and-one-authority-for-routine-creation).

Today widget layout remains per-device in `localStorage`. That is now the only
personalisation surface that does not follow the owner, which makes it inconsistent
rather than merely deferred — recorded as [DEBT-55](../product/PRODUCT_DEBT.md#-debt-55--today-widget-arrangement-is-still-device-local-while-the-theme-is-not--p3).
The appearance preference has now proven the migration shape end to end twice, so the
remaining work is the seam swap in `useTodayLayout`, not a design question.

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

V2.2 removed the Eisenhower Matrix (TASKS-05), so the preference's choices are now
**List — this week** (`focus`), **Time Sectors** (`sectors`) and **List — all tasks**
(`all`). No migration runs: the value is validated against the closed set on read and
falls back to the documented default, so a row still holding `matrix` resolves to the
primary task list on its next read and is rewritten the next time the owner chooses a
default. Nobody lands on a route that no longer exists. A legacy `/tasks?view=matrix`
LINK is separately redirected to the equivalent priority-grouped list — see
[`TASKS_MODULE.md`](TASKS_MODULE.md#the-matrix-was-removed).

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

## Backup (X-04)

`Settings → Privacy & data` carries the product's only bulk data-export surface,
and the group is titled **"Back up your data"**: the full DalyHub export is not
merely a copy, it is the file [Restore](#restore-set-02) reads. Full detail lives in
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

## Restore (SET-02)

Beside the backup group, in its own `tone="danger"` group because the populated
path replaces data. Full detail — the format, the validation stages, the failure
guarantee and the operational procedures — lives in
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md); what matters for Settings is:

| Step | Route | What happens |
|---|---|---|
| Choose backup… | `POST /settings/restore/preview` | the archive is verified, validated and staged. **Nothing canonical is written.** |
| Create safety backup | `POST /settings/restore/safety-backup` | a full DalyHub archive of the CURRENT workspace, verified by being read back, then downloaded to the owner |
| Replace workspace… | `POST /settings/restore/apply` | the atomic cutover, then post-restore verification |
| (cancel) | `POST /settings/restore/discard` | the staged rows are removed |

**Four decisions worth not re-litigating.**

1. **Choosing a file does not restore it.** Upload-and-write on file selection
   would make the most destructive action in the product a side effect of
   picking a file. The four steps are four requests for that reason.
2. **The preview speaks in the product's nouns**, not in collection names, and
   the one sentence that matters — what happens to the current data — is
   rendered on the row AND repeated in the confirmation.
3. **No new dialog system, no recovery design language.** This is `SettingsRow`,
   `SettingsGroup tone="danger"` and the shared `ConfirmationDialog` with its
   existing typed confirmation (`REPLACE`). The only new CSS lays out the
   preview's counts and gives the visually-hidden file input's label the same
   focus ring the destructive button already uses.
4. **Every refusal gets its own sentence.** Corrupt, unsupported version,
   incompatible, too large and "the restore did not complete" are five different
   situations with five different next actions; one generic error would collapse
   them into a shrug. The structural detail behind a refusal is logged
   server-side and deliberately does not travel to the browser.

The routes resolve the owner and workspace server-side, take **no** workspace
parameter, refuse a GET, and never expose snapshot paths, SQL or a stack trace.

## Deferred scope

No dead controls are shipped for: import from other products, file
attachments/R2, AI-provider credentials, integrations, notifications, reminders,
workspace deletion, multi-user roles/permissions or billing. **Export and restore
are no longer in that list** — see above. What DalyHub still does not do is keep
copies on the owner's behalf, and Privacy & data and Help both say so rather than
letting a working restore imply a backup service.

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

**Current status.** [SET-01](../roadmap/ROADMAP_V2.md#-set-01--app--workspace-settings--core-preferences) is ☑ (shipped as SETTINGS-01A). [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) is ☑ (2026-08-01) and added the export controls to Privacy & data. [SET-02](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21) is ☑ (2026-08-08) and added the Restore group beside them. [SET-03](../roadmap/ROADMAP_V2_1.md#-set-03--account--security--substantially-delivered-2026-08-08) is **◐ substantially delivered (2026-08-08)** — the Account & security section exists and is real; "sign out everywhere" is not built, because DalyHub cannot do it (see below).

**Delivered capabilities.** `/settings` as a first-class authenticated route on the shared Settings layout, with General, Date & time, Appearance, Navigation, Privacy & data and About sections. (Appearance now hosts the THEME-01 five-theme picker, and About reads the RELEASE-01 version authority and links to the full `/about` screen.) Owner/workspace behavioural preferences persist through the storage-independent `app/kernel/preferences` contract and its D1 adapter (`owner_app_preferences`, migration `0017`): timezone, date format, first day of week, default landing page, default Tasks view, default Diary mode and validated navigation visibility. Timezone is the shared owner-calendar authority for Today, date-derived loaders, Tasks urgency and Diary grouping. Appearance stays device-local through the existing theme cookie; Today widget arrangement stays device-local in `localStorage`. Navigation visibility resolves against the module registry, always keeps Today and Settings reachable, discards unknown module ids and shows new modules by default.

**No dead controls.** Every control on `/settings` maps to real behaviour. Privacy & data ships two REAL export actions and, since SET-02, a REAL restore; it still states plainly that import from other products, file attachments, AI-provider credentials, integrations, notifications, reminders, workspace deletion, roles and billing are deferred. That honesty has been preserved at each step — the deferred list has only ever shrunk by exactly what shipped, and when restore shipped the "restore is not implemented" sentence was removed in the same change rather than left saying something untrue.

**Known limitations.**

- **Export shipped (2026-08-01); import did not.** [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) is ☑ — both a structured archive and an Obsidian vault, from one canonical snapshot. Import from external tools remains [X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar) and is unstarted.
- **Backup and restore shipped (2026-08-08).** [SET-02](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21) is ☑. The full DalyHub export IS the backup format, and Privacy & data reads it back in: inspect, validate, preview, confirm, restore, verify, report. A populated workspace is an explicit REPLACE, gated by a verified pre-restore safety backup and the shared typed confirmation. The item's own rule was satisfied on its own terms — the end-to-end restoration proof exists and passes (`test/kernel/workspace-restore.test.ts`). What DalyHub still does NOT do is keep copies on the owner's behalf, and Privacy & data and Help both say so. See [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).
- **Account & security shipped (2026-08-08), without a global sign-out.** [SET-03](../roadmap/ROADMAP_V2_1.md#-set-03--account--security--substantially-delivered-2026-08-08) is ◐. The identity, session, local-data, security-activity and sign-out surfaces are real. **Sign-out-everywhere is not built and is not simulated**: revoking every Cloudflare Access session needs a Cloudflare API credential the Worker does not have, so the page states that plainly and points at Cloudflare Zero Trust. See [§ Account & security](#account--security-set-03-2026-08-08).
- **ORDINARY preference changes still append no Activity** — [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3--resolved-2026-08-25), now narrowed rather than open-ended. SET-03 built the mechanism the entry was waiting for (workspace-scoped, subject-less Activity events) and uses it for the two security-relevant actions; extending it to timezone, navigation and the rest is a separate, smaller piece of work.
- Today widget arrangement was deliberately **not** migrated into the new preference store; it remains per-device — [DEBT-32](../product/PRODUCT_DEBT.md#-debt-32--today-personalisation-is-per-device-not-synced--p3).

**Deferred work.** Import; backup and restore; account and security; file attachments and R2; AI-provider credentials ([AI-01](../roadmap/ROADMAP_V2.md#-ai-01--proposal-architecture--review-ui)/[AI-04](../roadmap/ROADMAP_V2.md#-ai-04--privacy-controls)); integrations ([X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar)); notifications and reminders; workspace deletion, roles and billing; synced Today arrangement; saved views ([X-02](../roadmap/ROADMAP_V2.md#-x-02--saved-views--cross-module-filters)), for which this preference store is the natural home.

**Relevant roadmap items.** [SET-01](../roadmap/ROADMAP_V2.md#-set-01--app--workspace-settings--core-preferences) ☑ · [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability) ☑ (the format SET-02 restores) · [SET-02](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21) ☑ · [SET-03](../roadmap/ROADMAP_V2_1.md#-set-03--account--security--substantially-delivered-2026-08-08) ☐ · [X-02](../roadmap/ROADMAP_V2.md#-x-02--saved-views--cross-module-filters) ☐ · [X-03](../roadmap/ROADMAP_V2.md#-x-03--import--sync-todoist-notion-calendar) ☐.

**Relevant product-debt items.** [DEBT-33](../product/PRODUCT_DEBT.md#-debt-33--settings-changes-are-not-yet-represented-in-activity--p3--resolved-2026-08-25) (narrowed by SET-03) · [DEBT-32](../product/PRODUCT_DEBT.md#-debt-32--today-personalisation-is-per-device-not-synced--p3).

---

## Account & security (SET-03, 2026-08-08)

`/settings?section=account-security` answers three questions and refuses to imply
a fourth: **who am I signed in as**, **what security state does DalyHub actually
know about**, and **what security actions can I actually take**.

The rule the whole surface is written to: *it must not look more powerful than
the architecture underneath it.* DalyHub does not own authentication — Cloudflare
Access does ([ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing)) — so the page has no password control, no MFA control, no
passkeys, no device list, no "last login", no IP address, no location and no
session inventory. Not because they were forgotten: DalyHub observes none of
them, and a security page showing an inference as an observation is worse than
one showing fewer facts.

### The five groups

| Group | What it shows | Where it comes from |
|---|---|---|
| **Identity** | Display name (when the provider supplied one), verified email, a trailing fragment of the identity subject, the authenticator, the environment | The boundary-validated session (`requireAuthenticatedSession`) — never a browser-submitted field |
| **This session** | Status (Active / Expiring soon / Expired / Not reported), issued-at, expiry, and a plain statement that other sessions are not visible | The credential's own `iat` / `exp` |
| **Data on this device** | Whether a personal copy is stored, and how many offline captures exist only here | The offline context, on the CLIENT — the server does not know |
| **Security activity** | Recent `security.signed_out` / `security.local_data_cleared` events | The ONE Activity stream, read through `activity.listForWorkspace` |
| **Sign out** | Sign out of this browser; a truthful statement about sign-out-everywhere | The sign-out hook; a SERVER-derived capability flag |

### What is deliberately absent, and why

- **A "sign out everywhere" button.** Revoking every Access session requires a
  Cloudflare API credential with Access write scope. DalyHub is configured with
  the team domain, the application AUD and the owner email, and **no Cloudflare
  credential of any kind**. The surface says so and points at Cloudflare Zero
  Trust. Whether the control renders is a **server-derived flag**
  (`globalSignOutSupported`), not a layout choice, so the button cannot exist
  without the capability behind it.
- **A workspace identity.** The `workspaces` table deliberately holds no name
  (FND-03), and the workspace id is trusted server configuration that must not
  reach a device — the same rule the offline snapshot follows.
- **Anything Cloudflare Access knows and DalyHub does not:** sign-ins, failed
  sign-ins, MFA events, sessions elsewhere. Manufacturing a "signed in" row from
  the fact that a request arrived would be inventing an observation.

### Local data, classified

`app/shared/account-security/local-data.ts` is the classification the sign-out
and clear behaviour turns on:

1. **Public application assets** — DalyHub's JS, CSS, fonts, icons and the
   offline shell document, in Cache Storage. Not personal, re-downloadable.
2. **Owner-specific personal data** — the seven-day snapshot, recent searches,
   the offline diagnostics ring. All of it also exists on the server, so removing
   it loses nothing.
3. **Unsynchronised owner-created work** — offline captures that have never
   reached DalyHub. **No copy exists anywhere else.**

Sign-out clears 1 and 2 and preserves 3. The section offers two controls: *Clear
your personal data on this device* (a plain confirmation — nothing is lost) and
*Clear everything DalyHub keeps on this device* (a TYPED confirmation, because it
can destroy class 3). The typed phrase stays required even when the queue is
empty: a confirmation should not be easier on the day it happens to be safe.

### Security activity is the ordinary Activity stream

Two Activity types are recorded — `security.signed_out` and
`security.local_data_cleared` — through a new workspace-scoped recorder that
appends to the SAME `activities` table with the same trusted actor. They carry no
entity subject, so they appear in the workspace feed and in no record's Timeline.
There is no second audit log. See
[`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md#workspace-scoped-events-set-03-2026-08-08)
and [ADR-082](../decisions/ARCHITECTURE_DECISIONS.md#adr-082-a-nonce-based-content-security-policy-one-header-authority-and-a-security-surface-that-refuses-to-overclaim) decision 9.

### Mutations go through the canonical boundary

The two state-changing actions post to `POST
/settings/account-security/:action` — an ordinary DalyHub mutation, so the Worker
boundary has already required a valid Access session AND same-origin provenance
(AUDIT-FIX-04) before the action runs. There is no route-specific CSRF token and
no bypass. Everything the client sends is a bounded count or an enumerated
literal, validated by the kernel's own parsers; the actor, workspace, timestamp
and event id all come from the trusted composition.


## Capture (CAPTURE-01, 2026-08-11)

`Settings → Capture` sits in the **Your data** group, beside AI and Account &
security, because what it really configures is *who may write into DalyHub from
outside it*.

The section answers four questions and nothing else:

1. **What is external capture, and what can it do?** A capture device creates
   tasks and notes. It cannot read, change, delete or export anything. That is
   stated in words on the page, because a permission model nobody reads is a
   permission model nobody trusts.
2. **Which devices exist, and when did each last capture something?**
3. **How do I create one?** Two fields — a name and the permissions — and a
   button. Not a wizard, and never a trip to developer tools.
4. **How do I stop one?** One control per device. Revocation is immediate.

### The token is shown exactly once

Creating a device returns the complete `dhcap_…` token in that one response,
under a panel that says *"Copy this token now. It will not be shown again."* This
is not a UI convention — it is the only truthful thing the page can say, because
DalyHub stores a SHA-256 digest and there is no read path that could return the
token a second time. The E2E journey reloads the page and asserts the prefix is
absent, so a future "reveal" control would fail the build rather than quietly
appear.

### The language is the product's, not an API console's

"Capture device", "Permissions", "Last used", "Revoke". Never "OAuth principal",
"service account grant", "API consumer" or "resource scope binding". The
implementation underneath is rigorous; the surface is a person's settings page.

### Mutations go through the canonical boundary

`POST /settings/capture/:action` (`create`, `revoke`) is a POST-only resource route
with no `GET` — nothing that returns a secret should be reachable by following a
link. It is authenticated by Cloudflare Access with same-origin provenance already
enforced at the request boundary (AUDIT-FIX-04), exactly like the Account &
security endpoints, and there is no route-specific CSRF token because the one
canonical boundary already covers every mutation.

A capture token can never reach this route: it holds no Access session, and the
boundary's capture carve-out is one exact path that is not this one. That
separation is what stops a leaked capture token from minting itself a sibling.

Full contract: [`UNIVERSAL_CAPTURE.md`](UNIVERSAL_CAPTURE.md).

---

## Calendars (CAL-01, 2026-08-12)

`/settings?section=calendars` is where the owner connects read-only external
calendars. It sits in **Your data** beside Capture and AI, because what it really
configures is what DalyHub reads from outside itself.

Four groups: what this actually does (read-only, what is imported, how often),
**Add a calendar**, **Your calendars**, and how to find a published link in
Outlook and iCloud.

### The link is a credential, and the surface is built so it cannot leak

A published ICS link is the credential: anyone holding it can read that calendar.
Two independent structural guarantees, not one careful habit:

1. **`CalendarSourceView` has no URL, host or fingerprint field.** It is the type
   the loader returns, so a feed address cannot cross into the browser even by
   accident — there is nowhere to put it.
2. **The repository's ordinary read does not `SELECT` the column.** Exactly one
   method returns the sealed value, and only the synchroniser calls it.

The link is accepted in one form field, sealed before it is stored, and never
shown again — and the surface says so on screen rather than leaving it to be
discovered when someone goes looking for an "edit link" control that does not
exist. The field is cleared the moment the link is accepted.

Asserted by `e2e/calendar.spec.ts`, which reads the rendered HTML and the visible
text and requires neither to contain the address.

### Validation happens BEFORE anything is stored

`add` normalises and policy-checks the URL, then FETCHES and PARSES it, and only
persists a source once the feed has genuinely produced a calendar. A source stored
first and validated later is a source the owner has to discover is broken. The
first refresh then runs immediately, so the schedule is populated by the time the
owner reaches Today.

### It says only what is true

The one sentence under each calendar comes from `describeSyncState`, which
distinguishes four genuinely different states — never synced (which is **not**
"Connected"), synced *n* ago, failed with nothing ever having worked, and failed
over an earlier success (which says both, because the events on screen are real
but old). A paused calendar says so.

### Mutations go through the canonical boundary

`POST /settings/calendars/:action` (`add`, `rename`, `toggle`, `refresh`,
`remove`) is a POST-only resource route with no `GET` — every action accepts or
acts on a credential. Authenticated by Cloudflare Access with same-origin
provenance already enforced at the request boundary, exactly like the Capture and
Account & security endpoints.

Failures are reported from a **closed message table**: a hostile feed can return
anything at all, and none of it — not a body, not a header, not a status text —
reaches a string the owner sees.

Full contract:
[`CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md`](../product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md).

---

## The AI section (AI-01 / AI-04, 2026-08-05)

`/settings?section=ai` is the owner's AI policy surface. It shows whether AI is
enabled, which providers are configured, the routing mode (direct or Cloudflare
AI Gateway), the approved model per tier with the date their prices were
verified, the monthly / daily / deep-analysis budgets and what has been spent
this period, a per-feature usage breakdown, per-feature and per-privacy-category
switches, the logging and reuse choices, and a plain disable control.

**There is deliberately no field for an API key.** Provider credentials are
Worker secrets; DalyHub cannot read one back, so a text input that appeared to
store one would be a lie about where the secret lives. Where changing a
credential requires Cloudflare configuration, the section says exactly that.

What D1 stores is non-secret policy only: enabled, default provider, allowed
features, approved model aliases, budgets, premium permission, retention choice,
body-logging preference and sensitive-category consent. Every value is validated
through the kernel's own parsers on write **and** on read, so a hand-crafted POST
cannot widen a budget past its ceiling or enable an unknown feature, and a row
written by an older version degrades to safe rather than widening a limit.

Full contract: [`AI_PLATFORM.md`](AI_PLATFORM.md).
