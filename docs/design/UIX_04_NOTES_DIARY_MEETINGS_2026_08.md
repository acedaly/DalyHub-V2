# UIX-04 — the Notes, Diary & Meetings redesign, August 2026

> A deliberate **product redesign** of DalyHub's three writing modules — the Notes
> collection and its editor, the Diary's chronology and its entries, the Meetings
> collection and its record — plus the shared writing surface all three sit on,
> across desktop and phone in both appearances. Not a polish pass: routes, domain
> rules, persistence and semantics are unchanged, but the composition of every
> surface named here is substantially different from what it replaced.

Evidence: `docs/design/assets/uix-04-2026-08/`, captured by
`e2e/uix-04-screenshots.spec.ts` against the deterministic `writing` fixture
(`node e2e/today-fixtures.mjs writing`). The same spec writes both halves of every
comparison (`SHOT_PREFIX=before-` and no prefix) against the same seeded
workspace, so nothing between a `before-` and its pair differs except the product.

The `writing` fixture is new and deliberate. Every other scenario seeds the
Area → Goal → Project → Task spine, because every other scenario judges the
spine; a writing surface can only be judged against writing. It seeds a 900-word
structured Note (headings, nested lists, a table, a blockquote, a fenced code
block, links, a task list), six shorter notes down to a four-word capture, eight
Diary entries spread across a fortnight with two on the same day, and a held
Meeting carrying an agenda body, agenda items, a written record, two decisions,
two outcomes and three actions — two of which became real Tasks through the real
`meeting_item_tasks` mapping.

---

## 1. The problem this pass set out to fix

The three modules shared an editor and nothing else. Each had decided
independently how wide the text was, how much chrome sat above it, and what a row
in its collection looked like — so they were recognisably the same component and
recognisably not the same product.

Six concrete defects, each visible in the `before-` captures:

1. **The writing measure was wrong in both directions at once.** `--app-width-editor`
   was 90ch, which came out around ninety-five characters a line — past every
   typographic recommendation for continuous text — while still leaving 235px of
   the canvas permanently empty beside it. Too wide to read, too narrow to fill
   the page.
2. **The document heading ladder collapsed.** `.markdown-content` mapped `h1` to
   `title-large` (22px), `h2` to `title-medium` (16px) and `h3`–`h6` to
   `body-large` (16px). Two of those are the size of the paragraph beneath them,
   so a note with `##` sections and `###` sub-sections rendered as an
   undifferentiated wall — the outline the author wrote was invisible to the
   reader. The live editor's own ladder had the same collapse at `h3`.
3. **The Notes collection was a gallery of tiles.** Three columns of equal-weight
   cards gave a four-word capture the same footprint as a nine-hundred-word
   document, wrapped titles to two and three lines inside bounded boxes, and put
   "Links: 1" on the rows that had one. Opening a note left the collection
   entirely; there was no list beside the document and no notion of a selected
   note.
4. **The Diary's loudest element was a ten-chip type filter.** Ten outlined,
   filled pills spanning the full width, above a day with two entries in it — so
   the most prominent thing on a personal, reflective surface was administrative
   metadata. The date navigator underneath it was a prev/label/next trio that
   answered "what day is selected?" and never "where am I in the week?".
5. **The Meeting record opened on a metadata form.** Its default tab held a
   duration, a timezone, a held date, an "Edit details" disclosure, an attendee
   editor with a full-width People search, and two relationship lists. The agenda,
   the notes, the decisions and the actions — the entire reason a meeting record
   exists — were one tab away, behind a tab labelled "Meeting". The header stated
   When and Where as labelled fields and never said who was there.
6. **The Meetings collection's filter row had no styles at all.**
   `.dh-meetings-filters` was referenced by the component and defined nowhere, so
   two `.dh-field` column labels stacked their controls into a tall left-hugging
   block: an unlabelled empty search box above a sort select, above three rows
   that read `When: … Where: …`.

---

## 2. The shared writing system

### 2.1 The document column

`--app-width-editor` is **72ch**. Comfortably inside the 60–75ch band for
continuous prose, and still wide enough that a four-column Markdown table or a
fenced code line does not wrap into a stack.

The cap and the centring moved **up** from `.cm-content` onto the editor's own
children (`markdown-editor.css`), so the toolbar, the writing surface, the read
view and the message slot all share one column and the bar's first icon sits above
the first character. `.cm-content` keeps no cap of its own — which is what makes
the EDIT-02 "caret in the middle of an empty note" defect unable to recur, since
there is no max-content box left for `.cm-scroller`'s flex layout to centre.

Where the slack is worth spending, the module spends it rather than leaving it
blank: Notes puts its list rail there, and Meetings gives the notebook the column
while its dense tabs keep the full width. **There is no single global max-width.**

| Content | Measure |
| --- | --- |
| Writing and rendered prose (Notes, Diary, Meeting notebook) | `--app-width-editor` (72ch) |
| Collection rows (Notes list, Meetings list) | `--app-width-content` (72rem) |
| The Notes rail | `--app-notes-rail-width` (19rem) |
| Metadata, context lines, toolbars | the column they belong to |

### 2.2 Typography

Four document heading sizes, in `tokens.css` as `--app-writing-h1…h4`
(28 / 22 / 18 / 16), consumed by **both** `.markdown-content` and the live
editor's CodeMirror decorations — so pressing **Read** does not resize a single
heading. They step through the 1.125rem the chrome typescale skips, because the
M3 scale is built for chrome (`title-medium` is 16px, identical to `body-large`)
and a document needs four levels that all differ from the body and from each
other. The bottom rung earns its distinction from weight and colour.

Space above a heading is larger than space below it, so a heading belongs to the
text that follows it. Paragraph rhythm is `--app-writing-paragraph-gap`, expressed
in `em` so it tracks OS text scaling, and shared by the editor and the read view.

Also rebuilt: list rhythm (items spaced like paragraphs, nested lists tightened at
the seam, GFM task lists with the checkbox in the line rather than indented past
it), inline code on the sunken surface, fenced blocks that scroll **inside
themselves** so a long line never widens the page, and links that carry a token
underline offset clear of the descenders — never the browser blue, never colour
alone.

### 2.3 The toolbar

Unchanged in architecture: the same data-driven catalogue, the same WAI-ARIA
toolbar with one roving tab stop, the same tooltips, shortcuts, `aria-pressed`
active state, disabled state and 44px targets.

What changed is **how many controls are permanent**. Thirteen 44px controls do not
fit a 72ch column, and the row's own horizontal scroll was hiding the overflow —
which is worse than clutter, because a control that has scrolled out of a strip
nobody knows scrolls is simply gone. **Strikethrough** and **Checklist** moved
behind *More*, keeping their shortcuts, tooltips and active state. Seven remain
permanently visible: bold, italic, heading, bulleted list, numbered list, link,
remove formatting — plus undo/redo, the record-link command and *More*.

The strip is now **sticky** to the top of the writing surface, so formatting a
paragraph three screens down no longer means scrolling back for a button. It
carries the page colour only while stuck.

### 2.4 Read and Write are one column

EDIT-02 gave reading 65ch and writing 90ch, on the reasoning that Markdown source
is not prose. That reasoning went with the 90ch measure: the live editor styles
the document as it is typed, so Write mode already shows the rendered document,
and reflowing every line on the way to Read was a jump with nothing behind it.
Both modes now take the writing column and the text does not move at all when the
toggle is pressed (`editor-geometry.spec.ts` pins both edges).

The read view also lost its card: it used to paint onto `surface-card` with a
large radius, putting a filled rounded rectangle around a document on a page with
no other box on it.

---

## 3. Notes

**Composition:** a list rail beside the open document, at ≥1024px.

`/notes/:id` loads one bounded page (40) of the same READ projection the
collection uses, ordered by the effective updated moment, and renders it as a
sticky, independently-scrolling rail. Rows are ordinary links, so Back, middle-click
and prefetch all work with no client state; the open note carries
`aria-current="page"` and a filled container, so the selected state is obvious to
the eye **and** to a screen reader. A rail failure degrades to no rail rather than
costing the user their note, and the rail is not rendered at all when there is
nothing to list. Below 1024px it is not rendered — a phone gets list screen → note
screen, per §13, not a squeezed split-pane.

**The collection is a list of documents.** One row per note: the title dominating
on its own line, then a one-line preview on the left and the date as a right-hand
column the eye can run down, with tags between them where there are any. Gone: the
entity glyph, the "Note" type label and the link count — all identical or
uninteresting on every row of a page called Notes. The archived state stays, in
words. Rows are separated by a hairline rather than boxed as cards.

**The document.** The record header is capped to the same column as the text, so
the breadcrumb, title, context line, tab strip and prose are one column — the
difference between a document and a form with a document in it. The title takes
`--app-writing-title-size` (32px, 26px on a phone) and balances its wrap. The
entity glyph is gone from the header: RECORD-01 had already dropped the type line
because the breadcrumb says "Notes", and on a title long enough to wrap the glyph
took a whole line of its own directly above it.

**Filters.** Same architecture — one ordinary GET form of native controls, so every
filtered view is a shareable URL that works with no JavaScript. Labels moved beside
their controls rather than above them, the search field's label became
`dh-visually-hidden` (present, announced, repeated verbatim by the placeholder),
and the field stopped growing past the shared 18rem control cap. The band went from
~90px to ~65px and packs left instead of scattering three controls across a
thousand pixels.

**Phone.** The first word moved from 437px down an 844px screen to 328px: the
breadcrumb is dropped (the phone top bar already carries "Notes" and Back), the
glyph line is gone at source, and the overflow trigger sits beside the title
instead of claiming a full-width band of its own.

---

## 4. Diary

**The date is the organising concept, so the date is the control.** The Day-mode
navigator is a **week strip** — Mon 8, Tue 9, Wed 10 — with the selected day
carrying the DalyHub primary accent as a filled container, today marked by a dot
*and* by "(today)" in its accessible name, and every day a real link named with its
full date. Seven days is one glance and one click; the previous navigator needed
two clicks and a page of reading to move one day, and four to reach Saturday.

Everything URL-backed survives: `?date=` is still the state, "today" is still the
absence of the param, a date change still drops the scope-bound cursor (and now
also drops `?inspector=`, so opening a day cannot reopen the previous day's entry
over it). The native picker survives as the way to travel further than a week —
stretched invisibly over a 44px well that draws a calendar glyph, because a native
date input cannot be shrunk to a glyph without the browser clipping its own
segmented field. A calendar widget would be the "huge calendar widget" §18 rules
out.

**The type filter got out of the way.** Same chips, same URL contract, no border,
no fill and no glyph until one is chosen — a quiet row of words beside a strip
that is now the primary control.

**Entries read like a journal.** The day is a group with a raised surface and no
border or hard corner (a stack of outlined cards was the administrative look §16
rules out); days are separated by space and a date heading. The preview is two
lines rather than one clipped clause. The per-row type badge is plain text instead
of a chip, and the *neutral default* type is announced but not drawn — "NOTE" on
every row of a diary of notes is a word that never varies.

**Phone.** One row: week arrows, seven days, picker, Today. The month caption is
the thing that goes (the day numbers and the picker both answer "which month?").
The days scroll inside their own track rather than pushing the next-week arrow off
the screen — a flex item will not shrink below its content unless told it may,
which is exactly what left those controls unreachable at 390px.

---

## 5. Meetings

**The notebook opens first.** Tab order is now `Notebook → Follow-up → Details →
AI → Activity → Settings`, and Notebook is the default (its slug stays `meeting`,
so every existing link resolves; `?tab=overview` and the four MEET-01 section slugs
redirect rather than break).

**The notebook runs in the order a meeting happens:** Agenda → Notes → Decisions →
Outcomes → Actions. Every section is a real column of the schema — the two Markdown
bodies on `meeting_details`, and the four `meeting_items.kind` values migration
0021 defines. Nothing is invented. Sections are separated by a heading and space,
never by a card each, and their editors size from a much lower floor: five 40dvh
minimums put the Actions list three screens below the title on a meeting with a
three-line agenda.

**Items are lines, not cards.** A decision, an outcome and an action lost their
outlined containers and their kind chips (every row in a list headed "Decisions" is
a decision). Their actions are revealed on hover *and* on `:focus-within`, and stay
permanently visible on coarse pointers — reveal-on-hover must never mean
unreachable.

**Context is one line under the title:** when, where, and with whom. Attendees are
small initial marks with their names, read-only, collapsing to "+N more" beyond
four — recognisable but secondary, per §28. Adding and removing attendees stays in
the Details tab where the rest of the metadata now lives. The header's `When:` /
`Where:` field pairs are gone; the raw `in_person` mode value now has a human label
(`meetingModeLabel`) shared by the header and the details form.

**The collection is a schedule.** Rows are grouped by calendar day with relative
headings ("Today", "Tomorrow", "Yesterday", or the full date), derived server-side
against the owner's stored timezone — a relative heading computed in the browser
would say "Yesterday" about a 9am Sydney meeting opened from London. A fixed
leading time column, the title dominating, the place beneath it, and the status
shown **only** when it is not what the view already implies. The filter row got the
styles it never had.

**One frame for the days, the meeting's own for the times.** Both sides of that
relative comparison are resolved in the **owner's** zone: the day boundaries the
rows are grouped on, and the `todayKey` they are compared against. Reading them in
different zones is not a rounding error — a meeting still dated the 10th in New
York, for an owner whose day is the 11th in Sydney, came out as "Yesterday" in a
list of *upcoming* meetings. A schedule is the owner's schedule. The **time** on the
row is still the meeting's own (MEET-01, and the only time an attendee would
recognise), so when the two zones differ the row names the zone the time belongs
to — from the IANA identifier's last segment, not from `Intl`, because this renders
on the server and hydrates in the browser and the two must agree byte for byte.

**An archived notebook is a document, not a form.** The repository refuses every
write to an archived meeting, and §26 made the Notebook the tab an archived meeting
*opens* on — which would have put two live autosaving editors at the top of a record
that cannot be saved. Archived Agenda and Notes bodies render through the one FND-08
sink instead, wearing the editor's own Read-view classes and publishing the same
named `group`, so the body reads identically whether the meeting is live-and-toggled
or archived.

Attendees are deliberately **not** on collection rows: the only way to resolve them
for a page of meetings today is one `listForEntity` call per row, and adding a
batched link read to the kernel to answer "with whom" a second time is not what
this redesign is for.

---

## 6. Dark appearance

No new dark rules were written for any of the three modules. Every surface added
here is painted from `--md-app-color-surface-*` and `--md-sys-color-*`, so both
appearances come from the token maps: layered dark neutrals, no pure-black editor,
no glowing accent on the toolbar, and the selected states (`secondary-container` in
the Notes rail and on the Diary's chosen type, `primary` on the selected day) carry
their own `on-` colour at full strength.

That last point is a fix, not a description: a first draft mixed the Notes rail's
selected supporting text to 78% of `on-secondary-container` for hierarchy, and axe
caught it immediately — those pairs are chosen to clear 4.5:1 exactly, so any
transparency takes them under. Hierarchy inside the row is carried by size and
weight, which cost no contrast.

---

## 7. What was deliberately not done

- **No storage change.** Notes, Diary and Meetings still store Markdown; the
  editor's document is still the source, byte for byte.
- **No new editor framework.** The redesign is composition, typography and
  measure over the existing CodeMirror live editor.
- **No invented Meeting sections.** Agenda, Decisions, Outcomes and Actions are
  the four `meeting_items.kind` values the schema already owns.
- **No mood tracking, no calendar system, no tagging framework**, and none of the
  AI/transcription/collaboration work §59 rules out.
- **No batched attendee read** for the Meetings collection (see §5).
