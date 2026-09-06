# PERFORMANCE.md — How DalyHub navigation is measured, and what it costs

> **Read this before making a performance claim.** AGENTS.md §16 says performance
> claims are backed by a measurement rather than a vibe. This file is where the
> measurements live, what instrument produced them, and which of them CI holds
> you to.

**Audience:** anyone changing a route loader, a repository read, a navigation
primitive or the build.

---

## 1. The question this file answers

The owner measured authenticated production navigation on `hub.daly.id.au` in
Safari, with the network panel open:

| Request | Observed |
|---|---|
| `/tasks.data` | ~450 ms |
| `/today.data` | ~850 ms |
| an unauthenticated Cloudflare Access redirect | ~115 ms |

The third number is the important one. It is the same DNS, the same TLS, the same
edge and the same round trip, answered without touching the application — so
whatever costs the other two is **inside the authenticated application path**,
not in the network.

That reframes the problem. "Make navigation faster" is not "make the queries
faster"; on the evidence below it is almost entirely **"make the application stop
waiting for itself"**.

---

## 2. The instrument

Three things are measured, and they answer different questions.

### 2.1 Statement count — the existing house measure

`countingDb` (`test/kernel/support.ts`) counts `prepare()` calls. It is what
every statement-budget test in the kernel suite asserts, and it is the measure
that catches a read introduced **per row**.

It is necessary and it is not sufficient. **Twenty statements issued in three
concurrent waves and twenty issued one after another cost the same budget and
feel completely different.**

### 2.2 Round-trip depth — the measure this programme added

`profileDb` (`test/kernel/perf-instrument.ts`) wraps a `D1Database`, records the
interval every execution occupies, and assigns each one a wave:

```
wave(x) = 1 + max({ wave(y) : y finished before x started })
```

**Depth** is the highest wave — the longest chain of statements that had to wait
for one another, and therefore the number of serial D1 round trips a loader
spends. Because it is derived from the ORDER of async events rather than from the
clock, two statements issued in one `Promise.all` land in the same wave on any
machine.

**Its one honest limitation.** A statement counts one level deeper when it was
issued after another had already *finished*, which conflates a true dependency
with a slow neighbour: if one query in a concurrent wave is much slower than the
rest, work that depended only on it can read one wave deeper than its dependency
graph says. That makes depth an excellent **regression detector** and a poor
absolute, which is why the budget test bounds it rather than equating it. It was
identical across repeated runs at both fixture sizes when the ceilings were set.

### 2.3 Payload size

The JSON bytes the loader's return value would serialize to — the `.data`
response body, minus framing.

### 2.4 Where the measurement runs

`test/kernel/navigation-measure.ts` runs the **real route loaders** against the
**real D1** in the Workers pool, substituting the instrumented binding for
`env.DB` for the duration of the call. That substitution is what makes the number
complete: it includes the workspace-existence check and the owner-preferences
read that every loader pays *before* its own work starts, which an injected scope
would silently omit.

### 2.5 Two workspace sizes, always

`test/kernel/navigation-fixture.ts` seeds one workspace through the real
repositories at two sizes:

| | `SMALL` | `LARGE` |
|---|---|---|
| Areas | 2 | 6 |
| Projects | 4 | 24 |
| Tasks | 12 | 240 |
| Goals | 2 | 12 |
| Obligations | 3 | 40 |
| Finance transactions | 8 | 300 |

Every claim is made at both, because **a single measurement cannot tell a
constant from a coincidence** — a loader that reads one row per Task looks
perfectly flat at ten Tasks. `LARGE` is chosen to cross every page bound the hot
loaders carry, so a bound that is not applied shows up as a moved number rather
than as a slower one.

---

## 3. Baselines and results (PERF-01, 2026-09-06)

Measured on `LARGE`, before and after PERF-01. Same fixture, same instrument,
same machine.

| Route | Statements | | Round trips | | Payload |
|---|---|---|---|---|---|
| | before | after | **before** | **after** | after |
| `/today` | 38 | 38 | **11** | **5** | 88 kB |
| `/tasks` | 11 | 11 | **8** | **4** | 48 kB |
| `/projects` | 15 | 15 | **9** | **3** | 30 kB |
| `/goals` | 23 | 22 | **9** | **5** | 22 kB |
| `/obligations` | 4 | 4 | **4** | **3** | 20 kB |
| `/finance` | 9 | 9 | **5** | **3** | 5 kB |
| `/analytics` | 14 | 14 | **6** | **4** | 7 kB |

On `SMALL`, the round-trip figures are **identical** to the `LARGE` ones for every
route. That is the property the budget test asserts separately: before PERF-01,
Today went from 7 waves to 11 between these two sizes purely because the page
crossed a chunk boundary.

**Today's serial round trips fell by 55%, Tasks' by 50%, and Projects' by 67%,
with no query rewritten and no index added.**

Cold and warm navigation are the same server-side measurement — the loader does
the same work either time. What differs between them is the route's JavaScript
chunk (§7) and the browser cache, both of which are client-side and are addressed
by prefetch rather than by the loader.

---

## 4. What was actually slow

### 4.1 Chunked aggregates read one chunk at a time

`listChecklistProgress` and `listBlockedSummaries` each split a page of ids into
chunks of eighty — because D1 accepts a finite number of bound parameters — and
awaited each chunk before issuing the next. On Today's 240-Task page that is
three serial round trips per aggregate, and the two aggregates were themselves
awaited one after the other: **six serial round trips inside two reads whose
entire design point was to be one each.**

A chunk boundary is arithmetic. No chunk depends on another.

### 4.2 A two-round-trip prologue on every loader

Every authenticated loader began by confirming the configured workspace exists
and *then* reading the owner's preference row. The second never depended on the
answer: the row is addressed by the configured workspace id and the trusted
actor, both known before the existence check is issued.

The preferences read now starts first (`startOwnerPreferencesRead`). It is
best-effort and **not an authority**: it never decides whether the workspace
exists, its result is used only after `resolve()` returns a context whose id and
owner it matches, and a workspace that does not resolve still fails closed with
the warm read discarded unused. Nothing request-supplied reaches it.

### 4.3 One preference row, read twice

`/goals` asked `scope.ownerTimeZone()` for the owner's day and
`scope.appPreferences.get()` for their week start. One row, two statements, and
the second on the critical path. The scope now memoises the read for its own
lifetime — which is one request — and **a write drops the memo**, because a
preferences action that updates and then re-reads must see what it wrote.

### 4.4 Independent blocks written in sequence

`/projects` ran five independent blocks one after another (the list, the parent
options, the lifecycle counts, the templates, the Goals rail) for two round trips
of real dependency. `/goals` awaited its seven grouped reads before starting the
Area options and the selected Goal's detail. `/finance` awaited the owner's day,
then the accounts, then everything else. `/analytics` ran two independent blocks
in sequence. `monthSummary` awaited its grouped read before issuing the transfer
count.

Every one of these keeps its own `try`, so the failure domains each loader
deliberately separates stay separate. A template read that fails still leaves the
Projects gallery standing; a Goals pane that fails still leaves the collection
usable.

---

## 5. Navigation prefetch

The primary navigation had **no prefetch at all** before PERF-01 — the rail, the
phone bottom bar and the phone navigation sheet all rendered plain `Link`s, so
every move between modules started from cold on click. `prefetch="intent"` was
already in use in exactly two places in the product (the Notes rail, the Meetings
list).

A cold click pays for three things in sequence: discovering the route's chunk,
fetching it, and only then issuing the `.data` request. The owner's Safari capture
puts the chunk fetch alone at 360–460 ms with cache disabled.

The policy lives in one place — `app/shared/shell/navigation-prefetch.ts` — with
the rejected alternatives written down:

- **`render`** prefetches every destination the moment the rail paints. The rail
  holds every module in the product, so that is the whole application downloaded
  on first paint, on a phone, on mobile data.
- **`viewport`** degenerates into `render` here: the rail is entirely visible at
  desktop widths and the phone sheet shows every row at once.
- **`intent`** is safe on touch because its touch trigger is `touchstart`, which
  fires for the ONE destination a finger has landed on. A tap warms one route a
  few dozen milliseconds before its own click event. Nothing prefetches on
  scroll, on viewport entry, or on mount.

---

## 6. Revalidation

| Surface | Rule | Effect |
|---|---|---|
| `root`, app shell, `/tasks` | `isSameDocumentParameterChange` (PWA-12) | declines a re-read for a parameter it does not consult |
| `/today`, `/today/tomorrow`, `/today/upcoming` | the same rule, added by PERF-01 | Today no longer re-reads 38 statements to open a Drawer |
| `/tasks` row mutations | `shouldRevalidateTasks` (TASKS-09) | a priority change on an unsorted, unfiltered list re-reads nothing |

**The skip is scoped to a device that is OFFLINE, and that is deliberate.**
Declining online looked free — a Drawer parameter changes nothing these loaders
read — but a navigation SUPERSEDES an in-flight revalidation, and the
navigation's own re-read is what used to replace it. Removing that turned
"mutate, then navigate" (create a task, close the Drawer) into a permanently
stale list. Two browser journeys caught it. PERF-01 did **not** re-open that
decision: the honest reading is that the online skip needs a mechanism to
preserve an interrupted revalidation, and inventing one inside a performance
release is how a correctness regression ships.

What the rule must never skip is asserted directly
(`test/kernel/navigation-revalidation.test.ts`): a submission, an explicit
`revalidate()` (which arrives with an *identical* url), and a real move between
pages.

---

## 7. Code chunks

Measured from `pnpm run build` at the head of PERF-01:

| | raw | gzip |
|---|---|---|
| `entry.client` | 183 kB | 58 kB |
| `root` | 83 kB | 11 kB |
| `errorBoundaries` | 110 kB | 36 kB |
| `root.css` | 805 kB | **93 kB** |
| largest route chunk (Today) | 78 kB | 22 kB |
| median route chunk | 12 kB | 4 kB |
| smallest route chunks | <1 kB | <1 kB |

308 client assets, 4.1 MB total — but a navigation fetches **one** route chunk,
and the splitting is already the "sensible splitting + intelligent prefetch"
shape this work was told to aim for. Nothing here argues for bundling the
application into one chunk to remove route fetches; it argues for warming the one
chunk that is about to be needed, which §5 does.

Repeat navigation does not pay the chunk cost again: `/assets/**` is hashed and
served **cache-first** by the service worker (§8), so a route visited once is
served from the cache on every later visit until a deployment changes its hash.

**The single largest client asset is the stylesheet**, at 93 kB gzipped and
render-blocking on first paint. It is one file for the whole design system, it is
cached after first load, and splitting it is a design-system decision rather than
a navigation one — recorded as [DEBT-249](../product/PRODUCT_DEBT.md).

---

## 8. Service worker

Audited, unchanged, and correct for this purpose:

| Request | Strategy | Effect on navigation |
|---|---|---|
| `/assets/**` (hashed) | cache-first | a prefetched route chunk warms the cache; a repeat visit never re-fetches it |
| document navigations | network-first | an online owner never sees a stale page; an expired Access session still redirects |
| anything ending `.data`, or carrying `?_data` | **never intercepted** | authenticated dynamic data is never served stale, and a prefetched `.data` goes straight to the network |
| everything else | not intercepted | a navigation never waits on service-worker work it does not need |

`test/unit/pwa/service-worker-runtime.test.ts` already asserts the `.data` case
against the real emitted worker. Nothing in PERF-01 weakens offline correctness
and nothing turns authenticated dynamic data into a cache.

---

## 9. Perceived performance

Same-route changes — a filter, a view, a page — already report themselves through
`useCollectionLoading` and the shared collection skeleton. A move BETWEEN modules
had **no acknowledgement at all**: React Router keeps the old route on screen
until the next one's loaders resolve, which is the right behaviour (nothing
blanks, nothing flashes) and also means nothing happens on screen.

PERF-01 adds one: the destination row in the rail and on the phone bar takes the
selected row's own indicator SHAPE the moment the navigation starts, and carries
`aria-busy`. The row the owner has not left yet keeps `aria-current`.

It is deliberately not a spinner and not an animation. Nothing spins, pulses or
slides, because motion whose only job is to occupy the wait is the "animation
that merely hides latency" this work was told not to add.

---

## 10. Budgets

The desired outcomes, from the PERF-01 brief:

| | Target |
|---|---|
| ordinary warm route data | < 250 ms |
| heavier Today / Insight | < 350 ms |
| prefetched perceived navigation | ≈ < 150 ms |

**These are not test assertions and must not become them.** A CI runner's wall
clock is not evidence about production, and a timing assertion that flakes is
worse than no assertion. What CI holds instead are the structural proxies that
decide those numbers:

| Proxy | Where |
|---|---|
| statement count per route, at two sizes | `test/kernel/navigation-statement-budget.test.ts` |
| round-trip depth per route, at two sizes | same |
| depth does not grow with workspace size | same |
| chunked aggregates read in one round trip | same |
| no hot statement scans a base table | same |
| payload ceiling per route | same |
| the prefetch contract | `test/unit/shell/navigation-prefetch.test.tsx` |
| the revalidation contract | `test/kernel/navigation-revalidation.test.ts` |
| the pending-navigation contract | `test/unit/shell/navigation-pending.test.tsx` |

### Raising a ceiling

A route that legitimately grows raises its ceiling **in the same change**, with
the new measurement quoted in the diff. A ceiling raised without a number beside
it is how a budget stops being one.

---

## 11. Measuring wall-clock time

### 11.1 The repeatable command

```sh
pnpm run perf:navigation                                      # localhost:5173
pnpm run perf:navigation -- --base=https://hub.daly.id.au --samples=10
pnpm run perf:navigation -- --routes=/today,/tasks --json
```

It requests each route's React Router `.data` endpoint N times and reports TTFB,
total, p50 and p95, with the first sample reported separately as the cold one.

It **holds no credential**. It does not authenticate, does not read a token file
and does not accept a password. It reads an optional session cookie from
`DALYHUB_PERF_COOKIE` if the operator chooses to export one for the duration of a
run, and never prints or stores it. With no cookie it still runs and reports what
it got — an Access redirect, honestly labelled as the network floor rather than
as an application measurement.

It reports; it does not gate.

### 11.2 The DevTools workflow, for a browser that is already signed in

If you would rather not put a session cookie in an environment variable at all —
and that is a reasonable preference — take the same measurement from the browser
Cloudflare Access has already authenticated:

1. Open `https://hub.daly.id.au/today` in Safari or Chrome and sign in normally.
2. Open the Network panel. Filter to **Fetch/XHR**. Leave the cache **enabled** —
   a warm navigation is the one the owner actually experiences; take a
   `Disable cache` pass separately for the cold figure.
3. Click a destination in the rail. The row for `<route>.data` is the
   measurement. Read **TTFB** (Safari: "Waiting"; Chrome: "Waiting for server
   response") and **Duration**.
4. Repeat five times per route, alternating destinations so no route is measured
   only as a repeat of itself.
5. For the cold figure, tick `Disable cache` and reload before each sample. That
   is the number that includes the route's JavaScript chunk.

Record the median, not the best sample.

### 11.3 What the LOCAL wall clock could and could not show

Both sides were measured with the command above, on the same machine, against
the same committed E2E seed, eight samples per route: `main` at `61a39c6`
versus this branch.

| Route | p50 total, `main` | p50 total, after | `.data` bytes |
|---|---|---|---|
| `/today` | 116.8 ms | **106.2 ms** | 28,745 both |
| `/tasks` | 37.5 ms | 37.8 ms | 35,123 both |
| `/projects` | 45.6 ms | 44.2 ms | 35,074 both |
| `/goals` | 51.4 ms | 49.3 ms | 12,264 both |
| `/obligations` | 25.4 ms | 22.9 ms | 7,911 both |
| `/finance` | 28.9 ms | 27.1 ms | 4,672 both |
| `/analytics` | 57.6 ms | 47.6 ms | 8,204 both |

**Read this as a null result, and an expected one.** The byte counts being
identical is the useful half: it is direct evidence that none of these loaders
returns different data than it did, which is what a performance change must be
able to show. The timings are not evidence of the improvement, and this file
will not present them as if they were.

The reason is the whole thesis of §2.2. What PERF-01 removed is **serial D1
round trips**, and against a local Miniflare SQLite a round trip costs
essentially nothing — the queries are the same queries, and issuing them in one
wave rather than five saves five times almost zero. A local benchmark is
therefore structurally incapable of demonstrating this change, however many
samples it takes.

Production is where the term is real, and the owner's own capture is the
evidence that it is: 850 ms for `/today` and 450 ms for `/tasks` against a
115 ms Access redirect, on eleven and eight round trips respectively. The
prediction this work makes is that the same routes, on the same connection, now
cost five and four — and it is a **prediction**, testable with the command in
§11.1 or the DevTools workflow in §11.2, not a result this repository can
assert from a CI runner.

That asymmetry is exactly why the budgets in §10 are structural. A wall-clock
assertion here would have passed identically before and after the change that
matters.

---

## 12. Measured residual bottlenecks

Named because they are real and were not fixed, not because they were missed.

1. **Today ships up to 200 overdue rows to draw three.** `day.overdue` is 78 kB
   of the 88 kB `LARGE` payload — 168 rows, of which the timeline renders three
   plus a "+n more overdue" link. The client needs the drawn slice, the rows
   completed today, and the COUNT of the rest; it is sent all of them because it
   re-buckets the day itself to keep optimistic edits honest. Recorded as
   [DEBT-248](../product/PRODUCT_DEBT.md) with the design: a bounded projection
   plus server-side counts. It was not done here because it changes Today's data
   contract across `day-view.ts`, `TodayScreen.tsx` and their tests, and a
   mistake there makes Today *wrong*, which is worse than making it 88 kB.
2. **The stylesheet is 93 kB gzipped and render-blocking** ([DEBT-249](../product/PRODUCT_DEBT.md)).
3. **`/goals` reads the Goal schedule-origin map twice per load**, once for the
   ordered page and once for the lens counts, because both derive status from
   identical SQL and therefore need identical inputs. Memoising it on the
   repository was **measured and declined**: `goal-outcome.test.ts` demonstrates
   the price by asking, creating twenty Goals, and asking again to get the first
   answer back. A repository lives as long as its scope and a scope can outlive a
   write. The honest alternative — the caller reading the origins once and
   handing the same value to both — puts an opaque repository intermediate into
   the kernel's public contract to save one statement on a route that is not the
   slow one.
4. **The application makes two workspace scopes per navigation**, one in the
   shell's loader and one in the page's, so the workspace check and the
   preferences read each happen twice. They run CONCURRENTLY across the two
   loaders, so this costs statements rather than depth. Sharing one scope per
   request through the router context would remove four statements per
   navigation; it is not free, because the scope carries the trusted actor and
   the sharing has to be provably per-request.
5. **No client-render hotspot was demonstrated.** Today's derived values are
   recomputed on every render over a payload of up to 200 rows, which is
   microseconds of work and not what a profile would flag. React profiling was
   not run against production; this file will not claim a client-render finding
   it did not measure.

---

## Related documents

- [`AGENTS.md` §16](../../AGENTS.md#16-performance-expectations) — the product's performance expectations.
- [`SETUP_AND_CI.md`](SETUP_AND_CI.md) — the commands and the CI pipeline.
- [`PWA_AND_OFFLINE.md`](PWA_AND_OFFLINE.md) — the service worker's cache strategy in full.
- [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md) — what Today loads and why.
- [`PRODUCT_DEBT.md`](../product/PRODUCT_DEBT.md) — DEBT-248 and DEBT-249.
