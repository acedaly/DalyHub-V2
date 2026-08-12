# CAL-01 — Unified External Schedule

> **Delivered 2026-08-12.** External read-only ICS calendars → DalyHub schedule →
> Today / Tomorrow / Next 7 days → optional canonical DalyHub Meeting.
>
> Governed by [`AGENTS.md`](../../AGENTS.md). The architectural decision is
> [ADR-091](../decisions/ARCHITECTURE_DECISIONS.md#adr-091); the design contract
> is [`DESIGN_SYSTEM.md → The Today screen`](../design/DESIGN_SYSTEM.md#the-today-screen);
> the deployment configuration is [`DEPLOYMENT.md`](../development/DEPLOYMENT.md).

---

## 1. Product purpose

**DalyHub should know what is happening in the owner's day, without becoming
another calendar application.**

Today was truthful about Tasks and blind to everything else. An owner with four
meetings, a workshop and a dentist appointment saw a Focus panel that said
"3 tasks planned" and implied a free day. CAL-01 makes Today aware of the day it
is actually describing.

The external calendar remains the **scheduling authority**. DalyHub subscribes to
it read-only, projects it locally, and combines it with the Tasks, Today and
Meetings capabilities it already has. Nothing in this feature writes to an
external calendar, and nothing in it can.

---

## 2. The architectural boundary

This is the load-bearing decision, and everything else follows from it.

| | External calendar event | DalyHub Meeting |
|---|---|---|
| Answers | *What is happening at this time?* | *What do I need to prepare, capture, decide and follow up?* |
| Owned by | the external calendar | DalyHub |
| Lifecycle | a disposable projection, rebuilt on every refresh | a first-class entity with Activity, links and follow-up Tasks |
| Created by | synchronisation | an explicit owner action |

    ExternalCalendarEvent  →  may link to  →  Meeting

and never `ExternalCalendarEvent = Meeting`.

Lunch, leave, focus time, travel, appointments, school events, reminders and
recurring blocks are all calendar events. None of them is a Meeting, and nothing
in this feature turns one into a Meeting without the owner pressing a button.

**Consequence, stated because it is the point of the whole design:** a refresh
can create, update and delete external events freely, and can never create,
update, archive or delete a Meeting.

    External ICS feeds
            ↓  scheduled refresh (cron) · Refresh now · add-a-source validation
    Calendar source synchroniser          app/platform/calendar
            ↓
    External calendar projection          external_calendar_events (D1)
            ↓
    Unified Schedule read model           app/kernel/calendar/schedule.ts
           ↙        ↓        ↘
       Today    Tomorrow   Next 7 days
            ↓  explicit owner action
    Existing DalyHub Meeting authority    scope.meetings.create
            ↓
    Existing Meeting follow-up → Tasks

---

## 3. Where it lives

```text
app/kernel/secrets/            the sealed-secret primitive (cross-product, see §5)
app/kernel/calendar/
  calendar.ts                  domain vocabulary + every bound
  feed-url.ts                  the URL policy — the SSRF control (§6)
  schedule.ts                  the unified Schedule read model (pure)
  sync-plan.ts                 reconciliation (pure)
  sync-window.ts               the retention/read window, derived in one place
  calendar-messages.ts         every owner-facing sentence about sync
  calendar-repository.ts       storage ports
  calendar-validation.ts       the owner-supplied half
app/platform/calendar/
  ics-parser.server.ts         ical.js → bounded occurrences
  feed-fetch.server.ts         the guarded, bounded fetch
  calendar-secrets.server.ts   seal/open the feed URL
  calendar-sync.server.ts      the refresh itself
  scheduled-refresh.server.ts  the Worker cron entry point
app/platform/storage/d1/       two workspace-bound repositories
app/modules/today/
  day/schedule-load.ts         ONE workspace read behind three surfaces
  schedule/                    ScheduleList · EventDetail · DayNav · drawer
  routes/tomorrow.tsx          CAL-02
  routes/upcoming.tsx          CAL-02
  routes/schedule.tsx          CAL-03 — the one write
app/modules/settings/          CalendarSourcesSection + routes/calendars.tsx
app/styles/schedule.css        every value a DS-01 token
migrations/0041_create_external_calendar.sql
```

The kernel is free of `ical.js` and of the network; the platform layer owns both.
Replacing the parser is a change to one file.

---

## 4. Source security — the feed URL is a credential

A published ICS link **is** the credential: anyone holding it can read that
calendar. It is treated accordingly, and the treatment is structural rather than
a matter of care:

| Requirement | How it is guaranteed |
|---|---|
| Never in Git | no URL in source, fixtures, tests or screenshots — every one is `calendar.example.com` |
| Never in source code | it arrives in one form field and leaves that function sealed |
| Never logged | nothing in the calendar path writes a log line at all |
| Never in Activity | the whole feature appends no Activity (§9) |
| Never returned to the browser | `CalendarSourceView` has **no URL, host or fingerprint field**, and the repository's ordinary read does not `SELECT` the column — two independent reasons |
| Never in an error | every message comes from a closed table; a remote body never reaches a string |
| Never in analytics | DalyHub has none |
| Encrypted at rest | AES-256-GCM, key held as a Cloudflare secret |

The one read that returns the sealed value — `listForRefresh` — is called by the
synchroniser and by nothing else.

**Proven, not asserted.** `test/kernel/calendar-sync.test.ts` reads the raw D1 row
and asserts the plaintext is absent; `e2e/calendar.spec.ts` reads the rendered
Settings HTML and asserts the same.

---

## 5. Encryption strategy

DalyHub already held two kinds of secret, and neither pattern fitted:

- a **capture token** is stored as a SHA-256 digest, because nothing ever needs
  the token back;
- an **AI provider key** is a Worker secret, because there is one of it and the
  owner never configures it.

A feed URL is the first value that is **both** a credential and owner-supplied
data: the owner adds several and removes them, so it must live in D1, and the
synchroniser must recover the exact URL, so a digest is not an option.

That combination will recur, so the primitive is a **kernel** one
(`app/kernel/secrets`) rather than Calendar code — crypto embedded in a feature
module is how a product ends up with two implementations of it.

**The design.** AES-256-GCM through the Web Crypto API the Workers runtime
already provides. No invented construction, no third-party crypto dependency, and
the same API in the Workers runtime, in Node 22 and in the Workers Vitest pool —
so the tests exercise the real thing.

    sealed := "v1" "." base64url(iv, 12 bytes) "." base64url(ciphertext||tag)

Three properties, each of which earns its place:

- **Authenticated.** GCM's tag is verified on open, so a tampered row *fails*
  rather than decrypting to an attacker-chosen URL the synchroniser would fetch.
- **Context-bound.** The AEAD additional data names the purpose *and the
  workspace*, so a ciphertext moved between workspaces does not open.
  Confidentiality alone would not have stopped that.
- **Random per seal.** A fresh IV per operation, so the column leaks nothing by
  comparison — which is why duplicate detection uses a separate **keyed HMAC**
  fingerprint rather than comparing ciphertexts, and keyed rather than a bare
  digest so a database dump plus a guessed URL confirms nothing.

**Configuration.** One secret, `APP_ENCRYPTION_KEY`: 32 random bytes, base64
(`openssl rand -base64 32`), set with `wrangler secret put`. Deliberately **not**
a committed `var` — a committed var of the same name would override the secret.

- **Without it:** nothing breaks. Settings says encrypted storage is not
  configured and refuses to store a link; the scheduled refresh is a no-op; every
  other part of DalyHub is unaffected.
- **If it changes:** stored links can no longer be opened, so their refreshes
  fail with a configuration error and the owner re-adds each calendar. Nothing
  else in DalyHub is encrypted with it. There is no rotation mechanism, and that
  is a deliberate omission for a personal deployment holding a handful of URLs.

---

## 6. SSRF protections

"Add a calendar" is a control that makes the **server** fetch an address the
owner types. That is server-side request forgery by design; the only thing
separating it from a generic internal-network HTTP proxy is
`app/kernel/calendar/feed-url.ts`.

The policy, applied at **three** moments — add, edit, and *every redirect hop*:

1. **`https:` only**, with `webcal:` accepted and rewritten to `https:`. Plain
   `http:` is **refused, not upgraded**: the link is a credential, and sending it
   in clear is not a trade DalyHub makes for one non-TLS publisher.
2. **No credentials in the URL** (`user:pass@`) — refused rather than stripped,
   because silently changing what the owner pasted produces a source that works
   in validation and fails forever after.
3. **No loopback, private, CGNAT, link-local, unique-local, multicast or reserved
   target**, as a literal IPv4 or IPv6 address or as a name that can only be
   local (`localhost`, `*.local`, `*.internal`, `*.home.arpa`, `*.lan`, and any
   bare dot-less hostname). `169.254.169.254` is covered by the link-local rule.

   **IPv6 literals are expanded to numbers, not matched as text.** The WHATWG URL
   parser canonicalises `https://[::ffff:127.0.0.1]/` to `[::ffff:7f00:1]`, so a
   check looking for a dotted quad never fires — the address arrives as hex. Every
   IPv4-mapped and IPv4-compatible form therefore has its embedded address
   reconstructed from the last two groups and run through the full IPv4 denylist,
   which is the only form of this check the parser cannot rewrite out from under.
   An IPv6 literal the policy cannot parse is refused rather than allowed.
4. **Port 443 only** — which removes port scanning from the surface entirely.
5. **Redirects followed manually** (`redirect: "manual"`), bounded at 3 hops,
   with every `Location` revalidated through the same function. An automatic
   follower would let a publisher redirect DalyHub somewhere the policy refused.
6. **The body is bounded while streaming** (5 MB), not after buffering: a hostile
   server can understate or omit `Content-Length`, and `await response.text()`
   would have exhausted the isolate before anything objected.
7. **The request is bounded in time** (10s) and carries no cookies, no
   credentials and no owner data. DalyHub does not tell a publisher who is asking.

**The residual risk, stated rather than implied.** A hostname is not resolved
before fetching — a Worker cannot — so a name that resolves to a private address
(DNS rebinding) passes rules 3–4 on its literal form. On Cloudflare's edge that
buys an attacker a request to an address the Worker cannot route to anyway. On a
self-hosted runtime it would be real. This is a documented limitation, not an
oversight; the mitigation if DalyHub ever runs outside Workers is a resolving
proxy in front of the fetch.

---

## 7. ICS parsing — the dependency decision

**Chosen: `ical.js` 2.2.1** (mozilla-comm, **MPL-2.0**, zero dependencies).

RFC 5545 is not a format you split on `BEGIN:VEVENT`. A conforming feed folds
long lines at 75 octets, escapes commas/semicolons/newlines inside TEXT values,
carries `VTIMEZONE` components defining their own DST rules, expresses recurrence
as `RRULE` + `RDATE` − `EXDATE`, and expresses exceptions to a series as
*separate* `VEVENT`s bound by `RECURRENCE-ID`. A hand-rolled parser gets the
simple cases right and is silently wrong about a moved meeting, a cancelled
occurrence and every event during a DST transition — precisely the cases a
schedule must be right about.

Evaluated against the [OSS checklist](../governance/OPEN_SOURCE_POLICY.md#reusable-evaluation-checklist):

| Criterion | Finding |
|---|---|
| **Workers compatibility** | Zero dependencies, pure JavaScript, no `fs`/`Buffer`/`stream`. **Verified in the real runtime** by `test/kernel/calendar-ics-parser.test.ts`, which runs in the Workers Vitest pool rather than in Node. |
| **Bundle/runtime impact** | ~78 KB minified, imported **only** from `ics-parser.server.ts`. Verified absent from `build/client/` — it never enters a browser bundle. |
| **Licence** | MPL-2.0 — file-level weak copyleft, which AGENTS.md §11 places in *"requires an explicit, documented decision"*. Used **unmodified** as an npm dependency, never vendored and never patched, so no MPL file is modified. Recorded in `THIRD_PARTY_NOTICES.md`. |
| **Focus** | An RFC 5545 parser, not a calendar framework. Exactly one function crosses our boundary; `ical.js` types never appear in its signature. |
| **Health** | The reference JavaScript implementation, maintained by the Mozilla calendar project, used by Thunderbird's calendar. |

**Alternatives considered.** `rrule` (BSD-3) solves recurrence but not parsing, so
it would have left us hand-rolling the ICS half — the thing CAL-01 explicitly
forbids. `node-ical` depends on Node built-ins. A hand-rolled parser was rejected
on the grounds above.

**Bounds are part of the parser, not around it.** A feed is untrusted input from a
server DalyHub does not run, so every loop is capped: 5,000 components read, 400
occurrences per series, 2,000 per source, and the window itself. `FREQ=SECONDLY`
is a legal rule and would otherwise be an unbounded write loop. One malformed
`VEVENT` is **skipped**, not fatal: a feed with one bad row still has a useful day
in it.

**Zone isolation.** The feed's own `VTIMEZONE` definitions are registered for the
duration of one parse and unregistered afterwards, so one publisher's idea of
`Australia/Sydney` can never leak into another feed's parse.

### Resolving an instant and storing a timezone are two different concerns

A feed's `VTIMEZONE` **may** be used to resolve an event's UTC instants, and is.
It states the offsets and the DST rules, so `ical.js` produces a correct
`startsAt`/`endsAt` from it with no IANA lookup involved. That behaviour is
required and unchanged.

The `TZID` **string** is a different thing: it is chosen by the publisher and is
not required to be an IANA zone. Outlook and Microsoft 365 publish Windows zone
names (`AUS Eastern Standard Time`), and smaller publishers emit wholly custom
labels. `new Intl.DateTimeFormat("en", { timeZone: value })` — the check every
DalyHub timezone authority performs, including Meeting validation — throws for
all of them.

So the occurrence's `timezone` column means **"a timezone DalyHub can
legitimately use"**, and the parser records the feed's `TZID` there only when
`isSupportedTimezone` (`~/kernel/preferences`, the same authority SET-01 validates
the owner's timezone with) accepts it. Anything else is stored as **NULL** rather
than persisted as though it were an IANA zone. Null is honest: the instants are
exact either way, and every surface that needs a zone falls back to the owner's —
which is what it already did for a floating time.

There is deliberately **no Windows→IANA mapping table and no provider-specific
translation layer** (§44). The instants are already resolved, so a mapping would
buy only a display label, and a wrong guess would silently mislabel a record the
owner owns.

---

## 8. Recurrence identity

Calendar recurrence belongs to the external calendar. DalyHub stores **expanded
occurrences**, never an `RRULE` — a rule DalyHub re-evaluated would be a second
scheduling authority over data it does not own, and CAL-01's Task recurrence model
is deliberately untouched.

The durable identity of an occurrence is:

    (source_id, external_uid, occurrence_key)

where `occurrence_key` is the empty string for a non-recurring event and the
**original slot** of a recurring occurrence (RFC 5545's `RECURRENCE-ID`, as a UTC
instant) otherwise.

Using the *original* slot rather than the current start is what makes a **moved**
occurrence keep its identity: Outlook shifting the 10 August instance from 10:00
to 11:30 updates a row rather than creating one — and therefore does not break the
Meeting linked to it.

Handled, each with a test:

| Case | Behaviour |
|---|---|
| daily / weekly / monthly recurrence | expanded into distinct occurrences inside the window |
| `EXDATE` | the excluded occurrence is absent |
| moved occurrence | one row, at its new time, under its new title, with its identity intact |
| retitled / relocated occurrence | the change lands on that occurrence alone |
| cancelled occurrence | **kept**, marked cancelled — the owner needs to know on the day |
| series removed | its occurrences vanish from the projection; linked Meetings remain |
| a series that started years BEFORE the window | expanded correctly — the per-series bound counts occurrences **in the window**, not steps from `DTSTART` |
| recurrence explosion | truncated at the per-series bound, and the refresh then **refuses to reconcile** (see §9) |

---

## 9. The sync algorithm

Reconciliation is a **pure function** (`sync-plan.ts`), so "is refresh idempotent?"
has a proof rather than an opinion.

Given the occurrences a feed currently claims and the occurrences stored for that
source, every occurrence is exactly one of:

- **created** — in the feed, not stored;
- **updated** — in both, and at least one imported field differs. Compared
  **field by field**, not by `LAST-MODIFIED`: publishers stamp that inconsistently,
  and a refresh that rewrites every row every fifteen minutes is not idempotent in
  any sense the owner would recognise;
- **unchanged** — only `last_seen_at` is touched, so a quiet feed produces a
  near-zero-write refresh;
- **vanished** — deleted, because it is a projection. **The Meeting it may be
  linked to is not deleted, and neither is the link.**

Matching is on identity, never on title or time. `Meeting with Bob @ 10am` moving
to 11am is the *same* event; two unrelated events called "Standup" are two events.

**Atomicity.** All four outcomes land in ONE D1 batch: a refresh either applies
completely or leaves the previous projection exactly as it was. A half-applied
refresh would show the owner a day that never existed, and every row on screen
would look plausible.

**A truncated parse is refused before reconciliation.** A partial result is the
one input reconciliation must never see: every occurrence missing only because a
bound fired looks exactly like an occurrence the feed has removed, and would be
**deleted**. So a truncated parse fails the refresh with `too_many_events`, the
last complete projection stays in place, and the owner is told the feed is larger
than DalyHub imports — rather than being silently handed a fragment of their day.

**Concurrency.** A refresh is claimed with a conditional `UPDATE` on
`refresh_claimed_at`, so the *database* picks the winner — a double-tap on
"Refresh now", or a manual refresh racing the cron, does the work once. The claim
is **released when the refresh finishes**, and is a separate column from
`last_sync_attempt_at` for exactly that reason: sharing them made a *completed*
refresh block the next one for two minutes and report "a refresh is already
running" when none was. A claim left by a Worker killed mid-refresh ages out after
two minutes. (Regression test:
`does not block a manual refresh that follows a completed one`.)

**No Activity.** Nothing in the calendar path appends an Activity event.
Synchronisation is infrastructure, not something the owner did; a stream carrying
"imported 43 events" four times an hour would drown the events that genuinely are
the owner's history (ADR-012). Creating a Meeting *does* produce the normal
Meeting-domain Activity, because that is an owner action on a DalyHub record.

---

## 10. Retention window

**30 days past → 90 days future**, anchored on the **owner's** calendar date and
their midnights (AUDIT-14), not UTC's.

It is derived in one place (`sync-window.ts`) because three callers must not
disagree: the synchroniser (what to import), the pruner (what to discard) and the
schedule read (what is available). A pruner narrower than the reader would put a
hole in Next 7 Days; wider, and the projection grows without bound.

30/90 is the smallest window serving all five product needs — Today, Tomorrow,
Next 7 Days, upcoming meeting preparation and modest recent context — with room
for a monthly series to be visible before it happens. Old occurrences outside it
are pruned safely: they are projections, and anything still in the feed returns on
the next refresh. **Linked Meetings are unaffected**, because the link is keyed on
external identity rather than on a row id — so a pruned-and-reimported occurrence
finds the same Meeting (tested).

---

## 11. Refresh model

**Cloudflare Cron Triggers on the same Worker**, every 15 minutes. Same Worker,
same D1 binding, no Durable Object, no Queue, no second service — every
alternative would have added a component to a personal deployment to do the same
thing.

The cadence is a bound on cost and on how hard DalyHub polls someone else's
server, and the product says so in plain words: *"This is not live: a change you
make in your calendar shows up at the next refresh."* Anything faster is
impolite; a push channel would need provider OAuth, which CAL-01 does not do.

Also: **Refresh now** per source in Settings, and a first refresh **immediately**
when a source is added, so the schedule is populated by the time the owner reaches
Today rather than up to fifteen minutes later.

The handler never throws — a `scheduled` handler that throws is only ever a log
line nobody reads — and is inert when no encryption key is configured, so an
unconfigured deployment does not mark every source red.

### What the UI says, and when

| State | Sentence |
|---|---|
| never refreshed | **"Never synced"** — never "Connected" |
| last refresh worked | "Synced 4 minutes ago" |
| last refresh failed, none ever worked | the failure sentence alone |
| last refresh failed over an earlier success | *both*: "Last refresh failed. Showing events from 12 minutes ago. …" |
| disabled | "Paused — its events are hidden and it is not refreshed." |
| in flight | "Refreshing…" on the control |

The last row of that table is the one that matters most: a failed refresh leaves
the previous projection in place, because an older real day beats no day — and the
surface states its age rather than pretending the refresh succeeded. Today carries
the same line when any enabled source is failing.

---

## 12. Failure handling

Every failure resolves to a **code** from a closed set, never a message and never
any part of a remote response — a hostile feed cannot put text on the owner's
screen, and a failure message is exactly where a leaked credential ends up in a
screenshot.

| Code | Cause | Owner-facing meaning |
|---|---|---|
| `unreachable` | DNS/TLS/connectivity, or a redirect with no `Location` | could not reach it |
| `timeout` | past 10s | took too long; will try again |
| `unauthorised` | 401/403 | the published link may have been reset |
| `not_found` | 404/410 | the address no longer exists |
| `server_error` | 5xx | the calendar service has a problem |
| `not_calendar` | the body is not iCalendar (usually an HTML sign-in page) | you copied the page, not the link |
| `too_large` | past 5 MB, declared **or** streamed | too large to read |
| `unparseable` | truncated or malformed calendar | not a standard feed |
| `too_many_events` | past the per-source bound | more events than DalyHub imports |
| `blocked_target` | the URL policy refused it, at entry or on a redirect | points at a private or local network |
| `too_many_redirects` | past 3 hops | redirects too many times |
| `not_configured` | no encryption key | encrypted storage is not configured |
| `storage` | a D1 failure | could not save; will try again |

**One source failing never affects another** — sources are refreshed in sequence
with independent outcomes. **One malformed event never fails a source.** **A
calendar outage never makes Today fail**: Today reads the local projection, so a
scope failure degrades that section to empty and the page still renders.

---

## 13. Privacy minimisation

Imported: title, start, end, all-day state, timezone, location, an online meeting
URL when one is reliably extractable, cancellation status, external identity.

**Not** imported, and with nowhere in the schema to put them: event
description/body, attendees, attendee emails, organiser, attachments, extended
properties, provider-specific fields. No People are created from a calendar and no
attendee matching is attempted.

The join URL is taken only from fields that *mean* "join here" —
`X-MICROSOFT-SKYPETEAMSMEETINGURL`, `CONFERENCE`, `URL` — and only when the value
is `https:`. The **description is never scanned**: body text is exactly what
CAL-01 refuses to import, and finding a URL in it would mean reading it. A
`javascript:` or `data:` value in an untrusted feed never becomes a pressable link.

---

## 14. Today integration (CAL-02)

**Today was not redesigned.** TODAY-10 owns Focus and is untouched: the same three
bands, the same classifier, the same bounds, the same ordering, the same stat row.

What changed is one region. Today already had a **Schedule** panel holding
Meetings; it now holds the *unified* schedule — every occurrence from every
enabled source, plus the DalyHub Meetings no occurrence already represents, in one
chronology. The region, its heading and its position are unchanged.

**Why Meetings are merged rather than listed beside.** Two lists would have given
the owner two chronologies of one day to reconcile, and a Meeting created *from*
an event would have appeared in both. One row per real thing, whichever side it
came from.

The "Meetings today" figure still counts DalyHub Meetings and still links to
`/meetings`. It is now **derived from the same schedule read** rather than from a
second pair of Meeting queries — so the figure and the panel cannot disagree, and
Today issues no additional queries versus TODAY-10.

### Current/next intelligence

`Now` and `Next` are each awarded to at most one row, only on the owner's actual
today, and are decided **once on the server** against the request instant. They
are **words**, not colours. There is no countdown, nothing that re-renders on an
interval, no notification, and no claim about lateness or attendance. `Next`
skips a cancelled event.

### A timed event that ends on another day

An event running 14:00 Wednesday to 12:00 Thursday used to render under a single
**Date** as "2:00 pm to 12:00 pm" — which reads as an end before its own start.

A timed row whose start and end fall on **different owner-calendar dates** now
states the transition explicitly, and states it against the day being shown, so
the same occurrence reads correctly on each of the days it appears on:

| Viewing | Time block | Supporting line | Detail sheet / accessible name |
|---|---|---|---|
| Wednesday | `14:00` / `12:00` | `Until Thu 13 Aug · Work` | `2:00 pm to 12:00 pm on Thursday 13 August` |
| Thursday | `14:00` / `12:00` | `From Wed 12 Aug · Work` | `2:00 pm on Wednesday 12 August to 12:00 pm` |

Same-day events keep the concise `08:30–09:00` range and the plain `8:30 am to
9:00 am` sentence — nothing changed for them.

Held with it:

- **the boundary is the OWNER's midnight, never UTC's.** A UTC reading calls a
  23:30–00:30 Los Angeles event same-day (both instants land on one UTC date) and
  calls a 09:00–10:00 Sydney event a crossing (its start is 23:00Z the day
  before). Both are wrong on the surface the owner is looking at;
- **an end falling exactly on midnight is not a crossing.** ICS ends are
  exclusive, so 23:00–00:00 belongs to the day it started — the same rule
  `scheduleFactDates` files it under, so the row's words and the row's placement
  cannot disagree;
- **a cross-day timed event is not an all-day event.** It keeps both clock faces,
  stays in the timed column and sorts by its start instant. Ordering is unchanged;
- **one string serves both readings.** The detail sheet renders the accessible
  label, so a screen reader and a sighted reader are given the same sentence;
- **it is a projection, still read-only.** No instant is altered and nothing is
  written back.

### Mobile (320–430px)

The row is a leading two-line time block (start over end, tabular, fixed 3.25rem
slot — 2.875rem below 30rem), a source accent mark where a Task's completion
circle stands, then the title with one quiet supporting line under it. Long titles
truncate with an ellipsis; the full title is in the row's accessible name and on
the detail sheet. All-day items have no time slot at all. Verified at
320/375/390/430 with no horizontal overflow (`e2e/calendar.spec.ts`), and captured
in [`docs/design/assets/cal-01-2026-08/`](../design/assets/cal-01-2026-08).

**Built to MOBILE-01's conventions**, which landed on `main` while this was in
progress:

- the schedule row's title IS `.dh-day-row__title`, so it inherits MOBILE-01's
  `(hover: none)` touch-target padding for free — the whole row height is a
  target, and no list grew by a pixel;
- the row's "Open notes" link takes the SAME padding-and-negative-margin
  technique against `--app-touch-target-min`, rather than inventing a floor;
- every prose empty state on the three surfaces uses `.dh-today__quiet--prose`,
  the variant MOBILE-01 added so a sentence is a sentence rather than a row of
  flex items;
- every text field is the shared DS-06 control, so it is above the 16px floor
  that stops iOS Safari zooming and leaving the page scrolled sideways;
- no rule in `schedule.css` writes a raw `env(safe-area-inset-*)` or a device
  pixel value — MOBILE-01 made those one token each, and nothing here needs them
  because the Schedule owns no sticky or edge-anchored chrome.

### Desktop

The existing three-region body, unchanged: Focus · Schedule · Needs attention,
inside Today's existing bounded page geometry. Not a stretched phone row, and not
a corporate calendar dashboard.

---

## 15. Tomorrow and Next 7 days (CAL-02)

Reached from a restrained rail under Today's own heading —
**Today · Tomorrow · Next 7 days** — drawn with the *shared* `ViewTabs` rail every
other collection uses, extended with an optional path target because these are
three routes rather than three values of one search param.

**Tomorrow** (`/today/tomorrow`) shares the primitives rather than copying Today:

- the **same** schedule read (`loadScheduleWindow` / `scheduleForDate`);
- the **same** Task date classifier. TODAY-10's `focusBand` was split so its
  due/planned half (`dateBand`) is reused directly — "Due tomorrow" and "Planned
  tomorrow" mean exactly what "Due today" and "Planned today" mean;
- the same rows, rail and Drawer.

It deliberately carries **no overdue band**, no attention rail, no Goal progress
and no stat row. Nothing can have slipped relative to a future date, and Today
remains the product's one overdue attention surface.

**Next 7 days** (`/today/upcoming`) is seven day groups, each with the day's
schedule and one restrained line ("3 planned tasks") — a **count**, not a list,
because a forward agenda that reprints every Task becomes the Tasks collection
with worse filtering. Two columns from the tablet boundary up; deliberately not a
seven-column grid, which is a week timetable.

The whole window is one schedule read, one Task read and two bounded Meeting
reads — the same query count as Today, not seven times it.

---

## 16. Event detail and the Meeting link (CAL-03)

Selecting an imported event opens it in the **shared DS-03 Drawer** — the same
affordance the Task record uses from the same page, with the same focus, history
and back behaviour, and on a phone the Drawer *is* the record's screen.

It shows only what DalyHub holds: date, time (or "All day"), the multi-day span,
the calendar's owner-given name, location, cancellation. No provider HTML, no
iframe, no feed URL. **Join meeting** appears when a reliable https join link was
imported, opened with `noopener noreferrer`.

The **Time** fact is the accessible label rather than the compact range, so a
timed event ending on another owner-calendar date names that date here too (§14,
"A timed event that ends on another day").

### Why "Create meeting notes" is not on every row

Most rows are not meetings. Putting a "make this a Meeting" control on Lunch,
Leave, Dentist and a recurring commute block invites exactly what §2 exists to
prevent — and costs three lines per row on a surface whose acceptance criterion is
that it stays compact at 320px.

CAL-01 §23 says the control appears "if an imported event is appropriate for
notes/work", and §44 forbids AI — so DalyHub cannot decide appropriateness. The
owner decides, by opening the event. The **row** carries "Open notes" only once a
Meeting genuinely exists; **creation** lives one tap away in the detail sheet,
where the owner can see what would be prefilled.

### The write

`POST /today/schedule/:eventId/meeting` calls `scope.meetings.create` — the same
repository, validation, Activity and record the Meetings module writes by hand.
There is no Calendar-specific Meeting repository, no second Meeting type and no
"imported" flag. Meeting validation is **not** bypassed: when a feed supplies
something the Meeting model refuses, the refusal is reported.

Prefilled: title, `startsAt`, `endsAt` (only when genuinely after the start),
timezone (the occurrence's own when it is a timezone DalyHub can use, else the
owner's), location, `meetingUrl`. **Not** prefilled: `mode` (an event can carry a
Teams link and still be held in a room), agenda, attendees.

**A Meeting's timezone is always a valid application timezone.** The route checks
the projected row's `timezone` with `isSupportedTimezone` before passing it on and
falls back to the owner's configured timezone when it fails. This is deliberately
defensive on top of the parser rule above, for two reasons: a projected row is
external data the route must not assume is well-formed, and production already
holds rows imported before that rule existed — a projection is only rewritten when
its source next refreshes.

The fallback changes **only** which zone the Meeting is written in. `startsAt` and
`endsAt` were resolved from the feed's own zone definition and are passed through
untouched, so the Meeting's instants are identical to the imported occurrence's.
Meeting validation stays authoritative and is not weakened to accept external
identifiers: the route supplies a value that is genuinely valid instead.

**An all-day occurrence gets owner-local bounds, derived from its DATES.** An
all-day item is a floating calendar date; the parser stores a placeholder instant
beside it so one column can order the whole schedule, and that placeholder is
midnight UTC. Passing it into the timed Meeting model made "Training Academy, 12
August" a Meeting at 10:00 on the 12th in Sydney — and at 17:00 on the *eleventh*
in Los Angeles. The bounds are therefore the owner's midnight on the first date to
the owner's midnight after the last, and the Meeting takes the owner's timezone
because an all-day item states none. No time is invented and the date is right
wherever the owner is.

**A failed link compensates the Meeting it just created.** If `linkMeeting`
errors after `create` succeeded, the Meeting is archived before the failure is
reported — otherwise it would be left unlinked, and the retry, finding no link,
would create a second one: the silent duplicate this endpoint exists to prevent,
arriving by the back door.

### The durable link

`external_calendar_meeting_links` is keyed on
`(workspace_id, source_id, external_uid, occurrence_key)` — the **external
identity**, not the event row id, deliberately and with no foreign key to the
events table. A projection row is disposable; the Meeting the owner wrote notes in
must survive pruning and re-import.

"One Meeting per occurrence" is therefore a **database guarantee**, not a check
the route performs. The sequence is find → create → claim; if a concurrent request
won the claim, this request archives the Meeting it just made (reversible, never a
hard delete) and reports the winner.

A `UNIQUE` index in the other direction stops one Meeting being claimed by two
occurrences.

### What survives what

| Event | Meeting | Link |
|---|---|---|
| refresh | untouched | intact |
| external title change | untouched — the projection follows the rename, the Meeting does not | intact |
| external time change | untouched — see §17 | intact |
| external cancellation | untouched; the event shows the cancellation | intact |
| external event disappears | untouched | intact (identity survives) |
| projection pruned and re-imported | untouched | re-attaches |
| **calendar source removed** | **untouched** | removed, with the events |

All nine rows are asserted in `test/kernel/calendar-meeting-link.test.ts`.

---

## 17. Cancellation and change behaviour

**Nothing a refresh does can rewrite an owner-edited DalyHub field.** The
projection follows the external source; the Meeting does not.

- **Title change.** Outlook renaming `Weekly Catch-up` to `L&D Weekly Catch-up`
  updates the schedule row at the next refresh. The linked Meeting keeps its
  title, because the owner may have changed it and the calendar has no authority
  over a DalyHub record.
- **Time change.** Same rule: the event moves, the Meeting does not.
- **Cancellation.** The event is kept and marked cancelled — struck through *and*
  labelled "Cancelled", never colour alone. The Meeting is not cancelled, not
  archived and not deleted.

**Deliberate current limitation.** CAL-01 §25 invites an explicit *"Calendar event
moved from 10:00 to 11:00 — Update DalyHub Meeting"* affordance. It is **not
shipped**: it needs a per-field "has the owner edited this?" signal the Meeting
model does not carry, and inventing one to serve a Calendar feature would be
exactly the kind of cross-module reach CAL-01 forbids. What shipped is the safe
half — never rewrite — and the divergence is visible because the event and the
Meeting are both on screen. Recorded as debt in §21.

---

## 18. Source identity and colour

Sources are named by the owner ("Work", "Personal", "Kids") and that name is what
the schedule shows — showing the URL would display a credential, which is why a
source *must* have a name.

Colour comes from the **shared design-system accent ramp**, allocated by the
source's stable creation rank — the same mechanism Areas use, audited for contrast
in both appearances and all five colour schemes. **No colour from the feed** ever
reaches the page: external calendars carry palettes chosen against their own
products' surfaces, and letting them through would put unaudited colour on a page
whose contrast is asserted. There is no user-supplied CSS colour anywhere.

The rank is computed over **all** sources including disabled ones, so pausing
"Family" does not change "Work"'s colour.

The mark is decorative; the source's **name** is beside it and in the row's
accessible name.

---

## 19. Performance

- **No feed is fetched in a page request.** `GET /today` reads the local
  projection only. Network work happens in the scheduled handler, in "Refresh
  now", and when a source is validated — nowhere else.
- **No N+1.** The schedule read is ONE statement carrying the source name, the
  source rank and the linked Meeting id already joined. Today does not ask per
  event; Next 7 Days does not ask per day.
- **Today's query count is unchanged from TODAY-10**: the schedule read replaced
  the two Meeting queries it used to issue.
- Bounded everywhere: response size, redirect count, components parsed,
  occurrences per series and per source, sources per workspace, occurrences read
  per window.

---

## 20. Testing evidence

| Suite | Coverage |
|---|---|
| `test/kernel/calendar-ics-parser.test.ts` (27) | **In the real Workers runtime** — timed/UTC/all-day/multi-day events, folded lines, escaped TEXT, daily/weekly/monthly recurrence, `EXDATE`, moved instance, cancelled instance, occurrence identity, **DST across the Sydney spring-forward**, midnight straddling, join-URL extraction and refusal, malformed event skipped, recurrence bomb bounded, window filtering, HTML refused, truncated feed refused, zone isolation between parses; **a Windows `TZID` resolved from the feed's own `VTIMEZONE` to the same instants as the identical IANA event and stored as NULL**, the same for a custom `TZID`, an IANA event keeping its zone, all-day unchanged, **a same-day end staying on the start day** and an inverted end normalised rather than rolled forward |
| `test/kernel/calendar-sync.test.ts` (17) | Real D1 — import, **idempotent re-refresh**, title change in place, time change keeping identity, vanished event removed, cancelled kept, multi-source merge, **source isolation**, previous projection kept on failure, `not_calendar`, disable/enable, **claim/release concurrency + the regression**, window enforcement, **no plaintext URL in the row**, no URL in the read, duplicate refused, source limit |
| `test/kernel/calendar-meeting-link.test.ts` (14) | Real D1 — ordinary Meeting created with mapped fields, **no second Meeting**, link joined into the schedule read, link survives rename / move / cancellation / disappearance / **source removal** / prune-and-reimport; **an occurrence whose feed named an unusable zone imports, stays usable and creates meeting notes on the owner's timezone with the imported instants intact**, including from a legacy row written before the parser fix, with an IANA-zoned event still keeping its own zone |
| `test/kernel/calendar-security.test.ts` (19) | Sealed-secret round trip, versioned envelope, random IV, wrong key refused, **wrong workspace refused**, **tampering refused**, weak key refused, keyed fingerprint; redirect followed, **redirect revalidated**, loopback redirect refused, redirect bound, oversized by header, **oversized while streaming**, status mapping, **no body/URL in errors**, blocked target refused before any request; scheduled handler inert and non-throwing |
| `test/unit/calendar/feed-url.test.ts` (17) | The URL policy as a security control — every scheme, credentials, port, ~25 blocked hosts/addresses, malformed input, fragment, **no URL in the refusal message**, provider hint suffix matching |
| `test/unit/calendar/schedule.test.ts` (32) | Ordering, all-day separation, span labels, **owner-timezone formatting**, Now/Next (and only on today, and never cancelled), control-character stripping, day membership incl. midnight straddle and exclusive ends, **the window in AEST and AEDT and across the transition**, reconciliation; **cross-day timed rows** — same-day unchanged, 2 pm Wednesday to noon Thursday from both of its days, a crossing of a few minutes, midnight-exact NOT a crossing, **an owner zone whose UTC date differs**, the Sydney spring-forward, a multi-day timed row keeping its ordering and its timed placement, zero-length and all-day rows |
| `e2e/calendar.spec.ts` (22) | The browser journey — Settings list/truthful state/**link never redisplayed**/blocked-URL refusal/http refusal/pause-resume/failed refresh/remove; Today merged chronology, all-day region, source labels, **Focus unchanged**, 320–430 no overflow, **axe clean**; event detail, Join link, **create ONE Meeting**, "Open notes" on the row, **no duplicate**; Tomorrow's date boundary, Next 7 days grouping, `aria-current`, phone widths; **an overnight event from a feed with an unusable timezone — it names the day it ends on and creates meeting notes instead of refusing** |

Totals: **101 new tests**, plus **26 regression tests** for the two production
defects below. Full suites green — `test:unit` 5,268 · `test:kernel` 2,457 · the
calendar and Today e2e specs.

### Four real defects the tests found

1. **A completed refresh blocked the next one.** The claim shared a column with
   "last attempt", so "Refresh now" silently did nothing for two minutes after
   every cron tick and reported a refresh already running when none was. Fixed by
   giving the claim its own column, released on completion; regression test named
   above.
2. **The Meeting record link was wrong.** Today's existing meeting row linked to
   `/meetings/:id`; the record route is `/meeting/:id` (singular), so it 404ed.
   Pre-existing on `main`, inherited when the row moved into `ScheduleList`, and
   fixed there — so both the calendar rows and Today's meeting rows now work.
3. **A valid ICS timezone could not create a Meeting.** A real Work calendar
   published `TZID:AUS Eastern Standard Time`. `ical.js` resolved it from the
   feed's own `VTIMEZONE` and the event imported perfectly — and "Create meeting
   notes" then answered *"Choose a valid timezone."*, because that identifier was
   stored as though it were IANA and handed to the Meeting model. Fixed on both
   sides: the parser stores NULL for a zone DalyHub cannot use, and the route
   falls back to the owner's timezone for rows already written. Meeting validation
   is unchanged. §7 and §16.
4. **A cross-day timed event read as ending before it started.** The same event
   ran 14:00 Wednesday to 12:00 Thursday and rendered under one **Date** as
   "2:00 pm to 12:00 pm". Timed rows now state the date transition, measured
   against the owner's midnight. §14.

### Retained evidence

Sixteen captures in
[`docs/design/assets/cal-01-2026-08/`](../design/assets/cal-01-2026-08) — Today at
320/375/390/430 and 1440 in both appearances, one non-default colour scheme, the
event detail on a phone and a laptop, Tomorrow, Next 7 days and Settings. All over
the synthetic fixture day; regenerate with `e2e/seed-calendar-evidence.mts` +
`e2e/calendar-shots.mjs`.

---

## 21. Deliberate non-goals, held

Not implemented, and no groundwork laid for any of them: Microsoft Graph,
Microsoft/Google/Apple OAuth, CalDAV, Exchange Web Services, two-way sync, writing
to any external calendar, accepting/declining/RSVP, attendee sync, People creation
from attendees, full description import, attachments, calendar event editing,
drag-and-drop scheduling, Tasks as calendar events, time blocking, automatic Task
scheduling, month or week calendar grids, resource calendars, room booking,
free/busy, collaboration, push notifications, WebSockets, realtime streaming,
browser polling, AI anywhere, and a second Meetings implementation.

Also deliberately absent: **no Task is created from a calendar event**, and no
"prepare for meeting" Task is inferred. Meeting follow-up stays the existing
Meeting workflow. **Imported events are not added to global Search** — recurring
occurrences would flood results for little gain, and CAL-01 §32 explicitly prefers
scope discipline here.

---

## 22. PWA / offline

Unchanged. No offline mutation capability was added, no offline source management,
no second offline database. The schedule is an external read projection; if the
app is offline, Today renders whatever the existing snapshot mechanism holds and
the freshness line stays truthful.

---

## 23. Remaining genuine debt

1. **No "the calendar moved this — update the Meeting?" affordance** (§17). Needs
   a per-field owner-edit signal the Meeting model does not carry.
2. **DNS rebinding is not defeated** (§6). Bounded on Workers by the platform;
   real on a self-hosted runtime.
3. **No key rotation procedure.** Rotating `APP_ENCRYPTION_KEY` means re-adding
   each calendar. Acceptable at this scale; a re-seal migration is the fix if it
   ever is not.
4. **`Content-Type` is not enforced**, only the body's shape. Publishers serve ICS
   as `text/plain`, `application/octet-stream` and worse; the `BEGIN:VCALENDAR`
   check is the more reliable test.
5. **The add-a-calendar fetch is not exercised in the browser suite.** The URL
   policy correctly refuses `localhost`, so there is no address the E2E server
   could be pointed at that the product would accept — and a test-only bypass of
   an SSRF control is a control with a hole in it. That path is proven against
   real D1 in the real Workers runtime instead; the browser drives the refusal
   path and a seeded projection.
6. **Sources refresh sequentially.** Correct and predictable for a handful of
   calendars; would want bounded concurrency at a much larger scale.
