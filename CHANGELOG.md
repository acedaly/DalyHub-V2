# Changelog

All notable owner-facing changes to DalyHub.

This file is written for the person using DalyHub, not for the person building it
— it says what changed on screen and why. The engineering record lives in
[`ROADMAP_V2.md`](docs/roadmap/ROADMAP_V2.md) (what was built),
[`PRODUCT_DEBT.md`](docs/product/PRODUCT_DEBT.md) (what is still inconsistent) and
[`ARCHITECTURE_DECISIONS.md`](docs/decisions/ARCHITECTURE_DECISIONS.md) (why the
system is shaped the way it is).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
DalyHub is not versioned by release number — see
[About](docs/development/HELP_AND_ABOUT.md) for what a given deployment is
running — so entries are grouped by date and by the roadmap item that delivered
them.

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
