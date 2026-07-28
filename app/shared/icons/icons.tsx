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

/** More — the overflow (⋯) affordance (DS-12). Horizontal, never vertical. */
export const MoreIcon = createIcon(
  "MoreIcon",
  <>
    <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </>,
);

/** Archive — a lidded box. The reversible "move it out of the way" lifecycle act. */
export const ArchiveIcon = createIcon(
  "ArchiveIcon",
  <>
    <path d="M3.5 7h17v2.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V7Z" />
    <path d="M5 10v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
    <path d="M10 13.5h4" />
  </>,
);

/** Restore — a counter-clockwise arrow returning a record to its active life. */
export const RestoreIcon = createIcon(
  "RestoreIcon",
  <>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4.5V9h4.5" />
  </>,
);

/** Trash — deletion. Always paired with the word "Delete", never colour alone. */
export const TrashIcon = createIcon(
  "TrashIcon",
  <>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
    <path d="M6.5 6.5 7.4 19a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12.5" />
    <path d="M10.5 10v6M13.5 10v6" />
  </>,
);

/** Pencil — an edit/rename action. */
export const EditIcon = createIcon(
  "EditIcon",
  <>
    <path d="m14.5 5.5 4 4" />
    <path d="M6 18.5H4.5V17L16 5.5a1 1 0 0 1 1.4 0l1.6 1.6a1 1 0 0 1 0 1.4L6 20" />
  </>,
);

/** Check — completion. */
export const CheckIcon = createIcon(
  "CheckIcon",
  <path d="m5 12.5 4.5 4.5L19 7" />,
);

/* -------------------------------------------------------------------------- */
/* Subtype glyphs (PX-05). Distinct from the ENTITY glyphs above: a subtype is  */
/* subordinate to its entity's identity and must never wear another entity's    */
/* icon (a Diary "meeting" entry is not a Meeting record).                      */
/* -------------------------------------------------------------------------- */

/** Chat — a conversation. */
export const ChatIcon = createIcon(
  "ChatIcon",
  <>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16H5.5A1.5 1.5 0 0 1 4 14.5Z" />
  </>,
);

/** Calendar — a scheduled moment (a Diary meeting/event entry). */
export const CalendarIcon = createIcon(
  "CalendarIcon",
  <>
    <rect x="4" y="5.5" width="16" height="14" rx="1.5" />
    <path d="M4 9.5h16" />
    <path d="M8.5 3.5v4M15.5 3.5v4" />
  </>,
);

/** Lightbulb — an idea. */
export const IdeaIcon = createIcon(
  "IdeaIcon",
  <>
    <path d="M9 17a5.5 5.5 0 1 1 6 0v1.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z" />
    <path d="M10 21h4" />
  </>,
);

/** Signpost — a decision taken. */
export const DecisionIcon = createIcon(
  "DecisionIcon",
  <>
    <path d="M12 3.5v17" />
    <path d="M6 6.5h10l2.5 2.5L16 11.5H6Z" />
    <path d="M18 14.5H8l-2.5 2.5L8 19.5h10Z" />
  </>,
);

/** Plane — travel. */
export const TravelIcon = createIcon(
  "TravelIcon",
  <>
    <path d="M10.5 4.5a1.5 1.5 0 0 1 3 0V10l7 4v2l-7-2v3.5l2 1.5v1.5l-3.5-1-3.5 1V19l2-1.5V14l-7 2v-2l7-4Z" />
  </>,
);

/** Eye — an observation. */
export const ObservationIcon = createIcon(
  "ObservationIcon",
  <>
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.5" />
  </>,
);

/** Ripple — a reflection (looking back on something). */
export const ReflectionIcon = createIcon(
  "ReflectionIcon",
  <>
    <path d="M3.5 15.5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 2 1.2 3.5 0" />
    <path d="M3.5 19.5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0 2 1.2 3.5 0" />
    <circle cx="12" cy="7" r="3" />
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

/* -------------------------------------------------------------------------- */
/* Asset subtype icons (ASSET-01 — one per Asset type, consumed via the        */
/* module-local asset-type icon registry, never hand-picked at a call site).   */
/* -------------------------------------------------------------------------- */

/** Vehicle — a car silhouette. */
export const VehicleIcon = createIcon(
  "VehicleIcon",
  <>
    <path d="M3 13.5 5 8.5a2 2 0 0 1 1.9-1.3h10.2A2 2 0 0 1 19 8.5l2 5" />
    <path d="M3 13.5h18v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4Z" />
    <circle cx="7" cy="15.5" r="0.75" fill="currentColor" stroke="none" />
    <circle cx="17" cy="15.5" r="0.75" fill="currentColor" stroke="none" />
  </>,
);

/** Trailer or camper — a towed caravan. */
export const TrailerIcon = createIcon(
  "TrailerIcon",
  <>
    <path d="M3 8h13a2 2 0 0 1 2 2v6H3V8Z" />
    <path d="M18 12h2l1 2v2h-3" />
    <circle cx="8" cy="17.5" r="1.5" />
    <path d="M3 16h1.5M11.5 16H18" />
  </>,
);

/** Equipment — a gear (machinery). */
export const EquipmentIcon = createIcon(
  "EquipmentIcon",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
  </>,
);

/** Appliance — a boxy machine with a control. */
export const ApplianceIcon = createIcon(
  "ApplianceIcon",
  <>
    <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
    <path d="M5 8h14" />
    <circle cx="15.5" cy="5.75" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14" r="3" />
  </>,
);

/** Electronics — a monitor/screen. */
export const ElectronicsIcon = createIcon(
  "ElectronicsIcon",
  <>
    <rect x="3" y="5" width="18" height="11" rx="1.5" />
    <path d="M9 20h6M12 16v4" />
  </>,
);

/** Tool — a wrench. */
export const ToolIcon = createIcon(
  "ToolIcon",
  <>
    <path d="M14.5 6a3.5 3.5 0 0 0-4.6 4.3L4 16.2 6.8 19l5.9-5.9A3.5 3.5 0 0 0 17 8.5l-2.2 2.2-1.5-1.5L15.5 7" />
  </>,
);

/** Property item — a house. */
export const PropertyIcon = createIcon(
  "PropertyIcon",
  <>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
    <path d="M10 19v-5h4v5" />
  </>,
);

/** Document — a page with lines. */
export const DocumentIcon = createIcon(
  "DocumentIcon",
  <>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6M9 15.5h6" />
  </>,
);

/** Licence — an ID card. */
export const LicenceIcon = createIcon(
  "LicenceIcon",
  <>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <circle cx="8" cy="11" r="1.75" />
    <path d="M5.5 15.5a2.75 2.75 0 0 1 5 0M14 10h4M14 13h3" />
  </>,
);

/** Insurance — a shield (protection). */
export const ShieldIcon = createIcon(
  "ShieldIcon",
  <>
    <path d="M12 3.5 5 6v5c0 4.4 3 7.6 7 9.5 4-1.9 7-5.1 7-9.5V6l-7-2.5Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);

/** Subscription — a repeat/renew cycle. */
export const SubscriptionIcon = createIcon(
  "SubscriptionIcon",
  <>
    <path d="M4.5 9A8 8 0 0 1 19 7.5M19.5 15A8 8 0 0 1 5 16.5" />
    <path d="M19 4v3.5h-3.5M5 20v-3.5h3.5" />
  </>,
);

/** Software — angle brackets (a licence key / code). */
export const SoftwareIcon = createIcon(
  "SoftwareIcon",
  <>
    <path d="m9 8-4 4 4 4M15 8l4 4-4 4M13 6l-2 12" />
  </>,
);
