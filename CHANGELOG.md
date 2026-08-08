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

## Record screens: one anatomy, and the working content back above the fold (#131)

Collection screens converged in #130. This does the same for the screens you
actually work in — a Project, an Area, a Goal, a Note, a Meeting, a Person, an
Asset, a Review and a Task — so they read as one product rather than nine.

### The thing you came for is now on screen

- **A Project's task list used to start 60px below the bottom of a 1280×800
  laptop screen.** You opened a project and saw no tasks at all until you
  scrolled. It now starts a third of the way down, with five tasks visible.
- Every record type is held to the same rule: with the header and tabs drawn,
  the first row of a record's working content is visible without scrolling.
- A Note's editor starts higher, is wider, and no longer sits in a box inside a
  box — the frame around the writing surface was being drawn twice.

### Each fact said once

- A Project record stated its task count three times, its health twice, its Area
  twice, its state twice, and each of six health signals twice. It now states
  each of them once.
- An Area with nothing active said so **four times** — twice in the header, once
  in a roll-up line, and again inside a card nested in another card. It now says
  it in one sentence.
- The same pass removed duplicated identity from the Asset overview, duplicated
  status from the Meeting overview, and the word "Weekly" three times in the
  first two lines of a weekly Review.
- **Nothing was deleted.** Created, Updated and raw state moved to each record's
  **Settings → Record details**, which is where you go for a record's paperwork.

### Clearer actions

- **Complete** is no longer the loudest button on a Project, a Goal or a Review.
  Ending a record is a lifecycle action, not the next thing you came to do.
- **A Person now offers Call and Email** (and Message where you have a mobile),
  and only when you actually have that contact detail — no more greyed-out
  buttons that can never do anything. Creating a task, meeting, note or diary
  entry for that person, and copying their details, moved into the record's ⋯
  menu, still linked to them.
- **An Asset's history** led with six identical-looking links. It now leads with
  the one that fits the asset — Record service for something serviceable, Record
  renewal for a policy or licence — with the rest in the ⋯ menu.
- Filters inside a record are now visibly quieter than the record's tabs, so
  "where am I" and "which subset" stop competing.

### A meeting you can still read

- The capture strip at the bottom of a Meeting took nearly a fifth of a laptop
  screen. It is now one row instead of two, quieter, and it no longer sits
  underneath the global **+** button — which had been making its own Add button
  unclickable.
- On a phone it still stacks, because a thumb needs the targets.

### Fixed along the way

- Every editable record title in the product was carrying about 29px of invisible
  space beneath it, which pushed the entity icon and the status pill below the
  title they sit beside.

---

## Collection header, view switching, overflow-menu placement and Project identity colour (#130)

Finishes the collection-level convergence the August 2026 UI quality audit
deferred, and gives a Project the visual identity an Area already had.

### One collection-header anatomy (UIQ-013 / UIQ-014)

- **One documented shape** for the top of every collection, with fixed semantic
  ownership of its slots — title/count, view switcher, secondary actions, one
  primary action, then filters in the band beneath. A module shows only what it
  needs; what is consistent is placement and hierarchy, not content.
- **The title block now GROWS** and the controls do not, so a header stops
  wrapping while hundreds of pixels of laptop width sit unused.
- **The narrow composition changed on purpose**: below `md` the header is a
  two-row grid (title + create on row one, switcher on row two) rather than a
  desktop row collapsing by accident. The create action is never hidden to fit.

### One view switcher (UIQ-013)

- **`~/shared/view-switcher`** is the one M3 segmented control for "change what
  this collection shows". Tasks, Projects, Goals, Notes, People, Meetings,
  Assets, Reviews and Diary render it; People's pill tabs, its bordered icon
  toggle, Assets' and Reviews' pill rows, Meetings' loose segment links and
  Diary's underline tabs are gone.
- **View and filter are documented as different things.** A view changes the
  presentation or the principal mode and cannot be unset; a filter narrows which
  records are included and can. `SegmentedFilter` stays for genuine in-content
  filters and renders through the same one implementation.
- **The selection glyph's box is reserved in every segment**, so choosing a view
  no longer shifts every label in the control. Geometry is identical whichever
  view is active.
- **The control scrolls, it never wraps.** A `projects.css` rule that turned
  every segmented control in the product into a two-column grid below 30rem —
  a module stylesheet deciding how a shared primitive degrades — is removed.

### The shared overflow menu fits the viewport (UIQ-021)

- Flip above, clamp to the larger side, scroll internally, and keep an 8px
  margin from every edge — the Tooltip's placement philosophy applied to a
  surface with real height. A ~713px Tasks row menu opened low on an 800px
  screen no longer runs past the bottom.
- Flipping and clamping are presentation only: keyboard semantics, item order
  and focus behaviour are unchanged, and the last item of a clamped menu is
  still reachable with End.

### Project identity colour

- A Project now carries **its own** stable colour, on the same mechanism Areas
  use rather than a parallel one: a rank over the workspace's
  `(created_at, id)` ordering, folded into the shared six-colour ramp. Assigned
  without asking, different for consecutive Projects, and unmovable by rename,
  re-sort, filtering, lifecycle changes or unrelated creation. No column, no
  migration, no index — and existing Projects are coloured deterministically.
- It replaces the inherited Area accent, which left several Projects in one
  Area indistinguishable and gave a Project with no Area no identity at all.
  Icon and colour stay independent attributes.

### Deliberately not here

- **UIQ-011** (Person record actions) and the systemic record-detail hierarchy
  it belongs to are owned by PR #131.
- **UIQ-012** ("Open" as a Goal status) was investigated and retained: "open" is
  also a Project repository filter value and a shareable URL parameter, so
  renaming is a vocabulary migration needing an owner decision, not cleanup.

## Unreleased

### Fixed — the August 2026 UI quality audit

A systematic pass over every module — clicking, hovering, typing and resizing
the way a person actually uses DalyHub. The register of everything found, fixed
and deliberately deferred lives in
[`docs/design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md`](docs/design/DALYHUB_UI_QUALITY_AUDIT_2026_08.md).

- **Pointing at a task no longer paints purple slabs across it.** On a desktop,
  hovering a task row in Today or Tasks showed the phone's swipe-action panel
  through the row — large coloured blocks with a half-clipped button at the
  edge, worse in dark. The touch panel now simply doesn't exist on a device
  with a mouse, and a highlighted row can never turn see-through again.
- **Task rows use their whole width.** The hover buttons ("Complete", "Plan
  today"…) were invisibly reserving about a third of every row, which is why
  chips wrapped onto an extra line for ordinary Area names and rows sat at
  uneven heights. The buttons now appear over the end of the row only when you
  point at it (or reach it with the keyboard); at rest the title and details
  own the row, so the list reads at an even rhythm. On a phone nothing changes
  — the buttons there were always visible and still are.
- **Renaming a record keeps the name in view.** Clicking a record's title to
  rename it collapsed the editor to a small box showing only the end of the
  name, with most of the header empty beside it. The editor now takes the width
  the title had.
- **Project cards on Today keep their shape with longer names.** A wrapping
  title used to strand the folder icon on its own line and drop the "Active"
  chip to the end of the last line; the icon and chip now stay put while the
  name wraps beside them.
- **Meetings speak the product's language.** "planned" is now "Planned",
  "Aug 10, 2026, 7:00 PM" is now "10 Aug 2026, 7:00 pm", and the Meeting
  details list uses the same tidy label-over-value layout as every other
  record instead of browser-default indentation.
- **Small consistency corrections.** Today's Waiting section puts its
  "View all" link on the heading row like every other section; the Assets
  filter row's fields share one height (and the Tag box says what it is for);
  a Review row no longer states its period twice.

### Changed — every record's name is edited the same way

- **Click a record's name to change it.** Notes, Goals, People, Assets, Meetings
  and Tasks now edit their name exactly the way Areas and Projects already did:
  the name looks like ordinary text until you point at it or Tab to it, clicking
  (or pressing Enter) turns it into a field, Enter saves and Escape cancels. The
  separate **Rename** button — and the panel it opened — is gone from all of
  them, because it was a second way to do something the name itself now does.
  Nothing about how a rename is checked or recorded changed; only where you do
  it.
- **If a save is refused, your words stay put.** Every one of these fields keeps
  exactly what you typed when the server says no, and shows the reason beside it.
  The old panels threw the text away when they closed.
- **A Goal's target date and definition of done are edited on the Goal.** The
  "Edit details" panel is gone. The target date opens a small date picker where
  the date is shown; the definition of done opens where the text is shown, with
  its own Save and Cancel. Each saves on its own, so changing one can no longer
  quietly undo a change to the other.
- **A Task's priority and dates are changed from the task itself.** Priority is a
  short menu on the value; the scheduled and due dates each open a small picker
  where they are shown. Setting a due date no longer means opening the Details
  form and saving the whole task.

### Changed — an empty field is empty

- **"No priority" is no longer something you can choose.** A task nobody has
  triaged now simply reads _No priority_ in the quiet style the product uses for
  anything that has not been filled in — it is not presented as a setting someone
  selected. The menu offers the real priorities only, and **Clear priority**
  appears as a separate command at the bottom, and only when there is a priority
  to clear.
- **Changing a value takes one action.** Going from _P1 · Urgent_ to _P3 ·
  Normal_ is: open, choose. There is no longer any field where you have to clear
  the current value before you can pick a different one.

### Changed — the same writing surface everywhere

- **Diary entries are written in the same editor as Notes and Meetings.** The
  Diary's details box was a plain text area with a "Show preview" link; it is now
  the product's one writing surface, with the same formatting toolbar, the same
  keyboard shortcuts and the same typography as a Note. A Task's description
  moved to the same editor. How each of them saves is unchanged — the Diary still
  has an explicit **Save changes**, a Note still saves as you write.
- **The editor greys out while a form is saving,** instead of letting you type
  into a document that is about to be replaced by the server's answer.

### Fixed — record titles and the writing area stop wasting your screen

- **A short record title stays on one line.** A Project called `Opo 1 2026` was
  splitting across two lines on a laptop — as `Opo 1`, then `2026` — with a very
  large amount of empty space sitting right next to it. It now takes the room it
  needs. Genuinely long titles still wrap, as they should, and the status chip and
  the buttons beside the title move out of the way before the record's own name is
  squeezed. This is fixed for every record — Areas, Goals, Projects, Notes, Tasks,
  People, Assets — not just for Projects.
- **A Note starts where you would expect to start typing.** Opening an empty Note
  put the cursor and the "Start writing…" prompt roughly halfway across the
  editor, leaving a wide blank strip in front of every line you typed. Writing now
  begins at the left edge of the editor, level with the first button on the
  toolbar above it, and a line of text can use most of the width that is actually
  there. Read mode still uses a comfortable, shorter reading width — but it starts
  in the same place, so switching between writing and reading no longer shifts the
  text sideways. The same fix applies everywhere the editor is used: Notes,
  Meetings, Reviews and any record's long-form field.
- **Turning a module back on in Navigation settings now works.** Hiding a module
  from the sidebar worked; showing it again said "Saved" and left it hidden. The
  only way back was the "Reset navigation" button. Both directions now do what
  they say.

### Changed — quieter records, and controls that behave the same way everywhere

- **A record reads as one workspace instead of a stack of cards.** The tabs now
  sit directly on top of the panel they control rather than floating above a
  separate card, and a summary that is only a few small details (Created, Updated,
  Tags) is shown as plain text rather than being boxed like a dashboard panel. A
  summary with real content — a Goal's definition of done, a Project's description
  — keeps its panel.
- **Fewer buttons competing with the record's name.** Each record shows at most
  one main action and one secondary one at the top; anything else moved into the
  **⋯** menu that was already there. Nothing was removed by that change — though
  Rename and "Edit details" have since gone from the Goal record entirely, now
  that its name, target date and definition of done are all edited in place (see
  above).
- **"No tags" is no longer shouted.** Missing information used to be shown in the
  same little rounded chip the product uses for real statuses like _Active_ or
  _On hold_, which made an empty record look busier than a full one. It is quiet
  supporting text now. Real statuses are unchanged.
- **Every button, menu item and tab responds the same way.** Hover, keyboard
  focus and press are now drawn by one shared treatment across the product, so
  they look and feel identical wherever you are — and several controls that never
  responded to being pressed at all now do. Nothing animates that did not animate
  before, and reduced-motion settings are still respected.
- **One kind of dropdown in Settings.** Settings mixed the operating system's own
  dropdowns with DalyHub's, side by side in the same panel. They are all DalyHub's
  now, and they behave the way the rest of the app's dropdowns do — including
  showing you the whole list when you reopen one that already has a value. Filter
  bars keep the simpler system dropdown on purpose, because it is more reliable on
  a phone.
- **Settings toggles are proper switches.** The on/off preferences that apply
  immediately now use one consistent switch that states its position with a moving
  knob and a tick, not just a colour.

### Fixed — the Capture button stops sitting on top of things

- **Nothing gets stuck underneath it any more.** The round **+** button in the
  bottom-right corner floats above the page, and the last thing on a page — the
  last card, the last row, the last control — used to end up trapped beneath it
  with nowhere further to scroll. Every page now keeps that much room at its end,
  so you can always reach the bottom of what you are looking at. The button still
  floats over things as you scroll past, which is what a floating button does;
  what it no longer does is put something out of reach.
- **On a phone there is now one Capture, not two.** The floating **+** and the
  bottom bar's **Capture** did exactly the same thing, in the same corner, a
  thumb's width apart. The bar's Capture is the one that stays — it is labelled,
  it is where you are already looking, and it does not float over the page. Every
  capture type, the keyboard behaviour and what happens when you close it are all
  unchanged. On a laptop the floating button stays exactly where it was.
- **Nothing else about creating things changed.** "New Task" on a Project, "New
  Note" on a Person and the create buttons on empty collections are all still
  there — those carry context that Capture cannot.

### Added — icon buttons explain themselves, to the keyboard as well as the mouse

- **Hover or Tab to an icon-only button and it now tells you what it does** — the
  formatting bar, the ⋯ menus on cards and records, the command palette and help
  buttons in the top bar, your account button, Back and Search on a phone, and
  Capture itself.
- **Formatting buttons show their keyboard shortcut** — `Bold ⌘B` — and they show
  it in the right form for the computer you are on. Previously that hint only
  appeared for a mouse, which meant the people most likely to want the shortcut
  were the ones who never saw it.
- **Press Escape to dismiss one.** They never take keyboard focus, never get in
  the way of clicking the button underneath, and never run off the edge of the
  window. If you have asked your system to reduce motion, they simply appear.

### Fixed — a Settings row that said the same thing twice

- **"Default task destination" is now written once** in its Settings row, not
  once on the left and again above the box on the right. A screen reader reads
  the setting once, and the control is still properly labelled by the words you
  can see.

### Changed — writing feels like writing, and small edits happen in place

- **The editor got out of the way.** The formatting bar is now a compact row of
  icons attached to the top of what you are writing, instead of a strip of word
  buttons floating above it in its own panel. It no longer wraps onto a second
  line on a laptop, and on a phone the space it used to take goes back to the
  words. Every button is still a full-size touch target.
- **The buttons finally tell you what your text already is.** Put the cursor in
  something bold and **Bold** lights up; the same for italic, strikethrough,
  code, headings, lists, checklists and quotes. Press it again to take the
  formatting off.
- **Undo and redo are on the bar**, and they are greyed out when there is
  nothing to undo — so they never pretend to do something and then do nothing.
- **Strikethrough is new.** There is still no underline, and that is deliberate:
  the notes are stored as Markdown so you keep them forever and can export them
  anywhere, and Markdown has no underline. A button that quietly did nothing
  would be worse than no button.
- **Everything you have already written is untouched.** Notes, diary entries,
  meeting content and reviews are stored exactly as they were — plain Markdown,
  yours, portable. Nothing was converted and nothing needs to be.

### Added — edit a value where you see it

- **Rename an Area or a Project by clicking its name.** No panel, no form, no
  second screen. Type, press Enter, done — Escape puts it back the way it was.
- **If a save is refused, your words stay put.** The field stays open holding
  exactly what you typed, with the reason beside it, so you can fix it and try
  again. Previously a rejected rename closed and threw your text away.
- **It works without a mouse.** Every editable value is a real control you can
  reach with Tab and open with Enter, and focus comes back to it when you are
  done. Nothing is hidden behind hover.
- **Things you cannot change do not pretend otherwise.** An archived Area's name
  is plain text, with no hover, no cursor change and no tab stop.

### Changed — Goals joins the gallery, and pickers stop making you clear before you choose

- **Goals now look like Areas and Projects.** Same cards, same grid, same column
  behaviour — including the Deleted view, so switching between Active and
  Deleted no longer feels like landing on a different page.
- **You can change a choice without emptying the field first.** Picking a
  different Area for a Project, a different parent for a Task, a different type
  for an Asset: click the field and every option is there. Previously the box
  filtered itself down to the thing you had already chosen, so you had to press
  **×** first — and nothing told you that.
- **Typing still filters**, and clicking a field with a value in it now selects
  the text, so your first keystroke replaces it rather than joining onto it.
- **"Choose a type…" is no longer a type you can choose.** On the New Asset
  form it was in the list of options; it is now the prompt in the empty box,
  where it belongs.
- **"No priority", "No sector" and "Does not repeat" are staying exactly as they
  are** — those are real answers about a task, not empty fields, and they keep
  their own words.

### Changed — Areas and Projects are proper galleries

- **About four cards across on a normal desktop screen** (Areas, Projects and Goals alike), five on a wide
  monitor, three or two as the window narrows, and one on a phone — comfortably
  usable down to a 320px screen with no sideways scrolling.
- **Cards read like places, not database rows.** The old `Goals: 2 · Projects: 4
· Tasks: 11` line is gone. Counts now appear as small icon-and-number facts,
  and a count of zero is simply left out instead of taking up a line saying "0".
- **Archive from the gallery.** Each card carries the same ⋯ menu every record
  has, so you no longer have to open a Project and find its Settings tab to
  archive it. Opening the menu never opens the card.
- **A brand-new Project still looks finished.** No area, no tasks, no dates,
  nothing written yet — the card just shows less, rather than showing a column
  of empty labels.
- **Nothing else moved.** Filters, search, sorting, "Load more", empty states,
  the back button and your scroll position all behave exactly as before.

### Added — you can choose Light, Dark, or follow your device

- **Appearance is yours again.** DalyHub still has exactly one light look and one
  dark look, but you now choose which to use: **System**, **Light** or **Dark**.
  System is the default, follows your phone or computer, and keeps following it
  while DalyHub is open — so nothing changes unless you want it to.
- **Two places, one setting.** Pick it from your account menu (the avatar at the
  top right, or the bottom of the navigation sheet on a phone) or from
  **Settings → General → Appearance**. Both show the same current choice, because
  they are the same setting.
- **It follows you between devices.** The choice is saved to your account, not to
  one browser, so signing in on your phone gets the appearance you chose on your
  laptop.
- **No flash on load, and no waiting.** The page arrives already in the right
  appearance rather than starting light and snapping to dark, and scrollbars,
  dropdowns and other parts your browser draws match it too. Choosing an
  appearance changes the screen immediately — it does not wait for the save — and
  if the save fails it changes back and tells you.

### Changed — one place to create, and page headers that stop repeating it

- **The ⊕ capture button is the way to create a task, note, meeting or diary
  entry.** It is on every page, at every size, and it always has been — but four
  page headers were offering the same thing again a few centimetres away. Those
  duplicates are gone from **Today** (Quick capture), **Tasks** (New task),
  **Notes** (New Note) and **Meetings** (New meeting).
- **Nothing became harder to reach.** Every one of those flows is unchanged and
  still one tap away from the capture button, from the command palette, and from
  the empty state on each page when you have no records yet. Meetings gained a
  create action in its empty state so it can never dead-end.
- **The create buttons that were doing real work all stayed.** New Area, New
  Project, New Goal, New Person, New Asset and New Review are still where they
  were, because each creates that page's own kind of record. So are the ones that
  carry context you would otherwise have to re-enter: a task or note created
  inside a Project, a follow-up on a meeting, a person's linked records, and
  Diary's **New Diary entry**, which files the entry on the day you are looking
  at rather than today.
- **Your account menu shows more, not less.** Its top section could previously be
  covered by a page's own sticky header on tall screens; it now sits above the
  page as it always should have.

### Added — choose an icon for an Area or a Project

- **Areas and Projects can wear an icon you pick.** Open an Area or a Project,
  go to **Settings → Appearance**, and choose from a searchable catalogue of
  thirty-four icons grouped by theme — travel, property, people, learning,
  safety and more. You can also pick one while creating the Area or Project.
  The icon appears on the record wherever it is shown.
- **Choosing one is optional, and reversible.** An Area or Project without a
  chosen icon keeps the standard one for its type, exactly as before. **Use the
  default** puts it back at any time. Nothing you already have has changed.
- **Your choice travels with your data.** An icon is included in a workspace
  export and in a Markdown vault export, so a record keeps its icon if you move
  your data or restore it later.

### Changed — DalyHub has a new look, and it follows your device

- **A new visual design, end to end.** Every surface in DalyHub has been rebuilt
  on **Material Design 3**: rounded cards that lift off the page, fully-rounded
  buttons, chips instead of pills, outlined text fields, a navigation drawer with
  a filled pill on the row you are on, and a floating **+** button for capture on
  every screen. Nothing moved and nothing was removed — the same pages, the same
  actions, in a clearer language.
- **One light look and one dark one, chosen by your device.** DalyHub used to
  offer seven themes. It now has a single, confident blue design with a light
  appearance and a dark one, and it follows your phone or computer: set your
  device to dark and DalyHub is dark, immediately and everywhere. There is
  nothing to pick, which is why **Settings → Appearance** is gone.
  - If you had chosen a theme, that choice no longer applies. This is the one
    thing this release takes away, and it is deliberate: one design that is
    proven correct in both appearances is worth more than seven that each needed
    proving separately.
- **A new typeface.** All text is now Roboto Flex — one family for everything,
  including long-form notes and diary entries, which previously used a separate
  serif. It is a third of the size of the two fonts it replaces, so pages paint
  sooner, especially on a slow connection.
- **New icons.** The whole icon set is now Material Symbols. Every icon means
  what it meant before; they are simply drawn in the same language as the rest of
  the interface.
- **Two new cards on Today.** A **Task summary** ring beside your morning brief
  shows the day at a glance — to do, waiting and done — with links to the tasks
  behind each figure. A **Productivity score** card gives the day a single 0–100
  number, and tells you exactly what it is made of: tasks you finished today,
  reduced by how far the plan has slipped. It caps that penalty deliberately —
  five overdue tasks and fifty score the same — because past a point a number
  stops being information and starts being a telling-off.
- **Everything stays as reachable as it was.** Contrast, keyboard operation,
  focus rings, 44px touch targets and reduced-motion support are unchanged and
  still checked automatically — now in both appearances rather than across seven
  themes.

### Added — a Meeting can now propose Notes, and its Tasks land where they belong

- **A Task you accept from a Meeting is now a real meeting follow-up.** Accepting
  a proposed Task records the action on the Meeting and converts it the same way
  the _Create task_ button on a meeting item always has — so it appears in the
  Meeting's **Follow-up** tab as converted, instead of sitting beside the Meeting
  as an ordinary Task that looked the same but was not. Accepting the same
  proposal twice returns the Task you already have; it never makes a second one.
  You can still send one to your Inbox without choosing a Project.
- **Meetings can propose Notes worth keeping.** Alongside proposed Tasks, a
  Meeting's AI tab may suggest up to four Notes — a summary of what the meeting
  covered, a record of what was decided, or the questions left open. Each one
  starts **unticked**, its title and body are yours to edit before you keep it,
  each shows what it was drawn from, and any of them can be thrown away. Ticking a
  Task never keeps a Note along with it.
- **A Note you keep is an ordinary Note.** Once you accept it, it is a normal
  DalyHub Note — editable, searchable, exportable, deletable — linked back to the
  Meeting it came from, with a link on the AI tab to open it straight away. Retry
  a save that seemed to fail and you get the same Note back, not a duplicate.
- **A Task you accept from a Note keeps its source.** It links back to the Note it
  came from, so the Note's **Linked** section shows the work it produced.

### Changed — a privacy correction, stated plainly

- **DalyHub now asks OpenAI not to keep a copy of its requests.** Every request to
  OpenAI carries `store: false`, which switches off the retrievable copy the API
  keeps by default for 30 days. To be clear about what this is and is not: it is
  not a promise that nothing is retained. Your provider's own abuse monitoring and
  any legal retention still apply under their policies, and DalyHub can neither
  see nor change them — it can only control what it sends and what it asks for.
  Anthropic is unaffected; its API has no such setting.

### Unchanged, deliberately

- Nothing is ever added to DalyHub without you ticking it. There is still no
  "accept all" and nothing is pre-selected.
- Your Activity still says **you** made every change, because you reviewed and
  approved it. AI is never named as the actor, and there is no separate "AI did
  this" entry.
- A Meeting or Note that was archived or deleted since a proposal was generated is
  refused, in plain words, rather than written to.
- No new database table, and no live AI request has ever been made from this
  repository.

### Added — controlled, evidence-backed AI assistance

- **A provider-independent AI platform.** One kernel of pure contracts
  (`app/kernel/ai/`) — versioned prompt registry, DalyHub-owned response schemas,
  a server-owned model and pricing registry, budgets, the request state machine
  and a typed error family — with Anthropic and OpenAI adapters behind a single
  contract. No module calls a provider; no provider SDK is added; no AI code
  reaches the browser bundle.
- **Three bounded capabilities.** Extract actions and decisions from a Meeting or
  a Note; generate an evidence-backed Weekly Review assistant summary; and Ask
  DalyHub questions about your own records, with citations.
- **Ask DalyHub answers what it can without AI.** Counts, the Inbox state and
  "when was the last Meeting" are read from repositories and cited — no provider
  is contacted, and nothing is sent anywhere.
- **Application-enforced budgets.** Reserve → run → reconcile, with a conservative
  USD $10 monthly default, a daily ceiling, a separate deep-analysis allowance
  that is off by default, per-feature daily limits, a concurrency cap and
  duplicate-submit protection. When a limit is reached, ordinary DalyHub is fully
  available and no provider call occurs.
- **An AI usage ledger** (migration `0030`) recording operational metadata only —
  no prompt, no response, no record content, no credential — and writing **no**
  Activity.
- **Privacy controls (AI-04), shipped with AI-01.** A structural seven-category
  classification; People and Diary excluded by default; per-category owner
  consent; and a pre-run disclosure naming exactly what will be sent and what was
  left out.
- **An AI section in Settings** showing status, providers, routing mode, models,
  budgets and usage — and deliberately containing no field for an API key.
- **Optional Cloudflare AI Gateway routing** with bring-your-own-keys, selected
  purely by configuration and never required.

### Changed — the surfaces AI appears on

- Meetings and Notes gained an **AI** tab; the guided weekly Review's focus step
  gained a deliberate _Generate assistant summary_ action that appends to — never
  overwrites — what the owner has written.
- The production deploy preflight refuses an inconsistent AI configuration and
  refuses to commit an AI binding as a `var`. A deployment with no AI
  configuration passes unchanged.

### Unchanged, deliberately — what AI does not touch

- DalyHub works exactly as before with AI disabled or unconfigured.
- AI never writes to DalyHub data. Accepted proposals are created through the
  modules' own repositories, with the **owner** as the Activity actor.
- The X-04 export contract: no AI table is exported, so no export can carry a
  credential.

### Added

- **Your weekly Review is now a guided process, not a wall of empty boxes.**
  Opening a weekly Review offers a step-by-step pass through the week — settle in
  with what actually happened, clear your Task Inbox without leaving the Review,
  check each Project, look at your Goals and Areas, reflect one prompt at a time,
  record next week's focus, and finish. It is the _same_ Review underneath: the
  same record, the same reflection, the same history, and the full record page is
  still there whenever you prefer it.

  - **It remembers where you stopped.** Leave halfway through on your laptop and
    pick it up on your phone at the step you were on, with everything you wrote
    still there. Tasks changing in another tab never move you backwards.
  - **Nothing is demanded of you.** An Inbox that is not empty never blocks
    finishing a Review, and no prompt is compulsory. Where a step does need an
    answer, you can always choose "continue without recording one" — leaving
    something on purpose is a decision, and the Review says so in those words
    rather than treating it as a failure.
  - **The Project check is new.** Each Project shows its Area and Goal, how it is
    going, what is open, overdue or waiting, what you finished this week, when it
    last moved, and the next thing to do — or, honestly, that no next action is
    visible, rather than inventing one.
  - **Goals and Areas, calmly.** Which Goals had supporting work, which have no
    active Project behind them, and where your active work is actually pointed.
    No scores, no streaks, no red dashboards, and nothing that scolds you about a
    quiet part of your life.
  - **Next week gets a handoff.** The focus you record is offered to next week's
    Review when you complete this one — read from the Review that wrote it, never
    copied, so completing a newer Review simply supersedes it. Nothing is
    scheduled and no Project is changed just because you mentioned it.
  - **On a phone** it is one step at a time, with Back and Continue in thumb
    reach, a step menu for jumping around, and a writing surface that grows with
    what you write. Checked at 320, 375, 390 and 430 pixels.
  - **Your writing is safer.** If a reflection changed on another device, saving
    now refuses rather than overwriting it, and tells you — your words stay in the
    editor. Reviews you already had keep their own prompts and are never rewritten.

- **Activity now says who did it.** Every activity, timeline, diary and history
  entry shows the real person who performed the action instead of the anonymous
  "Someone" — with their initials beside the name. The name comes from your own
  DalyHub profile: link the People record for yourself and every past event
  follows it, including if you rename it later. Genuinely automated activity says
  **System**, and the rare old record whose author truly cannot be recovered says
  **Unknown user** rather than guessing. It never assumes an old event was yours
  just because you are the only person here.

- **No more "Unrecognised event".** Events that were fully understood by the app —
  a meeting item converted into a task, a person or asset changing, an area
  archived — used to appear in the workspace feed flagged as unrecognised. Every
  kind of event now has a proper sentence, and the ones that connect two records
  name both: _"Aidan Daly converted a meeting item from Team Catch up into Chase
  the OpO"_. Technical event codes no longer appear on screen.

- **DalyHub has its own mark.** The app icon and the mark in the sidebar are now
  the approved DalyHub identity: a rounded blue-to-green tile carrying a white
  **D** with a small connected network of dots inside it. It replaces the plain
  dark-teal hub-and-spokes icon everywhere at once — the browser tab, the
  bookmark, the icon on your phone's Home Screen, the Android launcher, the
  install dialog, the sidebar, the phone header and the offline screen. The
  sidebar glyph and the Home Screen icon are drawn from the same source, so they
  are the same picture rather than two that look alike.
- **The sidebar says DalyHub.** The top of the sidebar used to show only your
  workspace's name, which meant that if you renamed the workspace, DalyHub
  stopped calling itself DalyHub anywhere on screen. It now always says
  **DalyHub**, with a differently-named workspace shown underneath it in smaller,
  quieter text. If your workspace is simply called "DalyHub", nothing is
  repeated.
- **About shows the full DalyHub identity** — the mark, the name and the line
  _"Your life. Connected."_ The words are real text, so they scale with your text
  size setting, follow whichever theme you are using and can be read aloud by a
  screen reader. Nothing about the branding is a picture of words.
- **DalyHub reads on a tinted page with cards raised above it — everywhere.**
  Every theme's page is now a soft tint rather than near-white, and the cards,
  panels and rows you work in sit visibly on top of it. The separation is carried
  by the surfaces themselves and a fine line, not by drop shadows — so the screen
  has depth without looking busy. Every module has been rebuilt on it: Today,
  Tasks, Areas, Goals, Projects, Notes, Diary, Meetings, People, Assets, Reviews,
  Settings, Search, Help, About and the offline screens.
- **Lists are lists again.** A task, a note or a project used to be its own boxed
  card with its own border and shadow, so a list of forty was forty boxes. Now the
  list is one card and each record is a row inside it, separated by a hairline.
  Roughly a third more fits on screen without anything getting smaller or harder
  to tap, and nothing was removed from any row.
- **Your Areas have colours.** Each Area gets its own small coloured dot,
  consistently, so you can pick Health out of a list without reading. The colour
  is only ever a dot — it never fills a card or tints a row — and the Area's name
  is always beside it, so it is a shortcut rather than something you have to
  learn. You cannot choose the colours yet.
- **Empty pages look deliberate.** A list with nothing in it now sits in the same
  card a full one would, saying what would go there and how to add it, instead of
  a message floating in the middle of blank space.
- **Two typefaces, chosen and shipped with DalyHub.** Chrome, labels and lists
  use Inter; the body of a note now reads in Source Serif, set in a narrow column
  at a comfortable size. Both are served from DalyHub itself — nothing is fetched
  from a font service, so no third party ever sees that you opened a page, and
  they work with no connection at all. Together they add about 62 kB, which is
  roughly a tenth of a second on a slow phone connection, and text is never
  invisible while they load.
- **Absence is stated in words.** Where a note has no tags, DalyHub says "No tags"
  on a quiet pill instead of leaving a gap. Nothing shows an empty bar or a dash to
  mean "there is nothing here" — a Goal with nothing measuring it says so, rather
  than showing a progress bar sitting at zero as though you had made no progress.
- **Prose reads like prose.** Note bodies, diary entries, meeting summaries, area
  visions, project descriptions and review answers are set in a serif, in a narrow
  column, with room between the lines. Everything you operate — titles, buttons,
  labels, lists — stays in the interface typeface, so there is a visible line
  between what you read and what you click.
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

- **Today has been rebuilt as a command centre.** The screen you land on every
  morning now opens with a proper hero: it greets you by name, states the date,
  says what shape the day has, shows how far through today's committed work you
  are, and carries one row of counts — planned, overdue, meetings still to come,
  what you are waiting on other people for, projects that need a look, and what
  you have finished today. Each count that has an answer somewhere links to it.

  It is also just called **Brief** now. The greeting inside it has always changed
  with the time of day, but the heading above it said "Morning brief" at nine in
  the evening. If you had customised your Today layout, it keeps its place —
  nothing was reset.

  Beneath it, the page is two deliberate columns instead of cards falling wherever
  they fitted: **your day, your meetings, the projects you are working on and what
  just changed** on the left; **signals, capture, goals, areas, notes, diary and
  assets** on the right. On a phone the same order simply stacks. Every card now
  shares one header, one shape and one hover response, and each list has a single
  "see the rest" link in its header rather than a link at the bottom of some
  sections and none in others.

  **Nothing is counted twice any more.** The day used to be summarised in the
  header, again in the brief, and again inside _My day_; it is now stated once, at
  the top. _Insights_ keeps only what the top of the page does not already say.

  **Today is no longer somewhere you read your whole backlog.** _Anytime_ and
  _Upcoming_ show the eight most pressing items with the true total beside the
  heading and a link to the rest — so what is actually due today is not buried
  under sixty things that are not. What you have committed to — today's tasks and
  anything overdue — is never shortened.

  Along the way: meetings read as a real timeline down the left of the card;
  project cards always say how healthy the project is, how far along it is and how
  much is left; goals say how complete they are next to whether they have had
  recent action; the two remaining empty sections now offer you something to do;
  and on a wide monitor the dashboard fills the screen instead of leaving a band
  of empty space down the right.

  Two things in the brief were deliberately left out rather than faked: a
  **weather** panel (there is still no weather data source, and an empty box that
  promises one is worse than no box) and **card shadows** (DalyHub separates cards
  by surface tone and a hairline, which stays legible in all seven themes where a
  single shadow does not).

- **On an iPhone that already has DalyHub on the Home Screen, the old icon may
  stay.** iOS copies a home-screen icon in when you add the app and does not go
  back for a new one — not when the app updates, and not when you reopen it.
  Everything that can be done from DalyHub's side has been: the new icon is at a
  new address, so nothing is being served from a stale copy. If your Home Screen
  still shows the old icon, **remove DalyHub from the Home Screen and add it
  again** — it takes a few seconds and loses nothing, because your offline
  snapshot and anything waiting to sync are stored separately from the shortcut.
  Safari tabs, Chrome, Edge, Firefox and Android all pick the new icon up on
  their own.
- **Labels are written in sentence case.** Metadata headings across the product
  used to be SHOUTED IN CAPITALS WITH WIDE SPACING. They now read as ordinary
  words, which is easier to scan and much less like a piece of admin software.
- **Settings is grouped into cards.** Each section — Startup, Module defaults and
  the rest — is a card with its heading inside it, instead of a long page of rows
  divided by lines.
- **Wide screens get a page, not a stretched phone.** On a large monitor a list no
  longer runs the full width with the record's name at one end and its status at
  the other; content is held to a comfortable measure and stays beside the
  navigation.
- **Every drop-down and text box matches.** A few filter menus were still the
  browser's own controls sitting next to DalyHub's — different height, different
  shape. They are all one style now.
- **The offline and safe-mode screens look like DalyHub.** They keep working with
  no connection, no stored settings and — in safe mode — no scripts at all, but
  they now use the same page tint, card and shapes as the rest of the app instead
  of looking like a browser error page.

- **Every theme's page and card colours were re-tuned.** All seven themes now put
  a real, measured step between the page, the cards on it and anything floating
  above them — before this, five of them had page and card colours close enough to
  read as one flat surface, and three had cards and menus at exactly the same
  white. The change is most visible in the light themes, including the default:
  the page is a few shades deeper and cards are no longer pure white. Each theme
  keeps its own warmth or coolness; only the relationship between its surfaces
  changed.
- **Progress bars are legible rather than decorative.** The track behind a
  progress bar now has enough contrast against the card it sits on that you can
  see how far the bar has to go, not only how far it has come.
- **The navigation rail sits inside the application rather than beside it.** The
  hard edge between the sidebar and the page is now a quieter divider, and the
  module you are currently on is marked with a small leading bar as well as its
  tint and heavier text — so "where am I" no longer depends on noticing a colour.
  The same treatment applies to the section list in Settings, and to every theme,
  not just the new ones.

### Security — only DalyHub can change your DalyHub

- **Another website can no longer make changes to your DalyHub.** Signing in
  through Cloudflare means your browser carries a DalyHub sign-in with it. That
  sign-in was attached to a request because of where the request was going — not
  because of who asked for it. So in principle a page on some other site, open in
  another tab, could quietly ask DalyHub to complete a task, delete a note, change
  a setting or run a command on your behalf, and DalyHub would have seen a
  perfectly valid, signed-in request. It now also checks that the request actually
  came from DalyHub itself, and refuses it outright if it did not — before
  anything is read, changed or written down.
- **"Nearly DalyHub" does not count.** A site at another address on the same
  family of domains is treated as just as foreign as an unrelated one. Only
  DalyHub's own address is accepted, and the address has to match exactly.
- **A refused attempt changes nothing and leaves nothing behind.** It never
  reaches your records, so nothing is altered and no entry appears in your
  activity feed — an attempt someone else made is not part of your history. The
  refusal itself says nothing useful to whoever sent it.
- **Nothing you do normally is affected.** Ordinary browsing, opening records,
  searching, the command palette, creating and editing, changing settings, back
  and forward, deep links and shared links all behave exactly as before, and
  captures you made offline still sync normally when you come back online.
- **The framework DalyHub is built on was updated** to the release that carries a
  published security fix, so DalyHub no longer ships a component with a known
  advisory against it.

### Fixed — permanently deleting an asset or a review

- **Deleting an asset for good now leaves a record that you did.** Permanently
  deleting an asset removed it, its details and its entire service, warranty and
  renewal history — and wrote nothing to say it had ever existed. There was no
  way to answer "what happened to that asset, and when did it go?" The workspace
  activity feed now keeps a single permanent entry naming the asset that was
  deleted and who deleted it. Everything the asset was already mentioned in stays
  in your history too; deleting it never erases past activity.
- **The same for reviews.** A deleted review now leaves an entry that names it.
  Previously it left one that named nothing at all — the entry was written, but
  with nothing in it, so the feed could only say "permanently deleted this
  review" about a review it could no longer identify.
- **A review that is still linked to something is no longer deleted quietly.**
  Deleting a review used to break its links to whatever it was connected to,
  without asking. It now stops and tells you how many records still hold it, so
  you can unlink them first — the same way assets have always behaved. Nothing on
  the other end of a link is ever deleted.
- **Deleting the same thing twice no longer fails.** Pressing delete again, or
  from two places at once, used to be able to produce a technical error. It is
  now simply a no-op — and it cannot leave a half-deleted record or a second
  duplicate entry in your feed.
- **The confirmation for deleting a review is honest about what it costs.** It
  now says plainly that every reflection written in it goes, that it cannot be
  undone, and that an export cannot bring it back.

### Fixed — the installed iPhone app crashing when opened offline

- **The installed DalyHub app no longer restarts itself until iPhone gives up.**
  Opening it from the Home Screen with no connection showed the offline page for
  a moment and was then replaced by Safari's _"A problem repeatedly occurred"_.
  The cause was specific: an installed app opens at `/`, and DalyHub was
  answering that with the offline page's contents while leaving the address as
  `/`. The application then tried to load the code for the _home_ page, which is
  deliberately not stored on your device, and restarted itself when it could not
  — over and over. It now opens the offline page **at the offline page's own
  address**, so there is nothing left to fail.
- **Nothing else can be handed a web page by mistake.** A stylesheet, an image or
  a piece of the application's own code that is not stored on your device now
  fails cleanly rather than receiving the offline page, which was the second way
  DalyHub could break itself while offline.
- **A last-resort stop.** If the offline page ever does restart repeatedly — for
  any reason, including one nobody has thought of — DalyHub now notices and shows
  a plain, completely static page instead, which says clearly that nothing has
  been lost and offers to try again. It cannot restart, so it cannot loop.
- **No more waiting forever.** _"Checking what this device has stored…"_ and
  _"Reading the copy stored on this device"_ could both sit there indefinitely if
  your browser's storage never answered — which iPhone's sometimes does not.
  Every one of those now ends in a plain statement: the stored copy loaded,
  there is no stored copy yet, storage is unavailable on this device, or the
  stored copy could not be read. Offline capture says which of those applies, and
  why it is or is not available.
- **Reconnecting asks before it acts.** On the offline page, getting a connection
  back now says _A connection may be available again_ and waits for you to press
  **Sync now**. It never reloads the page, never sends you to sign in and never
  syncs behind your back. Pressing **Sync now** repeatedly runs one sync, not
  several, so nothing can be created twice.
- **A Diagnostics panel** at the bottom of the offline page, collapsed by
  default, showing what has and has not worked on this device. It contains no
  sign-in details and is never sent anywhere.

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
- **The browser and app window take on your theme's colour.** Whichever of the
  seven themes you are using, an installed DalyHub's window chrome matches the
  page instead of framing it.
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
