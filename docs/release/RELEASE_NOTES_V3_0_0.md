# DalyHub V3.0.0 — Release Notes

**Version `3.0.0` · Release name "V3" · Release candidate 2026-09-15 · HELD on a defect**

> ⛔ **Do not deploy this yet.** After the release was cut, a defect was found
> that the test gate could not see: in the **dark appearance the text cursor is
> invisible** in every writing surface — Notes, Diary, the Meeting workspace, the
> guided Review. It is the same cascade cause as the one below, one property
> across, and it is fixed by
> [#303](https://github.com/acedaly/DalyHub-V2/pull/303).
> [`RELEASE_CHECKLIST_V3_0_0.md` §1.3](RELEASE_CHECKLIST_V3_0_0.md) has the
> measurement. No tag was created, so nothing has to be undone.

> Written for the person using DalyHub.
>
> **This is the release candidate, and it is not deployed.** The repository, the
> version constant and the test evidence are ready — `main` is green — but the
> deployment needs Cloudflare credentials no automated session holds, and the
> exhaustive nightly test suite has still never been run. Both are owner actions,
> listed in [`RELEASE_CHECKLIST_V3_0_0.md`](RELEASE_CHECKLIST_V3_0_0.md) §7, and
> **one of them is a precondition rather than a formality** — see *"Your data,
> and the one thing that is not true of this release"* below.
>
> The first attempt at cutting this, on 2026-09-15, stopped at its own gate: CI
> found a genuine accessibility regression the cascade change had introduced. It
> was fixed by [#298](https://github.com/acedaly/DalyHub-V2/pull/298) before
> anything shipped, and it is in Known limitations below, because the gate
> working is worth recording.
>
> Everything below is what `3.0.0` will say once it goes out. The evidence, the
> failures and what is left to do are in
> [`RELEASE_CHECKLIST_V3_0_0.md`](RELEASE_CHECKLIST_V3_0_0.md), and **one item
> there is a precondition rather than a formality** — see *"Your data, and the
> one thing that is not true of this release"* below.

---

## Why the major number moves

Not because of a feature. Between `2.4.0` and here, **every module in DalyHub was
rebuilt on a real design system**, and then the rules deciding which stylesheet
wins were rewritten underneath all of it.

That is not an addition, and calling it `2.5.0` would say it was. Almost every
surface you touch is a different implementation from the one `2.4.0` shipped —
even in the many places where the behaviour is deliberately identical, because
keeping the behaviour identical was the point.

The frontend is the reason for the number. It is not the whole release: `2.4.0`
was cut on 2026-08-22, production was last deployed on 2026-08-30, and three
weeks of product work landed behind that. Both halves are below.

---

## The interface

### It is one system now, not eighteen

DalyHub was built module by module, and it looked like it. A button on Settings
and a button on Today were two different buttons that happened to agree. A card
on Projects and a card on Areas were two implementations of one idea. Eighteen
passes converged every module onto **Untitled UI React Pro** — buttons, fields,
selects, badges, tables, tabs, menus, dialogs, progress, avatars, empty states
and focus rings are now one control each, everywhere: Today, Tasks, Projects,
Areas, Goals, Habits, Notes, Diary, the Meeting workspace, People, Finance,
Assets, Life Admin, Insight, Reports, Reviews, Ask DalyHub and Settings.

You will mostly notice this by its absence. Controls are the same size in every
module. A field looks like a field wherever you find one. Focus rings are one
ring. Dark mode is one decision rather than eighteen. The icons are one set
rather than the four that had accumulated.

### Deleting the design system DalyHub built before it had one

`DashboardCard`, `MetricTile`, `StatCard`, `MetricRow`, `ExpressiveSummary`,
`SupportingSurface`, `CardMetaFact`, `SummaryCards`, the shared `Timeline`, the
Material switch and the bespoke settings-control skins are all gone. Each was a
generic thing DalyHub had to build because nothing else provided one. Something
else provides one now.

### The cascade has an owner

This is the invisible half, and it is the reason for the major number.

DalyHub's stylesheets were **unlayered** — a technical decision that, for good
reasons, gave every old rule unconditional priority over the new design system.
Measured on the release before this one: 600,640 of the production stylesheet's
814,944 bytes, and 2,932 of its 4,602 rules. In practice that meant a rule
written years ago could silently repaint a correctly-rebuilt control, and the
only way to discover it was to measure the rendered pixel.

Every rule now belongs to an explicit cascade layer, and the layer order says who
owns what: Untitled draws the controls, DalyHub places them. What that fixed on
screen is small and specific — a few links that were taking a blanket accent
colour instead of the one their component asked for, a few headings whose own
`margin: 0` was being overruled — and what it prevents is the whole class of
defect. The architecture is written down in
[`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md).

### Branded Plum

The shell wears a deep plum identity, and the page canvas and overlays stay
neutral in both appearances so the colour is an accent rather than a wash. Five
colour schemes ship, each with a light and a dark appearance, and Appearance and
Colour scheme are independent choices — changing either applies straight away.

---

## The product, since `2.4.0`

Full detail is in [`CHANGELOG.md`](../../CHANGELOG.md) under `3.0.0`. In short:

- **Finance.** Accounts — everyday, savings, credit card, loan, cash — and CSV
  import from your bank that remembers your column mapping. Importing the same
  file twice adds nothing; the database itself refuses it. Transfers are
  excluded from spending, and "where is my money going" has an answer.
- **Life Admin, and Obligations as their own thing.** Renewals, registrations,
  bills, subscriptions, inspections and services, ordered overdue-first, with
  real counts. An obligation no longer has to be about an Asset — a tax return
  is about nothing. The Asset's Obligations tab shows the same records.
- **Attachments.** The paper lives with the thing it is about.
- **Ask DalyHub.** Suggestions you look at before anything happens, answers
  grounded in your own records with the facts shown, and saved definitions you
  can ask again.
- **Insight, Reports and Reviews.** Analytics asks about the period you choose
  rather than one of three; what the history says is derived and proved rather
  than asserted; and Reviews compare themselves to each other.
- **Capture is one act everywhere.** One row on Tasks, on a project and on a
  board column: click, type, Enter. `p1`, `today`, `every Monday` and `#tag`
  still work, and a board column captures into itself.
- **The board is a board.** Columns keep their line and the board scrolls
  sideways inside itself rather than wrapping onto a second row.
- **Tags are one thing now, everywhere**, and you can type them. Search answers
  before you type, and finds what you wrote rather than only what you called it.
- **Accessibility and mobile hardening.** Today reflows at 200% zoom; Projects
  on a phone is not a sideways spreadsheet; every path to a record leads to the
  record and says what it is.
- **Offline and PWA.** The offline shell and the queued-capture path carry
  through unchanged, and the version they report comes from the same single
  authority as everything else.

---

## Your data, and the one thing that is not true of this release

- **Your records are all still there afterwards, and none of them changes
  meaning.** Your obligations do move house — see below — but every one of them
  arrives, keeping its own identity, and everything attached to it comes with it.
- **Your colours are unchanged.** All five schemes, both appearances, every
  semantic colour — and asserted unchanged by the token contrast tests in both
  appearances.
- **Existing behaviour is preserved.** Keeping it identical through the rebuild
  was the constraint the whole programme worked under. If something behaves
  differently, that is a defect and not a feature of this release.

**But this release is NOT schema-free, and an earlier draft of these notes said
it was.** That claim was true of the frontend work and false of the release: the
last recorded production deployment, on 2026-08-30, reported no unapplied
migrations against a tree whose head migration was `0047`, and six migrations
committed since then — `0050_create_obligations`,
`0051_obligation_notifications`, `0052_create_attachments`,
`0053_create_finance`, `0054_ai_grounded_features` and
`0055_ai_assisted_features` — are the tables Finance, Life Admin, Attachments and
Ask DalyHub are built on. They ship with this release and **must be applied
before the Worker is deployed**, behind a verified backup, in the order
[`RELEASE_CHECKLIST_V2_4_0.md` §6](RELEASE_CHECKLIST_V2_4_0.md) sets out.

Migrations `0048` and `0049` may or may not already be applied; the production
ledger is what decides, and `pnpm run db:production:list` is what reads it.
Nothing here assumes an answer.

**And it is not a tidy, additive upgrade.** `0050` is the one that matters:
Obligations stop being a thing that belongs to an Asset and become records in
their own right, so every obligation is physically moved into the main record
table and the old `asset_obligations` table is dropped once they are all across.
The move is designed to be safe — each obligation keeps its own id, so every
task, series, event and Asset that pointed at it still does — and it is rehearsed
end to end before it ships. What it is not is reversible by putting the old
version of DalyHub back: after this runs, the old version cannot read your
obligations. `0051`, `0054` and `0055` likewise rebuild notification and AI
bookkeeping tables in place.

That is why the upgrade is one sitting rather than two, and why the backup in
front of it has to be one that has actually been restored from, not just taken.
Both are spelled out in
[`RELEASE_CHECKLIST_V3_0_0.md` §1.2 and §7](RELEASE_CHECKLIST_V3_0_0.md).

---

## Known limitations

Stated rather than omitted.

- **The cascade change broke the editor's geometry on four surfaces, and one of
  them was an accessibility failure.** The guided Review's writing surface began
  scrolling inside a scrolling page instead of growing, which is a WCAG 2.2 AA
  failure and was caught by the test suite; the Note and Meeting writing
  surfaces quietly went back to a narrower column and a taller minimum. Found
  while cutting this release, by the test suite rather than by a person using
  it, and fixed in [#298](https://github.com/acedaly/DalyHub-V2/pull/298) before
  it shipped — listed here because a release note that only says what went right
  is not a record.
- **The exhaustive nightly E2E suite has not run against this commit.** The
  accessibility and responsive matrices moved to a nightly workflow in this same
  release, and it has never been dispatched — the session that prepared this
  release could not trigger it (GitHub returned `403` to `workflow_dispatch`).
  The PR gate that DID run keeps a representative accessibility scan in both
  appearances, every open-overlay scan, and the responsive boundary widths over
  the daily-driver surfaces, so this is a thinner net than intended for a first
  release under the split rather than no net at all. It is a named owner action
  in the checklist.
- **Two colour engines still ship side by side.** The generated MD3/DalyHub
  semantic tokens and the Untitled colour foundations both exist, and the layer
  order is arranged so DalyHub's values keep winning where the two collide. That
  is deliberate: deciding between them is its own piece of work and did not
  belong in a cascade change. It costs bundle size and a second vocabulary; it
  costs no correctness.
- **`md-state-layer` remains**, at 34 usages across 23 files. It is a working,
  tested, single-implementation hover/focus/pressed model with two dozen live
  consumers, and retiring it means migrating each of those to Untitled's own
  hover treatment. It can no longer defeat the cascade architecture, which was
  the part that mattered.
- **Eight legacy control stylesheets survive**, 1,966 lines, listed in
  [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md).
  All eight now LOSE to Untitled, and all eight were measured to change nothing
  on screen when they started losing — so they are dead weight awaiting deletion
  rather than live paint.
- **`forms.css` keeps its old position**, because demoting it retired its field
  geometry along with its field paint. Splitting it is named maintenance debt.
- **The Finance collection heading sits a gutter short** of every other page's
  title at desktop widths. Pre-existing, unrelated to this release's changes
  (measured: no computed-style change on that surface), and not fixed here.

---

## Related documents

- [`RELEASE_CHECKLIST_V3_0_0.md`](RELEASE_CHECKLIST_V3_0_0.md) — the evidence and
  the deployment sequence.
- [`CSS_CASCADE_ARCHITECTURE.md`](../architecture/CSS_CASCADE_ARCHITECTURE.md) —
  the layer model and its measurements.
- [`UNTITLED_UI_MIGRATION.md`](../design/UNTITLED_UI_MIGRATION.md) — what the
  migration covered and what maintenance debt it named.
- [`RELEASE_NOTES_V2_4_0.md`](RELEASE_NOTES_V2_4_0.md) — the previous release.
