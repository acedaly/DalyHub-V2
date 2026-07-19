/**
 * PX-02 — the DalyHub outline icon set.
 *
 * One consistent, in-house outline set (24×24, currentColor, 1.75px). Two groups:
 *   - ENTITY icons — one per entity type; consumed only through the entity-identity
 *     map (app/shared/entity), never hand-picked at a call site.
 *   - UI icons — the frame's affordances (search, command, settings, menu, close,
 *     chevrons, theme, view switcher, new, sign-out, inbox for empty states).
 *
 * Each is a tiny tree-shakeable component sharing one accessibility/sizing contract
 * (see Icon.tsx). Add an icon here; never inline a one-off SVG at a call site.
 */

import { createIcon } from "./Icon";

/* -------------------------------------------------------------------------- */
/* Entity icons (one per entity type — consumed via the entity-identity map).  */
/* -------------------------------------------------------------------------- */

/** Area — stacked layers (a permanent domain of life). */
export const AreaIcon = createIcon(
  "AreaIcon",
  <>
    <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
    <path d="m3 12 9 4.5 9-4.5" />
    <path d="m3 16.5 9 4.5 9-4.5" />
  </>,
);

/** Goal — a target (a desired outcome). */
export const GoalIcon = createIcon(
  "GoalIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.75" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
  </>,
);

/** Project — columns of work (a finite body of work). */
export const ProjectIcon = createIcon(
  "ProjectIcon",
  <>
    <rect x="3.5" y="4" width="6" height="16" rx="1.5" />
    <rect x="14.5" y="4" width="6" height="10" rx="1.5" />
  </>,
);

/** Task — a checked circle (an atomic action). */
export const TaskIcon = createIcon(
  "TaskIcon",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);

/** Note — a document with text lines. */
export const NoteIcon = createIcon(
  "NoteIcon",
  <>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </>,
);

/** Meeting — people together. */
export const MeetingIcon = createIcon(
  "MeetingIcon",
  <>
    <circle cx="9" cy="9" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M16 7a3 3 0 0 1 0 5.7" />
    <path d="M17.5 19a5.5 5.5 0 0 0-2.5-4.6" />
  </>,
);

/** Person — a single person. */
export const PersonIcon = createIcon(
  "PersonIcon",
  <>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </>,
);

/** Asset — a package/box (a thing of value). */
export const AssetIcon = createIcon(
  "AssetIcon",
  <>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
    <path d="m4 7 8 4 8-4" />
    <path d="M12 11v10" />
  </>,
);

/** Diary — an open book (a private journal). */
export const DiaryIcon = createIcon(
  "DiaryIcon",
  <>
    <path d="M12 5.5C10.5 4 8 3.5 4 4v14c4-.5 6.5 0 8 1.5" />
    <path d="M12 5.5C13.5 4 16 3.5 20 4v14c-4-.5-6.5 0-8 1.5" />
    <path d="M12 5.5v14" />
  </>,
);

/** Review — a cycle (a recurring ritual). */
export const ReviewIcon = createIcon(
  "ReviewIcon",
  <>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4h-4" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* UI icons (frame affordances).                                               */
/* -------------------------------------------------------------------------- */

/** Search — a magnifier. */
export const SearchIcon = createIcon(
  "SearchIcon",
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.6-4.6" />
  </>,
);

/** Command — the ⌘ glyph, for the palette affordance. */
export const CommandIcon = createIcon(
  "CommandIcon",
  <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z" />,
);

/** Settings — a gear. */
export const SettingsIcon = createIcon(
  "SettingsIcon",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
  </>,
);

/** Menu — a hamburger (mobile nav toggle). */
export const MenuIcon = createIcon(
  "MenuIcon",
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>,
);

/** Close — an X. */
export const CloseIcon = createIcon(
  "CloseIcon",
  <>
    <path d="m6 6 12 12" />
    <path d="m18 6-12 12" />
  </>,
);

/** Chevron down — disclosure/menu indicator. */
export const ChevronDownIcon = createIcon(
  "ChevronDownIcon",
  <path d="m6 9 6 6 6-6" />,
);

/** Chevron right — nested/forward indicator. */
export const ChevronRightIcon = createIcon(
  "ChevronRightIcon",
  <path d="m9 6 6 6-6 6" />,
);

/** Sun — the light theme option. */
export const SunIcon = createIcon(
  "SunIcon",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
  </>,
);

/** Moon — the dark theme option. */
export const MoonIcon = createIcon(
  "MoonIcon",
  <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
);

/** Monitor — the system theme option. */
export const MonitorIcon = createIcon(
  "MonitorIcon",
  <>
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
    <path d="M9 20.5h6" />
    <path d="M12 16.5v4" />
  </>,
);

/** List — the list view. */
export const ListIcon = createIcon(
  "ListIcon",
  <>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </>,
);

/** Board — the board view. */
export const BoardIcon = createIcon(
  "BoardIcon",
  <>
    <rect x="3.5" y="4.5" width="6" height="15" rx="1.5" />
    <rect x="14.5" y="4.5" width="6" height="10" rx="1.5" />
  </>,
);

/** Grid — the grid view. */
export const GridIcon = createIcon(
  "GridIcon",
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>,
);

/** Plus — a create/new action. */
export const PlusIcon = createIcon(
  "PlusIcon",
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);

/** Sign out — an arrow leaving a door. */
export const SignOutIcon = createIcon(
  "SignOutIcon",
  <>
    <path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" />
    <path d="M10 8 6 12l4 4" />
    <path d="M6 12h9" />
  </>,
);

/** Inbox — the default empty-state glyph. */
export const InboxIcon = createIcon(
  "InboxIcon",
  <>
    <path d="M4 13 6.5 5h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" />
    <path d="M4 13h4l1.5 2.5h5L16 13h4" />
  </>,
);

/** Brand mark — DalyHub's glyph (a hub with connected nodes). */
export const BrandMark = createIcon(
  "BrandMark",
  <>
    <circle cx="12" cy="12" r="2.5" />
    <circle cx="12" cy="4.5" r="1.75" />
    <circle cx="12" cy="19.5" r="1.75" />
    <circle cx="5" cy="8" r="1.75" />
    <circle cx="19" cy="8" r="1.75" />
    <circle cx="5" cy="16" r="1.75" />
    <circle cx="19" cy="16" r="1.75" />
    <path d="M12 6.25v3.25M12 14.5v3.25M6.5 8.9 10 11M17.5 8.9 14 11M6.5 15.1 10 13M17.5 15.1 14 13" />
  </>,
);
