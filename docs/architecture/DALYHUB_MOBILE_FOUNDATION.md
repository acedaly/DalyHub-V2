# DalyHub Mobile Foundation

**Status: architectural discovery. Nothing here is built, and nothing here is
committed to.**

This document describes what DalyHub's current architecture would ask of a
future offline-capable native iOS client, and what that client would ask back.
It exists so the next phase starts from a survey rather than from a guess.

It introduces no Swift, no Xcode project, no Capacitor, no React Native, no
`/api/v1`, no sync engine and no authentication change. Every claim below is
about code that exists today, cited by path, and was read rather than
remembered.

> **The single most important finding.** DalyHub already has an offline client
> with a queue, an idempotency protocol, a conflict contract and a server-side
> arbitrator: the PWA (`PWA-05`, `PWA-12`). A native client's sync layer is
> mostly a **port of an existing, tested protocol**, not a new design. The
> places a native client would genuinely need something new are named in §4.7.

---

## 1. Current client/server boundaries

### 1.1 The layers, as they actually are

| Layer | Location | What it owns |
| :--- | :--- | :--- |
| Kernel | `app/kernel/*` (30 domains) | Pure domain rules and types. No I/O, no React, no Cloudflare. Runs in a plain test. |
| Platform | `app/platform/*` (26 domains, 30 `*.server.ts`) | Repositories, authentication, workspace scope, external services. Cloudflare-aware. |
| Storage | `app/platform/storage/d1` | Prepared D1 statements behind DalyHub-owned typed repository contracts ([ADR-009](../decisions/ARCHITECTURE_DECISIONS.md#adr-009-data-kernel-storage)). No ORM. |
| Routes | `app/modules/*/routes/*.tsx` (146 files, 140 loaders, 51 actions) | HTTP transport, form parsing, response shaping, and the React component. |
| Shell | `app/root.tsx`, `app/shared/shell` | Frame, navigation, theme. |

The kernel/platform split is genuinely clean and is the reason this assessment
is short rather than alarming. A native client needs the bottom three layers
and none of the top two.

### 1.2 Where a native client would be blocked today

The domain work is already reachable without React. What is **not** reachable
is the *transport*, and the coupling is specific and measurable:

**All 44 mutation actions read `request.formData()`. None reads
`request.json()`.** (Measured across `app/modules/*/routes/*.tsx`.)

The shape that follows from that is visible in
`app/modules/goals/routes/mutate.tsx`: the action reads a `FormData`, switches
on a string `intent` (`rename`, `update_details`, `delete`, `restore`, …), and
returns a route-local discriminated union (`GoalMutationResult`) describing
field errors in terms a form can render. The domain call in the middle —
`scope.spine.rename(goalId, title)` — is perfectly reusable. The envelope
around it is HTML-form-shaped and exists once per route.

So the honest statement of the coupling is:

- **Business behaviour is NOT trapped in the route layer.** It is in
  `app/kernel` and in the workspace-scoped repositories.
- **The request and response contract IS trapped in the route layer.** It is
  `multipart/form-data` in, bespoke JSON union out, one per route, with no
  shared envelope and no versioning.
- **Validation is already shared** (`app/kernel/*/\*-validation.ts`), which is
  the expensive half of an API and is already done.

A native client could post form-encoded bodies to the existing routes and it
would work. It would also be inheriting 51 independently-shaped response
unions, each free to change with its screen. That is the thing to fix — once,
deliberately — not by refactoring every loader.

### 1.3 What must NOT be disturbed

Two properties are load-bearing for security and are cheap to break while
"making things easier for mobile":

- **Workspace scope is resolved server-side from trusted state only.**
  `WorkspaceContextResolver.resolve()` deliberately **takes no arguments**, so
  there is structurally nowhere to pass a request, header, cookie or body
  ([ADR-010](../decisions/ARCHITECTURE_DECISIONS.md#adr-010-server-side-workspace-context)).
  Module-facing repositories are constructed already bound to one workspace and
  **no module-facing method accepts a `workspaceId`**. A native API must resolve
  scope the same way. An `X-Workspace-ID` header is the exact
  broken-access-control shape that decision exists to prevent.
- **Authentication runs at the Worker request boundary, before any loader**
  (`app/platform/request/request-boundary.ts`,
  [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing) §5.5).
  Adding native endpoints below that boundary rather than behind it would be a
  regression, not a shortcut.

---

## 2. Candidate native API boundary

### 2.1 There is already a precedent, and it is good

`POST /api/capture` (`app/routes/api-capture.ts`) is DalyHub's only existing
machine endpoint, and it is the template:

- a resource route with no component — JSON in, JSON out, never a document;
- bearer-token credential, verified **before the body is read at all**, so an
  anonymous caller can neither make the Worker buffer a payload nor use the
  validator as an oracle;
- a fixed order: method → content type → credential → rate limit → size →
  parse → act;
- a hard byte ceiling and a rate limit charged *before* parsing;
- exempted from the Access boundary by **exact path match, for `POST` only**.

It is also **deliberately write-narrow**: there is no `GET /api/tasks`, no
`PATCH`, no `DELETE`. Its own header states the reason — a leaked capture token
can add a Task to an Inbox and nothing else, because there is nothing to
enumerate.

### 2.2 What changes for a native client, and what that costs

A native client fundamentally needs the thing capture deliberately refuses:
**read access to the workspace**. That is not a reason to abandon the stance; it
is a reason to make the change consciously.

The boundary to document before building:

| Concern | Capture endpoint today | Native client needs |
| :--- | :--- | :--- |
| Direction | Write-only | Read and write |
| Credential | Capture token, narrow scope | A session credential with the owner's full scope |
| Blast radius of a leak | One Inbox Task | The entire workspace |
| Enumeration | Impossible by construction | Required |

The credential for a native client is therefore **not** a capture token with
more permissions. It is a different kind of secret with different handling
(§5), and conflating the two would quietly widen the blast radius of every
capture token already issued.

### 2.3 Resources a first API would cover

Named as a boundary, not as a schema. **This is not a list of endpoints to
create in this branch.**

Read (snapshot + incremental): Tasks, Projects, Areas, Goals, Habits, Meetings
and meeting items, People, Notes, Diary.
Write: the operations the offline queue already supports (§3.2), plus capture.
Cross-cutting: sync cursor, server time, schema version.

One shared envelope, one version, one error shape — the thing the 51 route
unions do not have.

---

## 3. Offline-first entities

### 3.1 What is already offline, today

`app/kernel/offline/offline-snapshot.ts` defines `OFFLINE_RECORD_KINDS`:

```
task · note · diary · meeting · reference
```

The snapshot is server-produced (`app/platform/offline/build-snapshot.server.ts`),
versioned (`OFFLINE_SNAPSHOT_VERSION = 1`), and stores long text as a **bounded
excerpt** (`OFFLINE_EXCERPT_LIMIT = 600`) with an explicit `truncated` flag
rather than pretending to hold the whole document.

That is a real, shipped classification made against DalyHub's own behaviour.
A native client should start from it rather than re-deriving one.

### 3.2 What is already mutable offline

`OFFLINE_MUTATION_OPERATIONS` (`app/kernel/offline/offline-mutation.ts`) —
Tasks only, seven operations:

| Kind | Operations |
| :--- | :--- |
| Lifecycle | `complete`, `reopen` |
| Replace (one field, last value wins) | `set_title`, `set_priority`, `set_due`, `set_planned`, and one checklist-item toggle |

Note the asymmetry, because it is the honest state of the product: **five record
kinds are readable offline; one is writable offline.**

### 3.3 Priority for a native client

Based on what DalyHub already treats as offline-critical, not on generic
mobile-app assumptions:

**Tier 1 — offline read and write.** Today, Tasks, Meetings and meeting items,
quick capture. These are the surfaces a person uses standing up, on a train, in
a meeting room with no signal. Tasks and capture already have the full protocol;
Meetings are read-only offline today and are the most valuable *extension*,
because a meeting is exactly when the network is least reliable and the notes
are least replaceable.

**Tier 2 — offline read, deferred write.** Notes, Diary, Projects, Areas,
Goals, People, Habits. Notes and Diary are already in the snapshot as truncated
excerpts; making them *writable* offline runs into §4.7 and should not be
attempted in a first slice.

**Tier 3 — online only.** Reports, Insight, Finance administration, Settings,
Ask DalyHub. These are deliberate: they are either derived (a report over the
whole workspace cannot be computed from a device's subset and would be
confidently wrong), administrative (Settings writes must not be replayed from a
stale device), or dependent on a remote provider (AI). Making them offline
would be a feature with no audience and a correctness risk.

---

## 4. Sync requirements

### 4.1 The protocol already exists

`app/platform/offline/mutation-receipts.server.ts` implements idempotency and
conflict arbitration, and the ordering is the part worth preserving:

1. the client generates one key when the mutation is **queued**, so every retry
   of the same intent carries the same key;
2. the server claims the key with an `INSERT` **before** it applies anything;
3. insert succeeds → this request owns the application;
4. insert conflicts → some other attempt owns it; the recorded outcome is read
   back and reported, applying nothing.

The primary key `(workspace_id, idempotency_key)` means **the database
arbitrates, not application code** — which is what makes it correct under
concurrency.

### 4.2 Conflict detection is field-level, and deliberately so

`app/kernel/offline/offline-conflict.ts` is a pure decision shared by both ends:
the server decides, the client words the result, neither imports the other.

The comparison is made on **the one field the queued operation writes**, against
the base value the device last saw. Its header states why `updatedAt` would be
wrong: `updatedAt` moves for every field, so an offline priority change would be
reported as conflicting with an unrelated server title change — and those two
are safely mergeable.

Three outcomes:

| Outcome | Meaning |
| :--- | :--- |
| `applied` | the field still holds the base value; write it |
| `satisfied` | the field **already** holds the intended value; write nothing, report success |
| `conflict` | the field holds a third value; the owner decides |

`satisfied` is what makes replay safe to repeat: a retry whose first attempt
succeeded but whose response was lost is a truthful no-op rather than a conflict
against itself.

### 4.3 A conflict releases its claim

The one place this departs from the capture protocol, and it is load-bearing: a
conflict **deletes its own unfinished claim**, because a conflict is a question
for the owner, who may answer "keep my change" by sending the same mutation
again under the same key. A finalised receipt would make that answer
permanently unanswerable.

### 4.4 Local persistence

The PWA uses IndexedDB behind plain async functions with no React in them
(`app/shared/offline/offline-store.ts`, `offline-database.ts`). The equivalent
native choice is a local SQLite store, which is also what the server already
speaks (D1 is SQLite) — so the schema translation is mechanical rather than
conceptual.

### 4.5 The isolation boundary is the namespace

Nothing can be queued until a namespace has been resolved from a
**server-produced** snapshot, and every queued record is stamped with it. A
device with no prior successful authenticated session has nowhere to put an
offline edit, and replay refuses any record whose namespace does not match the
session signed in at replay time. **This is enforced by the data model, not by a
flag,** and a native client must reproduce it exactly.

### 4.6 What a native client would need to add

- **Incremental sync.** Today's snapshot is a whole-workspace build. A phone on
  a cellular connection wants a cursor and a delta. This is the single largest
  genuinely-new piece of work.
- **Tombstones.** Soft-delete exists in the spine, but the snapshot is a
  rebuild, so deletions are currently expressed by absence. A delta protocol
  needs deletions expressed positively.
- **A revision or version per record**, for the delta — distinct from §4.2's
  field-level base values, which stay as they are.
- **Extending the queue past Tasks**, operation by operation, each with its
  conflict rule.

### 4.7 Long-form text is the real open question

Do **not** reach for a CRDT. The current architecture does not require one and
`decideConflict`'s field-level model is a better fit for structured records than
any CRDT would be.

But it is a poor fit for one thing, and this should be stated plainly rather
than discovered later: **a Note or Diary body is a single long string.** Under a
replace-style rule, two devices editing different paragraphs of the same note
produce a conflict over the whole document, and "keep mine" discards the other
device's paragraph silently.

The snapshot's current answer is to hold Notes and Diary as **truncated,
read-only excerpts** — which sidesteps the problem honestly. Any future decision
to make long-form text writable offline is a decision to solve this, and it
deserves its own ADR. Options to weigh then, in increasing cost: block
concurrent offline edit of a body outright; keep both versions as a conflict
copy the owner merges; a text-specific merge; a CRDT as a last resort for this
one field. The first two are probably enough for a single-user product.

---

## 5. Authentication

### 5.1 What exists

Cloudflare Access owns login and session lifecycle
([ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing) §5.1).
DalyHub implements no passwords, no OAuth callbacks, no local session-cookie
format and no auth SDK. It still validates every request itself: the Worker
reads `Cf-Access-Jwt-Assertion` and verifies it with `jose` against the team's
JWKS — signature, RS256 only, issuer, audience, `exp`/`nbf`, a valid `sub`, a
valid verified `email`, and that it is an identity token rather than a service
token. A configured `OWNER_EMAIL` is independently enforced, so an accidentally
broadened Access policy cannot grant entry. The raw JWT never enters loader
data, React context, HTML, logs, Activity payloads or error messages.

### 5.2 The native problem, stated precisely

Access authenticates a **browser** through a redirect flow and returns a
short-lived JWT as a header on subsequent requests. A native app has no cookie
jar participating in that flow.

This is the one area where a native client cannot simply reuse what exists, and
the investigation — not the decision — belongs to the next phase:

- **`ASWebAuthenticationSession`** can run the Access flow in a system browser
  and is the conventional answer. What must be established is what DalyHub ends
  up holding afterwards and for how long.
- **Access service tokens** are explicitly rejected by the current validator
  (`common_name`/empty `sub`), and that rejection is correct: a service token is
  not a person, and the Activity actor is the stable `sub`. Do not relax it to
  make a native login easier.
- **Token storage** is Keychain, with the device's own protection class —
  never `UserDefaults`, never a file, never a log.
- **Revocation and refresh** need a real answer before shipping, not after.
  Access tokens are short-lived by design; a native client that caches a
  long-lived credential to avoid re-authentication has invented a new session
  system with weaker properties than the one it replaced.
- **The offline case is the awkward one.** A device that has been offline past
  token expiry still holds queued mutations. The namespace rule (§4.5) already
  handles the *safety* question — those mutations cannot replay under a
  different identity. What needs designing is the *experience*: what the owner
  is told, and when.

**Do not weaken existing authentication to make mobile easier.** Every property
in §5.1 is there for a reason recorded in ADR-016, and a native client is not a
reason to drop one.

---

## 6. Design-system portability

### 6.1 The distinction that matters

**Untitled UI React components are WEB implementation source.** They are TSX and
Tailwind. They do not port, and a native client must not embed the website in a
web view to get them.

What ports is the **grammar**: the decisions the components express.

| Portable | Not portable |
| :--- | :--- |
| Design tokens — the semantic colour roles, the spacing scale, the type ramp, radius and elevation steps (`app/styles/tokens.css`, generated) | The CSS itself, Tailwind utilities, `sortCx`, class strings |
| Semantic colour *names* — `text-primary`, `fg-error-primary`, `bg-brand-solid` — and the rule that a role is chosen by meaning, not by hue | Their rgb values' delivery mechanism |
| Entity identity — the six Area accents, the derived identity slots, "identity is a mark on the surface, never the surface itself" (`app/kernel/entities/identity-colour-slots.ts`) | `EntityIcon`'s React implementation |
| The `@untitledui/icons` semantic key vocabulary — which icon *means* which concept | The SVG React components |
| Component hierarchy and product compositions — what a record header is, what a collection row contains, what a settings section is | Their TSX |
| The rules: colour is never the sole carrier of meaning; a badge always says its state in words; a status pill's `neutral` is the *absence* state | — |

### 6.2 The practical recommendation

A future SwiftUI client should generate its token layer from the same source
that generates `theme.css` today (`scripts/generate-untitled-theme.mjs`,
`scripts/generate-m3-scheme.mjs`), so the two clients cannot drift. Everything
above the tokens is reproduced with native components — a `List`, a
`NavigationStack`, a `Menu` — following DalyHub's grammar rather than
reproducing Untitled's DOM.

The test for whether this has been done correctly is not "does it look like the
website". It is: **does a DalyHub user recognise the product, and does an iOS
user recognise the platform?**

---

## 7. Recommended first vertical slice

**Today + Tasks + the Meeting workspace + Quick Capture, with a local store and
real sync.**

Not a broader subset, and explicitly not a reproduction of the product.

### Why this slice

- It is the **daily driver**. If a native client does only this and does it
  well, it is already worth carrying; the web app remains the place for
  Reports, Finance and Settings, which is where they belong anyway (§3.3).
- It is the slice where **offline is a real requirement** rather than a feature
  — a meeting room and a train are the two places DalyHub is most used and least
  connected.
- It exercises **every hard part of sync exactly once**: a read snapshot, an
  incremental delta, a queued mutation, an idempotent replay, a genuine
  conflict, and a deletion. Nothing is deferred to a "phase two" where the
  architecture turns out not to support it.
- Tasks already have the **complete protocol** (§3.2), so the slice can be built
  against a known-good reference implementation, and any divergence is a bug in
  the port rather than an open design question.
- Meetings are currently **read-only offline**, so the slice also proves the
  extension path — the thing §4.6 says is the largest new work — on one entity
  rather than on twelve.

### Why not "reproduce the product"

A native client that renders every module badly is worth less than one that
renders four modules properly, and it costs far more. It would also front-load
every §4.7-class question — long-form Note merging, Finance reconciliation,
report derivation — before the sync foundation has been proven on the easy
cases.

The purpose of the slice is to answer one question: **does DalyHub's existing
domain, conflict and idempotency architecture survive contact with a real
offline device?** Four surfaces answer that. Twenty do not answer it better.

---

## 8. Explicitly out of scope

This document does not authorise, and this branch does not contain:

- `/api/v1` or any new endpoint;
- restructuring loaders or actions;
- a sync engine;
- any authentication change;
- Swift, Xcode, Capacitor or React Native;
- a mobile monorepo;
- speculative abstractions "for mobile later".

The next phase starts with an ADR for the API boundary (§2) and one for native
authentication (§5). Neither is written here, because neither should be decided
by the person who happened to do the survey.
