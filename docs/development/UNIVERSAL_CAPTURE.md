# UNIVERSAL_CAPTURE.md — external capture (CAPTURE-01)

> **DalyHub should be easier to put information into than it is to forget the
> information in the first place.**
>
> This document is the authority on how a thought gets from a phone into DalyHub
> without opening DalyHub. Architecture, the capture contract, credentials, the
> Apple Shortcut, Siri, the Share Sheet, email, the security model, troubleshooting
> and the manual acceptance checklists.
>
> The *why* behind the design lives in
> [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-088-universal-capture--one-capture-contract-many-thin-transports-and-a-credential-that-can-only-bring-thoughts-in).

---

## 1. The idea in one picture

```
Thought occurs
     ↓
Tap / Share / Siri / Email
     ↓
Capture to DalyHub
     ↓
Task / Note / Inbox
     ↓
Saved
```

A few seconds, start to finish. One DalyHub capture contract; many lightweight
capture surfaces.

---

## 2. Architecture

```
iPhone Shortcut ─┐
Siri ────────────┤
iOS Share Sheet ─┼─→ POST /api/capture ─┐
DalyHub PWA ─────┤   (dhcap_ bearer)    │
future clients ──┘                      │
                                        ├─→ CaptureRequest  (kernel contract)
capture@… email ─→ Email Worker ────────┘        ↓
                                          classify (deterministic)
                                                 ↓
                              TaskRepository.createTask  ──┐
                              EntityRepository.create   ───┼─→ D1
                              NoteDetails.update        ───┘
                                                 ↓
                                   Activity (`capture.received`)
```

### Where the code lives

| Layer | Path | What it owns |
|---|---|---|
| Kernel | [`app/kernel/capture`](../../app/kernel/capture) | The contract, validation, classification, title derivation, the credential model, the rate-limit arithmetic, email policy, MIME extraction. No D1, no Cloudflare, no React. |
| Platform | [`app/platform/capture`](../../app/platform/capture) | The capture application service, capture authentication, safe logging, the email handler. |
| Storage | [`app/platform/storage/d1/d1-capture-token-repository.ts`](../../app/platform/storage/d1/d1-capture-token-repository.ts), [`…-rate-limiter.ts`](../../app/platform/storage/d1/d1-capture-rate-limiter.ts) | The two D1 adapters. |
| Route | [`app/routes/api-capture.ts`](../../app/routes/api-capture.ts) | `POST /api/capture`. |
| Settings | [`app/modules/settings/CaptureSection.tsx`](../../app/modules/settings/CaptureSection.tsx), [`routes/capture.tsx`](../../app/modules/settings/routes/capture.tsx) | Creating and revoking capture devices. |
| Schema | [`migrations/0039_create_capture_credentials.sql`](../../migrations/0039_create_capture_credentials.sql) | `capture_tokens`, `capture_rate_windows`. |

### What CAPTURE-01 deliberately did NOT add

- **No second Task or Note store.** A captured Task is `TaskRepository.createTask`
  — the same atomic create `/tasks/new` uses. A captured Note is
  `EntityRepository.create` plus the Note's own content mutation. There is no
  `shortcut_tasks` table and no `email_notes` table.
- **No second parser.** Task captures run through the same deterministic
  [TASKS-01 quick-capture parser](../../app/shared/task-record/quick-capture.ts)
  every other capture surface uses.
- **No Inbox entity.** Inbox is an active, unassigned Task — the semantics
  TASKS-04 already established.
- **No second idempotency mechanism.** Replay safety reuses the PWA-05
  `offline_capture_receipts` protocol, with the key namespaced by credential.
- **No second audit log.** `capture.received` goes into the one `activities`
  stream through the SET-03 workspace-event recorder.
- **No AI anywhere in the capture path.**

---

## 3. The capture contract

```ts
type CaptureRequest = {
  kind?: "task" | "note" | "inbox" | "auto";   // default: "auto"
  text: string;                                 // required unless `title` is sent
  title?: string;
  source?: "dalyhub" | "ios-shortcut" | "ios-share-sheet" | "email" | "api";
  sourceUrl?: string;                           // http(s) only
  sourceTitle?: string;
  clientCaptureId?: string;                     // idempotency key
  capturedAt?: string;                          // ISO-8601, advisory only
};
```

The client supplies **intent**. DalyHub decides representation. There is no
`workspaceId`, no `entityId`, no position and no lifecycle field in the contract —
those are absent, not merely rejected.

### The four intents

| `kind` | What happens |
|---|---|
| `task` | Creates a Task. The deterministic parser reads dates, priority, sector, recurrence (both scheduling modes), waiting and delegate tokens. |
| `note` | Creates a Note with a Markdown body. |
| `inbox` | Creates an intentionally unclassified Task with no parent — DalyHub's existing Inbox. |
| `auto` | Deterministic, conservative classification. Falls back to Inbox. |

`auto` is optional and never replaces an explicit choice. The documented Shortcut
offers **Task**, **Note** and **Inbox** as fast choices.

### Bounds

| Field | Limit |
|---|---|
| Request body | 32 KB |
| `text` | 10 000 characters |
| `title` | 200 characters |
| `sourceTitle` | 300 characters |
| `sourceUrl` | 2 048 characters, `http`/`https` only, no embedded credentials |
| `clientCaptureId` | 8–80 characters, `[A-Za-z0-9-]` |

Anything larger is refused at the boundary with `413`, before it reaches the
domain layer.

### The response

```json
{
  "ok": true,
  "capture": {
    "id": "…",
    "kind": "task",
    "title": "Follow up academy accommodation",
    "destination": "Inbox",
    "path": "/tasks/…",
    "replayed": false
  }
}
```

`path` is the canonical in-app path. A Shortcut joins it to the origin it already
posted to and offers "Open in DalyHub" — no second link scheme, no extra request.

---

## 4. How `auto` classifies

Only signals a person deliberately put in the text move a capture out of the
Inbox. Everything ambiguous stays.

| Signal | Result |
|---|---|
| Planning grammar the TASKS-01 parser recognises (`tomorrow`, `p1`, `every Monday`, `due Friday`, `next week`, `waiting`…) | **Task** |
| An unmistakable action opener (`Call`, `Book`, `Email`, `Pay`, `Pick up`, `Follow up`…) | **Task** |
| A leading reference marker (`OpO idea:`, `Note:`, `Thought:`) | **Note** |
| A title plus a separate body | **Note** |
| Several paragraphs, or ≥ 280 characters | **Note** |
| A shared web page with no action in it | **Note** |
| Anything else | **Inbox** |

```
"Call Sarah tomorrow"                            → Task
"OpO idea: entry pathways need a common block"   → Note
"Look into camper solar"                         → Inbox
```

No AI, no network, no model. Capture works with AI disabled, unavailable, or out
of credits.

### The parser is the Task module's, not capture's (TASKS-11)

A captured Task is parsed by the SAME bounded grammar `/tasks` uses, documented in
[`TASKS_MODULE.md → Quick-capture grammar`](TASKS_MODULE.md#quick-capture-grammar-deliberately-bounded).
Capture has no syntax of its own and never will: the same sentence produces the same
structured Task whether it was typed into the quick-add row, sent by the Apple
Shortcut, spoken to Siri or received by email.

TASKS-11 therefore reached every transport at once. A Shortcut can now say:

```
Service Hilux every 6 months after completion
```

and get a Task titled `Service Hilux` carrying the canonical TASKS-07
after-completion rule (`month` / `6` / `after_completion`), anchored to the owner's
today. There is deliberately **no** recurrence field in the capture contract for
this — the endpoint exists to accept a sentence, and adding a structured recurrence
parameter would create the second capture protocol CAPTURE-01 was built to avoid.

The restraint travels too. A phrase the grammar cannot read whole is left as the
owner's words, and an unrecognisable capture still lands in the Inbox with its text
intact rather than being given invented structure.

---

## 5. Authentication and capture devices

### The credential

| Capability | Allowed |
|---|---|
| Create a capture | ✅ |
| Create a Task | ✅ (when granted) |
| Create a Note | ✅ (when granted) |
| Read any record | ❌ |
| Update any record | ❌ |
| Delete anything | ❌ |
| Admin / settings / export | ❌ |
| Choose a workspace | ❌ — bound at creation |

This is structural, not a policy check: CAPTURE-01 adds **one** endpoint. There is
no read or update endpoint for a leaked token to reach.

### Token format

```
dhcap_<43 base64url characters>
```

`dhcap_` is a recognisable prefix so a capture token can be identified in a log or
a screenshot, and taught to a secret scanner, without being confused for another
credential.

### What is stored

Only a **SHA-256 digest** and a 12-character fingerprint derived from that digest.
The complete token exists in exactly two places: the response that created it, and
the owner's device. There is no read path that can return it again.

### Creating one

**Settings → Capture → New capture device**

```
Name   [Aidan's iPhone]
Allow  [x] Create tasks
       [x] Create notes
       [Create token]
```

Then, once:

```
Copy this token now. It will not be shown again.

dhcap_…
```

### Revoking one

**Settings → Capture → the device → Revoke.** Immediate and permanent: the check
runs against stored state on every request, and there is no cached session to
outlive it. Historical Activity is untouched — revoking a credential does not
rewrite what it captured.

---

## 6. The endpoint

```http
POST /api/capture
Authorization: Bearer dhcap_…
Content-Type: application/json

{"kind":"task","text":"Book Hilux service next Friday","clientCaptureId":"…"}
```

### Errors

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_capture` | Malformed JSON, wrong content type, unknown `kind`/`source`, empty capture, bad URL |
| 401 | `invalid_capture_token` | Missing, malformed, unknown, revoked, expired, or another workspace's credential — all one answer |
| 403 | `capture_not_permitted` | Valid credential without that capability |
| 409 | `duplicate_capture` | The idempotency key is claimed by an attempt whose outcome is not yet knowable |
| 413 | `capture_too_large` | Over a size bound |
| 429 | `capture_rate_limited` | Over the rate limit; carries `Retry-After` |
| 500 | `capture_failed` | Something below the boundary failed |

A response never contains SQL, a D1 error, a stack trace, a Cloudflare detail or
any token representation.

### Representative requests

Copy-paste fixtures for verifying a deployment, or for building another client.
Substitute the origin and a real token.

```bash
TOKEN=dhcap_…
HUB=https://hub.daly.id.au

# The smallest possible capture — DalyHub decides what it is.
curl -sS -X POST "$HUB/api/capture" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"text":"Look into camper solar"}'

# An explicit Task, with a client-generated idempotency key.
curl -sS -X POST "$HUB/api/capture" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"task","text":"Book Hilux service next Friday",
       "source":"ios-shortcut","clientCaptureId":"'"$(uuidgen)"'"}'

# Run the SAME command twice: one task, and the second answer says so.
#   {"ok":true,"capture":{…,"replayed":true}}

# A Share Sheet Note, with the page's title and URL.
curl -sS -X POST "$HUB/api/capture" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"note","title":"An article","text":"Worth reading",
       "source":"ios-share-sheet","sourceUrl":"https://example.com/article",
       "sourceTitle":"An article"}'

# An explicit Inbox capture.
curl -sS -X POST "$HUB/api/capture" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"inbox","text":"That thing Dad mentioned"}'

# Refusals, for checking the boundary is doing its job.
curl -sS -X POST "$HUB/api/capture" -H 'content-type: application/json' \
  -d '{"text":"no credential"}'                       # 401 invalid_capture_token
curl -sS -X GET  "$HUB/api/capture" -H "authorization: Bearer $TOKEN"  # 405
curl -sS -X POST "$HUB/api/capture" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"Task","text":"x"}'                     # 400 invalid_capture
```

### Idempotency

```
same credential + same clientCaptureId  →  the same capture
different clientCaptureId + same text   →  two real records
```

A retry whose response was never seen returns the id of the record the first
attempt created, with `"replayed": true`. Two concurrent retries create one
record — the database arbitrates, not application code. DalyHub does **not**
deduplicate ordinary repeated human text: capturing "Water the plants" twice on
purpose gives you two tasks.

### Rate limits

30 captures per minute and 300 per hour, **per capture device**. Far above what
dictating or typing on a phone produces; enough to bound a stolen token. One
device exhausting its budget cannot affect another device or the owner's own
access to DalyHub. Email capture is counted under its own separate identity.

---

## 7. Deployment configuration

| Value | Where | Purpose |
|---|---|---|
| *(none)* | — | The HTTP endpoint needs no new configuration. |
| `CAPTURE_EMAIL_RECIPIENTS` | `wrangler secret` / `.dev.vars` | Comma-separated capture addresses. Email capture is OFF unless set. |
| `CAPTURE_EMAIL_ALLOWED_SENDERS` | `wrangler secret` / `.dev.vars` | Comma-separated addresses permitted to send. Email capture is OFF unless set. |

Neither address is hard-coded anywhere in application logic.

### ⚠️ Cloudflare Access: the one required deployment step

The production Custom Domain sits behind Cloudflare Access
([ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing)),
which intercepts requests **before** the Worker runs. A Shortcut has no browser
and cannot complete an Access challenge, so without configuration every capture
would be answered with a login redirect that a Shortcut cannot follow.

In the Cloudflare Zero Trust dashboard, on the Access application protecting
`hub.daly.id.au`, add a **Bypass** policy scoped to the path `/api/capture`:

```
Application: DalyHub
Policy:      Capture endpoint
Action:      Bypass
Include:     Everyone
Path:        /api/capture
```

This is safe *because* of everything above: the endpoint requires a `dhcap_`
bearer token, refuses every other method, creates only Tasks and Notes, reads
nothing, and is rate-limited per credential. Bypassing Access on that one path
hands authentication to DalyHub, which is the point.

Verify after deploying:

```bash
# Should be 401 (DalyHub's answer), NOT a 302 to the Access login page.
curl -si -X POST https://hub.daly.id.au/api/capture \
  -H 'content-type: application/json' -d '{"text":"probe"}' | head -1
```

---

## 8. Apple Shortcut setup

There is **no DalyHub app to install**. This is a few minutes in Apple's own
Shortcuts app. DalyHub does not ship a `.shortcut` binary: the file format is
signed and opaque, generating one is not a mechanism this repository has, and a
downloaded binary is exactly the thing an owner should not paste a credential
into sight-unseen.

### 8.1 Prepare

1. **Settings → Capture** in DalyHub, create a device (e.g. "Aidan's iPhone"),
   allow **Create tasks** and **Create notes**, copy the `dhcap_…` token.
2. On the iPhone, open **Shortcuts**.

### 8.2 The main Shortcut — "Capture to DalyHub"

Create a new Shortcut named exactly **Capture to DalyHub** (the name is the Siri
phrase) and add these actions in order:

| # | Action | Configuration |
|---|---|---|
| 1 | **Text** | Paste the token. Rename the variable to `Token`. *(Or use a Keychain/Data Jar entry if you prefer — the Shortcut only needs to read it.)* |
| 2 | **Text** | `https://hub.daly.id.au/api/capture` → variable `Endpoint` |
| 3 | **Choose from Menu** | Prompt: *What are you capturing?* Items: **Task**, **Note**, **Inbox** |
| 4 | *(in each menu branch)* **Text** | `task`, `note`, `inbox` respectively → variable `Kind` |
| 5 | **Ask for Input** | Type: **Text**. Prompt: *What do you want to capture?* → variable `Captured` |
| 6 | **Text** | `{{UUID}}` — use the **Random UUID**-producing *Text* action, or the *UUID* action if your iOS version offers one → variable `CaptureId` |
| 7 | **Get Contents of URL** | See below |
| 8 | **Get Dictionary Value** | Key `capture.title` from the result → variable `SavedTitle` |
| 9 | **Show Notification** | Title: *Saved to DalyHub*. Body: `SavedTitle` |

**Action 7 — Get Contents of URL:**

```
URL:     Endpoint
Method:  POST
Headers: Authorization  →  Bearer <Token>
         Content-Type   →  application/json
Request Body: JSON
  kind             (Text)  → Kind
  text             (Text)  → Captured
  source           (Text)  → ios-shortcut
  clientCaptureId  (Text)  → CaptureId
```

**Then add the failure path (action 7a), and do not skip it:**

Wrap action 7 in **If** → *Get Contents of URL* **has any value**… or, more
simply, add after it:

| # | Action | Configuration |
|---|---|---|
| 7a | **Otherwise / on error** | **Copy to Clipboard** → `Captured` |
| 7b | | **Show Alert**: *DalyHub could not be reached. Your text is on the clipboard — paste it anywhere, or run this Shortcut again.* |

This is the difference between a capture system and a hole in the ground. Never
show a success notification on a path where the POST did not succeed.

### 8.3 Put it where your thumb is

- **Home Screen:** Shortcut ⋯ → **Add to Home Screen**.
- **Action Button** (iPhone 15 Pro and later): Settings → Action Button →
  Shortcut → *Capture to DalyHub*.
- **Widget / Control Centre:** add the Shortcuts widget, or the Shortcut control
  where your iOS version supports it.
- **Lock Screen:** as a widget, same as above.

---

## 9. Siri

The Shortcut's **name is the phrase**. No backend work is required and none was
done — Siri is another way to run the Shortcut, and DalyHub receives ordinary
text.

```
"Hey Siri, Capture to DalyHub"
  → "What do you want to capture?"
"Call Mum tomorrow afternoon."
  → "Saved to DalyHub."
```

For a hands-free flow, make a variant that skips the menu (see §11) so Siri asks
only one question.

---

## 10. iOS Share Sheet

Duplicate the Shortcut, name it **Capture to DalyHub** (share variant), and:

1. In the Shortcut's settings (ⓘ), turn on **Show in Share Sheet**, and accept
   **URLs**, **Text** and **Safari web pages**.
2. Add at the top: **Get Details of Safari Web Page** → *URL* → variable
   `SharedUrl`, and again → *Name* → variable `SharedTitle`. (For plain shared
   text, `Shortcut Input` is the text.)
3. Add **Ask for Input** → *Anything to add?* → variable `Captured` (leave it
   blank to capture just the page).
4. In **Get Contents of URL**, send:

```
  kind         → note        (or offer the Task/Note menu — a shared URL is not
                              forced to become a Note)
  text         → Captured
  title        → SharedTitle
  source       → ios-share-sheet
  sourceUrl    → SharedUrl
  sourceTitle  → SharedTitle
  clientCaptureId → CaptureId
```

The result:

```
Title:  the article's own title
Body:   whatever you typed or selected
Source: https://…            ← a real Markdown link in the Note's body
```

Sharing to a **Task** works the same way: the Shortcut asks for the task text and
passes the URL as metadata, which lands in the Task's description rather than
being appended to its title.

DalyHub does not fetch or scrape the shared page. It captures what iOS supplied.

---

## 11. Ultra-fast variants

Two more Shortcuts, both calling the **same endpoint** — there is no second API.

**New DalyHub Task** — actions 1, 2, 5, 6, 7, 9 above, with `kind` fixed to
`task`. One tap, one question, done.

**New DalyHub Note** — the same, with `kind` fixed to `note`.

These are the ones worth putting on the Home Screen, on the Action Button, and in
Control Centre: no menu, no choice, no friction.

```
New Task
"What?"
[dictate]
Done.
```

---

## 12. Email capture

### Setting it up

1. In the Cloudflare dashboard: **Email → Email Routing** for the domain, add a
   custom address (e.g. `capture@daly.id.au`) and route it to **Send to a
   Worker → dalyhub-v2**.
2. Configure the Worker:

```bash
wrangler secret put CAPTURE_EMAIL_RECIPIENTS      # capture@daly.id.au
wrangler secret put CAPTURE_EMAIL_ALLOWED_SENDERS # aidan@daly.id.au
```

Email capture stays **off** until both are set.

### Syntax — the whole of it

| Subject | Result |
|---|---|
| `task: Call supplier tomorrow` | A Task |
| `note: OpO workshop idea` | A Note |
| anything else, including `Fwd: …` | **Inbox** |

That is the entire command language, deliberately. Prefixes are read after any
`Fwd:`/`Re:` chain, so forwarding a prefixed message still works — and an email
genuinely *about* tasks ("Task list for Friday") is not silently turned into one.

### What arrives

- A clean subject, with forwarding noise stripped, as the title.
- A readable plain-text body: `quoted-printable` and `base64` decoded, the
  charset honoured, the plain-text alternative preferred.
- The original sender, as a `Forwarded from:` line in the body.
- **HTML-only messages are converted to plain text.** Scripts, styles, tags and
  remote tracking images are removed — DalyHub stores no markup from an email at
  all.
- **Attachments are ignored.** Out of scope for CAPTURE-01.

### Security

- Authorisation uses the **SMTP envelope sender**, not the `From:` header, which
  the sender writes themselves.
- The message must additionally pass **SPF, DKIM or DMARC** per Cloudflare's own
  `Authentication-Results`. A message carrying no authentication evidence is
  refused — absence of evidence is not a pass.
- The recipient must be a configured capture address.
- Messages are size-bounded (512 KB) before the stream is read.
- Repeated delivery of the same `Message-ID` is idempotent.
- Every refusal returns the same fixed, uninformative SMTP reason, so a prober
  learns nothing about the allowlist.

---

## 13. Failure must never lose the thought

| Failure | What happens |
|---|---|
| No network | The Shortcut's error path copies the text to the clipboard and says so. Nothing claims to have saved. |
| DalyHub unreachable / 5xx | Same. |
| Token revoked | `401` with a message naming Settings → Capture. |
| Rate limited | `429` with `Retry-After` and "nothing was lost". |
| Retry after a lost response | Idempotent: the same capture, not a second one. |
| Note body write fails | The empty Note is removed and the capture fails, so the text stays on the phone. |
| Email capture fails server-side | The message is **rejected** at SMTP, so the sending system keeps it. |

CAPTURE-01 deliberately does **not** build a second offline sync engine. A
Shortcut's failure handling and the PWA's offline mutation queue are different
concerns; joining them would be cross-device eventual consistency for a case that
needs a clipboard.

---

## 14. Privacy

Captured content is never sent to analytics, to OpenAI, to a logging platform or
to any third-party classification service. Request logs carry the event type, the
source, success/failure, the credential id and its fingerprint, and the created
record's id — and nothing the owner wrote. The `capture.received` Activity payload
carries a bounded enum, a record kind, a destination and the device name; never
text, title or URL. See
[`capture-log.server.ts`](../../app/platform/capture/capture-log.server.ts), whose
parameter type cannot express the owner's words.

---

## 15. Security model

| Threat | Mitigation |
|---|---|
| Token theft | Narrowest credential in the product: create-only, two record types, no read/update/delete endpoint to reach. Revocable immediately. |
| Token at rest | Only a SHA-256 digest is stored. A database dump yields no usable credential. |
| Email spoofing | Envelope sender + allowlist + SPF/DKIM/DMARC. `From:` is never an authorisation input. |
| Replay / duplicate POSTs | PWA-05 receipt protocol, key namespaced by credential; the database arbitrates. |
| Brute force | 256-bit secrets, indexed digest lookup, per-credential rate limits, identical answers for every credential failure. |
| Oversized requests | `Content-Length` and decoded-byte bounds, refused with `413` before the domain. |
| Malformed JSON | Structured `400`, no parser detail. |
| URL injection | `http(s)` only, no credentials in the URL, parsed by `URL` not by string matching. |
| Markdown/HTML injection | Link text escaped, destinations percent-encoded, email HTML converted to plain text. |
| Workspace crossover | Credential looked up *inside* the configured workspace; no method takes a workspace. |
| Privilege escalation | A capture token cannot reach the Settings routes (Access-gated) and cannot mint another credential. |
| Timing information | Unknown/revoked/expired/foreign credentials give one identical answer; digest comparison is length-then-constant-time. |
| Log leakage | One typed logging function whose parameters cannot carry content. |
| Revoked credentials | Checked per request against stored state; no cached session, no grace period. |
| Idempotency races | `INSERT … ON CONFLICT` claim; at most one attempt creates. |

Everything in §62 of the CAPTURE-01 brief is covered, and each item has a test —
see §17.

---

## 15b. Known limitations, stated rather than implied

- **Rate-limit counter rows are never pruned automatically.** They are tiny and
  bounded by how much the owner actually captures, and a closed window influences
  no decision — but nothing deletes them today.
  [`pruneCaptureRateWindows`](../../app/platform/storage/d1/d1-capture-rate-limiter.ts)
  exists and is safe to call from a future maintenance task; it is deliberately
  NOT on the capture path, because a capture must not pay for housekeeping. This
  is the same honest position `PWA_AND_OFFLINE.md` takes about idempotency
  receipts.
- **Email capture resolves relative dates against the deployment's default
  timezone.** A capture token records the subject that minted it, so a Shortcut's
  `"Water the plants tomorrow"` is resolved in the *owner's* timezone. Email
  capture holds no credential and no authenticated subject — the allowlist is an
  address, and timezone preferences are keyed by subject — so `task: … tomorrow`
  in an email subject uses `DEFAULT_OWNER_TIME_ZONE`. For a single-owner
  installation where the default IS the owner's timezone, that is the same
  answer; it is written down here rather than left to be discovered by a date
  landing a day out.
- **A captured Note is two writes.** D1 has no interactive transaction spanning
  two repositories, so the entity create and the Markdown body are separate. A
  failure between them compensates — the empty Note is soft-deleted and the
  capture fails — so the owner keeps their text rather than silently gaining an
  empty record. It is not atomic, and it is not claimed to be.
- **The `capture.received` annotation is best-effort.** It explains a record that
  already exists and already has its own `entity.created` history. Failing the
  owner's capture to preserve an annotation would be the wrong trade, so a failure
  to append it is swallowed.
- **The Cloudflare Access bypass cannot be enforced from this repository.** It is
  a dashboard policy (§7). Without it the endpoint is unreachable by a Shortcut;
  with it, authentication for that one path is DalyHub's own capture token.
- **Nothing here reaches an owner outside the app.** Capture is input. Pushover
  and other notification channels remain unbuilt, and CAPTURE-01 did not enable
  any — there was no inactive integration code to review.

---

## 16. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Shortcut gets HTML, or a redirect to a login page | Cloudflare Access is intercepting before the Worker | Add the Bypass policy in §7 |
| `401 invalid_capture_token` | Wrong, revoked or expired token; or a typo in `Bearer ` | Check **Settings → Capture**; create a new device if unsure |
| `403 capture_not_permitted` | The device is not allowed that record type | Create a device with both permissions |
| `400 invalid_capture` with `field: "body"` | Missing `Content-Type: application/json` | Set the header in *Get Contents of URL* |
| `400` with `field: "kind"` | `Task` instead of `task` | Values are lowercase |
| `413 capture_too_large` | Pasted something enormous | Capture a summary; DalyHub is not an upload API |
| `429` | Something is looping | Check the Shortcut for a repeat action; wait for `Retry-After` |
| Two identical tasks appear | The Shortcut sent no `clientCaptureId` | Add the UUID action (§8.2 action 6) |
| Nothing arrives, no error | The Shortcut's success notification is outside the error branch | Restructure per §8.2 — never notify success on a failed POST |
| Email is silently refused | Sender not allowlisted, wrong address, or failed SPF/DKIM/DMARC | Check the two secrets; check the message's `Authentication-Results` |

---

## 17. What is tested, and where

| Level | File | Covers |
|---|---|---|
| Unit | `test/unit/capture/universal-capture-contract.test.ts` | Contract validation, bounds, URL handling, deterministic titles, source-URL preservation, the error model |
| Unit | `test/unit/capture/universal-capture-classification.test.ts` | Explicit intent, every `auto` signal, ambiguity → Inbox, determinism |
| Unit | `test/unit/capture/capture-credentials.test.ts` | Token format, bearer parsing, hashing, fingerprints, constant-time comparison, status, capabilities, rate-limit arithmetic |
| Unit | `test/unit/capture/capture-email.test.ts` | Config, sender verification, subject syntax, MIME fixtures, HTML→text |
| Unit | `test/unit/request/capture-boundary.test.ts` | The Worker carve-out: exactly one path, one method, no session granted |
| Integration | `test/kernel/capture-route.test.ts` | The endpoint against real D1: domain termination, authentication, revocation, workspace isolation, idempotency (including concurrency), Activity exactly once, bounds, rate limits, no leakage |
| Integration | `test/kernel/capture-email-route.test.ts` | The Email Worker against real D1: acceptance, refusal, HTML safety, idempotency, workspace isolation |
| Integration | `test/kernel/task-capture-language.test.ts` | TASKS-11: the same sentence through `/tasks/new` and `POST /api/capture` produces the same Task and the same recurrence rule, anchored in the owner's timezone |
| Browser | `e2e/capture-settings.spec.ts` | Creating a device, the one-time token, revocation, axe + 320px |

Deliberately **not** a dozen Playwright journeys: the capture endpoint is HTTP,
and HTTP is tested where its properties can actually be asserted.

---

## 18. Manual iPhone acceptance checklist

Automated tests cannot drive iOS Shortcuts. Run this on a physical iPhone before
declaring phone capture accepted, and record the results.

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Launch **Capture to DalyHub** from the Home Screen, choose **Task**, dictate "Call Sarah tomorrow" | Notification names the saved task; it appears in DalyHub's Inbox with tomorrow's date | ☐ |
| 2 | Launch it, choose **Note**, type a short note | The Note appears in Notes with the typed text as its body | ☐ |
| 3 | Choose **Inbox**, capture a fragment | An unassigned Task in Inbox | ☐ |
| 4 | "Hey Siri, Capture to DalyHub", dictate a task | Siri asks once, confirms, the Task appears | ☐ |
| 5 | Safari → Share → Capture to DalyHub → Note | Note has the page title, your text, and the source URL as a link | ☐ |
| 6 | Safari → Share → Capture to DalyHub → Task | Task created; the URL is in its description, not its title | ☐ |
| 7 | Turn on Airplane Mode, capture something | Clear failure; text is on the clipboard; nothing claims to have saved | ☐ |
| 8 | Run **New DalyHub Task** from the Action Button | One question, saved | ☐ |
| 9 | Revoke the device in Settings → Capture, run the Shortcut | Fails with the invalid-token message; nothing is created | ☐ |
| 10 | Create a new device, update the token in the Shortcut | Capture works again | ☐ |
| 11 | Capture the same thing twice by force-quitting mid-request and retrying | One record, not two | ☐ |

## 19. Manual email acceptance checklist

Use the configured authorised sender. Delete only disposable verification records.

| # | Step | Expected | Result |
|---|---|---|---|
| 1 | Send a plain message with subject `note: Test note` | A Note titled "Test note" | ☐ |
| 2 | Send `task: Test task` | A Task in Inbox | ☐ |
| 3 | Forward a real email (any subject) | An Inbox capture with a clean subject and a readable body | ☐ |
| 4 | Forward an HTML newsletter | Readable text; no markup, no tracking URLs in the stored body | ☐ |
| 5 | Check Activity | "captured a task/note via email capture" | ☐ |
| 6 | Send from an unauthorised address | Refused; nothing created | ☐ |
| 7 | Send the same message twice | One record | ☐ |

---

## 20. Deliberately out of scope

These are **not defects**. They are choices, and the architecture makes each of
them possible later without a second capture backend:

- a native iOS app, an Android app, an Apple Watch app;
- a browser extension, a macOS Shortcut, a Raycast command;
- attachment or photo capture, OCR;
- AI classification of captures (a later *"Review Inbox with AI"* is a separate,
  proposal-shaped capability — [ADR-004](../decisions/ARCHITECTURE_DECISIONS.md#adr-004-ai-proposal-architecture));
- a general external CRUD API, or any read endpoint;
- inbound calendar sync, Todoist/Notion import;
- a webhook automation platform;
- push notifications, or a background iOS sync engine.

CAPTURE-01 is about **input**, not synchronisation.

---

## Related documents

- [ADR-088](../decisions/ARCHITECTURE_DECISIONS.md#adr-088-universal-capture--one-capture-contract-many-thin-transports-and-a-credential-that-can-only-bring-thoughts-in) — the reasoning
- [`TASKS_MODULE.md`](TASKS_MODULE.md) — the Task domain and the quick-capture parser
- [`NOTES_MODULE.md`](NOTES_MODULE.md) — the Notes domain
- [`PWA_AND_OFFLINE.md`](PWA_AND_OFFLINE.md) — the offline capture queue and the idempotency receipts
- [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) — the Cloudflare Access boundary
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploy-time configuration
- [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) — the Settings information architecture
