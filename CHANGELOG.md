# Changelog

All notable owner-facing changes to DalyHub.

This file is written for the person using DalyHub, not for the person building it
— it says what changed on screen and why. The engineering record lives in
[`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) (what was built),
[`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md) (what is still inconsistent) and
[`ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) (why the
system is shaped the way it is).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
From **2.0.0** DalyHub carries a release version, shown in **About** and reported
by `/health` from one authority (`app/lib/version.ts`). Entries before that release
are grouped by date and by the roadmap item that delivered them, because there was
no version number to group them under.

---

## 2.0.0 — DalyHub V2 (2026-08-01)

The V2 release. The full owner-facing description of what DalyHub V2 is and what it
does is in **[Release notes](docs/release/RELEASE_NOTES_V2.md)**; the evidence behind
every claim is in **[the release checklist](docs/release/RELEASE_CHECKLIST_V2.md)**.
This entry records only what changed _in the release itself_, on top of everything
already listed below.

### Changed

- **DalyHub now tells you which version it is.** About and `/health` report
  **2.0.0**, release name **V2**, from a single source. Previously the release name
  read "V2 Final Polish", which was the name of a milestone rather than of the
  product you are running.

### Fixed

- **Two problems in the automated test suite** that were making the project's own
  checks fail on the main branch. Neither was a fault in DalyHub itself: one test was
  still looking for a "coming soon" panel on Today that was deliberately removed, and
  the test run had outgrown its time budget. Nothing about the application changed.

### Deferred

- **Backup and restore is formally deferred to V2.1.** V2 gives you a real,
  verifiable **export** — that is the V2 data-safety feature, and it is complete. What
  V2 does not have is the other direction: DalyHub cannot read an export back in.
  Restore has never been exercised end to end, so it is not offered anywhere and not
  claimed anywhere. **Keep your own copy of an export until V2.1 ships restore.**

### Known limitations

Listed in full in the [release notes](docs/release/RELEASE_NOTES_V2.md#known-limitations)
rather than repeated here.

---

## 2026-08-01 — Take your data with you (`X-04`)

You can now get **everything** out of DalyHub. Until today you could not, and that
was the biggest thing wrong with trusting it: DalyHub had become good enough to be
the single copy of an increasing amount of a life, with no way to hold that copy
yourself.

`Settings → Privacy & data` now has two downloads.

### Added

- **Download full DalyHub export.** A single ZIP containing your entire workspace
  in one structured file, plus a plain description of what is in it, the format's
  own documentation, and checksums you can verify without DalyHub
  (`sha256sum -c CHECKSUMS.txt`). This is the complete, machine-readable copy —
  every area, goal, project, task, note, diary entry, meeting, person, asset and
  review, every link between them, and the whole activity history.
- **Download Obsidian vault.** The same workspace as a folder of ordinary
  Markdown files — one per record, with the details at the top and working links
  between them. Extract it and open the folder in Obsidian, or just read it in any
  text editor. No plugin, no import step, nothing DalyHub-specific.

Both are built from one snapshot taken the moment you press the button, so they
always describe the same thing.

### What is in an export, and what is not

- **Your writing is exactly your writing.** Notes, task descriptions, diary
  entries, meeting notes and review responses come out as the Markdown you typed
  — not a re-rendered version of it.
- **Nothing is quietly left out.** Records you archived or deleted are included
  and clearly marked as archived or deleted, because a copy that has been tidied
  is not a copy. Relationships you removed are recorded as removed.
- **Nothing is invented.** No summaries, no "insights", no scores. Where DalyHub
  stores a fact, the export prints it; where it does not, the export is silent.
- **Links keep working.** Internal links between your records become ordinary
  links between files. If one cannot be resolved — usually because its target was
  deleted — your own words are kept, the link is marked in place, and every such
  case is listed in one file so nothing goes missing quietly.
- **No credentials, ever.** Sign-in tokens, cookies, session data and DalyHub's
  own configuration are never in an export.

### Please read this before you export

An export contains **everything private in your workspace** — people's contact
details, diary entries, meeting notes, reflections. DalyHub says so above the
buttons, generates the file only when you ask, never stores it and never sends it
anywhere. Once it is on your device, looking after it is yours.

### Honest limits

- **An export is not a restore.** DalyHub cannot read one of these files back in
  yet. Keep a copy somewhere you control and treat it as a readable archive, not
  an undo button. Restore is the next thing being built.
- **It is a copy, not a frozen instant.** If you export while actively editing,
  one part of the file can be a couple of seconds newer than another. The export
  says so in its own documentation rather than pretending otherwise.
- **Renaming a record changes its filename** in the vault. Each file carries the
  record's permanent id at the top, so identity survives even when the name does
  not.

---

## 2026-08-01 — Daily-driver polish (`UX-01`)

A full-product UX, UI and product audit — every module, on desktop and on a
phone — and the fixes it found. Nothing was redesigned. Every change is a
deletion, a correction, or the adoption of a pattern DalyHub already had. The
complete audit, including what was deliberately left alone, is in
[`UX_01_DAILY_DRIVER_AUDIT_2026_08.md`](docs/product/UX_01_DAILY_DRIVER_AUDIT_2026_08.md).

### Added

- **Today now shows the meetings on your day.** Meetings had been in DalyHub for
  weeks with no presence on the landing page, so Today could tell you what to do,
  what had slipped and what was waiting — but not that you are in a meeting at
  two. The new section lists the day's meetings in order, says in words when one
  has already started, and on a clear day tells you so rather than disappearing.
- **`?` shows the keyboard reference on every screen.** It previously only worked
  on Today, even though the reference's own first line said it worked "anywhere".
  Help now documents the shortcuts worth learning.

### Changed

- **The sidebar keeps your place.** Opening any record — a project, a note, a
  meeting, an asset — used to leave the whole sidebar with nothing highlighted, so
  you lost the "you are here" anchor exactly where you spend the most time. The
  module you are in now stays marked, matching how the phone bar already behaved.
- **Meetings and Reviews load more without losing your place.** Both used to jump
  to a fresh page, discarding the list and your scroll position; Meetings even
  called that button "Load more", which is not what it did. Both now add the next
  page to the list you are already reading, exactly like every other collection.
- **Creating a meeting or a review is easier on a phone.** Both screens now name
  themselves in the top bar and offer a way back.
- **Small copy consistency** in Reviews and Settings, so the whole product uses
  one style of "…".

### Removed

- **The "Focus" panel on Today.** It listed three features that do not exist under
  the words "coming soon", and had never once shown information — while taking a
  section of your most-used screen every day. This is the same call made earlier
  for the Weather and calendar placeholders: an honest absence beats a promise the
  product keeps failing to keep. If focus sessions are ever built, the panel
  returns with something in it.
- **Leftover demonstration content on Today.** Old sample data was still being
  sent with every visit to Today, and a stale link could still have shown you
  sentences like "the full Project overview arrives later" about features that
  shipped long ago.

### Fixed

- **Two pages announced themselves twice to screen readers.** The new-meeting and
  new-review pages each declared a second "main" region inside the app's own, which
  makes navigating by landmark ambiguous.
- **The keyboard reference can now be scrolled with the keyboard.** It is the
  first read-only panel of its kind in DalyHub, and it exposed a gap in the shared
  panel component that every other panel had been hiding.
- **A rare pagination bug that could hide records.** Switching a filter while a
  "Load more" was still in flight could quietly skip a page of results. The fix is
  in one shared place, so it is fixed for every collection at once.
