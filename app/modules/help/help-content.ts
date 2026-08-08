/**
 * HELP-01 — the in-app Help content, as data.
 *
 * Help is a maintainable part of the repository, not an external documentation
 * platform: one typed structure, rendered by one route with the ordinary DalyHub
 * layout and theme tokens. Adding a topic is an edit here.
 *
 * ── Rules for this file ───────────────────────────────────────────────────────
 *   - Describe DalyHub AS IT IS. Nothing aspirational, nothing that only exists on
 *     the roadmap. A help page that documents a feature the product does not have
 *     is worse than no help page, because it makes the owner doubt what they see.
 *   - Owner language, not implementation language. No route paths as concepts, no
 *     kernel vocabulary, no ADR references.
 *   - Plain Australian English, short sentences, no enterprise jargon.
 *   - Where something is deliberately not built yet, say so plainly in the
 *     "What's not here yet" topic rather than quietly omitting it.
 *
 * The `id` of each topic is its anchor and its deep-link target
 * (`/help?topic=<id>`), so empty states across the product can link straight to
 * the paragraph that explains them. Ids are stable; renaming one breaks a link.
 */

/** One paragraph or one list within a topic. */
export type HelpBlock =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };

/** A single Help topic — one heading, a short lead, and its body. */
export interface HelpTopic {
  /** Stable anchor id, also the `?topic=` deep-link value. */
  readonly id: string;
  /** The heading shown in the contents and above the body. */
  readonly title: string;
  /** One sentence answering "what is this?" before any detail. */
  readonly lead: string;
  /** The body, in order. */
  readonly blocks: readonly HelpBlock[];
}

/** A group of related topics, shown as one section of the contents. */
export interface HelpSection {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly HelpTopic[];
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "start",
    title: "Getting started",
    topics: [
      {
        id: "what-is-dalyhub",
        title: "What DalyHub is",
        lead: "One calm place to run a life, instead of a dozen apps that do not know about each other.",
        blocks: [
          {
            kind: "text",
            text: "DalyHub holds your work, your notes, your meetings, the people in your life and your reflections in one system, where everything can be linked to everything else. It is built for one person — you — to use for years, not for a team to administer.",
          },
          {
            kind: "text",
            text: "The value is in the connections. A meeting creates tasks. A task belongs to a project. A project serves a goal. A person turns up across all of them. Nothing is stranded in a list of its own.",
          },
        ],
      },
      {
        id: "spine",
        title: "Areas, Goals, Projects and Tasks",
        lead: "The spine of DalyHub, from the most permanent thing to the smallest.",
        blocks: [
          {
            kind: "list",
            items: [
              "Areas are the ongoing parts of your life — Health, Career, Home, Finance. They never finish.",
              "Goals are outcomes you want, with a way of knowing you got there. They are optional; not all work needs one.",
              "Projects are finite bodies of work with an end. A project can sit under an Area, or advance a Goal.",
              "Tasks are the only things you actually do. A task belongs to a project, or floats in an Area for a one-off.",
            ],
          },
          {
            kind: "text",
            text: "Work rolls up. Completing tasks moves a project along, projects move goals, and goals give an area momentum. That rollup is how you can see whether your days match what you said mattered.",
          },
          {
            kind: "text",
            text: "You do not have to use every level. A task with no project is fine. Structure is there when it earns its keep, not as a rule.",
          },
        ],
      },
      {
        id: "today",
        title: "Today",
        lead: "Where a day starts: what you planned, what is late, and what is worth capturing.",
        blocks: [
          {
            kind: "text",
            text: "Today shows the tasks you planned for today, anything overdue or due soon, the meetings on your day, and a capture box for whatever just landed in your head.",
          },
          {
            kind: "text",
            text: "You can choose which widgets appear and in what order. That arrangement is remembered on this device.",
          },
        ],
      },
    ],
  },
  {
    id: "work",
    title: "Doing the work",
    topics: [
      {
        id: "tasks",
        title: "Tasks",
        lead: "The unit of action. Everything else is context for a task.",
        blocks: [
          {
            kind: "text",
            text: "A task is done or not done. Beyond that it can carry a priority, a scheduled date, a due date, a time sector, a recurrence and a note about who you are waiting on.",
          },
          {
            kind: "text",
            text: "The Tasks page is the full workspace: filter, sort and group however suits the moment, then save that arrangement as a view you can come back to.",
          },
        ],
      },
      {
        id: "scheduled-vs-due",
        title: "Scheduled date versus due date",
        lead: "Two different questions: when will I do this, and when must it be done?",
        blocks: [
          {
            kind: "list",
            items: [
              "The scheduled date is when you intend to work on it. It is a plan you make with yourself, and moving it costs nothing.",
              "The due date is when it actually has to be finished. It usually comes from outside you, and moving it has consequences.",
            ],
          },
          {
            kind: "text",
            text: "A task can have either, both or neither. Today uses the scheduled date to decide what you planned; overdue and due-soon come from the due date.",
          },
        ],
      },
      {
        id: "priority",
        title: "Priority",
        lead: "Four levels, based on urgent versus important — not on how loud something feels.",
        blocks: [
          {
            kind: "list",
            items: [
              "P1 — urgent and important. Do it.",
              "P2 — important, not urgent. Schedule it. This is where the good work lives.",
              "P3 — urgent, not important. Delegate it if you can.",
              "P4 — neither. Question whether it needs doing at all.",
            ],
          },
          {
            kind: "text",
            text: "Priority is always shown as a label, never as colour on its own, so it reads the same whatever theme you use.",
          },
        ],
      },
      {
        id: "time-sectors",
        title: "Time Sectors",
        lead: "A rough shape for the day, instead of pretending you know the exact hour.",
        blocks: [
          {
            kind: "text",
            text: "A time sector puts a task in a part of the day rather than at a time. It is a lighter promise than a calendar slot and it survives a day going sideways.",
          },
        ],
      },
      {
        id: "recurrence",
        title: "Recurrence",
        lead: "For work that comes back on a rhythm.",
        blocks: [
          {
            kind: "text",
            text: "A recurring task creates its next occurrence when you complete the current one, so a missed week does not leave a pile of identical overdue copies behind it.",
          },
          {
            kind: "text",
            text: "A repeat means one of two things, and DalyHub asks which. A FIXED SCHEDULE keeps its day: “every Monday” is still Monday next week even if you finished this one on Wednesday — right for weekly reviews, bins and regular admin. AFTER COMPLETION counts from the day you actually finished: “every 14 days after completion” finished on the 6th falls on the 20th — right for cleaning, maintenance and anything where the clock should restart when the work is done.",
          },
          {
            kind: "text",
            text: "Choose Custom… under Repeat to build anything else: every 3 weeks, every 3 months, or a weekly routine pinned to particular days. Whatever you build, the panel states the result in plain English before you save it.",
          },
          {
            kind: "text",
            text: "Not doing one this time is not the same as doing it. Skip this occurrence moves it to the next date and leaves it open, and your history says it was skipped — never that it was completed. Stop repeating ends the future occurrences and keeps every past one.",
          },
        ],
      },
      {
        id: "inbox",
        title: "Task Inbox",
        lead: "Where anything captured without a home waits for you.",
        blocks: [
          {
            kind: "text",
            text: "Capture first, sort later. A task with no project, no date and no priority sits in the Inbox until you give it one. An empty Inbox means nothing is waiting on a decision.",
          },
          {
            kind: "text",
            text: "Sorting is meant to be quick. On the task list, the priority, the dates and the project are all editable where they are shown — click the value, choose, done. To clear several at once, choose Select tasks (or press and hold a row on a phone), tick what you want and act on the whole set together.",
          },
        ],
      },
      {
        id: "projects",
        title: "Projects",
        lead: "A finite body of work with an end you can name.",
        blocks: [
          {
            kind: "text",
            text: "A project holds its tasks, its notes, the people involved and its own history. Its progress is worked out from its tasks — a project with no tasks reads as having nothing to measure yet, not as 0% done.",
          },
        ],
      },
      {
        id: "areas-goals",
        title: "Areas and Goals",
        lead: "The long view: the parts of your life, and what you want from them.",
        blocks: [
          {
            kind: "text",
            text: "An Area is a standing domain of life and never completes. A Goal is a specific outcome with a definition of done and, usually, a target date.",
          },
          {
            kind: "text",
            text: "Goal progress is worked out from the projects contributing to it. It is deliberately kept separate from marking the goal complete, so you always know the difference between the work being done and you deciding it is done.",
          },
        ],
      },
    ],
  },
  {
    id: "context",
    title: "Context and memory",
    topics: [
      {
        id: "meetings",
        title: "Meetings",
        lead: "A record of what was said, who was there and what you agreed to do.",
        blocks: [
          {
            kind: "text",
            text: "Capture notes while the meeting is happening, then turn the commitments into real tasks. Those tasks stay linked back to the meeting, so you can always find where a promise came from.",
          },
          {
            kind: "text",
            text: "Marking a meeting held is what adds it to the history of everyone who attended.",
          },
        ],
      },
      {
        id: "people",
        title: "People",
        lead: "Not a contacts list, and not a sales pipeline. A memory of the people in your life.",
        blocks: [
          {
            kind: "text",
            text: "A person's record accumulates the meetings you had, the commitments made and what you have learned about them. The point is to be a better friend and colleague, not to manage anyone.",
          },
          {
            kind: "text",
            text: "DalyHub can gently show when you have not been in touch with someone for a while. It is a prompt, not a scoreboard, and it is never used to make you feel bad.",
          },
        ],
      },
      {
        id: "diary",
        title: "Diary",
        lead: "What happened, as it happens.",
        blocks: [
          {
            kind: "text",
            text: "The Diary is for short entries logged through the day — an observation, a decision, a reflection — rather than one long entry at night. You can read it a day at a time or as a running timeline.",
          },
        ],
      },
      {
        id: "notes",
        title: "Notes",
        lead: "Longer thinking, in Markdown you own.",
        blocks: [
          {
            kind: "text",
            text: "Notes are written and stored as Markdown, so they stay portable and you can always take them elsewhere. A note saves itself as you write — there is no Save button. The small status beside the toolbar tells you where a save is up to, and if a save fails your writing stays exactly where it is with a Retry beside it.",
          },
          {
            kind: "text",
            text: "There are two ways to link a note to another record, and both create a real relationship the other record can see. Type [[double brackets]] around a record's title while you are writing — quickest, and it finds the record by name. Or use the Record link button in the toolbar to search for a specific record and insert it. Use the button when the exact record matters: it links by identity, so the link keeps working if the record is renamed, and two records with the same title can never be confused.",
          },
          {
            kind: "text",
            text: "Simply writing a note's title in a sentence does not link anything, and neither does a link written inside a code block. A link has to be one you actually made.",
          },
          {
            kind: "text",
            text: "The Backlinks tab shows every record that links TO this note, grouped by the part of DalyHub it came from, with the sentence that mentions it where we can show one. The Links tab shows what this note points AT. If a link's target is later deleted, the note is untouched — following the link just tells you the record is no longer there.",
          },
          {
            kind: "text",
            text: "Tags group notes across projects and areas. Filters on the Notes list narrow by search text, tag, project, area, or whether a note is linked to anything at all — “Unlinked notes” is there so you can find notes that never got connected, and leave them that way if that is what you want.",
          },
          {
            kind: "text",
            text: "Search looks inside a note's body, not just its title, so you can find a note by something you remember writing in it.",
          },
          {
            kind: "text",
            text: "Archiving a note puts it away but keeps it — it stays readable and still turns up in search, marked as archived. Deleting is separate and also reversible: a deleted note leaves the list and its page stops opening, and you can restore it from the Undo message or the Deleted view.",
          },
          {
            kind: "text",
            text: "From the ⋯ menu you can export one note as Markdown or plain text, copy either to the clipboard, or print it. The export includes the note's title, dates, tags and links, and the Markdown is exactly what you wrote.",
          },
          {
            kind: "text",
            text: "If a note is changed somewhere else — another tab or another device — while you have unsaved writing open, DalyHub tells you rather than picking a winner. Your writing is never overwritten. You choose whether to load the newer version or keep what you have. Nothing is merged automatically, because merging two versions of prose reliably is not something we can promise.",
          },
        ],
      },
      {
        id: "assets",
        title: "Assets",
        lead: "The things you own that need looking after.",
        blocks: [
          {
            kind: "text",
            text: "An asset record holds what a thing is, what it cost and the dates that matter — registration, warranty, insurance, service. It exists so a renewal never surprises you.",
          },
          {
            kind: "text",
            text: "An asset keeps three separate things, and it helps to know which is which. Its details are what is true right now — the current warranty expiry, the current odometer reading. Its history is what has happened to it. Its obligations are what it will need next.",
          },
        ],
      },
      {
        id: "asset-history",
        title: "Asset history",
        lead: "What has actually happened to the thing you own.",
        blocks: [
          {
            kind: "text",
            text: "The History tab is the asset's life: every service, repair, inspection, renewal, valuation, modification and anything else worth remembering. Each entry carries the date, what was done, and only the details that apply — a repair usually has a cost and a mechanic, an inspection might be a date and a sentence.",
          },
          {
            kind: "text",
            text: "There are six quick ways to add an entry: record a service, record a repair, update the meter, record a renewal, record a valuation, or add a general history entry. Each asks for the least that can work. Anything else is behind “More details”, and most entries never need it.",
          },
          {
            kind: "text",
            text: "Recording work can update the asset itself. A service with a next-service date moves the asset's next service; a renewal moves its renewal date; a warranty entry moves its warranty expiry. This only ever moves dates FORWARD, so writing up a service from three years ago will not pull today's schedule backwards.",
          },
          {
            kind: "text",
            text: "That is also why a mistake in a current date is fixed on the Details tab rather than by editing history. Editing an entry corrects the record of what happened; it does not rewrite a date you set on purpose.",
          },
          {
            kind: "text",
            text: "A provider can just be a name. Typing “Northside Auto” does not create a person record. If the provider IS someone in your People, you can link them as well — but you never have to.",
          },
          {
            kind: "text",
            text: "Receipts, service reports, policy documents and registration papers live in Notes, linked from the entry. DalyHub does not store files yet, so it does not pretend to.",
          },
        ],
      },
      {
        id: "asset-obligations",
        title: "Maintenance and renewals",
        lead: "What an asset will need next, and when.",
        blocks: [
          {
            kind: "text",
            text: "An obligation is something the asset will need: registration renewed by September, a service every six months, new tyres at 60,000 km. Add them on the asset's Obligations tab. They show overdue first, then due soon, then later, with finished ones tucked away.",
          },
          {
            kind: "text",
            text: "There are two ways something can become due, and an obligation can use either or both.",
          },
          {
            kind: "list",
            items: [
              "By date — registration renewed yearly, a service every six months, an inspection each January.",
              "By meter — a service every 10,000 kilometres, maintenance after 200 running hours, a part replaced every 500 cycles.",
            ],
          },
          {
            kind: "text",
            text: "When an obligation uses both, whichever comes first wins. Six months or 10,000 km means exactly that.",
          },
          {
            kind: "text",
            text: "Meter readings are only ever compared in the same unit. DalyHub will not quietly turn kilometres into miles — if the obligation is set in kilometres and the last reading was in miles, it says so rather than guessing.",
          },
          {
            kind: "text",
            text: "If an asset has a meter obligation and no recent reading, DalyHub says “Current meter reading needed”. It will not call you overdue for something it cannot measure. Use “Update meter” on the History tab and the state resolves itself.",
          },
          {
            kind: "text",
            text: "When you complete a repeating obligation, the next one is scheduled from the day the work was ACTUALLY done, not the day it was originally due. A service done two months late does not leave you permanently two months behind. You can always type the real next date instead — the one printed on the new registration certificate beats any calculation.",
          },
        ],
      },
      {
        id: "asset-tasks",
        title: "Asset tasks: doing it versus recording it",
        lead: "Ticking off “book the service” is not the same as the car being serviced.",
        blocks: [
          {
            kind: "text",
            text: "An obligation can have a task, so it turns up in Tasks and on Today alongside everything else you have committed to. Create one with “Create task” on the obligation.",
          },
          {
            kind: "text",
            text: "The obligation stays in charge of the asset side — the due date, how often it repeats, what it means. The task is just the reminder to act. If you change the obligation's due date, the task follows, so the two never drift apart.",
          },
          {
            kind: "text",
            text: "Completing the TASK does not complete the obligation. Ticking off “book the service” means you booked it, not that the car was serviced. So the obligation stays open and says: its task is done, record what actually happened. Completing the OBLIGATION does the opposite — it records what happened as history, updates the asset, schedules the next one, and closes the task for you.",
          },
          {
            kind: "text",
            text: "Deleting a task never deletes the obligation. The obligation notices the task is gone and lets you create a fresh one.",
          },
          {
            kind: "text",
            text: "On Today, you will not see the same job twice. If an obligation already has an open task, the task carries it and the Assets section says how many it is holding. The moment that task is done, the obligation comes back — which is exactly when you need to write up what happened.",
          },
        ],
      },
      {
        id: "asset-costs",
        title: "Recorded costs and value",
        lead: "What you have spent, and what it is worth — as far as DalyHub knows.",
        blocks: [
          {
            kind: "text",
            text: "Costs on history entries add up into a summary on the asset's Overview: service and maintenance, repairs, renewals and registration, upgrades and modifications.",
          },
          {
            kind: "text",
            text: "These are called RECORDED costs on purpose. DalyHub can only add up what you have entered, so it never claims to be the true cost of owning something. The purchase price is kept separate from ongoing costs, and combined only under a clearly labelled lifetime total.",
          },
          {
            kind: "text",
            text: "Amounts in different currencies are never added together. If some entries are in another currency, DalyHub totals the main one and tells you which it left out.",
          },
          {
            kind: "text",
            text: "Value history is whatever valuations you record — an insurance figure, a dealer quote. DalyHub does not estimate what anything is worth, and it will not draw a trend from two data points, because two points are not a trend.",
          },
        ],
      },
      {
        id: "asset-lifecycle",
        title: "Archiving and deleting an asset",
        lead: "Putting something away without losing its story.",
        blocks: [
          {
            kind: "text",
            text: "Archiving an asset puts the record away without destroying anything. Its history and obligations are kept, and it stops asking for things — its renewals leave Today. Restore it and the outstanding ones come back; finished work stays finished.",
          },
          {
            kind: "text",
            text: "Deleting an asset permanently is only offered once nothing else links to it, and it takes the history with it. Archive is almost always the one you want.",
          },
          {
            kind: "text",
            text: "Removing a single history entry is safe: an obligation you completed stays completed and its schedule keeps running, it just loses the write-up.",
          },
          {
            kind: "text",
            text: "One thing to know: DalyHub reminds you inside the app. It shows renewals on Today, on the asset and on the Assets list — but it does not send you an email or a phone notification. If you have not opened DalyHub, it cannot reach you.",
          },
        ],
      },
    ],
  },
  {
    id: "reflect",
    title: "Reflecting",
    topics: [
      {
        id: "reviews",
        title: "Reviews",
        lead: "Stepping back on purpose, on a rhythm.",
        blocks: [
          {
            kind: "text",
            text: "A review is a written check-in over a period — what moved, what did not, and what you are changing. Reviews are how the system stops being a to-do list and starts being something you steer with.",
          },
        ],
      },
      {
        id: "review-inbox",
        title: "Review Inbox",
        lead: "The things worth a second look before you decide.",
        blocks: [
          {
            kind: "text",
            text: "The Review Inbox gathers what has drifted — work that stalled, items that were never triaged — so a review has something concrete to work from instead of a blank page.",
          },
        ],
      },
    ],
  },
  {
    id: "moving",
    title: "Getting around",
    topics: [
      {
        id: "search",
        title: "Search",
        lead: "One search across everything you have.",
        blocks: [
          {
            kind: "text",
            text: "Search looks across tasks, projects, notes, meetings, people, diary entries and assets at once. Results show which kind of record each one is, so you can tell a note from a task at a glance.",
          },
        ],
      },
      {
        id: "command-palette",
        title: "Command Palette",
        lead: "Anything you can click, you can type.",
        blocks: [
          {
            kind: "text",
            text: "Press Ctrl+K (Cmd+K on a Mac) anywhere to open the Command Palette. Start typing what you want to do and run it without leaving the keyboard.",
          },
        ],
      },
      {
        id: "keyboard",
        title: "Keyboard shortcuts",
        lead: "The keys worth learning, and where to see the rest.",
        blocks: [
          {
            kind: "text",
            text: "Press ? on any screen to see the full keyboard reference. Escape always closes whatever is on top, or clears a selection.",
          },
          {
            kind: "text",
            text: "Press / to search. On Today you can move through your tasks with the arrow keys, open one with Enter, complete it with C, and plan it for today with P or tomorrow with Shift+P.",
          },
          {
            kind: "text",
            text: "Single-key shortcuts never fire while you are typing in a field, so a question mark in a note stays a question mark.",
          },
        ],
      },
      {
        id: "mobile",
        title: "On a phone",
        lead: "The same DalyHub, reachable with one thumb.",
        blocks: [
          {
            kind: "text",
            text: "On a phone the main destinations sit in a bar along the bottom, with More for everything else. The Capture button in the middle opens quick capture from anywhere — the fastest way to get something out of your head.",
          },
          {
            kind: "text",
            text: "Records open full screen with their actions pinned at the bottom, above the keyboard.",
          },
        ],
      },
    ],
  },
  {
    id: "managing",
    title: "Looking after your data",
    topics: [
      {
        id: "archive-delete",
        title: "Archive, delete and restore",
        lead: "Two different intentions, and neither of them is permanent by surprise.",
        blocks: [
          {
            kind: "list",
            items: [
              "Archive means finished with, but worth keeping. Archived records leave your active lists and stay fully readable and searchable.",
              "Delete means it should not have existed. A deleted record is removed from view and can be restored.",
            ],
          },
          {
            kind: "text",
            text: "Both are reversible from the record itself, and DalyHub will not let you archive something in a way that strands the records linked to it.",
          },
        ],
      },
      {
        id: "themes",
        title: "Appearance and Settings",
        lead: "How DalyHub decides between light and dark, and the defaults that shape how it opens.",
        blocks: [
          {
            kind: "text",
            text: "DalyHub has one light appearance and one dark one, and you choose which to use: System, Light or Dark. System is the default and follows your phone or computer, changing with it the moment you do. Light and Dark stay put whatever your device is set to.",
          },
          {
            kind: "text",
            text: "The choice lives in two places, and they are the same setting: your account menu (the avatar at the top right, or at the bottom of the navigation sheet on a phone) and Settings → General → Appearance. It is saved to your account, so it follows you to your other devices.",
          },
          {
            kind: "text",
            text: "Settings also holds your timezone and date format, which page DalyHub opens on, the default Tasks view and Diary mode, and which module rows appear in navigation.",
          },
        ],
      },
      {
        id: "ai",
        title: "AI assistance",
        lead: "DalyHub can help you read your own records. It never changes them on its own.",
        blocks: [
          {
            kind: "text",
            text: "AI in DalyHub does three things, and only three: it pulls the actions and decisions out of a meeting or a note, it writes a summary of your week for the guided weekly review, and it answers questions about your own records. It is not a chatbot, it has no access to the internet, it keeps no conversation history, and it cannot browse or change anything by itself.",
          },
          {
            kind: "text",
            text: "The rule behind all of it: DalyHub picks what to send, the AI comes back with a suggestion, and you decide what becomes part of DalyHub. Nothing is added, edited or deleted until you tick it and press the button. Anything you don’t accept is simply discarded.",
          },
          {
            kind: "text",
            text: "A meeting can suggest tasks and notes. Tasks become ordinary follow-up work on that meeting — the same as pressing “Create task” on an item yourself, so they show in the meeting’s Follow-up tab. Notes become ordinary notes, linked back to the meeting they came from. Both start unticked, both are yours to edit before you keep them, and ticking a task never keeps a note along with it. A note suggestion you never tick is simply thrown away when you leave the tab; it is not saved anywhere.",
          },
          {
            kind: "text",
            text: "A task you accept from a note keeps a link back to that note, so you can always see what a piece of work came from. And if you accept the same suggestion twice — after a dropped connection, say — you get back the record you already have, never a duplicate.",
          },
          {
            kind: "text",
            text: "Some questions never reach an AI at all. Ask DalyHub how many tasks are overdue, or when your last meeting was, and DalyHub reads the answer straight out of your records — it says so when it does, and that costs nothing.",
          },
          {
            kind: "text",
            text: "It needs your own developer account. AI assistance is off until you add an API key from Anthropic or OpenAI as a server secret. That is a developer account, billed by usage — it is NOT the same thing as a ChatGPT Plus or Claude subscription, and a subscription does not give you one. DalyHub does not include an account, credits or any usage of its own; you pay your provider directly for what you use.",
          },
          {
            kind: "text",
            text: "Because it is your money, DalyHub enforces its own budget before it contacts anyone. It starts at ten US dollars a month, with a smaller daily ceiling, and deep analysis turned off. When a limit is reached the AI actions switch off with a plain explanation and nothing is sent — the rest of DalyHub is untouched. You can raise a budget in Settings, deliberately; it never rises on its own.",
          },
          {
            kind: "text",
            text: "Every answer shows its working. A statement about your records is shown with the records it came from — you can open each one — and anything the AI worked out rather than read is labelled as an inference. If it can’t find enough to answer, it says so instead of making something up.",
          },
          {
            kind: "list",
            items: [
              "What is sent: only the records DalyHub selects for that one request, and it tells you how many and of what kinds before it runs.",
              "What is not sent by default: anything in a sensitive category — health, family, relationships, financial, and your own diary and reflections. You can allow a category in Settings if you want to.",
              "What DalyHub records: how long a request took, what it cost and which feature it was. Not what was in it.",
              "What your provider records: their own business, under their own policy. DalyHub asks OpenAI not to keep the retrievable copy of a request that its API keeps by default, but that is a request about one kind of storage — it is not a promise that nothing is retained. A provider’s own abuse monitoring and any legal retention still apply, DalyHub cannot see or change them, and it does not claim they never store anything. Read your provider’s developer-platform data policy, and only send information you are permitted to share with them.",
            ],
          },
          {
            kind: "text",
            text: "What it cannot do: change your data, create anything without you accepting it, act on a schedule, watch your workspace in the background, run itself, search the internet, or remember one question when you ask the next. It also cannot be trusted to follow instructions hidden inside your own notes — DalyHub treats everything in a record as information to read, never as a command.",
          },
          {
            kind: "text",
            text: "To turn it off, go to Settings → AI and turn AI assistance off. Everything else in DalyHub works exactly the same way with AI off as with it on — it has always been optional, and nothing depends on it.",
          },
        ],
      },
      {
        id: "privacy",
        title: "Your data and privacy",
        lead: "This is your system. Nothing in it is anyone else's product.",
        blocks: [
          {
            kind: "text",
            text: "DalyHub is a single-owner application. Your data is scoped to you and your workspace, checked on the server on every request, and shown to nobody else.",
          },
          {
            kind: "text",
            text: "Notes and diary entries are stored as Markdown, which means your writing stays in a plain, portable format rather than locked in a database format only DalyHub can read.",
          },
        ],
      },
      {
        id: "export",
        title: "Getting your data out",
        lead: "Everything you have put in, in two shapes, whenever you want it.",
        blocks: [
          {
            kind: "text",
            text: "Settings → Privacy & data offers two downloads. Both are built from the same snapshot of your workspace, taken the moment you press the button, so they always describe the same thing.",
          },
          {
            kind: "list",
            items: [
              "Download full DalyHub export — a ZIP holding one structured file with every record, relationship and event in it, plus a description of what it contains and checksums you can verify. This is the complete, machine-readable copy.",
              "Download Obsidian vault — a ZIP holding a folder of Markdown files, one per record, with working links between them. Extract it and open the folder in Obsidian, or read it in any text editor. No plugin needed.",
            ],
          },
          {
            kind: "text",
            text: "Both include everything: your areas, goals, projects, tasks, notes, diary, meetings, people, assets, reviews, the links between them and the activity history. Records you archived or deleted are included too, clearly marked, so a copy is a real copy rather than a tidied one. Your writing is exported exactly as you wrote it.",
          },
          {
            kind: "text",
            text: "An export contains everything private in your workspace — people's contact details, diary entries, meeting notes, reflections. DalyHub generates it on demand, never stores it and never sends it anywhere. Once it is on your device, looking after it is up to you.",
          },
          {
            kind: "text",
            text: "The full DalyHub export is also your backup: DalyHub can read it back in. Settings \u2192 Privacy & data \u2192 Restore takes that ZIP, checks it, shows you what it contains and what would happen to this workspace, and changes nothing until you confirm. If this workspace already holds records, restoring replaces them \u2014 so DalyHub takes a backup of what you have now, checks it can be read back, and gives it to you first.",
          },
        ],
      },
      {
        id: "not-yet",
        title: "What is not here yet",
        lead: "Said plainly, so you know what to rely on.",
        blocks: [
          {
            kind: "text",
            text: "These are deliberately not built yet. They are not hidden behind a setting and there is no partial version of them:",
          },
          {
            kind: "list",
            items: [
              "Automatic backups on your behalf. You can download a full export and restore it (see \u201cGetting your data out\u201d), but DalyHub does not keep copies for you or take one on a schedule. Downloading one after a significant week is worth the ten seconds.",
              "Import and calendar sync. Nothing connects to Todoist, Notion or a calendar.",
              "Weather on Today. There is no weather data source, so there is no weather widget.",
              "Notifications and reminders. DalyHub will not email you, push to you or nag you.",
              "AI. There is no AI in DalyHub yet. When there is, it will propose changes for you to accept or reject — it will never edit your data on its own.",
              "Building your own theme. You can choose from the five; you cannot yet make a sixth.",
            ],
          },
          {
            kind: "text",
            text: "This deployment is run by its owner. There is no support desk, no account recovery, and no second copy of your data somewhere else unless you download an export and keep it yourself.",
          },
        ],
      },
    ],
  },
];

/** Every topic, flattened, in the order Help presents them. */
export const HELP_TOPICS: readonly HelpTopic[] = HELP_SECTIONS.flatMap(
  (section) => section.topics,
);

/**
 * Resolve a `?topic=` value to a real topic id, or null. Validated against the
 * content rather than trusted, so a stale or hand-typed link opens Help rather
 * than an empty page.
 */
export function resolveHelpTopicId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return HELP_TOPICS.some((topic) => topic.id === value) ? value : null;
}

/**
 * The deep link to a Help topic — re-exported from the shared layer, which owns it
 * so other modules can link into Help without importing this module's internals
 * (see `app/shared/help/help-link.ts` for why).
 */
export { helpTopicHref } from "~/shared/help";
