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

## Unreleased

### Added

- **Two new themes: Modern Light and Modern Dark.** Settings → Appearance now
  offers a matched pair — the same DalyHub, one bright and one dimmed — so you can
  move between them by time of day without anything shifting position. Modern
  Light is a warm off-white page with clean white cards and a teal accent; Modern
  Dark is layered charcoal with a controlled indigo. They use the same spacing,
  type and shapes as each other, so switching changes how DalyHub looks and
  nothing about how it works.
- Both are ordinary choices, saved to your account like any other theme, so they
  follow you to any browser you sign in from. **Match system** is unchanged and
  still pairs Daly Light with Daly Dark. **No existing theme was removed** — Daly
  Light, Daly Dark, Eucalypt, Coastal and Ember are all still there, and if you
  are already on one of them, nothing changes for you.

### Changed

- **The navigation rail sits inside the application rather than beside it.** The
  hard edge between the sidebar and the page is now a quieter divider, and the
  module you are currently on is marked with a small leading bar as well as its
  tint and heavier text — so "where am I" no longer depends on noticing a colour.
  The same treatment applies to the section list in Settings, and to every theme,
  not just the new ones.

### Added — installation and offline support

DalyHub can now be installed as an app and keeps working when your connection
does not. Full detail:
[`PWA_AND_OFFLINE.md`](docs/development/PWA_AND_OFFLINE.md).

**This has not been tested on a physical iPhone, iPad or installed desktop app
yet.** The steps to do that are written down, and until they have been worked
through, treat the offline behaviour below as built and automatically tested but
not device-verified.

- **Install DalyHub as an app.** It gets its own icon, opens in its own window
  without browser chrome, and starts without a tab. On iPhone and iPad this is
  Safari's Share → Add to Home Screen; Settings → Offline & app gives the exact
  steps rather than pretending a button can do it. On Chrome and Edge, Settings
  offers an **Install** button.
- **A real DalyHub app icon**, at every size a browser or device asks for — the
  tab favicon, the iPhone home screen and the Android adaptive icon. It keeps the
  hub mark you already see in the sidebar, redrawn so it stays legible at 16
  pixels.
- **DalyHub opens without a connection**, once you have opened it online while
  signed in at least once on that device. Instead of the browser's error page you
  get DalyHub's offline surface.
- **A seven-day offline snapshot.** Tasks due, scheduled or overdue around today
  — including the ones you are **waiting on someone else for**; anything you
  completed in the last week; notes and diary entries from the last week, as
  excerpts; and meetings in the surrounding fortnight — with the project, area and
  person names those records need. You can search, filter and sort all of it with
  no connection.
- **Capture without a connection.** A new Inbox task, a quick note or a diary
  entry can be captured offline. It waits on your device and reaches DalyHub when
  a connection returns — **exactly once**, even if the connection drops
  mid-attempt.
- **A calm connection status.** Nothing is shown while everything is working.
  When something is wrong it says which: no connection, sign-in expired, DalyHub
  unavailable, or work waiting to sync — always in words, never colour alone.
- **Settings → Offline & app.** Whether DalyHub is installed, what is stored on
  this device, when it last synchronised, roughly how much space it uses, how many
  captures are waiting, and which sign-in the data belongs to. Plus three separate
  controls — clear the cached copy, discard queued captures, or reset everything —
  each explaining exactly what it removes.
- **An honest note about what this data is.** DalyHub does **not** encrypt what it
  stores on your device; it relies on your device and browser's own protection.
  And having offline data is not the same as being signed in — anything that
  touches the server still needs a valid DalyHub sign-in.

### Changed — offline behaviour

- Your sign-in still expires the way it always did. When it does, anything you
  captured offline stays safe on the device and syncs after you sign in again —
  DalyHub stops retrying rather than repeatedly bouncing you to the sign-in page.
- **Closing a tab mid-sync no longer strands a capture.** A capture that was
  being sent when DalyHub was closed used to sit on the device showing
  "Synchronising…" with nothing able to move it. It now returns to the queue by
  itself and syncs on the next connection.
- **A capture whose result DalyHub genuinely cannot determine now says so.** In
  the rare case where the server stopped mid-creation, DalyHub asks you to check
  whether the capture arrived instead of quietly creating a second copy.
- **A record from earlier in the day is no longer dropped from the offline copy.**
  Retention now measures dates in your own timezone rather than UTC, so a note or
  diary entry from the first morning of the window stays where you expect it.

### Known limitations — offline

- You cannot **edit, complete or delete** existing records offline. That needs a
  design for what happens when two versions disagree, which has deliberately not
  been rushed.
- Notes and diary entries are stored as excerpts, not in full.
- Signing out does not automatically clear this device's offline data — use
  Settings → Reset offline data.
- A waiting task with no due or scheduled date is not stored offline: the same
  seven-day rule applies to it as to every other task, and an undated task has no
  date to place inside that window.

---

## 2.0.1 — Hotfix & release hardening (2026-08-02)

A small, deliberate hotfix on top of V2. Five confirmed defects fixed, four
modules given the command-palette actions they were missing, and the machinery
around production deployments made harder to get wrong. **This is not V2.1** —
no module was redesigned and nothing moved out of the
[V2.1 roadmap](docs/roadmap/ROADMAP_V2_1.md). Full notes:
[V2.0.1 release notes](docs/release/RELEASE_NOTES_V2_0_1.md).

### Fixed

- **You can now permanently delete an Asset that has history.** Any Asset with a
  recorded event or an obligation simply could not be deleted — the attempt
  failed and the message said "Please try again", for something retrying could
  never fix. The Asset's own history and obligations are now removed with it, in
  one all-or-nothing operation. Deletion is still refused while other records
  are linked to the Asset, and archiving is unchanged.
- **An Area that still holds Assets can no longer be deleted out from under
  them.** The check that stops you deleting an Area that still has records could
  not see Assets. Now it can.
- **Meetings you have not had yet now appear in search.** Searching a meeting by
  name only found meetings that had already started — so next Tuesday's meeting,
  the one you were most likely looking for, returned nothing.
- **Diary entries open properly from a Review.** Clicking a diary entry in a
  Review's period context used to land you on today's Diary with nothing open.
  It now opens that entry, on its own day, and Back returns to the Review.
- **Unusual repeat rules are described honestly.** A task repeating "every 3
  weeks" showed an internal code and a wrong "no longer available" note, and one
  repeating "every Monday" claimed to repeat "every week". Both now read as what
  they are, and leaving the rule alone leaves it alone.

### Added

- **Projects, Areas, Goals and Diary in the command palette** (`⌘K`): open each
  module, create a new Project or Area, open the Diary for today, and capture a
  diary entry. (No "New Goal" command — a Goal is created on the Area it belongs
  to, and offering one from the palette would lead nowhere.)
- **Automatic daily backups of your production data**, kept for 30 days and
  downloadable. **This is a copy, not a restore** — reading a backup back in is
  still not something DalyHub can do (that is V2.1), so keep taking your own
  exports too.

### Changed

- Deployments now refuse to run from an unclean or unpushed checkout, or over a
  failing or unfinished CI check, and verify afterwards that the site really is
  running the version that was just released. Applying database migrations stays
  a separate, deliberate step — deploying never does it for you.

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
