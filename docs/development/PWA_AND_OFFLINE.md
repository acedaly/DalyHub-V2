# PWA_AND_OFFLINE.md — Installation, the service worker, and offline DalyHub

> How DalyHub becomes an installable application, what it stores on a device, what
> it can and cannot do without a connection, and how that interacts with
> Cloudflare Access.
>
> **The one-sentence summary.** After a successful authenticated online session on
> a device, DalyHub keeps a minimised, namespaced, fifteen-day-wide read-only
> snapshot in IndexedDB and can capture three kinds of new record offline; it
> cannot edit, complete or delete anything offline, and holding offline data is
> **not** the same as holding a valid sign-in.

---

## 1. Scope, in the product's own words

| | Offline |
|---|---|
| Open DalyHub | ✅ after one successful authenticated online load on that device |
| See tasks due, scheduled or overdue around today | ✅ read-only |
| See tasks completed in the last seven days | ✅ read-only |
| See notes and diary entries from the last seven days | ✅ **excerpts**, not full text |
| See meetings in the surrounding fortnight | ✅ read-only, with attendee names |
| Search / filter / sort the stored snapshot | ✅ entirely on-device |
| Capture a new Inbox task | ✅ queued, syncs later |
| Capture a new quick note | ✅ queued, syncs later |
| Capture a new diary entry | ✅ queued, syncs later |
| Complete a task | ❌ needs a connection |
| Edit any existing record | ❌ needs a connection |
| Delete or archive anything | ❌ needs a connection |
| Change a relationship, parent or workspace | ❌ needs a connection |
| Bulk actions, attachments, export, AI | ❌ needs a connection |

Unsupported actions are not merely disabled: the offline surface **does not render
them at all**, so there is no control that silently fails.

---

## 2. Architecture

Three layers, mirroring the rest of DalyHub ([`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md)):

| Layer | Location | Contains |
|---|---|---|
| **Kernel** | `app/kernel/offline` | Storage- and platform-independent contracts: the retention window, the snapshot shape, the queue model, the connection-state machine, the identity namespace, the IndexedDB schema ladder. No IndexedDB, no D1, no React, no `fetch`. |
| **Server platform** | `app/platform/offline` | Builds the snapshot from the workspace-scoped repositories; the idempotency receipts. Server-only. |
| **Browser platform** | `app/shared/offline` | The IndexedDB adapter, the store, the probe, the sync engine, the React provider and the UI. Client-only. |

Routes:

| Route | What it is | Renders the app shell? |
|---|---|---|
| `/offline` | The cacheable offline shell **document** | No — deliberately (see §4.3) |
| `/offline/snapshot` | The minimised seven-day snapshot (JSON) | No |
| `/offline/ping` | The reachability probe (JSON) | No |

All three are authenticated. None is a public path.

---

## 3. Installation

### Manifest

`public/manifest.webmanifest`, served as a static asset. `name`, `short_name`,
`description`, `id`, `start_url`, `scope`, `display: standalone`,
`display_override`, `orientation: any`, theme and background colours, and five
icons (SVG + 192/512 `any` + 192/512 `maskable`).

**`crossorigin="use-credentials"` on the `<link rel="manifest">` is load-bearing.**
A manifest is fetched with `credentials: "omit"` by default. DalyHub sits behind
Cloudflare Access, so an anonymous manifest fetch is redirected to the Access
login page, the browser concludes DalyHub has no manifest, and there is no
install prompt, no standalone launch and no icon. Sending credentials makes the
fetch carry the Access cookie. If installation ever stops being offered, check
this first.

### Document metadata (`app/root.tsx`)

Favicons (`.ico` + SVG), the Apple touch icon, `theme-color` for light and dark,
`mobile-web-app-capable` **and** `apple-mobile-web-app-capable` (kept because
current iOS Safari still reads only the Apple-prefixed name when deciding whether
an Add to Home Screen launch opens without browser chrome — a demonstrated
compatibility purpose, not habit), `apple-mobile-web-app-status-bar-style`,
`apple-mobile-web-app-title`, `application-name`. `viewport-fit=cover` was
already present and is what makes `env(safe-area-inset-*)` resolve.

### The install paths

| Platform | How |
|---|---|
| Chromium desktop/Android | `beforeinstallprompt` is captured and deferred; Settings → Offline & app offers **Install**. |
| iPhone / iPad Safari | No such event exists. Settings shows the three real Share-menu steps. DalyHub does **not** render an Install button that cannot install. |
| Anything else | The generic browser-menu steps. |
| Ordinary tab | Unchanged. Favicon and bookmarking work as before. |

There is no banner, no interstitial and no first-run prompt. The install
affordance lives where someone would look for it.

### Standalone behaviour

`display: standalone` + `display_override: [standalone, minimal-ui]`. The
existing PX-02 shell already respects `env(safe-area-inset-*)`; the `/offline`
page, which renders outside that shell, owns its own safe-area padding. Standalone
mode is detected (`isRunningStandalone()`) for exactly one purpose — telling the
owner in Settings whether they are installed. **The application does not fork into
browser and installed versions.**

---

## 4. The service worker

Source: `vite-plugins/sw-template.js`. Built by `vite-plugins/service-worker.ts`,
which substitutes a build id and a precache list and emits `/sw.js`.

### 4.1 Cache strategy

| Request | Strategy | Cache |
|---|---|---|
| `/assets/**` (hashed build output) | Cache-first, network fills a miss | `dalyhub-static-<buildId>` |
| `/icons/**`, `/favicon.ico`, `/manifest.webmanifest` | Cache-first | `dalyhub-static-<buildId>` |
| Navigations | **Network-first**, falling back to the cached `/offline` document | `dalyhub-shell-<buildId>` |
| `/offline/**`, `/search`, `/commands*`, `/links`, `/capture/**`, `/preferences/**`, `/health` | **Never cached, never intercepted** | — |
| Anything with `?_data` or ending `.data` (React Router loader data) | **Never cached** | — |
| Non-GET, cross-origin, non-200 | **Never cached** | — |

Navigation is network-first on purpose: an online owner never sees a stale page,
and an expired Access session still redirects to the identity provider exactly as
it would with no service worker.

### 4.2 The precache set, and why it is small

React Router marks **every route module** as a Rollup entry chunk. "Precache every
entry" would have precached 188 of 194 assets (~2.5 MB) onto a device that may
only ever open Today. Instead three roots are named explicitly — the framework
browser entry, the root route and the `/offline` route — and their static import
graphs and CSS come along. Measured: **23 assets, 674 kB uncompressed**. Every
other route chunk is cached at runtime the first time it is actually visited.

### 4.3 The one cached HTML document

`/offline` is the only HTML DalyHub caches, and it earns that by being
**structurally incapable of carrying private data**: its loader resolves no
workspace scope, reads no repository, and returns only the build version already
published at `/health`. It sits *outside* the app-shell layout for exactly this
reason — the shell's loader reads the owner's identity and preferences, none of
which may be baked into a cached document.

The worker additionally requires the `X-DalyHub-Shell: offline` response header
before caching it, because a Cloudflare Access challenge page is also an HTML 200
and must never be stored as the offline shell.

**It is cached by a message from the page, not during install.** The shell is a
server-rendered document, so fetching it inside `install` makes the server render
a second document while it is still serving the one the owner is waiting for —
measurably so on a cold development server, where it doubled the first page
load's compile work. The page asks for it once it is idle
(`REFRESH_OFFLINE_SHELL`), and again after every successful sync. The message
goes to the ACTIVE registration rather than to `controller`, because immediately
after a first registration the worker is active but not yet controlling the page.

Everything the owner then sees is read client-side from IndexedDB, which is
namespaced per identity + workspace.

### 4.4 Updates

A new deployment's worker installs **and waits**. It never activates under a page
that is already running, because swapping the asset cache beneath a loaded
document is how someone ends up running one build's JavaScript against another
build's server. The page is told (`Settings → Offline & app → Update available`)
and offers "Reload to update"; `SKIP_WAITING` is sent only on that action. On
activation, every superseded `dalyhub-*` cache is deleted, so storage does not
accumulate one dead cache per deployment.

Cache names are `dalyhub-{static,shell}-<version>-<sha256 of the sorted precache
list>`. Two builds of identical source produce the same id (a redeploy does not
needlessly evict a healthy cache); any change to a shell bundle produces a new one.

---

## 5. The offline data model

### 5.1 The seven-day window

**Previous seven calendar days + today + next seven calendar days, inclusive** —
fifteen days wide — resolved in the **owner's** timezone.

All arithmetic is on `YYYY-MM-DD` strings via UTC midnight, never millisecond
subtraction. `now - 7 * 86_400_000` lands on the wrong calendar date twice a year
in Australia/Sydney (the 23- and 25-hour DST days) and is off by one for part of
every day for a UTC+10/+11 owner. `test/unit/pwa/offline-window.test.ts` holds
both cases.

### 5.2 What is retained, field by field, and why

Every field below is rendered by an offline view. The rule applied was: *if the
offline UI does not display it or filter/sort on it, it is not in the snapshot.*

| Record | Fields | Why each is needed |
|---|---|---|
| **Task** | `id`, `title`, `status`, `priority`, `timeSector`, `dueDate`, `scheduledDate`, `completedAt`, `updatedAt`, `parentId`, `parentLabel`, `waiting` | The offline task row renders the title, its parent's name, its planning date, priority and waiting state; `status`/`completedAt` decide which section it appears in; `updatedAt` orders it. `parentLabel` is stored so the parent record itself need not be. |
| **Note** | `id`, `title`, `excerpt`, `truncated`, `tags`, `updatedAt` | A readable card. `truncated` is true for any note with a body, because the **full Markdown is never stored** — the card says so rather than letting a short excerpt read as a complete note. |
| **Diary** | `id`, `title`, `entryType`, `occurredAt`, `excerpt`, `truncated` | Chronology plus a readable excerpt. |
| **Meeting** | `id`, `title`, `startsAt`, `heldAt`, `attendeeLabels` | When it is, what it is called, who is coming. Attendee **names only** — never a Person record and never contact details. |
| **Reference** | `id`, `kind`, `label` | The minimum needed to render a project/area/person reference on a retained record. |

**Not stored, deliberately:** full note or diary bodies; any Activity event; audit
payloads; soft-delete metadata; EntityLink graphs; server-only columns; the
workspace id; the Access subject; any token, cookie or header; anything a view
does not render.

**There is no bulk Projects or People copy.** A project, area or person reaches
the device only because a retained record points at it, and only as an id and a
label. A pinning capability was considered and **not** built — it did not fit the
architecture cleanly enough to justify a second retention rule.

`test/kernel/offline-snapshot.test.ts` asserts each record type's fields against
an **allow-list**, so a new field on a repository projection cannot silently flow
onto every owner's device.

**Waiting tasks need a second read.** `listPlanningTasks` excludes them by
contract (`waiting_since IS NULL`) — Today deliberately separates "what I can do"
from "what I am blocked on". Offline has no such separation to make, so
`listWaitingTasks` is read alongside it (bounded at 60, guarded independently)
and its rows are subject to the same window rule as every other open task.
Without it the `waiting` field could never be true and the offline view would
quietly claim the owner had no blocked work at all. The waiting projection carries
no `timeSector`, so those rows store `null` for it rather than inventing one.

### 5.3 Bounds

`tasks: 400, notes: 100, diary: 150, meetings: 100, references: 300`. When a bound
bites, the snapshot's `bounded` flag is true and the offline view says the copy is
partial rather than implying completeness.

### 5.4 Retention cleanup

Runs: after a successful sync; when DalyHub opens; after an offline schema
migration; and when the owner clears offline data. `saveSnapshot` additionally
**replaces** its namespace's records rather than merging, so a record the server
has dropped from the window cannot survive on the device.

One deliberate exception: an **open overdue task is retained however old it is**.
It is still owed, and dropping it would hide exactly the work the owner most needs
offline.

The date a record is pruned by is resolved in the **owner's** timezone, exactly
like the window's bounds — `ownerCalendarDateResolver` in `app/shared/datetime`,
one formatter bound per snapshot. Slicing the first ten characters off an ISO
instant answers a different question (the date in UTC) and the two disagree for
part of every day: a Sydney diary entry written at 09:00 on the window's *first*
day is `T23:00Z` on the day before it, so a UTC reading would put it outside the
window and the next prune would delete it the moment it arrived.

Queued captures are **exempt from retention entirely** — they hold work that
exists only on the device, and no automatic policy may discard it.

### 5.5 Identity and workspace isolation

Every byte is filed under one opaque key:

```
namespace = "dh1-<schemaVersion>-" + sha256("dalyhub-offline v<n> <subject> <workspaceId>")[0..32]
```

- It is a **digest**, not `subject:workspaceId`, so neither the Access `sub` nor
  the workspace id is written to the device, and Settings can say *which* sign-in
  the data belongs to without showing an internal identifier.
- The separator cannot be moved between the two inputs to force a collision.
- Record keys are `${namespace}|${kind}|${id}`, so the same record id in two
  workspaces cannot overwrite.
- No store method reads without a namespace — there is no "read everything" method
  to forget with.
- On a successful sync under a **different** namespace, the other namespace's
  snapshot is deleted immediately, before anything renders it. Its **queued
  captures are kept**: they are that identity's un-synced work and replay when
  they sign in again.

**This is namespacing, not encryption.** See §8.

---

## 6. The offline capture queue

### 6.1 What may be captured

A new Inbox task, a new quick note, a new diary entry. All three are append-only
records with no parent and no dependency on server state, which is the *only*
reason they can be replayed without conflict analysis. Everything else is out of
scope for this milestone and must not be added here without that analysis.

### 6.2 What is recorded per capture

`id` (a collision-safe UUID, also the server idempotency key), `namespace`,
`kind`, `payload`, `payloadVersion`, `createdAt`, `queuedAt`, `status`,
`attempts`, `lastAttemptAt`, `attemptStartedAt`, `lastError`, `serverId`,
`syncedAt`.

Statuses: `pending` → `syncing` → `synced` | `failed` | `blocked`.

`blocked` is separate from `failed` on purpose: a blocked record is waiting for a
valid sign-in, is not the owner's mistake, and **does not consume retry budget**.

**`syncing` is leased, so it is recoverable.** A replay marks a record `syncing`
before it sends. A tab closed mid-request — or a device that simply loses power —
therefore leaves a record claiming an attempt is in flight with nothing running
it, and neither the automatic pass nor the Retry button will touch a `syncing`
record. `attemptStartedAt` is what makes that state recoverable: an attempt older
than the two-minute lease is treated as abandoned, returned to `pending`, and
shown to the owner as "This device was interrupted while syncing this capture."

The interruption **counts as an attempt**, so a capture whose replay reliably
crashes this device ends up `failed` with an honest explanation instead of
retrying forever. Reclaiming runs both inside a replay pass and whenever the
provider reloads the queue, so a stranded capture stops displaying as
"Synchronising…" as soon as DalyHub is reopened. Reclaiming a capture that was in
fact still in flight is safe: the server keys creation on the record's idempotency
key, so the second send returns the first attempt's record id rather than creating
anything.

### 6.3 Idempotency

Replay goes through the modules' **own** canonical create routes — `POST
/tasks/new`, `/notes/new`, `/diary/new` — not a new sync endpoint. Same
validation, same Activity, same workspace scoping, no second creation authority.
Each route wraps its existing handler in `withReplayGuard`; how a record is
created is unchanged.

Duplicate prevention is a **database** guarantee:

```
offline_capture_receipts (workspace_id, idempotency_key) PRIMARY KEY
```

1. `INSERT … ON CONFLICT DO NOTHING RETURNING` claims the key **before** anything
   is created. The database arbitrates, so two concurrent retries cannot both win.
2. The winner creates the record and writes its id onto the receipt.
3. A loser reads the receipt back and returns the **already-created** id.
4. A creation that fails (validation or exception) **releases** the claim, so the
   owner's retry is not permanently answered with "already being created".
5. A claim whose request **never came back** is retired as `unresolved` after
   five minutes, and no attempt ever creates under that key again. See below.
6. A receipt is scoped by workspace, owner subject and record kind: a replay
   cannot cross a workspace, be attributed to another identity, or have a note's
   receipt satisfied by the task endpoint.

**The one case the two-phase write cannot decide.** The claim is written before
the record exists, so a Worker that dies between the two leaves a receipt with no
record id. That is genuinely ambiguous: the create may have committed just before
the process ended, or never run at all, and D1 has no interactive transaction that
could have spanned the module's own creation code to make it atomic.

An earlier revision resolved this by letting the next attempt take the claim over
and create. That is the wrong trade — half the time it silently writes a second
task, note or diary entry, which is the exact failure the receipts table exists to
prevent, and the owner has no way to know it happened. So the key is **retired**
instead: every later replay of it receives the same stable answer telling the
owner to check whether the capture arrived, the queued capture is marked as
needing attention with that message, and its text stays intact on the device.

If the slow attempt does eventually finish and it *did* create the record, it
corrects the retired receipt with the real id — so a retirement is pessimistic
only for as long as the truth is unknown.

A rare visible question, never a silent duplicate. Recorded in §11 as a known
limitation.

**Before that window, "try again shortly" is RETRYABLE.** A request that was sent
but whose answer never arrived is the commonest network failure there is, and the
retry that follows finds the first attempt's claim still held. That answer is a
shared kernel constant (`OFFLINE_CAPTURE_IN_PROGRESS`) precisely so the sync
engine can tell it apart from a real validation rejection — otherwise a dropped
connection would present the owner's capture as permanently failed.

### 6.4 The sync pass

Before any replay: is the backend reachable, is the session valid, and does the
queued record's namespace match the identity and workspace signed in **now**?

Records are replayed one at a time, in queue order, bounded to 10 per pass, with
per-record exponential backoff (1s → 30s ceiling). A `blocked` outcome stops the
pass immediately — continuing would send one identity-provider redirect per queued
record.

Nothing is ever silently discarded. A record that exhausts its five automatic
attempts becomes `failed` with its reason and waits for a manual retry.

### 6.5 The owner's controls

Settings → Offline & app → Queued captures, and the `/offline` page, both show
every waiting capture with its kind, title, capture time, status, attempt count
and failure reason. Each offers **Retry** (which resets the automatic attempt
budget — the owner looking at a failure and choosing to try again is a different
fact from the machine trying five times) and **Discard…** behind an explicit
confirmation that says the capture exists only on this device and cannot be
recovered.

**Editing a queued capture before retrying is not implemented.** See §11.

---

## 7. Authentication and Cloudflare Access

### 7.1 The distinction that matters

**Holding offline data is not the same as holding a valid DalyHub sign-in.** No
token, cookie, credential or session is ever stored offline. Every server
interaction still requires a valid Cloudflare Access session; what survives
offline is a *copy of data already downloaded to this device*, available to
whoever can unlock the device and open that browser profile.

The product says this in the owner's own words on `/offline` and in Settings.

### 7.2 Why an expired session looks like being offline, and how they are told apart

Access intercepts at the edge, so an expired session produces a **cross-origin
redirect to the identity provider**, not a clean 401 from DalyHub's Worker. To
`fetch` that is an opaque redirect (with `redirect: "manual"`) or an outright
network error — the same shape as having no network.

`/offline/ping` resolves it: it is behind the Worker's auth boundary and answers
with `X-DalyHub-Authenticated: 1`. `classifyProbe` treats a 200 **without** that
header as `authRequired`, so a captive portal, a proxy or an Access challenge page
is never mistaken for a working session.

### 7.3 The ten scenarios

| # | Scenario | Behaviour |
|---|---|---|
| 1 | Installs while authenticated | Manifest resolves (credentialed fetch), worker installs, snapshot syncs. |
| 2 | Launches online with a valid session | Normal DalyHub. Snapshot refreshes; queue replays. |
| 3 | Launches offline after prior successful use | Worker serves the `/offline` shell; the snapshot renders from IndexedDB. |
| 4 | Access expires **while offline** | Nothing changes offline — there is no server to reject anything. Captures continue to queue. |
| 5 | Reconnects after Access expired | The probe returns `authRequired`. Sync **pauses**: no retries, no heartbeat. Queued captures are retained and marked `blocked`. The status surface says "Sign in required" and offers a sign-in link. |
| 6 | Different identity signs in on the same profile | The next snapshot arrives under a different namespace; the previous identity's snapshot is deleted before anything renders. Their queued captures are kept and are **never** replayed by this session (the namespace check refuses). |
| 7 | Workspace changes | Same mechanism — the namespace includes the workspace. |
| 8 | Logs out | The Access session ends; the probe returns `authRequired` and sync pauses. Local data is removed by **Settings → Reset offline data**, which is the explicit control (see §11 for the honest limitation here). |
| 9 | Clears site data | Everything goes: IndexedDB, caches, the worker registration. DalyHub re-primes on the next authenticated online load. Nothing server-side is affected. |
| 10 | Access reachable, Worker/D1 unavailable | The probe returns `backendUnavailable`. Queued captures are **retried** (unlike case 5) because a 5xx may recover on its own. The status surface distinguishes this from both offline and sign-in-required. |

### 7.4 What the implementation never does

It never bypasses, weakens or simulates Access; never stores or replays a
credential; never treats a cached page as proof of a session; and never retries a
request on a timer while a sign-in is expired.

---

## 8. Privacy, security and the claims that are NOT made

- **DalyHub does not encrypt browser storage.** Doing so honestly requires key
  management the device cannot silently hold, and a false encryption claim would
  change how someone treats a lost phone. Settings says, verbatim, that DalyHub
  relies on the device and browser's own protection.
- Local data is protected by the device passcode, disk encryption and the browser
  profile. Anyone who can unlock the device and open that profile can read it.
- The snapshot is only ever **downloaded** to the device. It is never uploaded,
  shared, or sent anywhere.
- People data is limited to display **names** on a meeting. No contact details, no
  Person record, no relationship graph.
- Note and diary bodies are excerpts. The most sensitive long-form text in the
  product is not stored offline.
- No Access token, cookie, header, team domain or AUD is stored, logged or
  displayed anywhere in these surfaces.
- Settings shows the owner's own email and an 8-character fragment of the opaque
  namespace digest — never the Access subject and never the workspace id.

---

## 9. Schema versioning and migrations

`OFFLINE_SCHEMA_VERSION` (currently **1**) is both the IndexedDB version and part
of the namespace digest.

The schema is an explicit, ordered **ladder** (`OFFLINE_SCHEMA_STEPS`), not
accumulated `if (oldVersion < n)` branches. Rules:

- One step per version; a step runs only when the database is below it; upgrading
  1 → 3 runs 2 then 3, in order.
- **Never edit a shipped step** — a device that ran it will not run it again.
- Steps are **structural only**. Long data rewrites inside a `versionchange`
  transaction are how a half-migrated database with the new version number
  happens. Where data must change shape, drop the affected store and let the
  snapshot be rebuilt from the server — always safe, because the snapshot is a
  cache, never the original.
- **A step must never drop the queue.** It is the one store holding data that
  exists only on the device.
- A step that throws **aborts the transaction**, so the version does not advance
  past a failed step.

The adapter handles the failure modes that otherwise become a blank screen:

| Failure | Behaviour |
|---|---|
| **A newer database** (a rollback, a stale cached bundle) | Reported as a distinct recoverable state. **Nothing is deleted** — that would destroy a newer release's un-synced captures. |
| **A blocked upgrade** (another tab holding the connection) | Reported, not hung. Every connection sets `onversionchange` to close itself so a newer release is not blocked forever. |
| **An interrupted upgrade** | Every open verifies the expected stores exist; if they do not, the database is deleted and rebuilt once. |
| **Storage unavailable** (private mode, disabled storage) | Offline support degrades to "not available on this device". It never throws into a render. |

Recovery deletes **only** the DalyHub offline database. There is no code path from
the browser adapter to a server mutation; D1 is never involved in a local
migration.

Application version, service-worker build id and offline schema version are
coordinated: the build id carries the application version, and the schema version
is inside the namespace, so a schema change re-namespaces the data rather than
reinterpreting it.

---

## 10. Testing

### Automated

| Area | Where |
|---|---|
| Manifest fields, document metadata, icon assets, deterministic regeneration | `test/unit/pwa/manifest-and-icons.test.ts` |
| Cache versioning, precache selection, never-cache rules (read from the **emitted** worker) | `test/unit/pwa/service-worker.test.ts` |
| Retention boundaries, timezone and DST cases (Australia/Sydney) | `test/unit/pwa/offline-window.test.ts` |
| Identity/workspace namespacing and collision resistance | `test/unit/pwa/offline-identity.test.ts` |
| Schema ladder shape, first install, idempotent re-apply | `test/unit/pwa/offline-schema.test.ts` |
| Queue state machine, backoff, blocked-vs-failed, namespace refusal | `test/unit/pwa/offline-queue.test.ts` |
| Probe classification, sync state, staleness | `test/unit/pwa/offline-connection.test.ts` |
| Data minimisation, Today derivation, replay-outcome classification | `test/unit/pwa/offline-sync.test.ts` |
| Idempotency against **real D1**, including concurrency and boundaries | `test/kernel/offline-capture-receipts.test.ts` |
| The snapshot against **real repositories**, with field allow-lists | `test/kernel/offline-snapshot.test.ts` |
| The lifecycle in a **real browser** | `e2e/pwa-offline.spec.ts` |
| Performance and storage ceilings | `e2e/pwa-budget.spec.ts` |
| Review screenshots | `e2e/pwa-screenshots.spec.ts` |

Two things the E2E setup forced into the open, both handled rather than worked
around:

- **`context.setOffline` does not reach fetches issued from inside the service
  worker** in Chromium. The offline helper therefore also aborts at the route
  level; without that, the "offline" tests silently exercised the *online* path.
- **A synced capture is pruned from the queue by design** (the queue shows work
  that still needs to reach DalyHub, not a history), so "drained" is the correct
  assertion rather than "all synced".

### What automation does NOT prove

The Playwright suite runs against the **development** server, because it is the
only one of the two servers with an authenticated session (the production-mode
server is deliberately fail-closed). The dev server serves the same worker code
with an empty precache list, so the worker's runtime behaviour is real — but a
Vite dev server's module graph is not precached, so **fully hydrated offline
rendering from the precached production bundle is not covered by automation.**
It is item 8 on the manual checklist below and must be verified on a device
before this is called production-ready.

### Manual device checklist

Nothing below has been run on physical hardware in this environment. Each line
needs a real device.

**Setup**

1. Deploy to production and confirm `/manifest.webmanifest` and `/sw.js` are
   served (200, correct content types) **while signed in**.

**iPhone Safari (current iOS)**

2. Open DalyHub signed in. Share → Add to Home Screen → Add.
3. The home-screen icon is the DalyHub mark, correctly masked, with no black ring
   or double-rounded edge.
4. Launch from the home screen: it opens **without** browser chrome.
5. The status bar is legible in both light and dark appearance.
6. No content is obscured by the notch/Dynamic Island or the home indicator;
   check the sidebar sheet, the Drawer, modals and bottom controls.
7. Sign-in redirects still work from the standalone window, and no redirect loop
   occurs.
8. **Offline cold launch:** enable Airplane Mode, force-quit, relaunch from the
   home screen. DalyHub's offline surface must render — styled, hydrated, with
   the stored snapshot — not a browser error and not an unstyled document.
9. Capture an Inbox task, a note and a diary entry offline.
10. Disable Airplane Mode. The captures sync; each appears **once**.
11. Force an Access re-authentication (wait out the session or clear the Access
    cookie). Queued captures stay pending; sync resumes after signing in.
12. Text size at the largest accessibility setting: no overlap, no clipping.
13. Pinch-zoom works.

**iPad Safari**

14. Repeat 2–8 at both a full-screen and a split-view width.

**macOS Safari**

15. Favicon renders in the tab; bookmarking works; offline reload behaves.

**Chrome/Edge desktop**

16. The install prompt appears; Settings → Install works; the installed window has
    the DalyHub icon and title.
17. Offline reload in the installed window renders the offline surface.
18. DevTools → Application: one worker, one `dalyhub-static-*` and one
    `dalyhub-shell-*` cache, no accumulation across a redeploy.

**Update behaviour**

19. Deploy a change. An open tab shows "Update available"; "Reload to update"
    activates the new worker and the superseded caches are gone.
20. Confirm the prompt does **not** reappear repeatedly after updating.

**Appearance**

21. Light and dark; each of the five themes on the `/offline` page and the
    Settings section.

---

## 11. Known limitations

1. **Offline editing, completion and deletion are not supported.** Deliberate:
   they need conflict analysis this milestone did not do.
2. **Editing a queued capture before retrying is not implemented.** A rejected
   capture can be discarded and re-captured. Recorded rather than half-built.
3. **Full note and diary bodies are not stored offline.** Excerpts only.
4. **No pinning.** Only records the seven-day window pulls in are stored.
5. **Hydrated offline rendering is not covered by automation** (§10).
6. **Logging out does not automatically wipe local data.** DalyHub has no
   client-side logout hook that runs before the Access session ends; clearing is
   the explicit Settings control. Stated here rather than implied.
7. **`offline_capture_receipts` are never pruned.** They are small and bounded by
   how many offline captures the owner makes, and `created_at` is indexed for a
   future age-based prune. Nothing prunes them today.
8. **`theme-color` does not follow the five DalyHub themes** — only light/dark.
   Changing it per stored preference needs a client script.
9. **A snapshot is a full replacement, not an incremental delta.** At the measured
   8.5 kB this is not worth the complexity; revisit if it grows.
10. **A capture whose replay request never came back is reported, not resolved.**
   D1 has no interactive transaction that can span the module's own creation
   code, so a Worker that dies between claiming the key and finishing the receipt
   leaves an outcome nothing can determine after the fact. The key is retired and
   the owner is asked to check whether the capture arrived (§6.3). Making this
   decidable needs the create itself to be idempotent — a record whose primary key
   derives from the idempotency key — which is the next milestone's work, not a
   patch on this one.
11. **A waiting task with no due or scheduled date is not stored offline.** The
   same window rule applies to waiting work as to every other open task, and an
   undated task has no date to place inside the window. Consistent, and stated
   rather than surprising.

---

## 12. Measurements

Measured 2026-08-02 against the production build of V2.0.1. The same numbers are
enforced as ceilings by `e2e/pwa-budget.spec.ts`.

| Metric | Measured | Budget |
|---|---|---|
| Service-worker script | 12,147 B | 24 kB |
| Precached assets | 23 | 40 |
| Precache size (uncompressed) | 674,322 B | 1.2 MB |
| Snapshot payload | 8,549 B (23 tasks, 3 notes, 4 diary, 1 meeting, 7 references) | 2 MB |
| Snapshot build (end to end) | 166–179 ms | 5 s |
| Origin storage after priming | 78,252 B | 20 MB |
| Origin storage after 3 syncs | 78,252 B → 78,252 B → 78,252 B (flat) | no growth |
| Added runtime dependencies | **none** | — |
| Effect on the online bundle | The offline provider and status surface are in the shell chunk; the offline page and its view are a separate route chunk. | — |

---

## 13. Operator troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **Stale service worker** — an old build persists | The waiting worker was never activated | Settings → Offline & app → "Reload to update". Failing that, DevTools → Application → Service Workers → Unregister, then hard-reload. Nothing is lost: the snapshot rebuilds and queued captures survive. |
| **Install option never appears** | Most often the manifest 401/302'ing behind Access | Confirm `<link rel="manifest" crossorigin="use-credentials">` is present and `GET /manifest.webmanifest` returns 200 **with** the Access cookie. Then check the worker is registered and the origin is HTTPS. |
| **Blank or unstyled offline launch** | The shell document cached but its CSS/JS were not | Check `dalyhub-static-*` holds the `/assets/*.css` and entry chunks. Reconnect and reload once to re-prime. |
| **Corrupt IndexedDB** | Interrupted upgrade, or a browser fault | The adapter detects missing stores and rebuilds automatically. If it persists: Settings → Reset offline data. Server data is untouched. |
| **"This browser holds DalyHub offline data from a newer version"** | An older bundle after a rollback | Reload to get the current release. **Do not delete the database** — a newer release's un-synced captures live there. |
| **Failed local migration** | A step threw | The transaction aborts and the version does not advance; the next open recovers. Settings → Reset offline data if not. |
| **Records stuck in the sync queue** | Status tells you which: `blocked` = sign in; `failed` = read `lastError` | `blocked`: sign in again, sync resumes. `failed`: read the reason, Retry, or Discard after confirming. |
| **Expired Access authentication** | Session lifetime elapsed | Sign in again. Sync is **paused**, not failing, and nothing is lost. |
| **Mismatched workspace** — captures do not sync | They belong to a different identity/workspace namespace | Sign in as that identity. They are never replayed into the wrong workspace by design. |
| **Repeated update prompt** | The waiting worker never activates (another tab holds an old one) | Close every DalyHub tab and reopen. |
| **Clear only local state without touching D1** | — | Settings → Offline & app → Reset offline data. Nothing in this path can write to the server. |

### Rollback

The milestone is additive. To roll back:

1. **Deploy the previous release.** The old bundle has no `/sw.js`, but the
   installed worker persists and keeps serving cached assets — so also
   **unregister** it, either by shipping a `/sw.js` whose `install` calls
   `self.registration.unregister()`, or by having owners clear site data.
2. **Migration `0027` can stay.** It is one new table with no reader outside the
   offline queue; leaving it is inert. Dropping it is safe only if no queued
   capture is mid-replay.
3. **Local data can be left in place.** It is namespaced by schema version, so a
   later re-deploy adopts or re-namespaces it; nothing server-side depends on it.

---

## Related documents

- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — where these layers sit.
- [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) — the Cloudflare Access boundary this composes with.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — production deploy and migrations.
- [`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md) — ADR-066.
- [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) — what offline work remains.
