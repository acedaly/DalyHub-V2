/**
 * The icon CATALOGUE — key → a drawn glyph, a human label, and a place to find it.
 *
 * The kernel owns the vocabulary (`app/kernel/entities/entity-icon-keys.ts`);
 * this owns the drawing. Splitting them is what lets the glyph for `travel`
 * change without touching a single stored row, and it keeps React out of the
 * validation path that runs in the Worker.
 *
 * Every entry names an icon DalyHub already exports through `createIcon`, so
 * there is no such thing as a catalogue entry that renders nothing.
 * `test/unit/entity-icons` asserts the two lists are the same set, that every
 * key has a label, and that no label or key repeats — so a new icon cannot be
 * half-added.
 */

import {
  ApplianceIcon,
  ArchiveIcon,
  BoardIcon,
  CalendarIcon,
  ChatIcon,
  DecisionIcon,
  DiaryIcon,
  DocumentIcon,
  ElectronicsIcon,
  EquipmentIcon,
  GoalIcon,
  GridIcon,
  IdeaIcon,
  InboxIcon,
  LicenceIcon,
  ListIcon,
  MeetingIcon,
  NoteIcon,
  ObservationIcon,
  PersonIcon,
  ProjectIcon,
  PropertyIcon,
  ReflectionIcon,
  ReviewIcon,
  ShieldIcon,
  SoftwareIcon,
  SubscriptionIcon,
  TagIcon,
  TaskIcon,
  TodayIcon,
  ToolIcon,
  TrailerIcon,
  TravelIcon,
  VehicleIcon,
} from "~/shared/icons";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";

/** An icon component from the generated set. */
type IconComponent = typeof ProjectIcon;

/** The groups the picker shows, in the order it shows them. */
export const ENTITY_ICON_CATEGORIES = [
  "General",
  "Work and projects",
  "Home",
  "People",
  "Time",
  "Learning",
  "Travel",
  "Safety",
] as const;

export type EntityIconCategory = (typeof ENTITY_ICON_CATEGORIES)[number];

export interface EntityIconOption {
  readonly key: EntityIconKey;
  /** What a human calls it. Shown under the glyph, and its accessible name. */
  readonly label: string;
  readonly category: EntityIconCategory;
  readonly Icon: IconComponent;
  /**
   * Extra words the picker's search matches, so someone typing "car" finds
   * `vehicle` and someone typing "house" finds `property`. The label is always
   * searched; these are the synonyms it does not contain.
   */
  readonly searchTerms: readonly string[];
}

export const ENTITY_ICON_OPTIONS: readonly EntityIconOption[] = [
  // General
  {
    key: "folder",
    label: "Folder",
    category: "General",
    Icon: ProjectIcon,
    searchTerms: ["file", "project", "group"],
  },
  {
    key: "task",
    label: "Task",
    category: "General",
    Icon: TaskIcon,
    searchTerms: ["todo", "check", "done"],
  },
  {
    key: "target",
    label: "Target",
    category: "General",
    Icon: GoalIcon,
    searchTerms: ["goal", "aim", "objective"],
  },
  {
    key: "checklist",
    label: "Checklist",
    category: "General",
    Icon: ListIcon,
    searchTerms: ["list", "steps"],
  },
  {
    key: "board",
    label: "Board",
    category: "General",
    Icon: BoardIcon,
    searchTerms: ["kanban", "columns"],
  },
  {
    key: "grid",
    label: "Grid",
    category: "General",
    Icon: GridIcon,
    searchTerms: ["tiles", "cards"],
  },
  {
    key: "inbox",
    label: "Inbox",
    category: "General",
    Icon: InboxIcon,
    searchTerms: ["capture", "unsorted"],
  },
  {
    key: "tag",
    label: "Tag",
    category: "General",
    Icon: TagIcon,
    searchTerms: ["label", "category"],
  },
  {
    key: "archive",
    label: "Archive",
    category: "General",
    Icon: ArchiveIcon,
    searchTerms: ["storage", "box", "old"],
  },

  // Work and projects
  {
    key: "document",
    label: "Document",
    category: "Work and projects",
    Icon: DocumentIcon,
    searchTerms: ["paper", "file", "report"],
  },
  {
    key: "licence",
    label: "Licence",
    category: "Work and projects",
    Icon: LicenceIcon,
    searchTerms: ["permit", "certificate", "registration"],
  },
  {
    key: "subscription",
    label: "Subscription",
    category: "Work and projects",
    Icon: SubscriptionIcon,
    searchTerms: ["recurring", "billing", "renewal"],
  },
  {
    key: "software",
    label: "Software",
    category: "Work and projects",
    Icon: SoftwareIcon,
    searchTerms: ["app", "code", "program"],
  },
  {
    key: "equipment",
    label: "Equipment",
    category: "Work and projects",
    Icon: EquipmentIcon,
    searchTerms: ["gear", "kit", "machine"],
  },
  {
    key: "tool",
    label: "Tool",
    category: "Work and projects",
    Icon: ToolIcon,
    searchTerms: ["repair", "maintenance", "diy"],
  },

  // Home
  {
    key: "property",
    label: "Property",
    category: "Home",
    Icon: PropertyIcon,
    searchTerms: ["house", "home", "building", "land"],
  },
  {
    key: "appliance",
    label: "Appliance",
    category: "Home",
    Icon: ApplianceIcon,
    searchTerms: ["kitchen", "whitegoods", "machine"],
  },
  {
    key: "electronics",
    label: "Electronics",
    category: "Home",
    Icon: ElectronicsIcon,
    searchTerms: ["device", "tech", "gadget"],
  },

  // People
  {
    key: "person",
    label: "Person",
    category: "People",
    Icon: PersonIcon,
    searchTerms: ["someone", "contact", "family", "friend"],
  },
  {
    key: "chat",
    label: "Conversation",
    category: "People",
    Icon: ChatIcon,
    searchTerms: ["message", "talk", "discussion"],
  },
  {
    key: "meeting",
    label: "Meeting",
    category: "People",
    Icon: MeetingIcon,
    searchTerms: ["catch-up", "call", "group"],
  },

  // Time
  {
    key: "calendar",
    label: "Calendar",
    category: "Time",
    Icon: CalendarIcon,
    searchTerms: ["schedule", "date", "plan"],
  },
  {
    key: "today",
    label: "Today",
    category: "Time",
    Icon: TodayIcon,
    searchTerms: ["day", "daily", "now"],
  },

  // Learning
  {
    key: "note",
    label: "Note",
    category: "Learning",
    Icon: NoteIcon,
    searchTerms: ["writing", "document", "record"],
  },
  {
    key: "idea",
    label: "Idea",
    category: "Learning",
    Icon: IdeaIcon,
    searchTerms: ["lightbulb", "inspiration", "think"],
  },
  {
    key: "decision",
    label: "Decision",
    category: "Learning",
    Icon: DecisionIcon,
    searchTerms: ["choice", "fork", "option"],
  },
  {
    key: "observation",
    label: "Observation",
    category: "Learning",
    Icon: ObservationIcon,
    searchTerms: ["notice", "watch", "see"],
  },
  {
    key: "reflection",
    label: "Reflection",
    category: "Learning",
    Icon: ReflectionIcon,
    searchTerms: ["think", "review", "journal"],
  },
  {
    key: "diary",
    label: "Diary",
    category: "Learning",
    Icon: DiaryIcon,
    searchTerms: ["journal", "log", "entry"],
  },
  {
    key: "review",
    label: "Review",
    category: "Learning",
    Icon: ReviewIcon,
    searchTerms: ["weekly", "retrospective", "check-in"],
  },

  // Travel
  {
    key: "travel",
    label: "Travel",
    category: "Travel",
    Icon: TravelIcon,
    searchTerms: ["trip", "holiday", "flight", "journey"],
  },
  {
    key: "vehicle",
    label: "Vehicle",
    category: "Travel",
    Icon: VehicleIcon,
    searchTerms: ["car", "van", "truck", "drive"],
  },
  {
    key: "trailer",
    label: "Trailer",
    category: "Travel",
    Icon: TrailerIcon,
    searchTerms: ["caravan", "tow", "camper"],
  },

  // Safety
  {
    key: "shield",
    label: "Safety",
    category: "Safety",
    Icon: ShieldIcon,
    searchTerms: ["insurance", "protection", "secure", "emergency"],
  },
];

const OPTIONS_BY_KEY: ReadonlyMap<string, EntityIconOption> = new Map(
  ENTITY_ICON_OPTIONS.map((option) => [option.key, option]),
);

/**
 * The option for a stored key, or `undefined` when this build does not know it.
 *
 * `undefined` rather than a throw is the whole point. A key can outlive the
 * catalogue entry that produced it — an icon removed in a later release, a row
 * restored from an older export — and a record that cannot render is far worse
 * than a record that renders its default icon. Callers fall back; nothing here
 * decides that for them.
 */
export function entityIconOption(
  key: string | null | undefined,
): EntityIconOption | undefined {
  return key ? OPTIONS_BY_KEY.get(key) : undefined;
}

/** The options in a category, in catalogue order. */
export function entityIconOptionsByCategory(
  category: EntityIconCategory,
): readonly EntityIconOption[] {
  return ENTITY_ICON_OPTIONS.filter((option) => option.category === category);
}

/**
 * Options matching a free-text query, over the label, the key and the synonyms.
 *
 * An empty query returns everything, so the picker's resting state is the whole
 * catalogue rather than nothing.
 */
export function searchEntityIcons(query: string): readonly EntityIconOption[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return ENTITY_ICON_OPTIONS;
  }
  return ENTITY_ICON_OPTIONS.filter(
    (option) =>
      option.label.toLowerCase().includes(needle) ||
      option.key.includes(needle) ||
      option.searchTerms.some((term) => term.includes(needle)),
  );
}
