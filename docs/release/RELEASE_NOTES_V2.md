# DalyHub V2 — Release Notes

**Version `2.0.0` · Release name "V2" · 2026-08-01**

> Written for the person using DalyHub. The engineering record is in
> [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md); the evidence behind every claim here
> is in [`RELEASE_CHECKLIST_V2.md`](RELEASE_CHECKLIST_V2.md).

---

## What DalyHub V2 is

DalyHub is a **Personal Operating System**: one calm place to run a life, where
everything is connected and nothing is lost. It is not a task manager, a note app or
a CRM — it is the layer above those categories.

V2 is the redevelopment that makes that promise real. V1 was prompt-driven and grew a
bespoke version of everything: a card per module, a header per module, a filter per
list, a history per feature. V2 is built on **one shared kernel** (entities, links,
activity, workspaces) and **one shared design system**, so learning one module teaches
you all of them.

The spine of the product is unchanged and deliberate:

```
Area        an ongoing domain of life      (Health, Career, Home)   — never completes
  └ Goal    a desired outcome              (Run a half-marathon)    — optional
      └ Project   a finite body of work    (12-week training plan)  — has an end
          └ Task  the thing you actually do (Monday: 5km easy run)  — done or not
```

Notes, Meetings, People, Assets, Diary entries and Reviews attach *across* that spine
through links. The structure gives shape; the links give it life.

---

## The modules and workflows delivered

**Today** is the default daily view and the command centre. It answers "what needs me
now?" from real records: a morning brief, your day's planned/overdue/upcoming tasks,
today's meetings in order, active projects, area and goal health, recent activity,
overdue-and-waiting insights, asset renewals that are due, and capture. Every widget
can be collapsed, reordered, pinned or hidden, and the arrangement is remembered.

**Tasks** is a first-class module, not a list inside Today. A task can be captured in
seconds without choosing a Project — project-less tasks land in a real **Inbox** with
a review flow, rather than being lost or forced into a fake project. The collection
filters, sorts and groups server-side with authoritative counts, and you can save a
view and come back to it. Inline editing changes priority, dates and status without
opening anything. Recurring tasks generate their successor exactly once. Priority
(P1–P4), scheduled date and due date are four separate questions and the product keeps
them separate — your commitment to do something on Tuesday is not the same as its
deadline.

**Projects, Areas and Goals** roll up honestly. Progress is *derived* from the tasks
underneath, never stored, so it cannot go stale. A project shows a derived health
signal that explains itself. A goal shows whether your recent action actually matches
it. An empty project says "No tasks yet" rather than drawing a 0% bar. Project-less
tasks are excluded from project reporting by construction — they have no project to
distort.

**Notes** are Markdown, stored as you wrote them. You can link notes to any record
with `[[Wiki Links]]` or `dalyhub://` record links, and see what links back. The
writing surface is a real editor with a preview, and a note can be copied, printed
and exported on its own.

**Diary** is an interstitial journal: capture first, organise later. Entries carry
the moment they happened, not the moment you typed them, so backdating works. The day
timeline shows one day at a time by default with a full chronological history behind
it.

**Meetings** connect to People, Projects and Notes, and turn agenda items, decisions
and outcomes into real Tasks. Marking a meeting held is a durable fact that becomes
part of every attendee's history.

**People** are remembered, not managed. A person's record shows one unified timeline
built from the records they are linked to — no second history, no copied content —
plus a calm relationship summary and a stay-in-touch signal that measures actual
shared moments. No guilt mechanics, no streaks, no pipeline language.

**Assets** track things you own as an ownership system, not a register: recorded
history (fourteen kinds of event) and future obligations (nine kinds), on calendar
dates *and* meter readings. Recurrence anchors on the day work was actually done, so
being late once does not compound forever. Costs are labelled "recorded costs" and
never pretend to be a cost of ownership.

**Reviews** are durable weekly, monthly, quarterly, annual and custom records over
real wall-calendar periods that honour your first-day-of-week preference. The period
context is read live from your actual records — nothing is copied or snapshotted, so a
review cannot drift from the truth.

---

## Mobile and daily-driver usability

V2 is a deliberate mobile product, not a desktop product that fits on a narrow screen —
and everything below is in the **shared layer**, so there is no mobile component tree,
no mobile data model and no mobile-only rule to drift.

- A persistent **bottom navigation bar** — Today · Tasks · Capture · Diary · More.
- One **Quick Capture** sheet for a task, diary entry, meeting or note, from anywhere,
  posting to the same routes the full forms use.
- Records open **full screen** on a phone, with the same URL, history and focus
  behaviour as the desktop drawer, and a keyboard-safe action bar.
- **Keyboard-safe forms** — fields stay visible above the on-screen keyboard, and a
  16px floor stops mobile browsers zooming a focused input.
- **Compact cards**, one shared filter/sort sheet per collection, and record tabs that
  collapse into a "More sections" menu rather than scrolling off the edge.
- Every interactive target meets 44px, and no layout overflows horizontally from
  320px up.

---

## Themes, Help and About

**Five curated themes** ship: Daly Light (default), Daly Dark, Eucalypt, Coastal and
Ember, plus a `system` mode that pairs the two Daly palettes with your OS preference.
Your choice is stored against your account, so it follows you between browsers, and it
is applied in the first byte of the page — no flash. Every theme meets WCAG 2.2 AA
across the whole text ramp, every tinted surface, filled controls in every state,
focus rings, control boundaries, progress and all six chart colours — asserted per
theme, not sampled.

**Help** describes DalyHub as it actually is, and has a topic called **"What is not
here yet"** that names what is missing — including that this deployment has no support
desk and no second copy of your data unless you keep an export yourself.

**About** shows the version, release name, environment and (when the deployment
records one) the build commit, all from a single authority that `/health` reads too —
so a deployment check and the running application can never disagree about which build
is live.

---

## Search and command actions

**Global Search** covers all ten record modules — Areas, Goals, Projects, Tasks,
Notes, Diary, Meetings, People, Assets and Reviews. Ranking is deterministic, results
route to real records, task priority and urgency are shown where they help, and recent
searches are kept on your device only and can be cleared. Previews deliberately avoid
sensitive content: no diary prose, no contact fields, no meeting notes, no asset
identifiers or prices, no review reflections.

**The Command Palette** (`⌘K`) is the shell: anything you can click, you can type.
`?` shows the keyboard reference from anywhere.

---

## Getting your data out

`Settings → Privacy & data` has two downloads, both built from one snapshot taken the
moment you press the button, so they always describe the same thing:

- **Full export** — a ZIP with your entire workspace in one structured file, the
  format's own documentation, and checksums you can verify with no DalyHub involved
  (`sha256sum -c CHECKSUMS.txt`).
- **Obsidian vault** — the same workspace as ordinary Markdown files, one per record,
  with working links between them. Extract it and open the folder in Obsidian, or read
  it in any text editor. No plugin, no import step.

Archived and deleted records are included and **marked** as such — an export that
inherited the app's hiding rules would not be a real copy. Nothing is invented: no
summaries, no computed health, no fabricated fields.

---

## Reliability, migration and accessibility

- **Workspace isolation is a security boundary, not an organisational one.** Every
  query is scoped in SQL to the authenticated workspace, repositories are bound to a
  workspace at construction so no module method can even accept a different one, and
  the database enforces it with composite foreign keys. A record id from another
  workspace reveals nothing.
- **Mutations are atomic.** A change and its activity event are written together or
  not at all.
- **Progress and counts are derived, never stored,** so they cannot go stale.
- **Recurring task generation is idempotent** — gated in-batch, `NOT EXISTS`-checked,
  and backstopped by a database constraint, so a retry or a concurrent request cannot
  produce two successors.
- **The V2 upgrade is proven against the deployed production schema**, not assumed: a
  test applies the migrations production actually has, seeds a representative
  workspace, then applies the whole remaining sequence and asserts nothing is lost,
  resurrected or rewritten.
- **Accessibility is tested, not claimed.** Keyboard-complete workflows, visible and
  restored focus, no keyboard traps, correct landmarks and heading order, dialog focus
  management, live-region announcements, `prefers-reduced-motion` honoured, and axe
  scans across surfaces in light and dark.

---

## Known limitations

Stated plainly, because a product that hides these is harder to trust:

- **An export is not a restore.** DalyHub cannot read one back in. See below.
- **An export is not an atomic point-in-time snapshot.** It is read-committed per
  statement, so a workspace being edited *during* an export can produce a slightly
  incoherent one. The archive says so itself.
- **Exports are bounded** at 50,000 rows per collection and 64 MiB per archive. Both
  are reported honestly when hit rather than silently truncating. A realistic personal
  workspace is orders of magnitude below both.
- **Nothing reaches you outside the app.** Asset renewals and obligations are tracked
  and shown on Today, but there are no notifications, emails or reminders of any kind.
- **No weather or calendar on Today.** Both placeholders were removed rather than
  faked; they return only if a real data source ever exists.
- **Reviews' period context is a bounded first cut** — it reads Tasks, Diary and
  Meetings, not Projects, and derives no progress signal from activity.
- **A held meeting can appear on the history of someone linked to it who was not an
  attendee.** The line is true about the meeting and disappears if you unlink, and it
  can never make a non-attendee count as recent contact — but on a relationship
  history it reads as more than it means.
- **Today's widget arrangement is per-device** while your theme is per-account.
- **Three modules have a named mobile remainder**: capturing a *new* Asset on a phone,
  the full capture-context matrix on People, and the one-prompt-at-a-time Review
  stepper.
- **No file attachments** — DalyHub stores none, so an export contains none.

---

## Deferred to V2.1

**Backup & restore (SET-02) is deliberately not in V2.**

V2 gives you a real, verifiable, owner-controlled **export**, and that is the V2
data-safety and portability feature. What V2 does **not** have is the other
direction: DalyHub cannot read an archive back in. Restore has never been exercised
end to end, so it is not claimed anywhere in the product — `Settings`, Help and these
notes all say so.

V2.1 will implement validated backup import and restore using the same canonical
snapshot format V2's export already produces, and it must include a preview of what
would change, validation of the archive, workspace protection, failure safety and a
proven end-to-end restoration test before it can be called done.

**Until then, keep your own copy.** Take a full export from
`Settings → Privacy & data` regularly and store it somewhere you control.

Also targeted at V2.1 or later, and not started: the weekly review flow and its
insights, day-context links on Diary entries, an Account & Security settings surface,
cross-module saved views, imports and sync from external tools, and the AI proposal
layer. The full list and its order is in
[`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md).

---

## Upgrading and deploying (for the owner)

**Production is currently on the `0001`–`0005` schema and the pre-V2 Worker.**
Deploying V2 is a twenty-migration step (`0006`–`0025`) over your live data.

The order is not optional, because the V2 Worker queries the new tables
unconditionally:

1. **Back this up first.** V2 has no in-app restore, so a `wrangler d1 export` (or a
   dashboard backup) is your only way back. Take it before anything else.
2. **Preflight** — `pnpm run deploy:production:preflight`. No credentials, no upload.
3. **Migrate** — `wrangler d1 migrations apply dalyhub-v2 --env production --remote`.
4. **Deploy** — `pnpm run deploy:production`.
5. **Verify** — `/health` returns `ok` and version `2.0.0`; the authenticated shell
   loads through Cloudflare Access; `/about` shows the same version and `Production`.

Every migration in the range is additive. Only one backfills anything (`0008` gives
each existing Project a details row). **Do not roll a migration back** — the sequence
is forward-only; if you need to revert, roll the Worker back and leave the schema.

The exact copy-and-paste command block and the full post-deployment checklist are in
[`RELEASE_CHECKLIST_V2.md`](RELEASE_CHECKLIST_V2.md) and
[`DEPLOYMENT.md`](../development/DEPLOYMENT.md).
