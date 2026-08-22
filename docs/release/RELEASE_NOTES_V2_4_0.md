# DalyHub V2.4.0 — Release Notes

**Version `2.4.0` · Release name "V2" · 2026-08-22**

> Written for the person using DalyHub.
>
> **This release incorporates the previously unreleased V2.1, V2.2 and V2.3
> programmes.** The last release anyone cut was `2.0.1`, on 2 August 2026. Three
> whole programmes have landed on `main` since, and none of them had ever
> reached a release. So although the version number moves once, what arrives is
> four programmes' worth of product — and everything below is new *to you* even
> where it has been sitting in the repository for weeks.
>
> The gate that made this releasable at all is described in
> [V2.4-GATE-01](../product/V2_4_GATE_01_RECOVERABLE_GREEN_RELEASED_2026_08.md).

---

## Why `2.4.0` and not a sequence of releases

The programmes are named V2.1 … V2.4 and the shipped code contains all of them,
so the release could either carry one number or be cut as a sequence. It carries
one, for a reason worth stating plainly:

**`2.1.0`, `2.2.0` and `2.3.0` were never built, never deployed and never ran
anywhere.** Tagging them retrospectively would create three release numbers that
identify nothing — the artefact is byte-identical for all four — and the version
number's whole job is to answer *"which build is live?"*. A number that was never
a build cannot answer it.

So there is one release, its notes enumerate what each programme contributed,
and `package.json`, `app/lib/version.ts`, these notes and the running application
all say `2.4.0`.

---

## What is new

### Plan the week, and keep the routine — V2.3

- **Weekly Planning.** `/plan` shows the week ahead as a board: the days you have
  committed to, and a queue of everything still to place. A Task's scheduled day
  *is* the plan — there is no second planning record to keep in step, and nothing
  to migrate if you stop using it.
- **Saved smart lists.** A filter you use often becomes a named list you can
  return to, in the same declarative vocabulary Tasks and Plan both read.
- **Habits and routines.** A Habit is a *behaviour*, not a recurring Task: it has
  an effective-dated schedule, owner-local check-ins, and consistency figures
  that are computed rather than manufactured. There are no streaks to break, on
  purpose — a day you did not schedule is never described as a miss, and a day
  that has not happened yet is never described as incomplete.
- **Checklists on a Task.** Steps inside a Task, with progress on the row, and
  ticking a step works offline.
- **Project templates.** A Project you set up the same way each time becomes a
  template, and creating from it is one action.
- **Advanced recurrence and dependencies.** Richer repeat rules, and a Task that
  is genuinely blocked by another says so — with cycles refused at the write
  rather than discovered later.

### The day, the phone, and the things you type — V2.2

- **One task row, everywhere.** Today, Tasks and Plan draw the same row, with the
  same controls, the same keyboard reach and the same accessible names.
- **Notifications.** An event ledger, an in-app inbox, and optional Pushover
  delivery for the obligations that matter outside the app.
- **Universal capture.** Capture from anywhere in the product, and a
  deterministic parser that understands priority, area, commitment, flags,
  relative days, weekdays, explicit and ISO dates, and the whole recurrence
  vocabulary — from one line of typing.
- **External calendars.** Subscribe to an ICS feed and see the day you actually
  have, beside the day you planned. It is a read: DalyHub never writes to
  someone else's calendar.
- **Offline Tasks.** Complete, reschedule and edit a Task with no connection; the
  changes replay exactly once when you come back.
- **iPhone daily-driver polish**, and a product-wide UI redesign against the
  approved references — Today, Projects, Areas, Goals, Notes, Diary, Meetings,
  People, Assets, Reviews, Analytics and Settings.
- **DalyHub colour schemes**, generated from one seed rather than authored, with
  every contrast pair checked rather than assumed.

### Reflection, recovery and mobile — V2.1

- **Backup and restore.** Download your whole workspace as a versioned archive,
  and restore it back into DalyHub — with a preview before anything is written, a
  verified safety backup before anything is replaced, and an all-or-nothing
  cutover.
- **Weekly Review**, with insights and alignment derived from what you actually
  did.
- **Saved views and cross-module filters.**
- **Mobile People, Assets and Reviews.**
- **An installable PWA** with an offline foundation.
- **Day-context links** from a Review to the Diary entries behind it.

### The gate this release is named for — V2.4

- **A disaster-recovery copy that is proved to be recoverable.** The nightly
  production backup no longer stops at "the file decrypts": it now **restores**
  the decrypted database and reads the kernel tables back out of it, every run.
  A schema-only or half-written export fails the job instead of being filed as a
  month of recoverable history.
- **A test gate that can be believed again**, so a real regression is visible
  instead of arriving among expected red.

---

## Fixed

- **A backup could report a recovery it had never performed.** The metadata
  published beside every encrypted artifact asserted `recoveryVerified: true` as
  a constant — it had no way to know whether the verification step had run, and
  would have gone on asserting it through any edit that dropped or reordered
  that step. The claim is now carried by a receipt, cross-checked against the
  artifact it describes.
- **The recovery instructions could not be followed.** The documented way to
  restore a D1 dump has never worked, for a reason that has nothing to do with
  the backups themselves — a dump's own statement order is refused by an executor
  that enforces foreign keys while loading. The working command is now in
  [`BACKUP_AND_RESTORE.md` § 5.0a](../development/BACKUP_AND_RESTORE.md), with
  the measurement behind it.
- **An unrevealed row action was still a hit target.** A row's `⋯` is invisible
  until you engage with the row, and its own rule says it must not be a hidden
  hit area over the row — but the wrapper around it stayed live, so it was.
- **A record's tab strip drew a doubled edge.** The panel below a record's tabs
  is meant to join the strip seamlessly, and two stylesheets were describing its
  border — the later one restoring the top edge the earlier one had removed. The
  result was a second hairline under the tabs on every record.
- **A record's filter rail was louder than the tabs above it.** The rail is
  meant to be subordinate to the tab strip it sits under, and was drawn one type
  step larger. Half a pixel of type, inverting the hierarchy — the kind of thing
  that has to be measured rather than looked at, which is how it was found.
- **A Goal measurement journey that never ran.** The end-to-end proof that
  recording a reading moves a Goal's figures had been quietly skipping for its
  whole existence, because nothing in the test workspace was measurable.

---

## Unchanged, and deliberately

- **No new product concept, no schema change and no new module.** V2.4-GATE-01 is
  a release-readiness pass; the features above are the ones that already existed.
- **What DalyHub's Restore reads is unchanged.** The canonical workspace archive
  is the same format, read the same way.
- **The AI layer is still a proposer.** Nothing writes to your data without you.

---

## Related documents

- [`RELEASE_CHECKLIST_V2_4_0.md`](RELEASE_CHECKLIST_V2_4_0.md) — the evidence
  behind every claim here, and the exact deployment sequence.
- [`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md) ·
  [`ROADMAP_V2_2.md`](../roadmap/ROADMAP_V2_2.md) ·
  [`ROADMAP_V2_3.md`](../roadmap/ROADMAP_V2_3.md) ·
  [`ROADMAP_V2_4.md`](../roadmap/ROADMAP_V2_4.md)
- [`BACKUP_AND_RESTORE.md`](../development/BACKUP_AND_RESTORE.md) ·
  [`DEPLOYMENT.md`](../development/DEPLOYMENT.md)
