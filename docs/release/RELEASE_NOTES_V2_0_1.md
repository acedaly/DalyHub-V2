# DalyHub V2.0.1 — Release Notes

**Version `2.0.1` · Release name "V2" · Hotfix and release hardening · 2026-08-02**

> Written for the person using DalyHub. V2.0.1 is a **hotfix release on top of
> V2 (`2.0.0`)** — it fixes a small set of confirmed V2 defects and makes future
> production releases safer. It is **not** V2.1: no module was redesigned, no new
> product concept was introduced, and the V2.1 roadmap
> ([`ROADMAP_V2_1.md`](../roadmap/ROADMAP_V2_1.md)) is unchanged. There is **no
> new database migration** (the sequence is unchanged at `0025`).

---

## Fixed

- **Assets with history can now be permanently deleted.** An Asset that had any
  recorded history event or obligation could never be permanently deleted: the
  database (correctly) refused to orphan those rows, but the purge never removed
  them, so the delete always failed — and the error said "Please try again" for
  an operation that retrying could never fix. An authorised permanent delete now
  removes the Asset's own events and obligations in the same atomic operation.
  The database's protective constraints are unchanged, archived and soft-deleted
  behaviour is unchanged, and deletion is still refused while other records
  remain linked to the Asset.
- **An Area that still houses Assets can no longer be permanently deleted.**
  Assets record their home Area outside the link system, so the Area
  permanent-delete guard could not see them and would delete the Area from under
  its Assets. The guard now counts Assets too.
- **Upcoming Meetings now appear in global search.** Searching for a meeting by
  its title only ever found meetings that had already started — the meeting you
  planned for next week, the one you were most likely to search for, was
  invisible. Search now covers upcoming and recent meetings alike (archived
  ones stay out, as before), soonest-first for upcoming, then newest-first for
  past.
- **Opening a Diary entry from a Review now works.** The Diary entries listed in
  a Review's period context linked to a URL the Diary never understood, so the
  click landed on today's Diary with nothing open. The link now opens the
  correct entry's details panel on the entry's own day, and Back returns to the
  Review.
- **Custom repeat rules display truthfully.** A task repeating "every 3 weeks"
  (which quick capture accepts) used to show a raw internal token and a
  misleading "no longer available" note in the quick-edit panel — and a task
  repeating "every Monday" confidently displayed as plain "Every week".
  The panel now shows the actual rule in words, leaving it selected leaves it
  unchanged, and replacing or removing it still works. No valid rule was
  restricted.

## Added

- **Projects, Areas, Goals and Diary are in the command palette.** The four
  modules that registered no `⌘K` commands now contribute them: *Open Projects /
  Areas / Goals / Diary*, *New Project*, *New Area*, *Open Diary for today* and
  *Capture Diary entry* — same command system, same keyboard behaviour as every
  other module. There is deliberately **no "New Goal" command**: a Goal is
  created on the Area it belongs to, and a palette command promising otherwise
  would lead nowhere.
- **Automated production backups.** A scheduled GitHub Actions workflow exports
  the production database daily (with manual runs available), storing each
  export as a dated, commit-stamped artifact kept for 30 days. **This is a
  backup copy, not restore** — automated restore remains V2.1 SET-02, and
  recovery from a backup file is still a manual process.

## Release hardening (for the owner performing deployments)

- **The production deploy now refuses the wrong repository state.** Unless an
  explicit, individually-named override is given, it refuses a dirty working
  tree, a branch other than pushed `main`, a release commit without a green
  **CI Gate**, and unacknowledged pending database migrations. Checking for
  pending migrations, applying them, and deploying remain three separate,
  deliberate actions — deploying never applies a migration.
- **Every deploy now verifies itself.** After uploading, the deploy asserts the
  public `/health` endpoint answers directly (a Cloudflare Access login redirect
  is treated as a failure, not a pass) and reports the application name, the
  production environment and exactly the version being released.
- **Branch protection:** the exact owner steps for requiring the **CI Gate**
  check before merging to `main` are documented in
  [`SETUP_AND_CI.md`](../development/SETUP_AND_CI.md#enabling-it-owner-action--exact-steps),
  and verifying the rule is active is now a release-checklist item.
  **Repository settings cannot be changed from the codebase, so this remains an
  owner action until performed — it is not claimed as enabled.**

## Unchanged, stated to avoid doubt

- No migration. No new module, entity type or setting. No change to archive or
  soft-delete behaviour anywhere. Restore is still not implemented
  ([SET-02, V2.1](../roadmap/ROADMAP_V2_1.md#-set-02--backup--restore-v21)) —
  keep taking your own exports.

---

The evidence behind each fix, the deployment runbook and the verification
record are in [`RELEASE_CHECKLIST_V2_0_1.md`](RELEASE_CHECKLIST_V2_0_1.md).
