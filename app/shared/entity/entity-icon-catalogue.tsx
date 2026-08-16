/**
 * The icon CATALOGUE — key → a drawn glyph, a human label, and a place to find it.
 *
 * The kernel owns the vocabulary (`app/kernel/entities/entity-icon-keys.ts`);
 * this owns the drawing. Splitting them is what lets the glyph for `travel`
 * change without touching a single stored row, and it keeps React out of the
 * validation path that runs in the Worker.
 *
 * ── IDENTITY-01: one hundred and one keys, one idiom ─────────────────────────
 * The catalogue grew from thirty-four to a hundred and one, and every entry —
 * including the thirty-four that were already here — now names a glyph from
 * `~/shared/icons/entity-glyphs`, DalyHub's own STROKE set. It previously
 * pointed at the application frame's Material Symbols, which are filled shapes:
 * inside the rebuilt identity tile a filled symbol reads as a solid blob of the
 * record's hue, which is the Material look the tile exists to leave behind. See
 * that module for the argument in full.
 *
 * No stored key changed meaning. `travel` is still a suitcase; it is a suitcase
 * drawn in the vocabulary the rest of the picker speaks.
 *
 * `test/unit/entity-icons` asserts the two lists are the same set, that every
 * key has a label, and that no label or key repeats — so a new icon cannot be
 * half-added.
 */

import {
  GlyphAnchor,
  GlyphAppliance,
  GlyphArchive,
  GlyphArt,
  GlyphAward,
  GlyphBaby,
  GlyphBank,
  GlyphBeach,
  GlyphBell,
  GlyphBoard,
  GlyphBook,
  GlyphBox,
  GlyphBriefcase,
  GlyphCalendar,
  GlyphCamera,
  GlyphCamping,
  GlyphCelebration,
  GlyphChart,
  GlyphChat,
  GlyphChecklist,
  GlyphCleaning,
  GlyphClock,
  GlyphCoffee,
  GlyphCompass,
  GlyphCycling,
  GlyphDecision,
  GlyphDiary,
  GlyphDocument,
  GlyphElectronics,
  GlyphEquipment,
  GlyphFilm,
  GlyphFinance,
  GlyphFire,
  GlyphFitness,
  GlyphFlag,
  GlyphFolder,
  GlyphFood,
  GlyphFurniture,
  GlyphGame,
  GlyphGarden,
  GlyphGift,
  GlyphGlobe,
  GlyphGraduation,
  GlyphGrid,
  GlyphGuitar,
  GlyphHandshake,
  GlyphHeart,
  GlyphHiking,
  GlyphIdea,
  GlyphInbox,
  GlyphKey,
  GlyphLanguage,
  GlyphLeaf,
  GlyphLicence,
  GlyphLightning,
  GlyphLock,
  GlyphMap,
  GlyphMedical,
  GlyphMeeting,
  GlyphMonitor,
  GlyphMoon,
  GlyphMountain,
  GlyphMusic,
  GlyphNote,
  GlyphNutrition,
  GlyphObservation,
  GlyphPaw,
  GlyphPerson,
  GlyphPlane,
  GlyphPlant,
  GlyphPresentation,
  GlyphProperty,
  GlyphPuzzle,
  GlyphReceipt,
  GlyphReflection,
  GlyphReview,
  GlyphRing,
  GlyphRobot,
  GlyphRocket,
  GlyphRunning,
  GlyphSavings,
  GlyphScience,
  GlyphServer,
  GlyphShield,
  GlyphSleep,
  GlyphSoftware,
  GlyphStar,
  GlyphSubscription,
  GlyphSun,
  GlyphSwimming,
  GlyphTag,
  GlyphTarget,
  GlyphTask,
  GlyphToday,
  GlyphTool,
  GlyphTrailer,
  GlyphTravel,
  GlyphVehicle,
  GlyphWater,
  GlyphWine,
  GlyphYoga,
} from "~/shared/icons/entity-glyphs";
import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";

/** An icon component from the entity glyph set. */
type IconComponent = typeof GlyphFolder;

/**
 * The groups the picker shows, in the order it shows them.
 *
 * IDENTITY-01 rebuilt this list. The previous eight categories were shaped by
 * which modules the product had built — "Work and projects", "Safety" — and
 * would not stretch over a hundred keys without producing a "General" bucket
 * with sixty things in it. These ten are shaped by the parts of a LIFE an Area
 * is actually named after, which is the question an owner is answering when the
 * picker is open.
 */
export const ENTITY_ICON_CATEGORIES = [
  "General",
  "Work and money",
  "Home and property",
  "Health and fitness",
  "Technology and making",
  "People",
  "Learning and thinking",
  "Life and leisure",
  "Travel and outdoors",
  "Time and nature",
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
   *
   * They matter more at a hundred keys than at thirty-four: an owner looking for
   * a gym Area types "gym", not "Fitness", and a grid they have to read all of
   * is a grid they will not use.
   */
  readonly searchTerms: readonly string[];
}

export const ENTITY_ICON_OPTIONS: readonly EntityIconOption[] = [
  // General
  {
    key: "folder",
    label: "Folder",
    category: "General",
    Icon: GlyphFolder,
    searchTerms: ["file", "project", "group"],
  },
  {
    key: "task",
    label: "Task",
    category: "General",
    Icon: GlyphTask,
    searchTerms: ["todo", "check", "done"],
  },
  {
    key: "target",
    label: "Target",
    category: "General",
    Icon: GlyphTarget,
    searchTerms: ["goal", "aim", "objective"],
  },
  {
    key: "checklist",
    label: "Checklist",
    category: "General",
    Icon: GlyphChecklist,
    searchTerms: ["list", "steps"],
  },
  {
    key: "board",
    label: "Board",
    category: "General",
    Icon: GlyphBoard,
    searchTerms: ["kanban", "columns"],
  },
  {
    key: "grid",
    label: "Grid",
    category: "General",
    Icon: GlyphGrid,
    searchTerms: ["tiles", "cards"],
  },
  {
    key: "inbox",
    label: "Inbox",
    category: "General",
    Icon: GlyphInbox,
    searchTerms: ["capture", "unsorted"],
  },
  {
    key: "tag",
    label: "Tag",
    category: "General",
    Icon: GlyphTag,
    searchTerms: ["label", "category"],
  },
  {
    key: "archive",
    label: "Archive",
    category: "General",
    Icon: GlyphArchive,
    searchTerms: ["storage", "old"],
  },
  {
    key: "box",
    label: "Package",
    category: "General",
    Icon: GlyphBox,
    searchTerms: ["parcel", "delivery", "shipping", "moving"],
  },

  // Work and money
  {
    key: "document",
    label: "Document",
    category: "Work and money",
    Icon: GlyphDocument,
    searchTerms: ["paper", "file", "report"],
  },
  {
    key: "licence",
    label: "Licence",
    category: "Work and money",
    Icon: GlyphLicence,
    searchTerms: ["permit", "certificate", "registration", "id"],
  },
  {
    key: "subscription",
    label: "Subscription",
    category: "Work and money",
    Icon: GlyphSubscription,
    searchTerms: ["recurring", "billing", "renewal"],
  },
  {
    key: "briefcase",
    label: "Work",
    category: "Work and money",
    Icon: GlyphBriefcase,
    searchTerms: ["career", "job", "business", "office"],
  },
  {
    key: "presentation",
    label: "Presentation",
    category: "Work and money",
    Icon: GlyphPresentation,
    searchTerms: ["slides", "talk", "pitch", "deck"],
  },
  {
    key: "chart",
    label: "Chart",
    category: "Work and money",
    Icon: GlyphChart,
    searchTerms: ["analytics", "metrics", "growth", "report"],
  },
  {
    key: "handshake",
    label: "Agreement",
    category: "Work and money",
    Icon: GlyphHandshake,
    searchTerms: ["deal", "partnership", "client", "contract"],
  },
  {
    key: "award",
    label: "Award",
    category: "Work and money",
    Icon: GlyphAward,
    searchTerms: ["prize", "achievement", "medal", "recognition"],
  },
  {
    key: "finance",
    label: "Finance",
    category: "Work and money",
    Icon: GlyphFinance,
    searchTerms: ["money", "dollar", "cash", "payment"],
  },
  {
    key: "savings",
    label: "Savings",
    category: "Work and money",
    Icon: GlyphSavings,
    searchTerms: ["piggy bank", "budget", "saving", "fund"],
  },
  {
    key: "receipt",
    label: "Receipt",
    category: "Work and money",
    Icon: GlyphReceipt,
    searchTerms: ["invoice", "expense", "bill", "tax"],
  },
  {
    key: "bank",
    label: "Bank",
    category: "Work and money",
    Icon: GlyphBank,
    searchTerms: ["account", "mortgage", "loan", "institution"],
  },

  // Home and property
  {
    key: "property",
    label: "Property",
    category: "Home and property",
    Icon: GlyphProperty,
    searchTerms: ["house", "home", "building", "land"],
  },
  {
    key: "appliance",
    label: "Appliance",
    category: "Home and property",
    Icon: GlyphAppliance,
    searchTerms: ["kitchen", "whitegoods", "laundry"],
  },
  {
    key: "electronics",
    label: "Electronics",
    category: "Home and property",
    Icon: GlyphElectronics,
    searchTerms: ["device", "gadget", "phone"],
  },
  {
    key: "furniture",
    label: "Furniture",
    category: "Home and property",
    Icon: GlyphFurniture,
    searchTerms: ["sofa", "couch", "lounge", "interior"],
  },
  {
    key: "cleaning",
    label: "Cleaning",
    category: "Home and property",
    Icon: GlyphCleaning,
    searchTerms: ["chores", "tidy", "housework"],
  },
  {
    key: "key",
    label: "Keys",
    category: "Home and property",
    Icon: GlyphKey,
    searchTerms: ["access", "lease", "rental", "unlock"],
  },
  {
    key: "garden",
    label: "Garden",
    category: "Home and property",
    Icon: GlyphGarden,
    searchTerms: ["yard", "landscaping", "outdoors", "lawn"],
  },
  {
    key: "plant",
    label: "Plant",
    category: "Home and property",
    Icon: GlyphPlant,
    searchTerms: ["pot", "greenery", "houseplant", "grow"],
  },

  // Health and fitness
  {
    key: "heart",
    label: "Wellbeing",
    category: "Health and fitness",
    Icon: GlyphHeart,
    searchTerms: ["health", "love", "care", "cardio"],
  },
  {
    key: "fitness",
    label: "Fitness",
    category: "Health and fitness",
    Icon: GlyphFitness,
    searchTerms: ["gym", "dumbbell", "weights", "strength", "exercise"],
  },
  {
    key: "running",
    label: "Running",
    category: "Health and fitness",
    Icon: GlyphRunning,
    searchTerms: ["run", "jog", "marathon", "5k"],
  },
  {
    key: "cycling",
    label: "Cycling",
    category: "Health and fitness",
    Icon: GlyphCycling,
    searchTerms: ["bike", "bicycle", "ride"],
  },
  {
    key: "swimming",
    label: "Swimming",
    category: "Health and fitness",
    Icon: GlyphSwimming,
    searchTerms: ["swim", "pool", "laps"],
  },
  {
    key: "yoga",
    label: "Yoga",
    category: "Health and fitness",
    Icon: GlyphYoga,
    searchTerms: ["stretch", "pilates", "mobility", "meditation"],
  },
  {
    key: "sleep",
    label: "Sleep",
    category: "Health and fitness",
    Icon: GlyphSleep,
    searchTerms: ["rest", "night", "bedtime", "recovery"],
  },
  {
    key: "nutrition",
    label: "Nutrition",
    category: "Health and fitness",
    Icon: GlyphNutrition,
    searchTerms: ["diet", "eating", "apple", "food"],
  },
  {
    key: "medical",
    label: "Medical",
    category: "Health and fitness",
    Icon: GlyphMedical,
    searchTerms: ["doctor", "health", "appointment", "medicine"],
  },

  // Technology and making
  {
    key: "software",
    label: "Software",
    category: "Technology and making",
    Icon: GlyphSoftware,
    searchTerms: ["app", "code", "program", "development"],
  },
  {
    key: "equipment",
    label: "Equipment",
    category: "Technology and making",
    Icon: GlyphEquipment,
    searchTerms: ["gear", "kit", "machine"],
  },
  {
    key: "tool",
    label: "Tool",
    category: "Technology and making",
    Icon: GlyphTool,
    searchTerms: ["repair", "maintenance", "diy", "fix"],
  },
  {
    key: "monitor",
    label: "Computer",
    category: "Technology and making",
    Icon: GlyphMonitor,
    searchTerms: ["desktop", "screen", "workstation", "pc"],
  },
  {
    key: "server",
    label: "Server",
    category: "Technology and making",
    Icon: GlyphServer,
    searchTerms: ["hosting", "infrastructure", "database", "rack"],
  },
  {
    key: "camera",
    label: "Camera",
    category: "Technology and making",
    Icon: GlyphCamera,
    searchTerms: ["photography", "photo", "shoot"],
  },
  {
    key: "robot",
    label: "Automation",
    category: "Technology and making",
    Icon: GlyphRobot,
    searchTerms: ["ai", "bot", "assistant"],
  },
  {
    key: "rocket",
    label: "Launch",
    category: "Technology and making",
    Icon: GlyphRocket,
    searchTerms: ["startup", "ship", "release", "space"],
  },

  // People
  {
    key: "person",
    label: "Person",
    category: "People",
    Icon: GlyphPerson,
    searchTerms: ["someone", "contact", "friend"],
  },
  {
    key: "chat",
    label: "Conversation",
    category: "People",
    Icon: GlyphChat,
    searchTerms: ["message", "talk", "discussion"],
  },
  {
    key: "meeting",
    label: "Meeting",
    category: "People",
    Icon: GlyphMeeting,
    searchTerms: ["catch-up", "call", "group", "team", "family"],
  },
  {
    key: "baby",
    label: "Baby",
    category: "People",
    Icon: GlyphBaby,
    searchTerms: ["child", "kids", "parenting", "newborn"],
  },
  {
    key: "ring",
    label: "Marriage",
    category: "People",
    Icon: GlyphRing,
    searchTerms: ["wedding", "engagement", "anniversary", "partner"],
  },

  // Learning and thinking
  {
    key: "note",
    label: "Note",
    category: "Learning and thinking",
    Icon: GlyphNote,
    searchTerms: ["writing", "record"],
  },
  {
    key: "idea",
    label: "Idea",
    category: "Learning and thinking",
    Icon: GlyphIdea,
    searchTerms: ["lightbulb", "inspiration", "think"],
  },
  {
    key: "decision",
    label: "Decision",
    category: "Learning and thinking",
    Icon: GlyphDecision,
    searchTerms: ["choice", "fork", "option"],
  },
  {
    key: "observation",
    label: "Observation",
    category: "Learning and thinking",
    Icon: GlyphObservation,
    searchTerms: ["notice", "watch", "see"],
  },
  {
    key: "reflection",
    label: "Reflection",
    category: "Learning and thinking",
    Icon: GlyphReflection,
    searchTerms: ["think", "journal", "retro"],
  },
  {
    key: "diary",
    label: "Diary",
    category: "Learning and thinking",
    Icon: GlyphDiary,
    searchTerms: ["journal", "log", "entry"],
  },
  {
    key: "review",
    label: "Review",
    category: "Learning and thinking",
    Icon: GlyphReview,
    searchTerms: ["weekly", "retrospective", "check-in"],
  },
  {
    key: "book",
    label: "Reading",
    category: "Learning and thinking",
    Icon: GlyphBook,
    searchTerms: ["books", "library", "literature", "study"],
  },
  {
    key: "graduation",
    label: "Study",
    category: "Learning and thinking",
    Icon: GlyphGraduation,
    searchTerms: ["course", "degree", "university", "school", "education"],
  },
  {
    key: "language",
    label: "Language",
    category: "Learning and thinking",
    Icon: GlyphLanguage,
    searchTerms: ["translation", "speaking", "fluency"],
  },
  {
    key: "science",
    label: "Science",
    category: "Learning and thinking",
    Icon: GlyphScience,
    searchTerms: ["research", "experiment", "lab", "chemistry"],
  },
  {
    key: "puzzle",
    label: "Problem solving",
    category: "Learning and thinking",
    Icon: GlyphPuzzle,
    searchTerms: ["puzzle", "strategy", "logic", "piece"],
  },

  // Life and leisure
  {
    key: "music",
    label: "Music",
    category: "Life and leisure",
    Icon: GlyphMusic,
    searchTerms: ["song", "listening", "playlist", "audio"],
  },
  {
    key: "guitar",
    label: "Instrument",
    category: "Life and leisure",
    Icon: GlyphGuitar,
    searchTerms: ["guitar", "practice", "band", "play"],
  },
  {
    key: "film",
    label: "Film",
    category: "Life and leisure",
    Icon: GlyphFilm,
    searchTerms: ["movie", "cinema", "tv", "watching"],
  },
  {
    key: "game",
    label: "Games",
    category: "Life and leisure",
    Icon: GlyphGame,
    searchTerms: ["gaming", "console", "play", "video game"],
  },
  {
    key: "art",
    label: "Art",
    category: "Life and leisure",
    Icon: GlyphArt,
    searchTerms: ["painting", "drawing", "creative", "design"],
  },
  {
    key: "gift",
    label: "Gift",
    category: "Life and leisure",
    Icon: GlyphGift,
    searchTerms: ["present", "birthday", "christmas"],
  },
  {
    key: "celebration",
    label: "Celebration",
    category: "Life and leisure",
    Icon: GlyphCelebration,
    searchTerms: ["party", "event", "anniversary", "festive"],
  },
  {
    key: "coffee",
    label: "Coffee",
    category: "Life and leisure",
    Icon: GlyphCoffee,
    searchTerms: ["cafe", "tea", "break", "morning"],
  },
  {
    key: "food",
    label: "Food",
    category: "Life and leisure",
    Icon: GlyphFood,
    searchTerms: ["cooking", "meal", "recipe", "dinner", "kitchen"],
  },
  {
    key: "wine",
    label: "Wine",
    category: "Life and leisure",
    Icon: GlyphWine,
    searchTerms: ["drink", "bar", "cellar", "tasting"],
  },
  {
    key: "paw",
    label: "Pets",
    category: "Life and leisure",
    Icon: GlyphPaw,
    searchTerms: ["pet", "dog", "cat", "animal"],
  },

  // Travel and outdoors
  {
    key: "travel",
    label: "Travel",
    category: "Travel and outdoors",
    Icon: GlyphTravel,
    searchTerms: ["trip", "holiday", "journey", "luggage"],
  },
  {
    key: "vehicle",
    label: "Vehicle",
    category: "Travel and outdoors",
    Icon: GlyphVehicle,
    searchTerms: ["car", "van", "truck", "drive", "ute"],
  },
  {
    key: "trailer",
    label: "Trailer",
    category: "Travel and outdoors",
    Icon: GlyphTrailer,
    searchTerms: ["caravan", "tow", "camper"],
  },
  {
    key: "plane",
    label: "Flight",
    category: "Travel and outdoors",
    Icon: GlyphPlane,
    searchTerms: ["plane", "airport", "flying", "overseas"],
  },
  {
    key: "map",
    label: "Map",
    category: "Travel and outdoors",
    Icon: GlyphMap,
    searchTerms: ["route", "navigation", "directions", "place"],
  },
  {
    key: "compass",
    label: "Exploring",
    category: "Travel and outdoors",
    Icon: GlyphCompass,
    searchTerms: ["compass", "direction", "adventure", "orientation"],
  },
  {
    key: "camping",
    label: "Camping",
    category: "Travel and outdoors",
    Icon: GlyphCamping,
    searchTerms: ["tent", "campsite", "outdoors"],
  },
  {
    key: "hiking",
    label: "Hiking",
    category: "Travel and outdoors",
    Icon: GlyphHiking,
    searchTerms: ["walking", "trail", "bushwalk", "trek"],
  },
  {
    key: "beach",
    label: "Beach",
    category: "Travel and outdoors",
    Icon: GlyphBeach,
    searchTerms: ["seaside", "summer", "coast", "holiday"],
  },
  {
    key: "mountain",
    label: "Mountains",
    category: "Travel and outdoors",
    Icon: GlyphMountain,
    searchTerms: ["peak", "climbing", "alpine", "summit"],
  },

  // Time and nature
  {
    key: "calendar",
    label: "Calendar",
    category: "Time and nature",
    Icon: GlyphCalendar,
    searchTerms: ["schedule", "date", "plan"],
  },
  {
    key: "today",
    label: "Today",
    category: "Time and nature",
    Icon: GlyphToday,
    searchTerms: ["day", "daily", "now"],
  },
  {
    key: "clock",
    label: "Time",
    category: "Time and nature",
    Icon: GlyphClock,
    searchTerms: ["hours", "schedule", "duration", "deadline"],
  },
  {
    key: "sun",
    label: "Sun",
    category: "Time and nature",
    Icon: GlyphSun,
    searchTerms: ["day", "summer", "weather", "light"],
  },
  {
    key: "moon",
    label: "Moon",
    category: "Time and nature",
    Icon: GlyphMoon,
    searchTerms: ["night", "evening", "lunar"],
  },
  {
    key: "star",
    label: "Star",
    category: "Time and nature",
    Icon: GlyphStar,
    searchTerms: ["favourite", "important", "highlight"],
  },
  {
    key: "leaf",
    label: "Nature",
    category: "Time and nature",
    Icon: GlyphLeaf,
    searchTerms: ["leaf", "environment", "green", "sustainability"],
  },
  {
    key: "fire",
    label: "Fire",
    category: "Time and nature",
    Icon: GlyphFire,
    searchTerms: ["flame", "burn", "heat", "emergency", "brigade"],
  },
  {
    key: "water",
    label: "Water",
    category: "Time and nature",
    Icon: GlyphWater,
    searchTerms: ["drop", "hydration", "rain", "plumbing"],
  },
  {
    key: "lightning",
    label: "Energy",
    category: "Time and nature",
    Icon: GlyphLightning,
    searchTerms: ["power", "electricity", "fast", "bolt"],
  },
  {
    key: "globe",
    label: "World",
    category: "Time and nature",
    Icon: GlyphGlobe,
    searchTerms: ["global", "earth", "international", "planet"],
  },
  {
    key: "flag",
    label: "Milestone",
    category: "Time and nature",
    Icon: GlyphFlag,
    searchTerms: ["flag", "marker", "country", "goal"],
  },
  {
    key: "anchor",
    label: "Anchor",
    category: "Time and nature",
    Icon: GlyphAnchor,
    searchTerms: ["boat", "sailing", "marine", "stability"],
  },
  {
    key: "shield",
    label: "Safety",
    category: "Time and nature",
    Icon: GlyphShield,
    searchTerms: ["insurance", "protection", "secure", "emergency"],
  },
  {
    key: "lock",
    label: "Security",
    category: "Time and nature",
    Icon: GlyphLock,
    searchTerms: ["password", "private", "locked", "safety"],
  },
  {
    key: "bell",
    label: "Reminders",
    category: "Time and nature",
    Icon: GlyphBell,
    searchTerms: ["alert", "notification", "alarm"],
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
