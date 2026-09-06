# NOTIFICATIONS.md — the notification system (NOTIFY-01)

> How DalyHub says something to its owner when they are not looking at it.
>
> The decision and its reasoning are
> [ADR-099](../decisions/ARCHITECTURE_DECISIONS.md#adr-099-notifications-are-events-in-a-ledger-not-a-second-attention-model--insert-before-send-a-channel-contract-and-secrets-in-the-settings-store);
> the surface rules are
> [`DESIGN_SYSTEM.md → The notification bell and inbox`](../design/DESIGN_SYSTEM.md#the-notification-bell-and-inbox-notify-01-2026-08-16).
> This is the how.

---

## The one rule

**Today's attention rail is STATE. A notification is an EVENT.**

The rail is recomputed from facts on every read, so it cannot go stale and cannot
be wrong about what needs the owner right now. A notification records that a fact
crossed a threshold at a moment and that DalyHub said so — which stays true
forever, whatever happens next.

Everything below follows from that. The inbox is a LOG: no "resolved", no
priority, no filters, no re-ranking, and no link back into the rail's model. If
the inbox and the rail ever disagree about what needs the owner, **the rail is
right and the inbox is history.**

The stored `title` and `body` are what was rendered when the event fired. They are
never re-derived from current facts, because re-rendering a past event silently
rewrites history.

---

## The pieces

| Where | What |
|---|---|
| `app/kernel/notifications/` | The domain. Pure: no clock, no storage, no channel, no React. |
| `app/platform/notifications/` | The tick, the digest facts, the Pushover adapter, the cron entry point. |
| `app/platform/attention/attention-facts.server.ts` | The SHARED facts Today's rail and the digest are both built from. |
| `app/platform/storage/d1/d1-notification-*.ts` | The ledger and the settings store. |
| `app/shared/notifications/` | The bell and the inbox sheet. |
| `app/modules/settings/NotificationsSection.tsx` | `Settings → Notifications`, and the two POST endpoints beside it. |
| `migrations/0043_create_notifications.sql` | `notification_settings`, `notifications`, `notification_deliveries`. |

The kernel is the interesting half:

- `notification.ts` — kinds, bounds, the delivery vocabulary, the **dedupe-key
  builders** (a storage contract: changing one re-fires every event that used it).
- `notification-evaluator.ts` — "is the digest due?" and "which rung is this
  obligation in?", both pure.
- `digest.ts` — what the digest SAYS, and `renderDigest → null` when there is
  nothing to say.
- `notification-channel.ts` — the external channel contract, and the type that
  refuses Pushover's emergency priority.
- `pushover-format.ts` — how Pushover is told, escaped and clamped.

---

## The tick

The Worker's existing fifteen-minute cron (CAL-01's) runs the calendar refresh and
then `runScheduledNotifications`. The order matters: the digest states what is on
today, and assembling it from a projection up to fifteen minutes stale would tell
the owner about a meeting that moved.

For each owner with notifications ON:

```
digest?      evaluate → render → RECORD → deliver
obligations? evaluate → render → RECORD → deliver
purge (only on a tick that recorded something)
```

**RECORD, then deliver. Always that way round.** The insert is
`INSERT … ON CONFLICT DO NOTHING … RETURNING`, and it commits before any channel
is called. Three properties fall out, and all three are the point:

1. two ticks racing produce ONE row and one send — the DATABASE arbitrates;
2. a provider outage cannot make an event not-have-happened;
3. a failed send is a VISIBLE fact badged on its own row, not a silence.

**Nothing retries.** A retry would reintroduce exactly the duplicate the ledger
exists to prevent, to deliver a message the owner can already read in the app.

A tick that finds nothing writes nothing, sends nothing and logs nothing.

---

## Why a tick rather than a scheduled send time

A cron expression is timezone-ignorant, and the owner's zone is a preference they
can change. `0 21 * * *` would be "07:00 Sydney" for half the year, an hour wrong
for the other half, and would need a redeploy to follow the owner moving house.

So the cron says nothing about when a digest is due. It offers the evaluator
ninety-six opportunities a day, and the rule is:

> **at or past the send time, on an owner-calendar date with no digest yet.**

- **at or past**, not "at" — ticks are fifteen minutes apart and a 07:05 send time
  falls between two of them.
- **owner-calendar date**, not "24 hours since the last one" — the owner asked for
  a digest each morning, not every 1,440 minutes.
- **no digest yet** — decided by the LEDGER, never by a timestamp this code keeps.
  The pre-read is an optimisation (it stops the digest being rendered ninety times
  a day once it has been sent); the guarantee is the UNIQUE conflict.

**DST falls out of those three, and is tested rather than hoped for.** On a
spring-forward day a send time inside the skipped hour still lands, late, at the
first tick past it. On a fall-back day the repeated hour is the same local date,
so the second pass claims the same key and is refused. Both directions are in
`test/unit/notifications/notification-evaluator.test.ts`, driven through the REAL
`wallClockInTimeZone` conversion rather than a stub.

---

## The digest

Built from `readDigestFacts`, which is the SHARED attention facts plus today's
due/overdue counts and the CAL-01 schedule. It derives nothing: project health is
`evaluateProjectHealth`, goal alignment is `evaluateGoalAlignment`, an
obligation's state is `evaluateObligation` (the ONE shared evaluator in
[`app/kernel/obligations`](../../app/kernel/obligations/index.ts) since V2.10
LIFE-00, reached through `evaluateAssetObligation`, which supplies the meter side
where the subject has one and decides nothing), the Inbox count is the canonical
`inbox` system view. **If the digest wants a fact the rail cannot supply, add it to
`attention-facts.server.ts` — never compute it a second time.**

**An empty digest is not sent.** `renderDigest` returns null and the tick writes
nothing. Silence has to mean something: a daily "nothing needs attention" is the
fastest way to teach the owner to stop reading the channel, at which point the one
morning it matters is the one they ignore.

### The follow-ups-due line (V2.7 RECALL-03)

One line, beside the waiting line, when the owner has recorded a chase date that
has arrived: **"2 follow-ups due"**. It obeys the suppression rule above exactly
— no follow-ups due, no line, and never "0 follow-ups due".

It is its OWN line rather than a clause on the waiting line because it answers a
different question with a different action: "two things are outstanding" is
ageing, "one of them you said you would chase today" is a commitment that has
come due.

The number is `facts.waiting.followUpDue`, the SAME field Today's attention rail
renders, from the same shared facts layer and the same `followUp: "due"`
predicate in the one declarative Task vocabulary
([`TASKS_MODULE.md` → Filters](TASKS_MODULE.md#filters)). Reading
`facts.waiting.count` here instead would state the generic waiting total under
follow-up words — the specific untruth
[`digest.test.ts`](../../test/unit/notifications/digest.test.ts) falsifies, and
the reason the two counts are asserted to DIFFER on a fixture where they do.

### The meeting lead notice: asked, and answered NO (V2.7 RECALL-03)

The question RECALL-03 was required to decide rather than omit: *is an upcoming
Meeting with a known time an explicit enough commitment to justify one calm lead
notice through the existing evaluator?* The recorded answer is **no**, and
`NOTIFICATION_KINDS` remains the closed set of two
([ADR-114](../decisions/ARCHITECTURE_DECISIONS.md#adr-114-recall--retrieval-reaches-content-under-an-explicit-query-boundary-one-excerpt-contract-one-completion-time-authority-and-commitments-that-return-without-a-reminder-engine)
decision 5). The evidence, re-checked at implementation time and unchanged:

- the digest **already states today's schedule with times** each morning (the
  events line, up to three named — see the renderer above);
- Today's Now band surfaces the next upcoming Meeting all day, so the commitment
  already reaches the owner twice;
- both existing kinds are **day-granularity**; a lead notice is
  **minute-granularity** — a genuinely new precision class, with its own
  evaluator timing, its own dedupe shape and its own failure modes;
- CAL-01 events come from external calendars **that already notify**, so a third
  channel carries a real duplicate-noise risk with no calm mitigation;
- it is the first step toward the per-event reminder engine this product has
  explicitly refused (see *Not built, deliberately* below).

Nothing about the implementation overturned that reasoning, so nothing was
added: no `meeting_lead` kind, no countdown, no new evaluator precision. **The
reversal condition** is the one ADR-114 records — an owner-stated need, weighed
against this same evidence, in its own decision.

---

## Event sources

Obligations, at three fixed rungs: **30 / 7 / 1 days**, each fired once and
deduped forever by `obligation:{obligationId}:{rung}`.

Since V2.10 LIFE-03 that means EVERY obligation — a tax return, a passport
renewal, a subscription — not only the ones about an Asset. The notice names its
subject where it has one ("Hilux — Registration renewal") and itself where it
does not ("Lodge the tax return"), and links to the obligation's own record
either way. The `kind` is `obligation` and the key prefix is `obligation:`;
migration 0051 rewrote both across every historical row, in the same statement,
because changing the prefix without carrying the ledger across would re-announce
every rung the owner had already been told about.

**No PERSON is ever named in one either.** AGENTS.md §17 keeps People and Diary
out of external services without an explicit per-action opt-in, and enabling a
channel once is not one. An obligation about a person announces ITSELF ("Renew
the working-with-children check") rather than them; it still fires, still links
to the obligation, and the subject id is still stored in-app so the inbox can
say what a historical row concerned. Until V2.10 LIFE-03 this held by accident —
the path read only obligations about an Asset — and it is now a rule with a test.

**No amount ever appears in a notification** — not in the title, not in the body,
not in the link. A lock screen is the one surface an owner cannot choose not to
show somebody (ADR-049 decision 5), and `test/unit/notifications/digest.test.ts`
asserts the refusal rather than trusting it.

- The rung is the SMALLEST one the obligation is inside, so an obligation twelve
  days out is in the 30-day rung. Adding one three days before it is due fires the
  7-day rung and skips the 30 — there is no retrospective burst.
- An overdue obligation stays in the 1-day rung forever, and therefore says so
  exactly once.
- A meter-only obligation has no due date, so it has no rung. It reaches the owner
  through Today and the digest's obligation line.
- Obligations are read through the EXISTING bounded `listAttention` seam, whose
  default horizon is 30 days — the same number as the widest rung, so the read
  and the ladder agree by construction. **No scheduling of its own was added.**
  That read is ONE page of at most `MAX_ATTENTION_ITEMS` (50), oldest-due first:
  a workspace holding more than fifty attention-eligible obligations can starve
  the ones behind them, which is recorded as
  [DEBT-246](../product/PRODUCT_DEBT.md) rather than left unstated.

**Overdue tasks and ageing waiting items are digest-only, deliberately.** They
change every day, so a per-event channel would deliver the same anxiety every
morning until the work was done. That is the nagging failure mode this design
exists to prevent.

**One rule differs between the rail and the rung, on purpose.** Today's rail
suppresses an obligation whose linked Task is still open, because the Task is a
row in the timeline beside it. The rung does not: outside the application there is
no timeline to have seen, and suppressing there would give an owner who dutifully
made a Task LESS warning than one who did not.

---

## Adding a channel

1. Implement `NotificationChannelAdapter` in `app/platform/notifications/`. One
   method, `deliver(notification) → delivered | failed(reason)`. It must NEVER
   reject: a failure is data, and a provider's own words never leave the adapter —
   map onto `DeliveryFailureReason`.
2. Add the channel name to the `channel` CHECK in a new migration. The vocabulary
   is closed on purpose.
3. Add its formatter beside `pushover-format.ts`, pure, with its own bounds.
4. Add its credentials and its enable switch to `notification_settings`, and its
   block to `NotificationsSection`. **Validate before enable** — see below.
5. Wire it into `channelsFor` in `notification-run.server.ts`.

Nothing in the evaluator, the digest or the inbox changes. That is what the
contract is for.

**Priority 2 does not exist.** `NotificationPriority` is `0 | 1`. Pushover's
priority 2 re-alerts until a human acknowledges it and overrides quiet hours, and
nothing in a personal planner justifies waking someone repeatedly at 3am. The
refusal is in the TYPE so there is no code path to widen.

---

## Validate before enable

A channel that has never been proven to work is a channel that fails silently at
7am with nobody watching. The rule is enforced in three places, because a rule
enforced in one place is a rule one future code path can forget:

1. **The route.** `POST /settings/notifications/test` calls Pushover's own
   `users/validate.json`, then sends one real message, and only then stamps
   `pushover_validated_at`.
2. **The repository.** Any change to a stored credential clears that stamp and
   switches the channel off.
3. **The database.** A CHECK on `notification_settings` refuses
   `pushover_enabled = 1` without stored, stamped credentials.

---

## Configuration

| Setting | Where | Default |
|---|---|---|
| Master enable | `Settings → Notifications` | **off** |
| Digest, obligations falling due | same | on (inert until the master is) |
| Digest send time | same | `07:00` |
| Timezone | same | follow the profile — and the EFFECTIVE zone is always displayed |
| Pushover user key / app token | same, stored in D1 | none |
| `APP_PUBLIC_ORIGIN` | deploy-time env var, optional | absent → messages arrive without a tappable link |

`APP_PUBLIC_ORIGIN` is read through an optional config shape rather than the
generated `Env`, like the Access values and the capture addresses. It must be
`https`.

**The Pushover credentials are stored as plain columns in D1**, knowingly — they
are the OWNER's rather than the deployment's, and `wrangler secret` would make
"turn on notifications" a deploy. ADR-099 decision 6 records the trade and
[DEBT-146](../product/PRODUCT_DEBT.md) records the uniformity it costs. Three
things bound it: the ordinary read does not select the columns, the settings view
type has no field they could occupy, and they appear in no response, error or log.

---

## Retention

Read notifications are purged after **90 days**, on a tick that recorded something
(in practice about once a day — rows exist only because something fired, so there
is nothing to purge on a tick that wrote nothing).

**An unread notification is never purged, however old.** Silently deleting
something the owner has not seen is the one thing an event log must not do.

---

## Running it locally

`wrangler dev` does not fire crons. Run one on demand:

```
curl "http://localhost:5173/cdn-cgi/handler/scheduled"
```

Nothing happens until an owner turns notifications on in Settings —
`listEnabledSenders` returns nothing and the run stops there.

---

## Verification

| Level | File | What it proves |
|---|---|---|
| Unit | `test/unit/notifications/notification-evaluator.test.ts` | Digest gating across BOTH DST transitions, the owner-calendar date boundary, the rung ladder. |
| Unit | `test/unit/notifications/digest.test.ts` | Empty-digest suppression, the wording, the ledger bounds on an extreme day. |
| Unit | `test/unit/notifications/pushover-format.test.ts` | The escaped-length bound, no cut inside an entity or a tag, escaping under `html=1`. |
| Unit | `test/unit/notifications/notification-settings.test.ts` | Off by default, the parsers, and the absence of any way for a form to assert a validation. |
| Kernel (real Workers/D1) | `test/kernel/notifications.test.ts` | Insert-first concurrency (two ticks, one row), delivery failure recorded without blocking the insert, the purge, workspace isolation, validate-before-enable. |
| E2E | `e2e/notifications.spec.ts` | The bell's count, the sheet, mark-read navigation, the empty state, and the Settings gate. |

What is deliberately NOT covered end to end is recorded as
[DEBT-147](../product/PRODUCT_DEBT.md) rather than implied.

---

## Not built, deliberately

A generic outbound webhook · per-task "remind me at" reminders · Web Push
(VAPID, per-device subscription state) · email-out, ntfy or any channel beyond the
contract they would implement · notification grouping, snoozing or actions · read
tracking beyond `read_at` · quiet hours (there is nothing to be quiet about — the
digest goes once a day and a rung fires at most three times in an obligation's
life) · any AI involvement · **a Meeting lead notice** (V2.7 RECALL-03 evaluated
it and recorded NO, [above](#the-meeting-lead-notice-asked-and-answered-no-v27-recall-03))
· per-event overdue nagging.

---

## Related documents

- [ADR-099](../decisions/ARCHITECTURE_DECISIONS.md#adr-099-notifications-are-events-in-a-ledger-not-a-second-attention-model--insert-before-send-a-channel-contract-and-secrets-in-the-settings-store) — the decision and its alternatives
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md#the-notification-bell-and-inbox-notify-01-2026-08-16) — the bell and the inbox
- [`ASSETS_MODULE.md`](ASSETS_MODULE.md) — the obligations this reads, and their one evaluator
- [`TODAY_DASHBOARD.md`](TODAY_DASHBOARD.md) — the attention rail, which is the STATE half
- [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) — where the configuration lives
