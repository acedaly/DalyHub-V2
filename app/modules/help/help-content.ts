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
            text: "Today shows the tasks you planned for today, anything overdue or due soon, your meetings, and a capture box for whatever just landed in your head.",
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
            text: "Notes are written and stored as Markdown, so they stay portable and you can always take them elsewhere. Use [[double brackets]] to link a note to another record; those links work in both directions.",
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
        title: "Themes and Settings",
        lead: "Five themes, and the defaults that shape how DalyHub opens.",
        blocks: [
          {
            kind: "text",
            text: "Settings → Appearance offers five themes: Daly Light, Daly Dark, Eucalypt, Coastal and Ember, plus Match system, which follows your device between Daly Light and Daly Dark. A theme applies straight away and is saved to your account, so it follows you to any browser you sign in from.",
          },
          {
            kind: "text",
            text: "Settings also holds your timezone and date format, which page DalyHub opens on, the default Tasks view and Diary mode, and which module rows appear in navigation.",
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
              "Export and backup. There is no way to take a full copy of your data out yet, so treat DalyHub as one copy rather than an archive.",
              "Import and calendar sync. Nothing connects to Todoist, Notion or a calendar.",
              "Weather on Today. There is no weather data source, so there is no weather widget.",
              "Notifications and reminders. DalyHub will not email you, push to you or nag you.",
              "AI. There is no AI in DalyHub yet. When there is, it will propose changes for you to accept or reject — it will never edit your data on its own.",
              "Building your own theme. You can choose from the five; you cannot yet make a sixth.",
            ],
          },
          {
            kind: "text",
            text: "This deployment is run by its owner. There is no support desk, no account recovery and no second copy of your data somewhere else.",
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
 * The deep link to a Help topic. Empty states use this to point at the paragraph
 * that explains them, so "no dead ends" (AGENTS.md §6) has somewhere to go.
 */
export function helpTopicHref(topicId: string): string {
  return `/help?topic=${encodeURIComponent(topicId)}`;
}
