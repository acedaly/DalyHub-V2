# Changelog

- **The Goals screen now answers one question, and you can answer it back.**
  `/goals` was ordered by how much recent task activity a goal had — which is a
  real signal, but it is not the question the screen looks like it is asking.
  A goal three weeks past its own target date could sit below one that was
  comfortably ahead, and a goal with no measurement at all could sit above both.
  Now the list is ordered by **outcome**: the goals that need a decision first —
  overdue, then behind, then gone quiet — and the healthy ones below them.

  Whether a goal has moved recently is still shown. It just no longer decides
  the running order, because "something happened last week" and "this is off
  track" are different things.

  **The numbers beside the filters are now true.** They used to count the goals
  on the page you were looking at while reading as though they described your
  whole workspace, so "Needs attention 3" could mean three on this page and
  eleven in total. Every count now describes the whole collection — and on the
  Deleted view, where no such figure would be honest, no figures are shown at
  all.

  **You can now set a goal aside.** One choice, on the goal's own record and in
  the list's detail pane: **Pursuing** (which every goal already was) or **Set
  aside**. A goal you have set aside stops appearing on Today and stops `/plan`
  telling you it has no supporting work planned — because you already know, and
  you decided.

  What it does _not_ do is change a single fact. Its measurement, its status,
  its alignment and its movement line read exactly as they did before, on its
  record and in the list, where you deliberately went to look. Nothing sets this
  for you and nothing infers it: there is no "at risk", no "stalled", no goal
  health score, and no way for the product to decide on your behalf that you
  have given up on something. It is your word, and only yours.

  **And a goal can finally be moved to a different area.** Filed under the wrong
  one, or an area that has changed shape? Change it from the goal's record, the
  same way you change anything else. It is the same goal afterwards — its
  history, its measurements, every project working towards it and every task
  under those projects come with it, and the move is recorded in its own
  activity. Previously the only remedy was to create a new goal, which threw all
  of that away.

  The Goals list also stopped loading three things it had not drawn since the
  screen was redesigned — a per-goal sparkline, some hidden text and some
  unshown evidence rows — so it now fetches what it shows and nothing else.

- Every goal now tells you whether it actually moved this week — including the
  ones carrying no number at all. DalyHub could say what a goal _was_, and for a
  goal with a target it could say where the measurement stood. For everything
  else it said nothing: Today's goal panel showed measurable goals only, so a
  workspace with goals and no numeric targets was told **"No measurable Goals
  yet"** every single morning, and on `/goals` a goal that moved on Monday and a
  goal that had not moved since March were drawn identically.

  Now each one carries a sentence, and it is the same sentence everywhere:

  > **Moved this week.**
  > 2 of 3 Projects contributed · 2 Tasks completed

  > **No movement yet this week.**

  It appears on **Today**, on the **Goals** list and its detail pane, and on the
  **goal's own record** — where it also prints the seven days it is talking
  about, so "this week" is never a guess. All three read from the same place, so
  they cannot disagree.

  **"Moved" means something finished, not something happened.** A task completed
  under a project that advances the goal, a contributing project completed, a
  measurement recorded, a stage completed, or the goal itself completed. Renaming
  a project is activity — it is not the goal moving, and it does not count.
  Neither does adding work, planning it, or reopening something you had already
  finished.

  **A goal with no target is not given a fake percentage.** No 0%, no empty
  ring, no bar with nothing behind it. "No numeric target" is not "0%", so an
  unmeasured goal gets words instead of a number, and a measured goal keeps every
  figure it already had — its reading, its target, its pace, its status — with
  the movement sentence beside them rather than instead of them.

  **Two different questions, kept apart.** _Is it on track?_ is about your
  number and your target date. _Did it move?_ is about seven named days. A goal
  can be comfortably on track and have moved nothing this week, and the product
  says both rather than picking one. Today's summary says so too: "1 of 2 on
  track · 4 of 4 moved this week" — each figure with the set it actually
  describes.

  **And when nothing moved, it says exactly that and no more.** Not "stalled",
  not "neglected", not a red badge. Seven quiet days is not proof a goal has
  failed; it is an absence of evidence inside a window, and that is what it says.
  There is no score, no momentum figure, no streak, and no percentage anywhere in
  it.

  Nothing new is stored. It is worked out from the history DalyHub already keeps,
  every time you look, at a cost that does not grow with your goals or with how
  busy they have been.

- DalyHub now tells you what became of the week you planned. It has been asking
  you to commit to a week — this task, this day — and then never mentioning it
  again, which meant a week that quietly fell apart looked exactly like one that
  worked. A task finished on the day you planned it and one finished three days
  later were drawn identically. A task you moved from Monday to Wednesday to
  Friday simply appeared on Friday, as though it had always been there. And four
  things could happen to your week that left no trace at all: taking work off the
  plan, pushing it into next week, finishing something you had never planned, and
  changing your mind the following Monday about a Friday you never got to.

  So `/plan` now carries one sentence about the week it is showing:

  > This week's plan held 8 tasks: 2 done (1 on the day planned), 4 left
  > unfinished, 1 moved out and 1 taken off the plan. 1 task was completed
  > without being planned for it. _3 tasks moved to another day 4 times between
  > them, and 1 task came into the week from another day._

  Press **What happened** and it opens out: each task by name, with the dates the
  verdict was read from — "Planned for 17 Aug, done on 20 Aug", "Planned for 21
  Aug, and still open after moving 2 times", "Planned for 20 Aug, now planned for
  27 Aug — outside this week" — and every one of them a link to the record.

  The **weekly review** now opens on the same account of the same week, in the
  same words, because both come from the same place. It is the return half of a
  loop that only ran one way: the review has always handed the planner your
  written focus, and now the planner's week comes back.

  Two things it deliberately is not. There is **no score** — no percentage of
  your plan kept, no grade, no streak, no "productive week". A week you re-planned
  on Tuesday because Tuesday changed is not a week you failed, and no single
  number can say that. And there is **no judgement about days that have not
  happened**: while a week is still running, work whose day is still ahead is
  counted as "still to come", never as unfinished.

  Two questions are kept apart on purpose, because they are different questions:
  did the work land on the day you said, and did the plan move? A task you moved
  on Tuesday and finished on its new Thursday **kept its day and moved**, and the
  words say both. "Done later than planned" also means what it says: the plan
  really did point at an earlier day at the moment you finished, read from your
  own history rather than from whatever date the task happens to carry now.

  The review also finally says something about your **routines** — "2 of 3
  scheduled check-ins", with the days a routine did not ask for explicitly not
  counted. Two numbers and the week they cover, and no percentage. It had been
  silent about habits since they shipped.

  None of this is stored anywhere new. It is worked out from the history DalyHub
  already keeps every time you look, which is why it is right the moment you
  reopen a task, delete one, or change your mind. It also means hindsight cannot
  rewrite a week: move a task onto a Wednesday that has already been and gone,
  and that week's account does not pretend it was ever planned for it.

- Made a task row stop saying things that were not true. Weekly planning's "still
  to place" list drew **two tick boxes on every row**, eight pixels apart, and
  they did different things: one scheduled the task, one finished it. On the one
  screen whose entire job is deciding when you will do something, a slip of the
  mouse marked it done instead. Now a row shows one control at a time. Normally
  it is the one that completes the task, exactly like every other list in
  DalyHub, and you place work from the row's own "⋯" menu — "Plan for Wednesday
  14 May", a line for each day of the week. When you want to move several at
  once you press **Select tasks**, and while you are choosing, the tick box on
  each row _becomes_ the selection box rather than sitting next to it. Escape,
  "Done", or placing the work takes you back out. Nothing moves on the screen
  when you switch between the two, and both things stay reachable by keyboard
  the whole time.

  And a cancelled task with a date in the past no longer claims to be overdue.
  It was painting the date in the late-work colour right beside its own
  "Cancelled" label — telling you that work nobody is ever going to do is running
  behind. Same for finished work and anything parked as Someday / Maybe. The date
  is still there, because it is true and it is history; what has gone is the
  urgency. Work you are _waiting_ on someone for, or that is on hold, is still
  counted as late, because that is still yours to chase — and now every screen
  agrees about which is which, instead of three of them each having their own
  opinion.

  One smaller thing, on a phone: a project's name in a task's second line was
  being cut short by about four pixels even when there was plenty of room beside
  it — "Conference t…" with fifty pixels of empty space to its right. It had been
  looked at before and written off as unfixable. It was a stylesheet rule that
  had been overridden without anyone noticing, and it now says what it always
  meant to.

- Fixed the things that were quietly broken, and made the test gate mean
  something again. The searchable pickers — the ones you use to file a task
  under a project, choose a priority, link a record to another — had been
  correct for a while, but nothing was checking them: nineteen tests were
  looking for the list of choices in the wrong place, so a real break in any of
  those pickers would have gone straight past. They are checked properly now.

  The little "⋯" button on a task row could not be reached by anything but a
  hand on a mouse. It looked fine and it worked fine for you; what it could not
  do was be driven by a test, because an invisible box exactly its size was
  catching the click first. That box was already there and already swallowing
  clicks — it just wasn't the button. Now it is.

  Weekly planning on a phone promised one day and drew two, but only on
  Saturdays and Sundays, because the weekend shares a column with its neighbour.
  A phone now shows the day the strip says is selected, every day of the week.

  A record's tabs had grown a second hairline directly under the first, so the
  panel read as a bar sitting on a card rather than as one surface. And the
  filter inside a project's task list had quietly grown half a pixel larger than
  the tabs above it, which is backwards — a filter is subordinate to the
  navigation it sits under. Both are back to one edge and one hierarchy.

  Behind all of that: a Goal-measurement journey that had never once run in the
  entire history of the test suite now runs on every check, and the suite stopped
  giving different answers on identical code.

- Went looking for the things that were quietly wrong, and fixed them. On a
  phone, the little priority tag on every task — P1, P2, P3, P4 — was having its
  number sliced in half. Not on some rows: on every row, on every phone size,
  everywhere a task appears. It is fixed, and there is now a test that measures
  the tag against the box it is painted in at five different phone widths, so it
  cannot come back.

  On Today, the project name beside a task had been squeezed down to a single
  letter — "C…" where it should say "Conference talk" — on the phone size most
  people actually carry. A row now gives up the date before it gives up the
  project, because knowing what something belongs to is worth more than knowing
  exactly when it slipped, and the heading above the row already says it is
  overdue.

  On a tablet, the Capture button had become a blank purple square. The plus
  sign inside it was being shrunk to nothing along with its label, so the one
  action the whole product is built around was an unmarked block. It has its
  plus back.

  Weekly planning was starting in the wrong place: its title sat hard against
  the top bar with no margin at all, and on a phone it touched the very edge of
  the screen while everything beneath it was properly indented. It now begins on
  the same line as every other page in DalyHub, at every screen size.

  The Diary's week — the row of seven days you tap to move around — had been
  quietly squeezed into two thirds of the width available to it, because the box
  it sits in was indenting it a second time. On a small phone each day had
  shrunk to 35 pixels, which is smaller than a thumb. The seven days now use the
  full width of their strip, and they are back to the size they were meant to
  be.

- Made things that float actually look like they are floating. When you open
  Capture, the page behind it now dims properly and the panel casts a real
  shadow, so it reads as something in front of your work rather than a white box
  that has landed on a white page. The same correction applies to the drawer,
  the inspector, search, the command palette, the settings panels and the phone
  navigation sheet — all of them were dimming the page to about a third of the
  amount they were supposed to. It is most obvious in dark mode, where there was
  almost nothing separating a dark panel from a dark page.

- Made the cross-module Views screen look like the rest of DalyHub. Every result
  used to sit in its own little white slab with a purple link for a title and
  the date in bold black beside it, so the loudest thing in each row was the due
  date and the record's own name came second. Results now sit in one list with
  quiet dividers, the name is the name, and only a genuinely overdue date is
  coloured.

  Elsewhere: a long email address on a person's row now ends in "…" instead of
  being chopped through a letter; the "⋯" button stopped being drawn on every
  row of the projects table and the areas list until you actually point at one;
  the box around the Assets search field is gone, so its "Filter & sort" button
  no longer looks like it fell out of the toolbar; a stray grey block on the
  Goals panel is gone; and an overdue date on a task panel no longer runs off
  the edge of it.

- Made moving things feel like moving them. A step in a task's checklist and a
  stage of a goal can now be picked up and dropped where you want it — by mouse,
  by thumb, or from the keyboard alone (Enter to pick up, arrow keys to move,
  Enter to drop, Escape to change your mind) — and the new order is genuinely
  saved, so reloading confirms it rather than undoing it. A goal's stages could
  never be reordered at all before; they now also have Move up and Move down in
  the same menu the task checklist has, so there is never only one way to do it.

  On the tasks list, when you group by Project, priority, status or Time Sector,
  the groups become real destinations: pick a task up and drop it on another
  Project and it moves there, with a "Moved to …" message and Undo. It is the
  same change the little Project menu on the row already made — one operation,
  reached two ways — so nothing about the task behaves differently depending on
  how you moved it. A group the task is already in never lights up, so you can
  never drop somewhere that then refuses you, and nothing at all is saved until
  you actually let go.

  And a great deal was deliberately left alone. Almost nothing in DalyHub is
  draggable, and a page you are not touching looks exactly as it did before:
  there are no grips on Today, in search, on a project card, on a habit or on a
  note. Where a list's order comes from your dates or your priorities rather
  than from you, there is no grip at all — because a drag that quietly undoes
  itself on the next screen is worse than one that was never offered. Tasks
  cannot be dragged up and down a list for exactly that reason, and rather than
  invent a hidden ordering to make it look possible, it is written down as work
  that has not been done.

  Completing a task also stopped being a disappearance: the row now closes up
  where it was, and if you were using the keyboard your place moves to the next
  task rather than to the top of the page. Moving something leaves everything
  else where it was — your scroll position, your filters, your grouping, and
  every group you did not touch.

- Made DalyHub feel handled rather than operated. Small changes now happen where
  you are already looking. You can rename a task from Today and from the weekly
  plan, not only from the Tasks list; moving a task to a project that is not in
  the short menu opens a search box over the row instead of opening the whole
  task; a repeat can be set to Daily, Weekly or Monthly from the task itself,
  with the full editor still there for anything more involved. A project's
  status changes from the project's own header rather than from a settings tab,
  and its Area changes from the cell that already names it. A goal's target date
  is set on the screen you read goals on. An asset's status, where it is kept
  and which part of life it belongs to are edited on the record that used to
  simply print them under an "Edit details" link. Every one of these writes
  through exactly the same path the record page uses, so nothing is a shortcut
  that behaves differently, and a change that the server refuses leaves the real
  value on screen with the reason beside it rather than quietly pretending.

  And the counterweight, which mattered as much: none of it made the product
  louder. A list of fifty tasks still shows dates, projects and priorities as
  plain text — no boxes, no dropdown arrows, no column of "Not set" — and the
  controls appear only when you point at a row or tab to it. Two things that had
  been quietly wrong were found by looking: metadata on a phone had a smaller
  touch target than it should have, and a project's "Project"/"Area" label in
  the chooser was stranded on its own line, making every option twice as tall as
  it needed to be. Both are fixed. Keyboard operation is first-class throughout,
  a phone gets a proper bottom sheet for every choice, and nothing was added to
  the database to make any of it possible.

- Made changing something as fast as reading it. Anything that floats above the
  page — a menu, a date picker, a Project chooser, a filter panel, a
  confirmation — is now one recognisable family with one set of habits, and each
  kind has a job it does not stray from. Changing a task's date, priority or
  Project is a click on the value and a click on the answer, in the list, with
  no record to open and no form to save; the change is written through the same
  path the record page uses, so nothing is a shortcut that behaves differently.
  Quick Capture's three stacked form rows became one quiet line of metadata
  under the title, each opening the same picker the task list opens — and its
  due date can now be any day rather than one of three. Priority finally means
  exactly one thing everywhere: four choices, the same words and the same
  colours in every list, filter, form and menu that offers them, including the
  two places that had quietly drifted to bare codes. Meetings, Reviews and
  People stopped drawing three different sort controls. Menus can no longer be
  clipped by the card or row they belong to; a picker near the bottom of the
  window flips rather than running off it; a form's date picker, which had been
  drawing itself with no background at all, now looks like everything else. On a
  phone every one of these opens as a proper bottom sheet with full-width,
  thumb-sized rows instead of a shrunken desktop panel, and the search field
  stays put when the keyboard comes up. Keyboard operation is first-class
  throughout — open, arrow, type to search, choose, and focus returns to exactly
  where it was. Nothing added a dialog for an ordinary edit, and nothing became
  a coloured pill to look clickable.

- Gave DalyHub one motion and interaction grammar. Interface motion now speaks a
  single vocabulary — five durations named for what they are for, four easing
  curves that genuinely differ, and one shared set of named behaviours every
  surface reaches for instead of writing its own. Menus, popovers, tooltips,
  panels, sheets, dialogs, toasts and the command palette all appear and dismiss
  the same way, and things leave slightly faster than they arrive. Completing a
  task is now one polished sequence wherever a task can be ticked: the strike
  draws in rather than snapping on, and pointing at a finished task no longer
  makes it look unfinished. Grouped task sections open and close smoothly instead
  of jumping. On Today, finishing the current task lets the next one settle into
  its place rather than the screen re-composing. Secondary row actions fade in
  without nudging anything beside them, and several small defects went with the
  pass — a frantic loading shimmer, a spinner running several times too fast, a
  contextual `…` that popped instead of fading, and a command palette that
  arrived from the wrong direction. Reduced motion is properly supported:
  movement is removed rather than merely sped up, and nothing depends on
  animation to be understood. No animation library was added, and ordinary
  navigation stays instant.

- Completed the remaining DHDS shared-pattern convergence: Drawer, Inspector
  and Sheet now share one panel heading/body/footer grammar; Projects table
  progress uses the canonical progress primitive; the mobile editor signals
  off-screen formatting controls; desktop dialogs no longer advertise a false
  drag gesture; and Review Inbox no longer repeats its exit action. Added a
  cross-module regression boundary and corrected the design-system description
  of the shipped card family.

- Unified DalyHub's dense working rows: Task metadata now reads **when, where,
  importance** in the same order visually and to assistive technology; secondary
  actions stay quiet until hover/focus on desktop while remaining visible on
  touch; Weekly Planning uses the same collapsible group headings as Tasks; and
  agenda note actions no longer add permanent row noise on pointer devices.

- Added the first DHDS implementation ratchet: product styles may reduce but no
  longer increase their direct dependency on Material machinery tokens; Today,
  Goals and Habits now consume DalyHub semantic colour roles directly.

- Established `docs/design/DESIGN_DIRECTION.md` as the product-level UI/UX
  brief for coding agents, including system-wide interaction rules,
  module-specific direction and a practical completion checklist.

- Expanded the design direction with explicit desktop/mobile compositions,
  competitive quality standards and measurable density guidance, and added the
  staged `DHDS_01_WORK_PACKAGE.md` implementation package.

- Tightened the daily-work surfaces after production review: Today now uses a
  compact current-task row, bounded supporting regions, smaller gaps and a
  collapsed weekly KPI strip; Tasks has a denser capture/list transition;
  Goals exposes progress state and the next incomplete stage; Projects uses a
  tighter working-card grid; and the remaining workspaces now share compact
  controls, card density and section rhythm.

## Unreleased

- Refined Today into a decision-first command centre: one canonical Now task,
  the next real Meeting, a shorter active plan, collapsed completed work and
  weekly reporting below the day's decisions.

- Converged every module on the approved DalyHub command-centre finish: tighter
  navigation and page rhythm, quieter controls, one outlined card family,
  cleaner record surfaces, and matching desktop/mobile chrome.

- Refined Today into a clearer command centre: an honest live day summary,
  stronger task-first hierarchy, one bounded measure strip, and a quieter
  supporting rail across desktop and phone.

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

## Things that quietly went wrong, put right

A whole-application audit went looking for defects across every module. This is
what it found and what changed on screen. Most of it you will only notice by its
absence.

**Two people can no longer overwrite each other's meeting notes.** If a meeting
was open on your laptop and your phone, whichever saved second used to silently
replace everything the other had written — with no warning and no way to get it
back. Now a save that was written against text somebody else has since changed is
refused: your draft stays exactly where you left it, the newer version stays
safe, and a small banner offers you the choice — _load the newer version_ or
_keep mine_. It is the same banner Notes has had for a while, doing the same job.

**A note captured from the meeting capture bar now appears in an editor you
already have open**, instead of waiting for the next reload.

**You can clear a meeting's agenda or notes.** Deleting everything and saving used
to report success and change nothing; the old text came back the next time you
opened the meeting.

**Restore accepts the backups you already have.** Any DalyHub export taken before
18 August was being refused as "malformed" — it was not; it was simply older than
one of the things DalyHub now stores. Recovery works on your existing archives.

**"Created: Today" means today, where you are.** The Tasks and Views date filters
were comparing your calendar day against UTC, so in Sydney _Created: Today_
silently left out everything captured before about ten in the morning. The same
correction reaches the assistant, which could report a different "tasks completed
this week" from the Review it was describing.

**Deleting a view actually deletes it.** Confirming _Delete view_ and navigating
away immediately used to cancel the request in flight, leaving the view there with
nothing said. The dialog now waits for the answer, says _Deleting…_ while it does,
and tells you if it was refused. Saving, renaming and updating a view behave the
same way.

**Editing a meeting is no longer "seeing" the people in it.** Typing up one
meeting reported eleven interactions with each attendee, and fixing a typo in an
old meeting's title reset _last interaction_ to today — which quietly removed the
follow-up nudge for someone you had not actually spoken to in months. A meeting
counts once, and tidying up a record is not contact. Your interaction totals may
read lower than they did; the old numbers were wrong.

**A finished week stays finished.** A Weekly Review that said "3 tasks completed"
used to say "2" once you tidied up and deleted one of them. What happened during a
week no longer changes because of what you do afterwards.

**A project whose leftover work was cancelled can be archived.** DalyHub's way to
drop a task is _Cancel_ — and then the project refused to archive, telling you to
"complete or move the unfinished tasks". Cancelled and Someday work is not
unfinished work, and the message now says what actually blocks it.

**Checklist progress shows on a project's task list.** The same task showed
"2 of 5" everywhere except inside its own project, which is where you work from.

**Your export says what it does not contain.** Notification settings, the
notification history and your subscribed calendars are deliberately left out of a
backup — each holds a credential or a private feed address. That was true before;
it just was not written down anywhere, so a restored workspace came back missing
them with no explanation. The archive's manifest now names all three and says what
you will need to set up again.

**Changing a habit's cadence works after you travel west.** It used to fail with
an unexplained error until your local date caught up.

---

## Repeats that match how you actually work, and tasks that can wait for each other

**Two things arrived together, and they answer two different questions.** A
repeat decides _when_ a task turns up. A dependency decides _whether_ a task you
already have can be started. DalyHub keeps them apart on purpose — a dependency
will never quietly move a date you chose.

### Repeats

**"The last Friday of every month" is now a thing you can say.** Open a task's
**Repeat** control, choose **Custom…**, and beside _Monthly_ you can pick a named
weekday — the first, second, third, fourth or last — instead of a day number.
There is no "fifth Monday", deliberately: it does not exist in most months, and a
repeat that skips a month without telling you is worse than one you can predict.

**Mon/Wed/Fri is one repeat, not three tasks.** Selecting several weekdays has
always been possible; now it is guaranteed to stay one series with one history,
however long it runs.

**A repeat can end.** _Never_ (as before), _after a number of times_, or _on a
date_. The count includes the occurrence you are looking at — so "3 times" means
this one and two more — and the control says so where you type the number. An
"ends on" date is inclusive: something falling exactly on it still happens.

**Weekends are a choice, not a checkbox.** DalyHub deliberately does not offer a
box marked "skip weekends", because that phrase means three different things in
three different apps. Instead you pick what should actually happen:

- leave it on the weekend,
- move it to the **Friday before**,
- move it to the **Monday after**,
- or skip that occurrence entirely.

If a repeat gets moved off its day, the _routine_ stays where it was. "The 1st of
every month, moved to the Friday before" comes back to the 1st next month rather
than creeping earlier and earlier until it is a different thing.

### Tasks that wait for other tasks

**Open a task and you will find _Dependencies_.** Add a blocker — another task
that has to happen first — and the task says so, in words:

> Blocked by Get director approval

That line appears wherever the task appears: in your task list, on **Today**, in
**Weekly Planning**, and inside a project. A blocked task planned for today is
**still on Today**. It was your commitment, and the reason it is not moving is
exactly what you need to see.

**Nothing is moved on your behalf.** If the thing you are waiting for slips by
three days, your task stays exactly where you put it and simply says it is
blocked. No date is rewritten, no priority is changed, nothing is rescheduled.

**It keeps itself up to date.** Finish the last blocker and the task is no longer
blocked. Re-open that blocker and it is blocked again. Put a blocker in the trash
and it stops holding anything up; take it back out and it starts again. There is
nothing to refresh.

**And you can still finish a blocked task.** "Blocked" is DalyHub telling you what
was supposed to happen first — never DalyHub deciding what you are allowed to do.

**Circles are refused.** If A waits for B, then B cannot be made to wait for A —
at any distance, however long the chain — and DalyHub says why rather than
letting you build a knot that can never come undone.

**One thing worth knowing.** A dependency is between the two tasks in front of
you. If both of them repeat, next month's pair starts fresh: the relationship is
not copied forward. That is deliberate — guessing which future repeat pairs with
which is exactly the kind of quiet wrong answer this product tries not to give —
but it does mean a monthly pair is re-linked once a month.

Adding or removing a dependency, and editing a repeat, need a connection.
Everything else about them — including seeing what is blocked — works from what
your device already has.

---

## Start a project from one that already worked

**Some projects come round again.** Monthly reporting, a new client, packing for a
trip — the same twelve things, in the same order, with the same short checklists
inside them. Until now the only way to reuse that was to find last time's project,
duplicate it by hand, rename it, and then go through it deleting the parts that
had already happened.

**Now you save the shape once.** Open a project that worked, choose **Save as
template** from its ⋯ menu, and DalyHub tells you exactly what it kept — for
example _"Saved "Monthly reporting" — 12 tasks · 3 checklist items. Dates,
progress and history were not copied."_

A template holds the **shape of the work**: the task titles, what you wrote about
each one, how important each is, the order you put them in, and the checklists
inside them. It holds none of last time's **history** — no completed tasks, no
due dates, no planned days, no ticks, no waiting-on-someone, no activity. Every
task in a project made from a template arrives open, undated and unticked, which
is the point: it is the next one, not a copy of the last one.

**Templates live behind one quiet link** beside _New project_, and that link only
appears once you have one. If you have never saved a template, `/projects` is
exactly the page it always was.

**Creating from one asks you two things and no more:** what to call this project,
and which Area or Goal it belongs to. Both start pre-filled — the template's name,
and the Area the original was in — so the usual case is one edit and Enter. The
line above the button says what is about to be created before it creates it.

**Templates are editable, and safely so.** Open one to rename it, describe what it
is for, add or remove a task, reorder with _Move up_ / _Move down_, set a
priority, or add steps inside a task. Editing a template **never** changes a
project you already made from it, and editing that project never changes the
template — the record says so at the foot of its own task list, because it is the
one thing you would otherwise have to guess.

**Deleting a template deletes only the template.** Projects created from it keep
every task and are not touched.

**Search finds a template by name**, under its own _Project templates_ heading,
and opens the template itself. The tasks inside a template never appear in
search: they are the shape of work you have not started, not work you can do.

**Dates are deliberately not part of a template**, including "14 days after the
project starts". A new project arrives with nothing scheduled, and **Plan** is
where you give it days — which is what Plan is for.

---

## Your week, on one board — and your habits, at a glance

**Weekly Planning was a list of seven days, one under another.** It worked, and it
meant the week was something you scrolled rather than something you saw. Now it is
a **board**: Monday to Friday side by side, the weekend sharing the last column,
and every day showing what is already booked above what you have planned to do.

Each column shows your calendar commitments first — the time, what it is, where it
is and how long it takes — because that is what you are planning around. Under
them sit the tasks you have given that day, as small cards you can tick off where
they stand. At the foot of every column there is **Plan a task**: press it to name
that day, then pick the work from _Still to place_ beside it. Nothing is created
behind your back, and nothing is dragged anywhere — the same select-and-choose it
always was, now reachable from the day you are looking at.

**Three figures sit above the board and again below it:** what is planned, what is
still to place, and what is already overdue — plus how many hours of your week the
calendar has already taken. The **Week at a glance** bar at the foot carries all
four, and the focus you wrote in your last weekly Review is one press away instead
of taking up the top of the screen every time.

On a narrower laptop the board folds to three columns over two rows rather than
squeezing six columns into space they do not fit. On a phone it is unchanged: the
day rail across the top, and one day beneath it.

**Habits got the same treatment.** The list became a table that says everything at
once: the habit and where it belongs, its cadence, how the week is going with a
quiet bar, and **this week as seven dots** — one per day, filled where you checked
in. Days that have not happened yet are simply blank. Thursday cannot be a missed
day on a Wednesday, and DalyHub will not draw it as one.

Above the table, four figures: how many habits are active, how many today asks
for, how many check-ins the week has, and **how consistent you have been recently**
— shown as a percentage _with_ the numbers it comes from, always ("78%", and "111
of 142 expected check-ins" right beside it). It is the only percentage in Habits,
it only ever covers the last four weeks, and a stretch where nothing was expected
of you has no percentage at all rather than a zero. There is still no streak, no
flame, no chain to break and nothing that empties if you miss a day. That was never
going to change.

Beside the table there is a rail: what today is asking for (tick it off there
without scrolling), which of your goals these behaviours are supporting, and the
week in three numbers. The tabs now open on **Today** — the same habits as before,
with the ones today asks for at the top.

---

## Tasks can hold their steps now

**Some jobs are one thing to have done and several things to do.** _Prepare the
camper for the trip_ is one commitment — but it is tyre pressures, water tanks,
batteries and the fridge. Until now there was nowhere to put those four except in
the notes, where they could not be ticked, or as four separate tasks, where they
filled your Inbox and had to be planned one by one.

**Open a task and you will find a checklist.** Press _Add checklist_, type the
first step and press Enter — the box stays open, so you type the next one and the
one after that without touching the mouse. Press ⌘/Ctrl+Enter when you are done.
Click a step to rename it, tick it off, and use the ⋯ menu beside it to move it up
or down or remove it. It all works with the keyboard, and it all works with a
thumb.

**A step is not a task, and that is the point.** Checklist steps never appear in
your Inbox, never turn up in Today, never ask to be given a day in Weekly
Planning, and never change what a Project or a Goal says about your progress.
_Prepare the camper_ is one task on your list whether it has four steps or none.

**Finishing every step does not finish the task.** DalyHub shows _"4 of 4
complete"_ and says, plainly, that the task is still open until you complete it —
because there is often a last look before you call something done. Equally, when
you do complete a task, nothing tidies your steps away: if you finished two of
four and decided that was enough, the record says exactly that afterwards.

**Repeating tasks bring their checklist with them.** Complete _Monthly camper
check_ and next month's arrives with the same three checks, unticked. Last
month's ticks stay with last month.

**Where you see it.** The task's own record is where you work through a checklist.
On a laptop the tasks list, Today and Weekly Planning show a quiet _2 of 5_
beside the title so you can see how far through you are without opening it; on a
phone that count would have pushed titles onto a second line, so it stays in the
record, one tap away.

**Ticking a step works offline.** If you lose signal mid-job, ticks are kept on
your device and sent when you are back — the same way completing a task already
did. Adding, renaming, removing and reordering steps still need a connection, and
say so.

**Searching finds the task through its steps.** Look for "tyre pressures" and you
will find _Prepare camper for trip_, even though nothing in its title says so.

---

## The things you do again and again

**DalyHub now holds your habits and routines — and it does not turn them into
tasks.** Going for a walk every morning, calling your parents on Sundays, three
gym sessions a week: these are behaviours you repeat, not jobs on a list that get
finished. Until now the only way to keep them here was to make a repeating task,
which meant every morning began with something already waiting to be ticked, and
every day you skipped one made you look further behind than you were.

**Habits live on their own page.** `/habits` lists what you are keeping up, with
a schedule in plain words beside each one and where it stands today. You can start
one, describe it, change its schedule, archive it when it has served its purpose,
and bring it back if it hasn't.

**There are three ways to say when.** _Every day._ _On chosen days_ — pick the
weekdays and no others. _A number of times a week_ — three runs, any three days.
That is the whole vocabulary, deliberately: it covers what people actually keep,
and it stays readable at a glance instead of becoming a scheduling language you
have to learn.

**Today shows only what today asks for.** A habit scheduled for Tuesday appears
on Tuesday. A three-times-a-week habit stays available until the third one is
done, then steps back. Ticking one is a single tap, and tapping again undoes it —
there is no confirmation and nothing to regret. The band sits below your plan and
your schedule, so the first thing you see is still your first task.

**Nothing here keeps score against you.** There is no streak, no flame, no
counter that resets to zero and no red warning for a day you missed. Three
honest measurements, and only three: whether today is done, how this week is
going ("2 of 3 this week"), and how recent weeks have gone ("9 of 12"). A day a
habit was never scheduled is not a miss. A day that hasn't happened yet is not a
failure. Skipping a habit does not make a task overdue, does not move a project's
progress, does not dent a goal's percentage and does not appear in anything that
needs your attention.

**A habit can support a goal or belong to an area.** The goal shows the habits
behind it, and an area shows the routines that keep it running — but a habit
never changes a goal's number. A goal is measured by its own measurements; the
habit is how you get there, not the evidence that you have.

**Changing a schedule does not rewrite your history.** Move a habit from four
days a week to two and last month still says what last month actually asked of
you. The record's history strip is a small calendar you can read — and it reads
aloud properly too, day by day, rather than being a wall of coloured squares.

**Deliberately not included:** reminders and notifications of any kind, more than
one tick a day, quantities to log, and anything that would celebrate, badge or
shame you.

## A phone can reach what a phone can see

**Four things on a phone were smaller, or further away, than they were meant to
be, and now are not.**

- **Opening a task from a list.** The strip of a task row that actually opened
  the task was 20 pixels tall inside a 73-pixel row, so a thumb aimed at the
  title and hit nothing. The whole line is the target now, and the row is a
  little airier for it.
- **Typing into quick capture.** Tapping the "Add a task" field on Tasks, or the
  search field on any collection, zoomed the page in and left it there — the
  fields were a shade under the size iOS treats as readable. They are not any
  more, and nothing looks different on a computer.
- **Reading Today at 200% zoom.** The day's rows pushed the page sideways, so
  the screen had to be scrolled in two directions to read one task. At that size
  a row now puts its project, date and priority on a line of their own instead
  of squeezing them off the edge.
- **A Project in the table.** Opening a Project from the table announced only its
  name to a screen reader, where every other list in DalyHub says "Open" first.

Nothing else about these screens changed.

## Today's tasks are the same tasks

**You can now change a task from Today without leaving it.** The rows on Today's
plan were a different object from the rows on Tasks — they looked similar and they
could not do the same things. A task's project, its date and its priority were
editable on Tasks and merely printed on the screen you open first every morning.
They are now the SAME row, so everything you could already do on Tasks you can do
on Today: tick it, re-file it under a different Project or Area, move its date,
change its priority, send it to Someday / Maybe, skip an occurrence of a repeating
task, or open the full record. On a phone, swiping still completes a task one way
and opens its date the other.

**A project looks like itself, everywhere.** The small mark beside a task's
project used to be a generic badge — every Project the same colour. It now carries
that Project's own colour and glyph, the ones you see on the Projects page and on
its own record, wherever the task appears.

**Today looks like a workspace rather than a dashboard.** The greeting, the date
and Today · Tomorrow · Next 7 days are one calm heading instead of three separate
bands. The week's three figures lost their boxes and became a quiet strip — the
same numbers, the same charts, a third of the height. The day's own plan is wider
and starts higher up the page: on a 1440-wide laptop the first task is now 138
pixels further up the screen. Needs attention reads as a short list of decisions
rather than another panel.

Nothing was added that DalyHub cannot honestly back — still no productivity score,
no focus time and no invented times on tasks.

---

## Overdue, on the record — and the lists get out of the way

**Analytics now says what you have NOT finished.** It reported four things you
had completed and nothing about the backlog, which for most workspaces is the
more useful half. There is a fifth figure — how much is overdue — and a chart
beneath the other two showing which way it has gone over the period you are
looking at. The chart is drawn in the product's amber, because a backlog really
is a status; the sentence beside the figure stays the same calm grey as its
neighbours, because "4 fewer than the previous period" is arithmetic and not a
telling-off. Nothing about this goes into your notifications — Today is still
the one place that says what needs you now.

Two honest limits are printed under the figures rather than buried: a past
reading uses each task's due date **as it stands today**, and counts only tasks
that still exist. Change a due date or delete a task and its history here changes
with it, because DalyHub keeps no record of what a due date used to be.

**People leads with what connects you to someone, not with what is missing.**
Every row used to end in "No shared history yet" — a list of relationships whose
loudest statement was a reproach. A row now opens with the things you actually
share: when you last spoke, how many open tasks are between you, which projects
you are both on. "No shared history yet" is still there, quietly, where it
belongs. Rows are all the same height now too, so a person you know well no
longer takes up more of the screen than one you have just added.

**Notes.** "+ New note" is back at the top of the page, where every other
collection keeps its create button. Previews are two lines instead of one, so the
opening sentence of a note is actually readable from the list. Tags are chips you
can count rather than a comma-separated run of grey text. And the editor has
stopped printing the maximum note size under everything you write — the limit has
not changed, you are simply only told about it when you are near it.

**Goals had two rows of filters; now it has one.** All, On track, Needs
attention, Completed and Deleted are one strip, and the space beside the page
title is empty again. Nothing moved anywhere you cannot find it: Deleted is the
last tab, and the same strip is there when you are in it, so the way back is
where the way in was.

**Projects opens as a table when you have a lot of them.** Above forty in
whatever you are looking at, the page starts in the table view instead of the
gallery — at that size you are looking _for_ a project, not _at_ your projects.
If you pick a view yourself it is remembered in the address, honoured whatever
the size, and never quietly changed back.

**On a phone, project cards are rows.** They were nearly a third of the screen
each, so three fit; now five or six do, and everything that mattered on them —
the mark, the name, the progress, the line telling you what is wrong — is still
there. Only the description went, and that is on the project itself.

**Smaller things you may notice.** The chip showing which subset you are looking
at no longer shouts louder than the name of the page it sits next to. The labels
on the phone's bottom bar no longer get trimmed on handsets with a rounded screen
or a home indicator, and "Add" sits level with its neighbours instead of a few
pixels nearer the edge. The People list has lost the white card it sat on, so it
reads like the Notes and Tasks lists do. And the Projects table no longer makes
the whole page slide sideways on a phone.

---

## DalyHub can now tell you things

Until now, everything DalyHub knew reached you only when you opened it. A
registration expiring next week, a waiting item ageing quietly, the day already
assembled — all correct, all sitting there, none of it going anywhere. If you
were away for a fortnight, the rego expired in silence.

**A short digest each morning.** One message, at a time you choose, in your own
timezone: what is on today, what is overdue, what is unfiled, what is waiting and
how long, any asset obligation needing attention, and anything drifting. It is the
same information Today's attention rail shows — the same numbers from the same
place, so the two can never tell you different things.

**On a day with nothing to report, nothing is sent.** That is deliberate, and it
is the most important thing about it. A daily "all clear" would teach you to stop
reading the channel, and then the one morning that matters is the one you skim
past. Silence from DalyHub means there was nothing to say.

**A heads-up before an asset obligation falls due** — 30 days, 7 days and 1 day
before. Each one is sent once, ever. You will not be told about the same renewal
every morning until you deal with it.

**A bell in the top bar**, with a count of what you have not read. It opens a log
of what DalyHub has actually told you and when — newest first, tap to go to the
thing it was about. It is a record, not a second to-do list: Today remains the
place that says what needs you now, and if the two ever seem to disagree, Today is
right.

**On your phone, if you want it.** Connect a Pushover account in Settings and
every notification arrives there as well. DalyHub is straightforward about the
trade: your notification list never leaves this workspace, but a Pushover message
does — the title and body, which can include a record title and a date, pass
through Pushover's servers under their retention policy. DalyHub will not switch
the channel on until it has sent a real test message and you have received it.

**All of it is off until you turn it on**, and turning the whole thing off makes
DalyHub completely silent again. What DalyHub deliberately does NOT do: notify you
about individual overdue tasks (they change every day — they are counted in the
digest instead), offer a snooze, or have any way to send an alert that keeps
sounding until you acknowledge it.

---

## Today becomes the command centre

Today has been rebuilt around the picture you approved. It is the same screen in
the sense that matters — it still opens on the day, and the day is still the
first thing you can act on — but there is a good deal more of your life on it
now, and none of it is invented.

**The week's figures are back at the top.** Tasks completed, tasks captured, and
how many of your measurable Goals are on track, each with a small chart beside
it. They are about the _week_, not about the list underneath them: a number that
counts what you can already see two inches lower is a caption, not a measure.
Both figures cover the last seven days, and they say so — not "this week", which
would mean three days on a Wednesday to you and seven to the arithmetic.

**Your day and your schedule sit side by side.** Today's plan keeps its three
bands — overdue, due today, planned today — and now ends each row with the
Project, Goal or Area it belongs to. Beside it, the Schedule panel has gained a
**week strip**: the seven days of this week, with a dot under any day that has
something on it. Tap a day and the timeline below shows that day. It is instant,
because the whole week was already loaded — and it never calls a day you have
selected "Today" when it isn't.

**Capture without leaving the screen.** A Quick capture card, with a place to
start typing and four buttons — Task, Note, Diary, Meeting. They open the same
capture panels the `+` in the top bar opens; there is no second way to create
anything, just a second door to the one that exists.

**A daily reflection.** If you have written a Diary entry today, its opening
shows here. If you have not, it asks what went well and opens the Diary. It does
not read what you wrote, score it, or congratulate you on a streak.

**What is deliberately not here, and why.** The picture shows a "Focus time" card
reading 6h 45m, and a "Productivity score" of 78. DalyHub does not time you — no
timer, no sessions, no field one could be worked out from — and it does not grade
you, anywhere, on purpose. Rather than fill those two spaces with something
plausible, they are empty and this is the note that says so. For the same
reason, tasks on the plan carry no clock time: a task in DalyHub is a _date_, and
a time beside one would be a number nobody entered. The times you see in the
Schedule are real, because a meeting genuinely happens at one. The picture's
"Reminder" and "Upload" buttons are absent too — DalyHub cannot yet remind you of
anything outside the app, and cannot attach a file, and a button for neither is
worse than no button.

Everything still works at a phone's width, in both light and dark, and a quiet
day is still a short page.

---

## Areas open as a grid, like Projects

The Areas page opened as a list of rows while Projects opened as a gallery of
cards, which made two halves of the same spine feel like two different products.
Areas now opens as a **grid**, with a **Grid / List** toggle beside it — the
same control, in the same place, as the Grid / Table toggle on Projects.

The list is still there and still does what it always did: more Areas on screen
at once, in a denser read. The toggle lives in the address bar, so a view you
like is a link you can bookmark, and Back and Forward work the way they should.

An Area card says the three things an Area has — what is living in it, how much
is waiting in it, and when it last moved. It still has no progress bar: Areas
never complete, so there is nothing for one to measure.

---

## Areas, Projects and Goals get a colour and an icon you choose

Every Area, Project and Goal has always had a colour. You have never been able to
pick it — the product worked one out from where the record sat, and gave you six
to work with. Now there are sixteen, and you choose.

**Choose a colour and an icon in one place.** Open any Area, Project or Goal's
settings and the Appearance section shows both together, with a live preview of
the combination: pick a flame, pick red, and you can see the red flame before you
apply it. The icon grid draws every glyph in the colour you are trying, because
what you are choosing is what the record will look like, not two separate things.

**A hundred and one icons, up from thirty-four.** The old set covered the parts of
a life the product had built modules for. This one covers the parts of a life you
actually run: a heart, a dumbbell, a pair of running shoes, a book, a plane, a
tent, a coffee, a paw, a piggy bank, a guitar. Search it — typing "gym" finds
Fitness — because a hundred options without a filter is a wall.

**Or leave it Automatic.** The no-choice option is still there, it is still the
default, and it now tells you which colour it currently resolves to rather than
asking you to trust it. **Every record that has never chosen anything looks
exactly as it did yesterday** — the automatic colours are the same six, in the
same order, on the same records.

**Goals can have an identity of their own.** They used to borrow their Area's icon
and colour with no say in it. A Goal can now choose either, or both, or neither —
and a Goal that picks a heart but no colour keeps the heart and takes its Area's
colour. The control is on the Goal itself, under **Appearance**, and it tells you
which Area colour it is currently borrowing before you decide to stop.

**Your choices survive an export.** Backups and archives carry the colour and the
icon you picked, for Areas, Projects and Goals alike, so restoring a workspace
restores what it looked like — not a reset to the defaults.

**The identity follows the record everywhere.** The colour you choose paints the
record's tile, its progress bar, its chart line, its Area pill and its chip — on
the gallery, in the table, on Today, on your phone. One record, one colour,
everywhere. The tiles themselves are redrawn to match the design reference: a
whisper of colour behind a fine coloured edge, with the icon in the full colour
rather than a muted one on a pastel square.

It all works in dark mode, and every colour is contrast-checked in both.

---

## Projects and Goals became workspaces (REDESIGN-04)

The last pass reconciled the spine's competing designs and fixed dark mode; it
deliberately stopped short of rebuilding Projects, Areas and Goals. This one
finishes that.

**Projects is a gallery you can actually work from.** The page now opens with
what the workspace holds — "8 active · 2 archived" — rather than how many rows
happen to have loaded, and there is a **search box** in the header: type, and
the gallery narrows. The address bar remembers, so a narrowed list is something
you can bookmark or send to yourself, and Back returns you to it rather than to
the unfiltered page.

Every card was rebuilt to the design. The coloured tile sits alone at the top
with the ⋯ opposite it, which gives the name the full width of the card — long
Project names stopped being truncated. Beneath the progress bar there is now a
plain line of facts: **"14 tasks · 4 due this week"**. If something is overdue,
the due count is tinted and the state dot beside it says so — but the words are
always there, so nothing depends on seeing a colour.

**There is a table view.** The toggle at the right of the tab row switches the
same Projects between the gallery and a table with Area, progress, task counts
and the last update in columns. It is the same records in the same order — just
drawn for scanning instead of for browsing.

**Goals is now a workspace rather than a wall of cards.** The list is on the
left — each Goal with its bar and its own honest figure at the end of the line
("60.0 / 70 kg", "12 / 24", "75% complete") — and the Goal you select fills the
panel beside it: its name and Area, then **Current / Target / Target date** as
three equal figures, then the chart. Selecting a Goal changes the address, so
you can link straight to one, and Back behaves. On a phone the two are two
screens, with a way back to the list from either.

**The chart now shows where you are heading.** The solid line is still only what
you have recorded. A **dotted line** continues from your last reading to a
marked point at your target date — the path that would get you there on time.
It appears only when you have set both a target and a date; DalyHub will not
guess a future it cannot know.

**You can add a Goal from Goals.** Until now a Goal could only be created from
inside an Area, which meant leaving the page you were on to find the button.
There is an **Add goal** action at the foot of the list — and because a Goal
always lives in an Area, choosing one is the first thing it asks.

**The Projects page shows your Goals.** A compact three-Goal section sits under
the gallery, with **View all** through to the workspace — so the work and what
it is for are on one screen.

**Linked projects are on the Goal itself.** The Projects advancing a Goal are
now small chips on its overview, each opening the Project, with **Link project**
beside them to attach another.

**The colours are the concept's own.** Project, Goal and Area identity used to
draw from a palette of mint, lavender and aqua — pastel tiles with near-black
icons, which is the Material look rather than DalyHub's. The six identity
colours are now sampled from the design itself: violet, green, red, orange,
blue and teal, each drawn as a soft tint of its own hue with the colour itself
as the icon, and the same colour on the progress bar beneath. They no longer
shift with the colour scheme you pick, which is what an identity colour was
always supposed to mean.

Areas were left alone, deliberately. They already read the way they should: a
quiet list of the permanent parts of your life, with no progress bars and no
invented scores, because an Area is never finished.

Everything above is the same in dark mode, and every figure on screen is a real
one — where DalyHub does not have a number, it says so rather than showing a
zero.

---

## Today, Projects, Goals and Areas, converged (REDESIGN-03)

DalyHub had been through several redesigns, and the last merge brought two of
them together without deciding between them. This pass decided.

**Dark mode now exists.** This is the big one. Choosing Dark used to repaint a
few badges and leave the page, the sidebar and every card white — because the
colour palette the redesign introduced had only ever been given light values.
It has both halves now: a near-black frame, a charcoal sidebar, cards that sit a
step above the page, quiet borders, and red, orange, blue and grey that still
mean what they mean. Every screen, not just the ones in this pass.

**Today opens on your day, not on statistics.** The morning screen had grown two
rows of number cards and a chart, and on a phone you could scroll past all of it
without seeing a single task. Nearly every number was counting something printed
in full a little further down the same page: "Overdue 44" sat above the overdue
list, "Meetings today · Next 20:00" sat above the meeting it was describing, and
the week's chart restated the two figures directly above it.

They are gone. What is left is one row of three measures about the week —
completed, captured, and Goals on track — and then the day. On a phone the
measures are a compact band rather than three tall cards, so the first thing you
see is the first thing you have to do.

**No more "Daily progress" percentage.** It divided what you had finished by
however many tasks happened to carry today's date, which meant a day with three
tasks scored better than a day with twelve. DalyHub does not measure your life as
a percentage — Analytics has refused to for a while, and Today now agrees.

**The empty rectangle under Today is gone.** The day's work and the things around
it were laid out as three columns forced to the same height, so a short day left
a large blank area sitting directly under your tasks. Your work now has a column
of its own with a single supporting rail beside it, and the page ends where its
content ends.

**Trends live in Analytics.** Today's week chart could not be read on a busy week
— one heavy day flattened the rest to hairlines — and Analytics already does this
properly. "Tasks completed" on Today now takes you there.

**Projects scan faster.** Project names were a pixel too large, which wrapped the
longer ones onto a second line and made every card in the row as tall as the
worst one. Titles are smaller; the gallery is even again.

**Goals read as one measurement.** "83 kg" was printed half as large again as the
Start, Target and Remaining figures beside it, so it stopped being the lead
number in a set and became a banner with three captions. All four can be read
together now, and the grey slab behind the pace figures is a quiet line instead.

**Areas were left alone,** deliberately. They are quiet, they never imply a
percentage complete, and that was already right.

---

## The refinement pass (FINAL-UI, part two)

The redesign landed the structure. This pass made it confident.

**Card edges you can actually see.** Every card in DalyHub was outlined with a
grey so pale it read as a smudge, while every list of rows carried a line under
each one — so the boxes disappeared and the lists looked like a grid. There are
two greys now: a firmer one for the edge of a card, and a fainter one for the
rule between two rows. Cards look deliberate; lists look calm.

**Today is one screen, not five boxes.** The day's tasks sit in a card, and
everything beside it — what needs attention, what to continue, your goal progress
— sits on the page as plain sections. Goal progress in particular used to be four
outlined tiles inside an outlined panel; it is now just the goals.

**Meetings says more.** Each meeting shows how long it runs, taken from the end
time already on the record, and each day heading carries its count in the same
style Tasks uses.

**The diary reads like a diary.** An entry used to stretch across a 1100-pixel
card with the words in the left third. It now has a reading width.

**Task titles lead.** A task's title is a shade heavier than the date, project
and priority beside it, so your eye lands on the work rather than on the columns.

**Settings' heading is the same size as every other page's.** It was the biggest
and the lightest title in the app.

**On a phone**, the List / Board / Calendar tabs are plain text with an underline
— the same control you see on a laptop, instead of a lozenge that only appeared
on small screens. A goal's description trims to two lines so one goal cannot fill
the screen, and Settings' descriptions line up with their headings again.

Nothing moved, nothing was removed, and there is still no horizontal scrolling at
any phone width from 320 pixels up.

---

## DalyHub looks like DalyHub (FINAL-UI)

Three approved design concepts settled what DalyHub should look like, and this
release makes the running application match them.

**The sidebar is light now.** It used to be a near-black column down the left of
every screen. The approved design draws it near-white, one shade under the page,
with a hairline between them — so the darkest thing on screen is your own text
rather than the furniture around it. The page you are on is a soft violet row
with a violet label instead of a solid violet block.

**Tasks got a lot faster to scan.** A task row was 56 pixels tall; it is now 36 —
about nine more tasks on a laptop screen without scrolling. The column header
above the list is gone, the date now comes before the project (you ask "when"
before "where"), priority is a small coloured flag instead of a filled capsule,
and "Overdue · 20" is written in red at the top of its group rather than in grey
small capitals. On a phone the project name now trims with an ellipsis instead of
running into the priority flag, and a 320px screen no longer starts every row
with a stray dot.

**Today opens on your day.** Two large figure cards used to sit between the
greeting and your first task. They have moved to the bottom of the page, where
the concept puts them — so the first thing on screen is what is overdue and what
is due today, then your schedule, then your goals, and only then the numbers.
The greeting is also the same size as every other page title in the app; it used
to be the largest text anywhere in DalyHub.

**Goals cards are shorter.** A goal's reading — "8.1 km", "$25,600", "83 kg" —
was set at headline size and forced a 235-pixel card for six facts. It is now
about 145 pixels, and the chart and the progress bar carry the visual weight,
which is what makes a page of goals read as progress rather than as numbers.

**Settings reads like a list of places to go.** Each section already had a line
saying what is inside it — "Appearance, where DalyHub opens, and how new work
starts" — and it was only shown on the phone. It is visible everywhere now.

**Smaller things.** The Active / Archived / Deleted control lost its grey tray:
the current one is a filled chip and the rest are plain text. The "+ New" button
in the top bar is quieter, so each page has exactly one bold button — its own.
Assets' search and tag boxes share one line again instead of stacking, with
"Filter & sort" at the right where it belongs. And the whole thing works the same
way in dark mode, which was designed rather than inverted.

**Nothing about how DalyHub works changed.** Same records, same routes, same
data, same keyboard shortcuts. On a touchscreen every button and checkbox keeps
its full comfortable size — the tighter rows are for a mouse.

---

## The whole app, brought onto one design (DS-05 – DS-08)

DS-04 rebuilt Tasks. This finishes the job everywhere else: Projects, Areas,
Goals, Today, Notes, Diary, Meetings, Reviews, Analytics, Settings and every
dialog, drawer and empty state in between.

**Cards look like one thing now.** Every card in DalyHub — a project, a goal, an
area, a person, a settings group, a dashboard panel, an empty state — draws the
same edge: a thin hairline, a small corner, and no shadow. They used to disagree,
and a gallery of project cards read like a different application from the panel
sitting next to it.

**Projects got shorter and easier to scan.** A project card was 215 pixels tall
for six facts and is now 117. The percentage used to be the biggest thing on the
card, larger than the project's own name; it is now small text at the end of its
progress bar, where you read it anyway.

**Goals stopped being coloured blocks.** A goal's current reading — "8.1 km",
"$25,600", "83 kg" — used to sit inside a large filled pastel panel, so a page of
goals read as a page of colours. The reading is now simply the largest text on the
card, and the goal's colour survives where it means something: the icon, and the
progress bar.

**Today uses the whole page.** There was a large empty area in the bottom-left of
the dashboard with your goal progress stranded below it. Goal progress has moved
up into that space, so what you are working towards is visible without scrolling.
The heavy red bar down the side of your overdue work is gone — the "Overdue"
heading and the dates already say it.

**Areas reads as a list.** It used to be a list inside a floating panel on a grey
page. It is now rows on a white page, like Tasks, and each row is shorter.

**Every collection has the same header.** The count sits next to the page title
rather than on a line of its own, and every "new" button looks the same: a plus,
then the words. Six screens each did this differently.

**Settings stopped looking like a different app.** Choosing an appearance, a
colour scheme or a settings section used to fill the whole row with solid
lavender. Selection is now a quiet tint, the same one the sidebar and every menu
use. The tick and the radio button still show you what is chosen.

**Small things that were wrong.** The weekly chart on Today printed "4 0" under
Sunday, which reads as "forty" — the two figures are now separated. A mistyped web
address produced a page with no title at all, which matters for screen readers and
browser history; it has one now.

**Checked, not assumed.** Every screen was checked at phone, tablet, laptop and
wide-screen sizes in both light and dark, for sideways scrolling, small touch
targets and accessibility problems. Nothing scrolls sideways at any width.

---

## Tasks, rebuilt as a list (DS-04)

Tasks is the screen you spend the most time on, and it now looks like it.

**The list stopped being a stack of cards.** Every task used to sit in its own
rounded, bordered panel on a grey page. Tasks are now plain rows on a white
page, separated by a hairline, in real columns — **Task · Project · Due ·
Priority · Status**, with the column names above them. Dates line up, projects
line up, and the list starts a little higher up the page.

**Rows say less, and mean more.** A project is a small coloured dot and its
name instead of a bordered tile. A date that has passed still says so in
words — `Yesterday`, `20 days ago`, `3 months ago` — but it no longer counts
up forever: anything older than a year now reads `Over a year ago` instead of
`9722 days ago`, and it is coloured without also being bold. Priority is a
coloured dot and `P1`. The only coloured pill left on a row is the status, and
only when the status says something the rest of the row does not.

**Overdue is calmer.** The completion circle no longer turns crimson. The date
already says the task has slipped, and the heading above it already says
Overdue; a red ring on the button that finishes the task was alarm, not
information.

**Adding a task is now just the next line.** The capture field was a large box
with two buttons above the list. It is now the row above the first task, same
size, same shape. Type, press Enter, keep typing — exactly as before.

**Choosing a project, a priority or a date got faster.** The project menu used
to show five projects at a time in three-line rows that ran off the bottom of
the screen. Options are one line each now, so you see about fourteen, the name
you picked carries a tick, and there is a **Search all Projects and Areas…**
entry at the bottom for everything not in the list. Choosing a value replaces
the old one — there was never a need to clear it first, and now nothing implies
there is.

**On a phone, a task is two lines instead of a squeeze.** The title gets the
whole width and no longer gets cut to "Chase the plu…"; the project, the date
and the priority sit underneath it. The filter tabs across the top are quiet
text with a purple underline instead of solid purple buttons running off the
edge of the screen.

**The task panel is no longer purple.** Opening a task used to show a
lavender-tinted panel with two white cards inside it. It is now a plain panel
with the sections separated by lines, and its buttons are the size of their
words instead of the width of the panel. Purple is back to meaning "this is the
action" and "this is selected".

Nothing about how tasks work changed: the same dates, the same priorities, the
same Inbox, the same recurrence, the same filters, sorting, grouping and saved
views, and the same links you can share.

---

## A new frame for the whole app (DS-03)

This is the change you will notice before you read anything: the sidebar is now
a dark column down the left of the window, in the light theme as well as the
dark one, and the app is arranged around it.

- **The sidebar went dark.** It is the same navigation, in the same order, with
  the same destinations — but it now reads as a quiet frame around your work
  rather than a second page beside it. Whichever section you are in is marked
  with a solid purple block, so "where am I" is answered from across the room.
- **Your account moved to the bottom of the sidebar.** It used to sit in the top
  right. The sidebar now opens with DalyHub and closes with you, and the top of
  the window has room for the thing you actually use.
- **Search moved to the top left.** It is a proper field again, at the start of
  the row, lined up with the page title underneath it and the first card under
  that. `/` still opens it and `⌘K` still opens the command palette.
- **The top bar is shorter and the page starts higher.** Roughly a third less
  chrome above the first task on an ordinary laptop screen.
- **Laptops get more room.** The navigation rows are tighter, so the whole
  sidebar — including your account — fits a laptop screen without crowding, and
  every destination is still one click away.
- **Tablets get their own layout.** Between phone and laptop size the sidebar
  becomes a narrow column of icons, giving about 150px back to the page. Hover
  or focus an icon and its name appears; nothing is hidden from a screen reader.
- **Wide screens line up properly.** On a large monitor the page title used to
  drift right of the list it was titling. Everything now starts on one line, at
  every window size.
- **The phone is tidier.** The top bar is shorter, and the navigation menu's two
  large search buttons are now ordinary compact fields. The bottom bar —
  Today · Tasks · Capture · Diary · More — is unchanged; it was already right.
- **Dark mode was designed, not inverted.** The sidebar is the same object in
  both themes and the selected section is a confident purple in both.
- **A keyboard fix that came with it.** The focus outline was too faint against
  the new dark sidebar to meet the accessibility contrast standard, so the
  sidebar draws its own. Every destination keeps its name for a screen reader at
  every window size, including when the sidebar is collapsed to icons.

Your routes, shortcuts, search, command palette, settings and sign-in are
unchanged. Nothing moved except the frame around them.

---

## A tighter, quieter interface (DS-02)

DalyHub's buttons, fields, menus and dialogs have been rebuilt on one shared
foundation, and the first thing you will notice is that the desktop app has
stopped feeling like a phone app on a big screen.

- **Controls are smaller, and there is more on screen.** A button, a text field
  and a dropdown are now about a quarter shorter on a computer, which means a
  form, a filter row and a menu all take less room and less scrolling.
- **Buttons stopped being lozenges.** Every button now has the same softly
  rounded corners as the field beside it, so a toolbar reads as one set of
  controls rather than a row of unrelated shapes.
- **Purple means one thing again.** Secondary buttons — Cancel, Reset, Filter &
  sort — used to be filled with a second shade of purple, which made it hard to
  see at a glance which action was the main one. They are now plain, with a fine
  outline. The purple is saved for the action you actually came to do.
- **Status labels are smaller.** A status like "In progress" no longer stands as
  tall as the row it is describing.
- **Menus feel like a desktop app.** Shorter rows, a crisper edge and a lighter
  panel, so a long menu is a list you can scan rather than a wall you scroll.
- **Nothing shrank on your phone.** Every button and field on a touchscreen is
  exactly as large and as easy to hit as it was — the tighter sizing applies only
  where there is a mouse or a trackpad. Text still stays large enough that tapping
  a field never zooms the page.

Everything works the way it did. This changes how DalyHub looks, not what it
does, and it is the groundwork for the wider redesign that follows.

---

## Your real day, on Today (CAL-01)

Today has always been honest about your tasks and completely blind to everything
else. If you had four meetings, a workshop and a dentist appointment, it still
showed you three tasks and implied a free afternoon.

You can now **connect your calendars** — Settings → Calendars — and DalyHub shows
your actual day alongside your work.

- **Add a calendar with a name and a link.** Nothing to install, no sign-in to
  Microsoft or Apple, no permissions to grant. Publish your calendar from Outlook,
  iCloud or anything else that produces a standard calendar link, paste the link,
  and give it a name you will recognise on your schedule — "Work", "Family",
  "Kids". Add as many as you like, up to ten.
- **Read-only, always.** DalyHub never creates, edits, moves, cancels or replies to
  anything in your calendar. Nothing you do here can change what your calendar
  shows.
- **Your day, in one list.** Today's Schedule now holds every event from every
  calendar you have connected, in time order, with all-day items — leave, a public
  holiday, a training day — in their own small band above the timed ones rather
  than pretending to start at midnight. **Now** and **Next** are marked, in words.
- **Tomorrow and Next 7 days.** Three tabs under the greeting: _Today · Tomorrow ·
  Next 7 days_. Tomorrow shows tomorrow's schedule and the work you have due or
  planned for it. Next 7 days is a compact forward agenda — what is on each day,
  and one line saying how much work you have planned. It is deliberately not a
  month grid: DalyHub is not trying to replace your calendar.
- **Turn an event into meeting notes, when you want to.** Tap any event to see it
  in full — time, place, which calendar it came from, and a **Join meeting** button
  when there is an online link. If it is the kind of meeting you want to prepare
  for and follow up, **Create meeting notes** makes an ordinary DalyHub Meeting,
  with agenda, notes, decisions, outcomes and actions. After that the event shows
  **Open notes** instead, and it can never accidentally make a second one.
- **Your notes are yours.** If the meeting is renamed or moved in Outlook, the
  event on your schedule updates and your notes do not — DalyHub will not rewrite
  something you wrote. If the meeting is cancelled, the event says so and your
  notes stay. Even removing the whole calendar leaves your meetings untouched.
- **It tells you the truth about freshness.** Calendars refresh in the background
  roughly every 15 minutes, and there is a **Refresh now** button. A calendar that
  has never worked says "Never synced" — never "Connected". If a refresh fails,
  DalyHub keeps showing the last schedule it did load and says so, rather than
  quietly showing you an empty day.
- **Your calendar link is treated like a password.** It is encrypted before it is
  stored and never shown again — not on the page, not in an error, not anywhere.
  Anyone holding that link can read your calendar, so DalyHub treats it that way.
- **Only what a schedule needs.** DalyHub imports the title, the time, the location
  and an online meeting link. It does not import event descriptions, attendees,
  organisers or attachments, and it never creates People from your calendar.

Two smaller fixes came with it: **the meeting rows on Today used to lead to a
"page not found"**, and are now correct; and **pressing Refresh shortly after a
background refresh** used to silently do nothing and claim one was already running.

---

## DalyHub on an iPhone, sanded down (MOBILE-01)

DalyHub already worked on a phone. This is the pass that makes it feel like it was
_meant_ for one. Nothing moved, nothing was redesigned, and no feature was added —
a phone audit at the four iPhone widths (320, 375, 390 and 430 points) turned up a
short list of things that were genuinely annoying, and they are fixed.

- **Tapping "more" on a task now opens a proper sheet.** The ⋯ menu used to open a
  narrow box floating in the middle of the list, with actions wrapped onto three
  cramped lines. It now slides up from the bottom of the screen, full width, one
  comfortable row per action — the same sheet the rest of the phone product
  already uses. On a computer it is unchanged.
- **Save is where your thumb is.** On a new Person, a new Project, a new Note, a
  Diary entry, an Asset renewal and twenty-one other forms, the Save button used
  to sit at the very bottom of a long scrolling page — under the keyboard, past
  every field. It now stays pinned above the keyboard and above the bottom bar, so
  you can commit the moment you are ready.
- **Tapping a field no longer zooms the page.** Searching Notes or People, or
  changing a Reviews filter, used to make Safari zoom in and leave the page
  scrolled sideways with the header off screen. Every text field in DalyHub is now
  large enough that it never happens.
- **Ticking a task off Today is much easier to hit.** The circle looks the same;
  the area your thumb actually has to land on is now more than four times bigger.
  Opening a task by its title got the same treatment on every list.
- **The Diary shows the whole week again.** Saturday and Sunday used to be
  scrolled off the end of the day strip with nothing to say so. All seven days are
  now on screen, the same size, and considerably easier to tap.
- **A Project page stops sliding sideways.** A task with a long "Waiting for" note
  could push the entire page wider than the screen, dragging the bottom navigation
  bar with it. It cannot any more.
- **Small things that were quietly wrong.** A record's tab strip no longer shows a
  tab cut down to a single letter, and now shows a soft edge when there is more to
  scroll to. Today's "No measurable Goals yet…" line reads as a sentence instead of
  three columns. The Tasks quick-add no longer cuts its own prompt off mid-word.
  Goal cards are tighter, so two fit on a phone screen instead of one and a half.

---

## Your tasks keep working when your phone loses signal (PWA-12)

Until now, losing your connection meant DalyHub could still _show_ you your tasks
but not let you change them. Tick a task in a lift and nothing happened; tap one to
open it and you got "Something went wrong". That was the honest behaviour for a
product that had only ever promised offline _capture_ — but it is not the behaviour
of something you run your life on.

You can now keep doing the Task work that actually matters through a temporary
outage. **Complete a task, reopen one, rename it, change its priority, or move its
due or planned date** — using exactly the same controls you use online. There is no
offline mode to switch on and no separate editor to learn.

- **Your change shows immediately, and DalyHub tells you the truth about it.** The
  row updates the moment you make the change, with a quiet "Waiting to sync" beside
  it. That line is the point: DalyHub will never tell you something is saved when
  it is only saved on your phone.
- **It survives.** Close the tab, reload, restart the browser, lose signal again —
  the change is still there, still waiting.
- **When you reconnect, it just goes.** No "Sync now" to press for ordinary
  changes. The pending note disappears when DalyHub actually has your change.
- **Repeating tasks stay correct.** Tick off a recurring task offline and you get
  **exactly one** next occurrence when it syncs — not two, not none — even if the
  connection wobbled halfway through sending it. DalyHub does not guess at the next
  date on your phone; the real scheduling rules run on the server, once.
- **If something changed on another device, DalyHub asks instead of guessing.** If
  you renamed a task on your phone while it was offline and the same task changed
  elsewhere, you will see: _"This task was renamed on another device while you were
  offline"_, both versions side by side, and two buttons — keep yours, or keep the
  one DalyHub has. Neither side is ever thrown away quietly.
- **If your sign-in expired while you were away, nothing is lost.** DalyHub pauses,
  says you need to sign in again, and picks up where it left off afterwards.
- **When there is nothing waiting, nothing appears.** No sync icons on every row,
  no cloud badges, no green ticks. A normal task list looks completely normal.

Two other things were fixed on the way. **Opening a task while offline no longer
breaks the page** — it used to reload data it did not need, which failed with no
connection. And **reconnecting now actually reconnects**: DalyHub could notice the
network had come back without acting on it, so a change could sit waiting longer
than it should have.

This is deliberately a first slice. Everything else — Projects, Goals, Notes,
Diary, Meetings, and moving a task to a different Project — still needs a
connection, and says so.

---

## Type the routine, not the form (TASKS-11)

Some jobs do not repeat on a calendar — they repeat _from the last time you did
them_. Servicing the Hilux six months after the last service is not the same thing
as servicing it every 1 March, and DalyHub has known the difference since Recurrence
2.0. Until now you had to say so in the recurrence editor after capturing the task.

Now you can say it in the sentence:

```
Service Hilux every 6 months after completion
```

That creates a task called **Service Hilux** that repeats **6 months after
completion** — the same rule, in the same words, that you would have built by hand.
Finish it on 18 August and the next one lands on 18 February; finish it late and the
whole schedule moves with you, which is the entire point.

Five other ways of saying it work as well — _after completed_, _after completing_,
_after finishing_, _after I complete it_, _after I finish it_ — and you can lead with
_repeat_ if that reads more naturally to you. It works everywhere you capture: the
quick-add row, the Create panel, the full task form, and the Shortcut on your phone
(so Siri and the Share Sheet too). There is nothing new to learn per surface, because
there is only one thing to learn.

Two smaller things came along with it. **Days now count** — "every 14 days" was
oddly missing while "every 2 weeks" worked — and so does **every 1 month**, for when
that is simply how you would say it.

What has _not_ changed is the promise underneath. **"Pay rent every month" still
means a fixed schedule**, and nothing but the words _after completion_ (or one of
those five siblings) will ever move a task from one kind of repeat to the other.
DalyHub does not guess:

- _Discuss monthly report format_ is a task called exactly that.
- _Research six month service intervals_ keeps all five words.
- _Review tomorrow's agenda_ is not scheduled for tomorrow.
- _Regularly check the camper_, _Service Hilux when needed_ and _do this every so
  often_ become ordinary tasks with your words intact — no invented date, no invented
  repeat, no project chosen for you.
- _every 999999 months after completion_ is not a repeat; it is a sentence, and it
  stays one.

And when DalyHub does recognise something, it shows you: the interpretation appears
as removable chips before you save, so you can always put a word back. None of this
uses AI. It never has, and this part never will — capture has to work the same way
every single time.

---

## Today says which work is due and which you planned (TODAY-10)

Today's Focus panel had one list called **For today**, and it held two different
kinds of commitment without saying which was which: work whose deadline is today,
and work you deliberately planned for today but that may not be due for weeks. A
task due in six weeks sat in that list looking exactly like a deadline — and the
same task on **Tasks → Today** plainly showed its real due date, so the dashboard
was the less clear of the two screens.

- **Focus now has up to three named bands** — **Overdue**, **Due today** and
  **Planned today** — inside the same one panel. Each appears only when it holds
  work, so an ordinary day with nothing separately planned is still one list. A
  task that is both due and planned today appears **once**, under Due today: a
  deadline outranks an intention.
- **The order is priority, then the nearest deadline, then the title.** It was
  alphabetical, which meant a P1 could sit ninth because its title began with a
  W. Where a task has a priority the row now shows it, using the same P1–P4 tag
  the Tasks list uses. Nothing is grouped or coloured by priority.
- **Ticking an overdue task no longer makes it jump.** It used to vanish from the
  overdue rows and reappear at the very bottom of the day's list, under a heading
  that was not true of it, while a previously hidden overdue task took its place.
  A completed task now stays, dimmed, exactly where it was.
- **A big day stays a dashboard.** Focus draws at most eight of the day's own
  rows and then says _View all 14 tasks for today_, linking to the full list.
  Nothing is truncated silently, and the planned band is never squeezed out
  entirely to make room for deadlines.
- **Overdue with nothing else on** now says so — _Nothing else planned today_ —
  instead of ending after the slipped rows and implying the day was full.
- **A paused task is no longer counted as today's work by one screen and not the
  other.** A task you put On hold is not today's work, which is what Today
  already believed; **Tasks → Today**, **Upcoming** and **Overdue** now agree
  with it, exactly as all four already agreed about a task you are waiting on.
  Both remain fully reachable in **All active** and through the status filter.

On a phone the row keeps the title and the project and drops the priority tag, so
the task's name stays the widest thing on every line from 320px up.

---

## Two fixes you would have met on a phone (HARDEN-02)

> **A note for anyone who upgraded from an interim build of this branch.** An
> earlier revision renamed a database migration, which would have made your copy
> of DalyHub try to apply it a second time and stop upgrading. The rename is
> reverted and the released path is clean: nothing your database has already
> applied is applied again.

Both of these were found by tests that had been failing for days and had been read
as the tests being out of date. They were not.

- **Searching People on a phone works again.** The People list has a search box at
  every width — that is the module's own rule — but the change that gave the phone
  its "Filter & sort" sheet also hid the whole filter row it lives in. On a phone
  there was no way to find a person by name from the list. The search box is back;
  the sort and the catch-up filter stay in the sheet, where they belong.
- **"More note options" opens the full note form again.** Capturing a note from a
  Person and pressing "More note options" did nothing the first time you pressed
  it. Pressing it moved focus off the title field, an error message appeared above
  it, and the link moved out from under your finger before you let go — so the tap
  never landed. Leaving for the fuller form no longer flags the title you have not
  written yet, and the link no longer moves.

Nothing else about validation changed: a field still tells you what it needs, in
the same words, at the same moment. What has changed is that the whole-form "there
is 1 problem to fix" summary appears when you try to SAVE, rather than the moment
you look away from a field — which is what it was always meant to do.

---

## Five colour schemes, and DalyHub stops being "the violet app" (THEME-01)

DalyHub has always had one colour. It is a good colour — but a tool you sit in
front of for years should be able to change its mood without changing what it is.
**Settings → General → Colour scheme** now offers five:

- **Daly Violet** — the one you already have, unchanged. If you do nothing, nothing
  changes.
- **Electric** — cobalt blue with violet and magenta accents, over a deep blue-black
  shell. Modern and energetic.
- **Pulse** — magenta and plum over dark neutrals, with a lime accent kept for small
  positive detail. The boldest of the five.
- **Ocean** — royal blue, teal and cyan on cool slate. Calm and focused, with no
  violet in it at all.
- **Graphite** — charcoal and slate. The quietest option, and deliberately _not_ a
  grey mode: overdue is still red, done is still green, and every status keeps its
  full colour.

**Colour scheme and Light/Dark are separate choices.** Every scheme has a proper
light version and a proper dark version, so "Ocean, Light" and "Ocean, Dark" are
both real. Changing one never disturbs the other.

**Only the colour changes.** Layout, type, spacing, corners, icons and every
interaction are identical in all five — you are not learning a new app when you
switch, and nothing moves.

**It applies immediately.** Tap a scheme and the page is repainted: no reload, no
sign-out, nothing to restart on an installed app. The choice is stored with your
other preferences, so it follows you to another browser or your phone, and the
right colours are already there in the first frame of a page rather than flashing
in afterwards.

**Working surfaces stay calm on purpose.** A scheme spends its colour on the
things that mean something — the buttons you press, what is selected, where you
are in the navigation, progress, charts — not on the page behind your work. That
is why five schemes still read as one product, and why Pulse's lime stays a small
accent rather than a wall.

## Capture from your phone without opening DalyHub (CAPTURE-01)

A thought does not wait for an app to load. Until now, catching one meant
unlocking the phone, finding the DalyHub icon, waiting for it to open, waiting to
be signed in, waiting for the page, then finding Quick Capture. Every step was
small; together they were longer than the thought lasted.

Now there is a much shorter path, and several ways onto it.

**A Shortcut on your Home Screen.** Tap it, choose Task, Note or Inbox, dictate or
type, done. Put it on the Home Screen, in a widget, on the Action Button, or make
two even faster ones — **New DalyHub Task** and **New DalyHub Note** — that skip
the choice entirely.

**Siri.** _"Hey Siri, Capture to DalyHub."_ → _"What do you want to capture?"_ →
_"Call Mum tomorrow afternoon."_ → _"Saved to DalyHub."_ Nothing extra to set up;
the Shortcut's name is the phrase.

**The Share Sheet.** Share a page from Safari and keep it as a Note, with the
page's own title and a real link back to it in the note's body — or as a Task,
with the link kept out of the task's title where it would only be noise.

**Email.** Forward anything to your capture address and it lands in your Inbox,
cleaned up: a readable subject, a readable body, no wall of raw email. Start the
subject with `task:` or `note:` if you already know what it is.

**It goes where you would put it yourself.** A task with a date or a priority in
it is read the same way DalyHub already reads what you type into Quick Capture —
_"Call Sarah tomorrow p1"_ becomes a P1 task scheduled for tomorrow. Anything
DalyHub is not sure about goes to your Inbox rather than being guessed at.
Nothing is ever filed under a Project or an Area automatically, and nothing is
ever sent to an AI to be classified.

**Losing your phone does not mean losing DalyHub.** A capture device can create
tasks and notes and _nothing else_ — it cannot read your records, change them,
delete them or export anything. **Settings → Capture** shows every device, when
each last captured something, and a Revoke button that takes effect immediately.
The token is shown once when you create it, because DalyHub does not keep a copy.

**A lost connection does not lose your words.** If DalyHub cannot be reached, the
Shortcut says so plainly and puts your text on the clipboard. Nothing ever
pretends to have saved. And if a capture is sent twice because the phone lost the
reply, you get one task, not two.

Setup takes a few minutes in Apple's own Shortcuts app — there is no DalyHub app
to install. Step-by-step instructions are in
[`UNIVERSAL_CAPTURE.md`](docs/development/UNIVERSAL_CAPTURE.md).

---

## Goals now show where you are, where you started, and how far is left (UIX-03)

Goals could already track a real measurement — a weight, a savings balance, a
count of books — but the screens barely used it. A Goal looked like a Project
card with a percentage on it, every Goal wore the same grey flag, and the chart
on a Goal's page did not show the target you were aiming at. That is fixed.

**The Goals page.** Each Goal now leads with its actual reading — `79.3 kg`,
`$7,240`, `5 books` — with the whole journey underneath it: _from 85 kg → 70 kg_.
That one line is what lets you check the percentage instead of trusting it. Under
that sits a thin bar, then the state, what is left, and the date you set:
_On track · 9.3 kg to go · by 10 Dec 2026_.

**Colour that means something.** A Goal now takes the colour and the icon of the
Area it belongs to, so a page of Goals groups by the part of your life each one
serves before you read a word. The same Goal is the same colour on Today.

**A small chart on the card.** Where a Goal has enough history, the card draws
the shape of it beside the number. Where it does not, it does not draw a line —
one measurement is a value, not a direction.

**Four views.** _All_, _On track_, _Needs attention_ and _Completed_, so you can
ask "which of these needs me?" without reading all of them.

**The chart on a Goal's page now includes the target.** Before, a weight goal's
chart showed the last few kilograms and nothing else — the 70 kg you were aiming
at was off the bottom of the picture. The target is now part of the chart, which
means the empty space between your line and the dashed target line _is_ the
distance you have left. Point at the chart (or use the arrow keys) to read any
measurement. There is a dotted line for where you started, too.

**The page leads with your progress.** A Goal's numbers, chart and history used
to sit inside the summary box, below the definition of done. They are now the
first thing on the page, and they open with four labelled figures — **Start**,
**Now**, **Target**, **Remaining** — instead of one long sentence. Once you pass
your target, _Remaining_ becomes _113% of target_.

**Smaller things.**

- A Goal you have not told DalyHub how to measure now shows what it is _for_ —
  its definition of done — instead of an empty progress bar.
- A Goal tracked as a plain percentage no longer claims a "Target 100%" you
  never set.
- A Goal you have already passed no longer tells you the pace required to reach
  it.
- A completed Goal is no longer greyed out. Finishing one is the best news on
  the page.

## Editing a task from the list works again (EDIT-03)

Changing a task's **priority**, **project** or **due date** from the Tasks list
showed you the value you already had and none of the others — the chooser was
being cut down to the height of the row it opened from, so there was nothing to
choose between. It now floats above the list.

- **Priority** opens the full set — P1, P2, P3, P4 — with the current one marked,
  and one separated **Clear priority** underneath when there is something to clear.
- **Project** opens the whole list of Projects and Areas, scrolls when it is longer
  than the screen, and offers **Move to Inbox** when the task is filed somewhere.
  Start typing a name to jump to it.
- **Due date** opens **Today**, **Tomorrow** and **Next week** beside the date
  picker and a **Clear** — the same four answers the task record has always given.
- A chooser opened near the bottom of the window now opens upward instead of off
  the edge, and a long one scrolls inside itself rather than pushing the page.
- On a phone these are proper sheets that slide up from the bottom, the same way
  every other choice on a phone is made. The date sheet was previously drawn inside
  the task row and was unusable.

## A redesigned DalyHub (UIX-01)

The biggest visual change since 2.0. Nothing moved in the product's structure —
the same Areas, Goals, Projects and Tasks, in the same places, with the same
meanings — but Today, Tasks and the frame around them have been redrawn against
a new design.

### Create is at the top, and it is the one violet thing on the screen

The floating **+** in the bottom-right corner of every window is gone. On a
computer, **New** now sits at the top with search and your account; on a phone,
the **+** in the middle of the bottom bar is the same control it always was. One
button, where the rest of the controls already are.

### Today is three columns and a row of colour

The day's figures are four small cards with coloured marks — your tasks, your
meetings, anything overdue, and how the day is going. Underneath them the day
reads across rather than down: what to do, what is scheduled, and what needs a
look, side by side. Goal progress moved to the full width beneath, so four Goals
fit where two did.

Overdue work is no longer a pink panel at the top of the day. It is an ordinary
row with a coral date beside it, which is what it is.

### Tasks is a list again

Tasks now opens **grouped by when things are due** — Overdue, Today, This week,
Later — with the five views you actually use as tabs across the top: Inbox,
Today, Upcoming, All active, Completed. Everything else is still one click away.

A task is one line. A circle to tick it off, the title, its Project, and the
date. Dates read **Yesterday**, **Today**, **Tomorrow** — not "7 Aug 2026" —
and turn coral when something has slipped. The chips, badges and buttons that
used to sit under every title are gone: about twice as many tasks now fit on a
screen.

Ticking a task off is the circle at the start of the row. Everything else a row
can do is still there, in its **…** menu.

On a phone there are now two rows of controls above the list instead of four:
the count and **Filter & sort**, then the view tabs across the full width. The
Project and the date line up in columns, so you can run your eye down either
one.

### Selecting several tasks is something you turn on

Rows no longer carry a permanent checkbox. Choose **Select tasks** from the
**…** menu at the top (or hold a row on a phone) and the checkboxes appear, with
the same range-select and the same 100-task limit as before.

### Capturing a task on a phone

The new-task sheet is **Cancel · New task · Save**, a big title field, and three
quiet rows for the due date, the priority and the Project. Typing a title and
pressing Enter is still all it takes; nothing below the title is required.

### Dark mode

Dark got the same treatment rather than an inversion of the light one: layered
charcoal surfaces, quiet borders, and the same six accent colours at a strength
chosen for a dark screen.

---

## A quieter DalyHub (VIS-01)

Nothing moved and nothing was renamed. This is the pass that takes the last of the
Material scaffolding off the outside of the product.

### The navigation gets out of the way

The sidebar is narrower, its destinations are tighter, and the one you are on is a
soft wash rather than a filled lilac capsule. The three rules that grouped the
destinations are gone — the space between the groups was already saying it. The
glyphs are smaller, so the labels lead.

### You can see where to search

The top bar carries a compact search field again — **Search DalyHub**, with the
`/` shortcut printed in it — instead of a magnifying glass you had to know about.
It opens exactly what the glyph opened. On a narrower window it folds back into
the glyph.

### Today reads as one composition

The day's figures are properly sized cards rather than small tiles stranded at the
left of an empty row. **Goal progress** is now a row of glances — title, value,
target, bar, and one word for how it is going — instead of a tall stack of full-width
readouts, so three or four Goals fit where one used to. Each glance dropped the
things you were already looking at somewhere else: the Area, the remainder, and the
green pill saying what the word beside it said.

### Cards stop shouting

Corners are smaller and more varied — a figure card is rounder than a row and less
round than a panel, which is the point of having a scale. A Goal card in the gallery
carries five facts where it carried eleven; the ones that went are the ones the
number above them already stated. Buttons are rounded rectangles now, and the pill
shape is kept for the one action on a surface that is genuinely the action.

### Filters look like filters

The segmented control — Active/Deleted, List/Board/Sectors, All/Open/Completed — is a
quiet recessed track with a soft chip on the chosen segment, instead of an outlined
capsule with a rule between every option.

### Notes is somewhere to write

The writing surface has no box. No outline, no fill, no corners — just the document,
with one hairline under the toolbar.

### Dark is dark, not black

Every surface came up off black onto a dark blue-grey, so a card reads as lifted
rather than drawn, and the coloured identity marks on Projects, Areas and Goals are
mixed back toward the card — a palette instead of a rainbow.

### The phone bar is a bar, not a slab

The bottom navigation is 60px instead of 80, with smaller glyphs, smaller labels and
a compact selected state. Every destination is still the full height of the bar to tap.

## The Tasks list stops making you wait (TASKS-09)

Ticking a task off used to take four round trips to the server before anything on
screen moved. Everything worked; it just never felt like it. That is fixed.

### Changes show up when you make them

Tick a task and it strikes through immediately. Set a priority, a date or a Project
and the row updates as you choose it. DalyHub still sends every change to the same
place it always did, and the server is still the only thing that decides whether a
change is allowed — it just no longer makes you watch the round trip.

If a change is refused, the row goes straight back to exactly how it was, and DalyHub
tells you why in the server's own words. Nothing is ever left looking saved when it
was not.

### Completing a task now offers Undo

Completing or reopening a task raises a short confirmation with an **Undo** button.
It appears once DalyHub knows the change actually happened — never before — and it
carries the same detail the list always announced, including what a repeating task's
next occurrence did.

### You can work faster than one task at a time

The list used to disable its buttons while any change was in flight, so completing
five tasks meant five pauses. Each change is now its own request; complete as fast as
you like.

### "Load more" keeps your place

If you had loaded three pages of tasks and then changed anything at all, the list
quietly collapsed back to the first fifty rows. It no longer does. Loaded pages stay
loaded, and a task the server has just re-sorted moves to its new position rather
than appearing twice.

### And it re-reads the list only when it has to

Changing a priority on an unfiltered list does not need DalyHub to go and ask the
server what the list contains — it already knows. Completing a task in a view that
hides completed work does, and it still does. The rule is deliberately cautious: when
DalyHub cannot be sure a change left the row where it was, it checks.

---

## Goals you can actually measure (GOAL-02)

A Goal used to be a name, a date and a paragraph. Now it can be an outcome — and
DalyHub can tell you whether you are getting there.

### Say how success is measured

When you create a Goal, DalyHub asks **how will you measure this?** and offers four
answers:

- **Target value** — move from a starting value to a number. _Reach 70 kg._ _Save
  $20,000._
- **Count** — work towards a total. _Read 24 books._
- **Milestones** — complete defined stages. Each counts equally unless you give one
  a weight.
- **Manual progress** — set the percentage yourself, for the outcomes that genuinely
  cannot be counted.

You never have to say whether the number should go up or down. Type 85 and 70 and
DalyHub works out that progress means going down — and tells you so, in words, before
you save.

### Record progress, and keep the history

**Log weight.** **Add measurement.** Whatever your Goal is measured in, the button
says it. It opens a three-field sheet — the number, the date (today, unless you say
otherwise) and an optional note — with the decimal keypad on a phone and Save sitting
above the keyboard where your thumb already is.

Every reading is kept. Your current value is simply the most recent one, so mistyping
a weigh-in is an ordinary edit rather than a lost fact, and back-dating a reading you
forgot puts it in the right place in the history.

### See where you stand

The Goal now leads with the number:

> **79 kg** Target 70 kg
> ▓▓▓▓▓▓▓▓░░░░░░░░
> 40% · 9 kg remaining · ↓ 6 kg from baseline · **Ahead**

Beneath it, a line of the readings over time with your target as a quiet reference,
your recent pace against the pace you would need, where that pace lands, and the
full history — each entry showing the change from the one before, and each editable.

### It says what it does not know

This is the part we care most about. DalyHub will not make a number up:

- no target yet → your value and your movement, and no percentage;
- one reading → "More measurements needed for a trend", not a flat line;
- two readings a day apart → no weekly pace, because a day is not a week;
- a pace that would land in 2031 → no projection at all;
- nothing recorded → "No progress logged yet", never an empty 0% bar.

The language stays calm too. The strongest thing DalyHub says about your own life is
**Needs attention** — never "failing" — and a Goal you have not measured for a month
gets **No recent update**, which is a fact rather than a verdict.

### Today knows about your Goals

**Goal progress** shows up to four Goals that deserve a look today — the ones behind
their own schedule or past their date first, then the ones whose target date is close,
then the ones you have not checked in on for a week. Each shows its value, its target,
its progress and one button: log a measurement without leaving Today.

**This week** compares the tasks you completed with the tasks you created, over seven
days, with the plain summary beneath it:

> 24 completed · 18 created · 6 tasks fewer in your active workload

It only claims your workload moved when the two numbers actually differ, and it does
not appear at all in a week where nothing happened. There is no productivity score,
because a score is a number you cannot check.

### Your existing Goals are untouched

Every Goal you already have keeps working exactly as it did. None of them has been
given a measurement, a guessed baseline or an invented percentage — they simply say
"Not measured yet" and offer to start, whenever you want to. Nothing was rewritten and
nothing was inferred from what you had written.

---

---

## Expressive composition, and a phone layout of its own (M3X-02)

The second Material 3 Expressive pass. The first one gave DalyHub its violet
identity and gave every page one strong surface; this one is about everything
_underneath_ that surface — and about the phone.

### Today answers "what next?"

Beside the day's summary there is now **Next up**: the meeting that has not
started yet, or — when the day holds none — the next task due, or the oldest
thing that has slipped. Under it, **Current focus** is the project you were last
actually working in, with its own icon, its status and how far along it is.

The summary itself moved into the day's own column, so the screen is three
regions of different sizes rather than a banner over two matching boxes. On a
phone the order is what a phone glance wants: how much is on, what is next, then
the day.

### Tasks are easier to scan

A task row now has three weights instead of one. The title leads; the priority
and the urgency sit beside it; the planned date, the time sector and a delegate
step back. **Overdue** says _Overdue_ rather than repeating the due date printed
next to it, and a task with no time sector no longer says "Sector: No sector".

Nothing was hidden and nothing stopped being editable from the row.

### Projects, Areas and Goals you can tell apart

Their icons are bigger on a gallery card, progress is thicker and its percentage
much larger, and three lines of metadata that did not help you choose anything —
open/done counts, "No tasks yet", "Updated …" — are gone.

**Goals now show a real measure**: how many of the Projects advancing a Goal are
complete. That number was always there; it had just never been drawn. Open Goals
have also stopped wearing a chip saying they are open.

### Notes use the screen

The directory is a gallery of note cards rather than one narrow column, so an
excerpt is long enough to be worth reading. Search and Sort stay in view; Tag,
Project, Area and link state moved behind **More filters**, which opens itself
whenever one of them is set.

### On an iPhone

Projects, Areas and Goals are compact rows on a phone rather than the desktop
card stacked — roughly twice as many records to a screen. A task row that used to
run to six lines now runs to two. Both appearances were designed and reviewed,
not recoloured.

## Tasks, as a daily driver (V2.2 — TASKS-05 · TASKS-06 · TASKS-07 · TASKS-08)

The programme that makes Tasks the fastest thing in DalyHub. The whole point is one
change of shape: **see a task → act on the task**, instead of _see a task → open it →
find Edit → change a field → save → close_.

### Change a task where you can see it

Priority, the due date, the planned date and the Project or Area are now editable
**on the row**. Click the value, choose, done. Nothing new appears on a row to make
this work — a task with no priority simply reads a quiet "No priority", and that word
is the button.

Because those four moved onto the row, nine entries left the row's ⋯ menu. What is
left there is what genuinely does not fit on a row: renaming, the searchable
Project/Area picker, Someday/Maybe, the repeat editor and the full task record.

Filing is still optional and still one step. One choice replaces the Project — you
never clear it first — and **Move to Inbox** sits in the same menu.

### The Eisenhower Matrix is gone

Deliberately, not by accident. The 2×2 was a second way of reading the one thing it
showed: your P1–P4 priority. Everything it did is available as an ordinary list
**grouped by priority**, which also sorts, filters and pages properly.

**Your priorities are untouched.** P1–P4 are exactly as they were, and they are still
a filter, a sort, a grouping and the badge on every row. If you have an old Matrix
bookmark it takes you to the priority-grouped list rather than an error, and if the
Matrix was your default Tasks view you now land on the task list. Time Sectors stays —
it is a real planning field, not a second reading of priority.

### Select many, do one thing

Choose **Select tasks** (or press and hold a row on a phone), tick what you want —
Shift-click to take a run of them, or **Select all** — and act on the lot:

- complete or reopen them;
- give them all a priority, a due date or a planned date;
- move them all to a Project, an Area or the Inbox;
- park them as Someday/Maybe, change their status, or delete them.

Where the selection disagrees, the control says **Mixed** rather than pretending they
all share one value — and choosing a value sets it on all of them.

**Deleting is reversible.** "Delete 18 tasks?" tells you exactly what happens: they
move to a new **Deleted** view keeping their dates, links and history, and you restore
them from there. Nothing is destroyed by a toolbar button.

Every bulk action says what it did — "18 tasks deleted", not "18 tasks updated" — and
says it somewhere a screen reader will still be listening after the selection clears.

One bulk change is one bounded, all-or-nothing operation, and it works on up to 100
tasks at a time so it stays fast and cannot half-apply. If you have loaded more than
that, **Select all** takes the first 100 and says so beside itself — and a selection
that has run past the limit tells you how many to deselect, rather than offering
buttons that would all be refused.

### Repeats that mean what you meant

A repeat is now one of two things, and DalyHub asks which:

- **Keep a fixed schedule** — "every Monday" is still Monday next week, even if you
  finished this one on Wednesday. For weekly reviews, bins and regular admin.
- **Repeat after completion** — "every 14 days after completion", counted from the day
  you actually finished. For cleaning, maintenance and anything where the clock should
  restart when the work is done.

Every repeat you already have keeps behaving exactly as it did — they are all fixed
schedules, which is what they already meant.

**Custom repeats are now buildable.** Choose _Custom…_ under Repeat for every 3 weeks,
every 3 months, or a weekly routine pinned to particular days. Whatever you build, the
panel states it in plain English — _"Every 2 weeks on Monday and Thursday"_, _"14 days
after completion"_ — before you save it.

Two more things a repeating task needed:

- **Skip this occurrence.** Not mowing the lawn this week is not the same as mowing it.
  Skipping moves it to the next date and leaves it open, and your history says it was
  skipped — never that it was done.
- **Stop repeating.** Ends the future occurrences and keeps every past one.

### On a phone

Press and hold a row to start selecting. The action bar becomes the bottom row of
buttons the rest of DalyHub uses — Complete, Date, Priority, Move, More. The custom
repeat editor is built for a thumb: full-width controls, seven day buttons big enough
to hit, a number pad for the interval, and the plain-English result right above Save.

---

## Turning a meeting item into a task now happens all at once, and writing has one keyboard save (AUDIT-13 / AUDIT-16 / DOC-EDITOR-01)

Three things, all of them about not being surprised.

**Converting a meeting item into a Task is one action again.** It always looked like
one, and underneath it was five separate writes: the Task, then its status, then its
description, then the record that the item had been converted, then the link between
the two. If DalyHub died in the middle — a dropped connection at the wrong instant, a
tab closed mid-request — you could end up with a Task that no meeting knew about. The
meeting item still showed **Create task**, so you would press it again, and now you
had two Tasks for one decision. The same shape of problem sat behind completing an
Asset obligation: the task it tracked was ticked off first, and if recording the work
then failed you were left with a done task and a service that DalyHub still thought
was outstanding.

Both are now a single write. Either everything lands — the Task, the conversion, the
link, the history entry — or nothing does, and the item is still there waiting,
exactly as it was. Pressing the button twice creates one Task. A retry after a
failure creates one Task. Two devices doing it at the same moment create one Task.
And the history entry no longer says a task was closed when it was not: it says what
actually happened.

**⌘/Ctrl+Enter now saves wherever you are writing.** A Diary entry, a Task's
description, a Review reflection — anywhere with a **Save** button, you can reach it
from inside the text without moving your hands. Pressing plain **Enter** still starts
a new paragraph, which is the whole point: an editor that saved on Enter could not be
used to write more than a sentence.

**One writing surface, and nothing beside it.** DalyHub had quietly kept two older
long-form editors around after everything moved to the current one. Neither was
reachable from anywhere in the product, and both were the kind of thing that ends up
back on screen by accident. They are gone. Nothing you use looks or behaves
differently — the writing surface, its toolbar and its shortcuts are the same ones
you already have.

Nothing you have written was touched, no data moved, and nothing needed migrating.

---

## Account & security, and a browser that now refuses injected script (SET-03 / AUDIT-10)

Two things you could not see, and one you could not do.

### Settings → Account & security

A new section that answers three questions and refuses to imply a fourth: **who
you are signed in as**, **what DalyHub actually knows about this session**, and
**what you can actually do about it**.

- **Identity** — your name (when your sign-in provider supplies one), your
  verified email, a short fragment of your identity reference, how you signed in,
  and which DalyHub you are looking at.
- **This session** — whether it is active, expiring soon or expired, when it was
  issued and when it ends. All of it read from your sign-in itself.
- **Data on this device** — whether this device holds a copy of your records, and
  how many things you captured offline that have not reached DalyHub yet.
- **Security activity** — the security-relevant things you have done, in the same
  history DalyHub already keeps for everything else.
- **Sign out**.

**What is deliberately not there is the point.** No password control, no
two-factor control, no list of your devices, no "last login", no IP address, no
map. DalyHub does not know any of those things — your sign-in is handled by
Cloudflare Access — and a security page that shows you a guess as though it were
a fact is worse than one that shows you less.

That includes **"sign out everywhere"**. It was planned. DalyHub cannot do it:
ending your sessions on other devices is Cloudflare's job, and DalyHub holds no
credential that can ask Cloudflare to. So instead of a button that would sign out
only the browser you are looking at while appearing to do more, the page says so
plainly and tells you where the control that genuinely does it lives. That is the
one button you would reach for if you thought a device had been stolen, and it
had to be honest or absent.

### Signing out now cleans up after itself

DalyHub keeps a copy of your recent records on each device so it still works
without a connection. Until now, logging out left it there — so on a borrowed or
shared laptop, "I logged out" did not mean "my data is off this machine".

Signing out through DalyHub now removes that copy, your recent searches and
DalyHub's cached files **before** it hands you back to the sign-in screen. When
there is nothing waiting to sync, it removes DalyHub's offline storage entirely.

**Anything you captured offline that has not reached DalyHub yet is kept.** It
exists nowhere else, so signing out will never throw it away — the page tells you
how many are waiting, and deleting them is its own separate control with its own
confirmation.

### A browser that refuses script DalyHub did not write

DalyHub already strips anything dangerous out of the Markdown you write, and
still does. That was the _only_ thing standing between an injected string and
code running in your browser. Now there is a second, independent layer: DalyHub
tells your browser exactly which scripts, styles, images, fonts and connections
are legitimate, and your browser refuses everything else — an injected script
tag, an `onclick` handler smuggled into content, a script from somewhere DalyHub
never asked for.

Nothing about this changes what you see. It is the kind of improvement whose
whole value is that you never notice it.

## Add something you own from your phone, in seconds (ASSET-03)

Recording an Asset used to mean getting to a laptop, or at least getting to the
Assets screen and finding its own "New Asset" button. So the trailer, the policy
and the licence renewal stayed in your head, which is exactly where DalyHub exists
to stop things living.

**Assets is now in the global `+`.** Tap capture from anywhere — the phone bar,
Today, the command palette — and Asset sits beside Task, Diary entry, Meeting and
Note. It opens the real New Asset form, not a stripped-down phone version of it,
so what you create is an ordinary Asset record from the first second.

**Choosing what kind of thing it is got much better on a phone.** The type field
used to be a small dropdown that opened underneath the keyboard. On a phone it is
now a full-width list of large, labelled choices, grouped so you can find the right
one at a glance:

- **Physical** — Vehicle · Trailer or camper · Equipment · Appliance · Electronics ·
  Tool · Property item
- **Documents and cover** — Document · Licence · Insurance
- **Digital and recurring** — Subscription · Software
- **Anything else** — Other

The groups are only there to help you look; nothing about your Asset changes
because of which heading it sat under. On a laptop the field is exactly as it was.

**It still only asks for what it needs.** A name and a kind is a complete Asset.
Choose the kind and it offers the few details that actually apply — a trailer asks
for a manufacturer, model, serial number, where it lives and when the warranty
ends; an insurance policy asks for the issuer, the reference, the renewal date and
a link. Everything else waits for the record's Details tab, whenever you feel like
it. Change your mind about the kind and it shows the right fields without throwing
away what you have typed — and it never files a serial number against a policy that
was never asked for one.

**Two small things that were quietly getting in the way, fixed:** dismissing the
type list no longer closes the whole capture and loses what you had written, and
tapping straight to the type field no longer makes it jump out from under your
finger.

## Save a useful question, not just a filter (X-02)

Tasks could hold a saved view. Nothing else could — and none of the questions you
actually ask are about one module. _What needs my attention?_ is overdue Tasks and
at-risk Projects and off-track Goals and a Meeting with actions still hanging. There
was no way to ask that, let alone keep asking it.

**Views** is a new place in the sidebar for exactly that. Choose what to include —
Tasks, Projects, Goals, Notes, Meetings, Reviews — narrow it in the same filter
sheet every other collection uses, and save it with a name. Reopening it re-runs the
question against today's records, so it is always current rather than a snapshot.

It opens on four built-in views you did not have to build:

- **Needs attention** — overdue and waiting work, Projects that have stalled or
  slipped, Goals with nothing moving, Meetings with actions still open, and Reviews
  you have not finished.
- **This week** — everything that has moved since the week began.
- **Since my last Review** — what changed after the period your last completed
  Review closed. It uses that Review's own record of when it closed, not a guess.
- **Waiting & follow-up** — what you are waiting on, and Meetings with outstanding
  actions.

Your Review now links into all of this. When it tells you a Project moved from On
track to At risk, you can open every Project whose health moved. When it says
something needs attention, you can open the view that keeps showing you.

Three small promises worth stating. A view **never invents an answer**: if a record
type cannot answer one of your conditions — a Note has no due date — it is left out
and the page says so, instead of quietly returning everything. A view **never
surfaces what you hid**: if you have turned a module off, no view reads it. And a
view **is a URL**, so it is shareable, bookmarkable and Back-button-correct, exactly
like the Tasks views you already had.

Your existing Tasks views are untouched. They now share the same machinery as the
new ones, which is why the switcher looks and behaves identically in both places.

---

## You can get your data back in (SET-02) — and your nightly production backup is no longer readable by anyone with repository access (AUDIT-11)

DalyHub could give you everything you had ever written, in a file, on demand. It
could not read that file back in. So the worst day — a bulk edit that went wrong,
a week of records gone, a workspace you wanted returned to how it was on Tuesday
— had no answer, and every export was an archive rather than a way back.

**It has one now.** The full DalyHub export was always the backup format. Today
DalyHub reads it.

### Restoring

**Settings → Privacy & data → Restore.** Choose a full DalyHub export ZIP, and
DalyHub:

- **checks it** — the archive's own checksums, the version it was written by, and
  whether everything inside it holds together. **Nothing in your workspace
  changes at this point.** Choosing a file inspects it; it does not restore it.
- **shows you what is in it** — when the backup was taken, and how many Areas,
  Goals, Projects, Tasks, Notes, Diary entries, Meetings, People, Assets and
  Reviews it holds, beside what this workspace holds right now;
- **tells you what will happen**, in one sentence. If this workspace already has
  records, restoring **replaces** them, and DalyHub says so with both numbers
  rather than asking "are you sure?";
- **backs up what you have first.** Before anything is replaced, DalyHub creates
  a backup of your current workspace, checks it can be read back in, and gives it
  to you. If it cannot make that backup, it stops and changes nothing. That file
  is your way back from a restore you regret;
- **asks you to type `REPLACE`** — the same deliberate confirmation DalyHub uses
  for anything irreversible;
- **restores, then checks its work**, and tells you plainly if the result does
  not match the backup rather than reporting success because rows were written.

### The promise underneath it

**A restore that fails leaves your workspace exactly as it was.** Not most of it,
not a mixture of the old workspace and the new one. Either the workspace you had,
or the workspace in the backup — never something in between. That is the whole
reason this took as long as it did, and it is proved automatically: DalyHub
builds a realistic workspace, backs it up, throws the workspace away, restores
the backup and checks that every record, every link, every date and every line of
your writing came back identical.

A restore also **does not pretend to be you**. Your history comes back as history
— the events that actually happened, when they happened — not thousands of new
"created today" entries.

### What restore does not touch

AI settings. Your budgets and privacy choices are spending and consent decisions,
and restoring a file should not quietly turn them back on. A restored workspace
starts with AI off.

### And what DalyHub still does not do

Keep copies for you. There is no scheduled backup on your behalf and no second
copy held somewhere on your account. **Downloading a backup after a significant
week is worth the ten seconds** — Settings → Privacy & data → _Download full
DalyHub export_.

### Behind the scenes: the nightly production backup

DalyHub takes a nightly low-level copy of the production database for the case
where the database itself is gone. That copy used to be stored in plain text
where anyone who could read the project's build history could read all of it —
contact details, diary entries, meeting notes, everything.

It is now **encrypted before it is stored**, with a key that lives in a protected
secret store and never travels with the backup. Every night the job decrypts its
own copy again and checks it comes back byte for byte, so "it is encrypted" and
"it can actually be recovered" are both true rather than assumed. How that key is
kept, and how to use it on the day it is needed, is written down in
[`BACKUP_AND_RESTORE.md`](docs/development/BACKUP_AND_RESTORE.md).

---

## Your Review now shows you what actually moved (REVIEW-03)

Reviews could hold what you wrote. They could not tell you whether anything was
getting anywhere. The guided weekly Review opened on six counts — Tasks
completed, Tasks overdue, Inbox, Diary entries, Meetings, active Projects — with
nothing to compare any of them against, and in a quiet week three of them read
zero. That is a dashboard measuring nothing.

Every Review now opens on **evidence**: what changed, where the work contributed,
how your Projects moved, what is still hanging over from before, and how that is
changing over your recent Reviews. You still write the Review. DalyHub just stops
making you remember the week from scratch.

### What you see now

- **What changed.** What you actually finished this period — Tasks, Projects,
  Goals — and, when there is one, the Project that was stalled last time and is
  moving again.
- **Where the work contributed.** Each Goal is **Moving**, **Limited movement**,
  **No recent movement** or **No contribution path** — always followed by the
  reason: _"3 Tasks completed this period, across 2 contributing Projects."_ A
  Goal that no Project advances is described as having no path to contribute
  through, not as neglected: that is a missing connection, not a failure.
- **How Project health moved.** _At risk → On track._ _On track → At risk._ Both
  states named, in words. A Project is never called "improved" just because you
  ticked off more Tasks — finishing things and being on track are different
  facts, and DalyHub keeps them apart.
- **What needs attention.** Commitments that were already overdue when the period
  started and still are, work that has been waiting on someone else since before
  it, and Projects sitting open with nothing completed — with how many of them
  were in the same position at your last Review. Things you have deliberately
  parked or dropped are left out of it.
- **Where effort landed.** Which Areas received finished work, and which had
  active work but nothing completed.
- **Over recent Reviews.** A small chart of the last few Review periods, with the
  numbers written out beside it — so it reads on a phone, on a printout, and to a
  screen reader just as well as it does as bars.

Everything is one click from the record behind it. If DalyHub says three Projects
need a look, you can see which three.

### What it deliberately is not

- **No score.** No productivity percentage, no weekly grade, no life score, no
  streak. Those numbers look precise and hide someone else's opinion about how
  your week should have gone. DalyHub tells you what completed, what contributed,
  what is stuck and what is changing — separately, so you can weigh them yourself.
- **No AI.** Nothing here asks a model anything. Every conclusion comes from your
  own records by a rule you can read, opening a Review costs nothing, and you can
  always see why DalyHub said what it said.
- **No invented comparisons.** Your first Review says it is your first Review,
  rather than showing you a column of zeros. If something could not be read, it
  says so instead of reporting nought.

### The honest small print

- **Health comparisons start now.** DalyHub records what was true at each Review
  the moment you complete it. Reviews you completed before this update have no
  such record, so the "since your last Review" comparisons begin with your next
  completed Review. The trend over recent Reviews does not have that limitation —
  it is read from history you already have.
- **Finished work counts where it lives today.** If you move a Project to a
  different Goal or Area later, its finished work moves with it.

---

## The Today screen is a place to work, not a dashboard about work (#132)

Today has been replaced. It had become a report: search took the top of the page,
six stat tiles counted the day (mostly to zero), a donut counted it again, and the
day's actual tasks started below the fold. Everything on it was true — that was
the problem. The screen said the same few things three times and left no room for
the day.

### What you see now

- **Your day, first.** A greeting, the date, and — the moment you finish
  something — "3 of 8 done today" with a small progress bar. Then the day itself:
  anything overdue, your meetings in time order, and everything due today, all in
  one column you can tick straight from.
- **A short row of chips** — "8 tasks", "3 meetings", "1 overdue" — each linking
  to the list it counts. Overdue is the only coloured one on the page.
- **A rail beside it** holding only what the day does not already show: your
  inbox, what you are waiting on (with the age of the oldest — that is the part
  that matters), any project or goal that needs a look, and the projects you were
  most recently actually working on.

### What is gone

The search box (search is now an icon in the top bar, and `/` still opens it from
anywhere) · the "Customise" control and the whole widget system · the "Brief"
wrapper around the greeting · the Task Summary donut, its legend and its filter
pills · the Insights and Productivity panels · the Notes, Diary, Areas, Goals and
Assets widgets · the Recent activity feed · Today's own capture buttons. Nothing
became unreachable: every one of those lives in its own place in the sidebar, and
capture is the `+` it always was.

### The rules the new screen keeps

- **A zero is never drawn.** Every chip, the progress bar, every section and every
  rail row appears only when it has something to say. A quiet day is a short page.
- **Nothing is counted twice.** Overdue work is a chip and a set of rows you can
  act on — and it is deliberately absent from the rail, which holds only what the
  day does not show.
- **The screen finally reads your due dates.** A task due today used to land in
  "Anytime", and a task a week past its deadline reported "0 overdue", because the
  old surface only looked at the day you had planned it for. Both dates now count,
  by the same rule the Tasks views use.
- **No times on tasks.** A task is a date and a meeting is a time, so meetings
  carry a clock and tasks do not — and there is no "Morning / Afternoon" split
  that would only be honest for a handful of items.
- **Ticking a task is instant** and writes to the same task the Tasks list and the
  task record edit, with the progress figure moving with it. A task you finished
  earlier today stays where it was, dimmed and struck through, so the "of 8" adds
  up in front of you.

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
