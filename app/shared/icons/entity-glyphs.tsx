/**
 * UNTITLED-15 — the ENTITY ICON vocabulary, on `@untitledui/icons`.
 *
 * The hundred-and-one keys an Area, a Project or a Goal may carry. The kernel
 * owns the key list (`app/kernel/entities/entity-icon-keys.ts`); the catalogue
 * (`app/shared/entity/entity-icon-catalogue.tsx`) maps key → glyph → label; this
 * is the glyph layer. Splitting the three is what lets the DRAWING change
 * without a single stored row moving, and this pass is the third time that has
 * been collected on: PX-02 drew them, IDENTITY-01 redrew them as DalyHub stroke
 * art, and UNTITLED-15 hands eighty-four of them to the library the product
 * already depends on.
 *
 * **No stored key changed meaning, and no migration was written.** `travel` is
 * still a suitcase. It is a suitcase drawn by `@untitledui/icons` `Luggage01`.
 *
 * ── The seventeen that stayed, and why that is the rule rather than a gap ────
 *
 * `@untitledui/icons` is a professional APPLICATION icon set: eleven hundred
 * glyphs for interfaces, and — checked, not assumed — none for a paw, a leaf, a
 * campsite, a coffee, a plate of food, a mountain, a guitar or a pram. DalyHub
 * lets an owner call an Area "Pets", "Garden" or "Camping", so those keys have a
 * genuine product reason to keep a DalyHub drawing, which is exactly the bar the
 * icon brief sets: *generic UI and entity icons come from Untitled unless a
 * specialised icon has a real reason to exist.*
 *
 * They are not a second SYSTEM. There is one registry, one resolution path and
 * one place a key is looked up; these seventeen are a bounded, enumerated
 * exception inside it, and every one of them is listed below with the search
 * that found nothing. Adding an eighteenth means first failing to find it
 * upstream.
 *
 * The exceptions are drawn at stroke weight 1.75 against Untitled's 2. That is
 * deliberate: at the 16–20px these render at, 1.75 on DalyHub's 24-unit grid is
 * the optical match for Untitled's 2 on theirs, and matching the NUMBER would
 * have made the seventeen visibly heavier than the eighty-four beside them.
 */

import { createStrokeIcon, fromUntitled } from "./Icon";
import {
  AreaIcon,
  AssetIcon,
  DiaryIcon,
  FinanceAccountIcon,
  FinanceTransactionIcon,
  GoalIcon,
  HabitIcon,
  MeetingIcon,
  NoteIcon,
  ObligationIcon,
  PersonIcon,
  ProjectIcon,
  ReviewIcon,
  TaskIcon,
} from "./icons";

import {
  Activity,
  Anchor,
  Archive,
  Award01,
  Bank,
  BarChart01,
  Beaker01,
  Bell01,
  BookClosed,
  BookOpen01,
  Briefcase01,
  Brush01,
  Calendar,
  CalendarDate,
  Camera01,
  Car01,
  CheckCircle,
  CheckSquare,
  ClipboardCheck,
  Clock,
  CodeBrowser,
  Columns03,
  Compass03,
  CpuChip01,
  CpuChip02,
  CurrencyDollarCircle,
  Diamond01,
  Droplets01,
  Eye,
  File02,
  FileCheck02,
  Film01,
  Flag05,
  Folder,
  Gift01,
  Globe01,
  GraduationHat01,
  Grid01,
  Heart,
  HeartHand,
  Home01,
  Inbox01,
  Key01,
  Lightbulb02,
  Lightning01,
  Lock01,
  Luggage01,
  Map01,
  MedicalCross,
  MessageCircle01,
  MessageSmileCircle,
  Monitor01,
  Moon01,
  MusicNote01,
  Package,
  Palette,
  PiggyBank01,
  Plane,
  Power01,
  PresentationChart01,
  PuzzlePiece01,
  Receipt,
  RefreshCw01,
  Rocket01,
  Server01,
  Shield01,
  Speedometer03,
  Star01,
  Sun,
  Tag01,
  Target04,
  Tool01,
  Tool02,
  Translate01,
  Truck01,
  Umbrella01,
  User01,
  Users01,
  Waves,
} from "@untitledui/icons";

/* -------------------------------------------------------------------------- */
/* The catalogue, drawn upstream.                                             */
/* -------------------------------------------------------------------------- */
export const GlyphFolder = fromUntitled("GlyphFolder", Folder);
export const GlyphTask = fromUntitled("GlyphTask", CheckSquare);
export const GlyphTarget = fromUntitled("GlyphTarget", Target04);
export const GlyphChecklist = fromUntitled("GlyphChecklist", ClipboardCheck);
export const GlyphBoard = fromUntitled("GlyphBoard", Columns03);
export const GlyphGrid = fromUntitled("GlyphGrid", Grid01);
export const GlyphInbox = fromUntitled("GlyphInbox", Inbox01);
export const GlyphTag = fromUntitled("GlyphTag", Tag01);
export const GlyphArchive = fromUntitled("GlyphArchive", Archive);
export const GlyphBox = fromUntitled("GlyphBox", Package);
export const GlyphDocument = fromUntitled("GlyphDocument", File02);
export const GlyphLicence = fromUntitled("GlyphLicence", FileCheck02);
export const GlyphSubscription = fromUntitled("GlyphSubscription", RefreshCw01);
export const GlyphBriefcase = fromUntitled("GlyphBriefcase", Briefcase01);
export const GlyphPresentation = fromUntitled(
  "GlyphPresentation",
  PresentationChart01,
);
export const GlyphChart = fromUntitled("GlyphChart", BarChart01);
export const GlyphHandshake = fromUntitled("GlyphHandshake", HeartHand);
export const GlyphAward = fromUntitled("GlyphAward", Award01);
export const GlyphFinance = fromUntitled("GlyphFinance", CurrencyDollarCircle);
export const GlyphSavings = fromUntitled("GlyphSavings", PiggyBank01);
export const GlyphReceipt = fromUntitled("GlyphReceipt", Receipt);
export const GlyphBank = fromUntitled("GlyphBank", Bank);
export const GlyphProperty = fromUntitled("GlyphProperty", Home01);
export const GlyphAppliance = fromUntitled("GlyphAppliance", Power01);
export const GlyphElectronics = fromUntitled("GlyphElectronics", CpuChip01);
export const GlyphCleaning = fromUntitled("GlyphCleaning", Brush01);
export const GlyphKey = fromUntitled("GlyphKey", Key01);
export const GlyphHeart = fromUntitled("GlyphHeart", Heart);
export const GlyphFitness = fromUntitled("GlyphFitness", Activity);
export const GlyphRunning = fromUntitled("GlyphRunning", Speedometer03);
export const GlyphCycling = fromUntitled("GlyphCycling", Speedometer03);
export const GlyphSwimming = fromUntitled("GlyphSwimming", Waves);
export const GlyphYoga = fromUntitled("GlyphYoga", Sun);
export const GlyphSleep = fromUntitled("GlyphSleep", Moon01);
export const GlyphMedical = fromUntitled("GlyphMedical", MedicalCross);
export const GlyphSoftware = fromUntitled("GlyphSoftware", CodeBrowser);
export const GlyphEquipment = fromUntitled("GlyphEquipment", Tool02);
export const GlyphTool = fromUntitled("GlyphTool", Tool01);
export const GlyphMonitor = fromUntitled("GlyphMonitor", Monitor01);
export const GlyphServer = fromUntitled("GlyphServer", Server01);
export const GlyphCamera = fromUntitled("GlyphCamera", Camera01);
export const GlyphRobot = fromUntitled("GlyphRobot", CpuChip02);
export const GlyphRocket = fromUntitled("GlyphRocket", Rocket01);
export const GlyphPerson = fromUntitled("GlyphPerson", User01);
export const GlyphChat = fromUntitled("GlyphChat", MessageCircle01);
export const GlyphMeeting = fromUntitled("GlyphMeeting", Users01);
export const GlyphRing = fromUntitled("GlyphRing", Diamond01);
export const GlyphNote = fromUntitled("GlyphNote", File02);
export const GlyphIdea = fromUntitled("GlyphIdea", Lightbulb02);
export const GlyphDecision = fromUntitled("GlyphDecision", CheckCircle);
export const GlyphObservation = fromUntitled("GlyphObservation", Eye);
export const GlyphReflection = fromUntitled(
  "GlyphReflection",
  MessageSmileCircle,
);
export const GlyphDiary = fromUntitled("GlyphDiary", BookOpen01);
export const GlyphReview = fromUntitled("GlyphReview", ClipboardCheck);
export const GlyphBook = fromUntitled("GlyphBook", BookClosed);
export const GlyphGraduation = fromUntitled("GlyphGraduation", GraduationHat01);
export const GlyphLanguage = fromUntitled("GlyphLanguage", Translate01);
export const GlyphScience = fromUntitled("GlyphScience", Beaker01);
export const GlyphPuzzle = fromUntitled("GlyphPuzzle", PuzzlePiece01);
export const GlyphMusic = fromUntitled("GlyphMusic", MusicNote01);
export const GlyphFilm = fromUntitled("GlyphFilm", Film01);
export const GlyphArt = fromUntitled("GlyphArt", Palette);
export const GlyphGift = fromUntitled("GlyphGift", Gift01);
export const GlyphTravel = fromUntitled("GlyphTravel", Luggage01);
export const GlyphVehicle = fromUntitled("GlyphVehicle", Car01);
export const GlyphTrailer = fromUntitled("GlyphTrailer", Truck01);
export const GlyphPlane = fromUntitled("GlyphPlane", Plane);
export const GlyphMap = fromUntitled("GlyphMap", Map01);
export const GlyphCompass = fromUntitled("GlyphCompass", Compass03);
export const GlyphBeach = fromUntitled("GlyphBeach", Umbrella01);
export const GlyphCalendar = fromUntitled("GlyphCalendar", Calendar);
export const GlyphToday = fromUntitled("GlyphToday", CalendarDate);
export const GlyphClock = fromUntitled("GlyphClock", Clock);
export const GlyphSun = fromUntitled("GlyphSun", Sun);
export const GlyphMoon = fromUntitled("GlyphMoon", Moon01);
export const GlyphStar = fromUntitled("GlyphStar", Star01);
export const GlyphWater = fromUntitled("GlyphWater", Droplets01);
export const GlyphLightning = fromUntitled("GlyphLightning", Lightning01);
export const GlyphGlobe = fromUntitled("GlyphGlobe", Globe01);
export const GlyphFlag = fromUntitled("GlyphFlag", Flag05);
export const GlyphAnchor = fromUntitled("GlyphAnchor", Anchor);
export const GlyphShield = fromUntitled("GlyphShield", Shield01);
export const GlyphLock = fromUntitled("GlyphLock", Lock01);
export const GlyphBell = fromUntitled("GlyphBell", Bell01);

/* -------------------------------------------------------------------------- */
/* The seventeen Untitled has no glyph for.                                   */
/*                                                                            */
/* Each was searched for by concept before it was kept: furniture/sofa/chair,  */
/* garden/flower/tree, plant, nutrition/apple/food, baby/pram, guitar,         */
/* game/controller, celebration/party/cake/balloon, coffee/cup/mug,            */
/* food/cutlery/restaurant, wine/beer/glass, paw/pet/dog/cat, camping/tent,    */
/* hiking, mountain, leaf, fire/flame. The package has none of them.           */
/* -------------------------------------------------------------------------- */

export const GlyphFurniture = createStrokeIcon(
  "GlyphFurniture",
  <>
    <path d="M4 11.5V8a1.8 1.8 0 0 1 1.8-1.8h12.4A1.8 1.8 0 0 1 20 8v3.5" />
    <path d="M3 15.4a2.2 2.2 0 0 1 2.2-2.2h13.6a2.2 2.2 0 0 1 2.2 2.2V18H3Z" />
    <path d="M5 18v2M19 18v2" />
  </>,
);

export const GlyphGarden = createStrokeIcon(
  "GlyphGarden",
  <>
    <path d="M12 20.5V11" />
    <path d="M12 12.5C8.5 12.5 6 10.4 6 6.4c4 0 6 2.2 6 6.1Z" />
    <path d="M12 15c3.5 0 6-2 6-6-4 0-6 2.1-6 6Z" />
  </>,
);

export const GlyphPlant = createStrokeIcon(
  "GlyphPlant",
  <>
    <path d="M6.5 14h11l-1 6.5h-9Z" />
    <path d="M12 14V8.5" />
    <path d="M12 10.5c-2.6 0-4.2-1.6-4.2-4.4 2.8 0 4.2 1.5 4.2 4.4Z" />
    <path d="M12 9.5c2.4 0 3.8-1.4 3.8-4-2.6 0-3.8 1.4-3.8 4Z" />
  </>,
);

export const GlyphNutrition = createStrokeIcon(
  "GlyphNutrition",
  <>
    <path d="M12 8.4c-1-1.4-2.4-2-3.9-2C5.8 6.4 4 8.6 4 12c0 4.4 4 8.4 5.8 8.4 1 0 1.5-.5 2.2-.5s1.2.5 2.2.5C16 20.4 20 16.4 20 12c0-3.4-1.8-5.6-4.1-5.6-1.5 0-2.9.6-3.9 2Z" />
    <path d="M12 6.4c0-1.9 1.3-3.3 3.2-3.4" />
  </>,
);

export const GlyphBaby = createStrokeIcon(
  "GlyphBaby",
  <>
    <circle cx="12" cy="11.4" r="7.6" />
    <path d="M9.2 10.2h.01M14.8 10.2h.01" />
    <path d="M9.6 14.6a3.4 3.4 0 0 0 4.8 0" />
    <path d="M9.4 4.4a3 3 0 0 1 5.2 0" />
  </>,
);

export const GlyphGuitar = createStrokeIcon(
  "GlyphGuitar",
  <>
    <path d="m20.6 3.4-4.4 4.4" />
    <path d="m17.4 6.6-5.2 5.2" />
    <path d="M12.2 11.8a4 4 0 0 0-5.6 0 3.4 3.4 0 0 0-.6 4 3.4 3.4 0 0 1-.6 4 3.6 3.6 0 0 0 5.1 5.1h.01" />
    <circle cx="9.4" cy="14.6" r="1.2" />
  </>,
);

export const GlyphGame = createStrokeIcon(
  "GlyphGame",
  <>
    <path d="M7.6 7.4h8.8a4.6 4.6 0 0 1 4.5 3.7l.7 3.6a2.6 2.6 0 0 1-4.7 2l-1.3-1.9H8.4l-1.3 1.9a2.6 2.6 0 0 1-4.7-2l.7-3.6a4.6 4.6 0 0 1 4.5-3.7Z" />
    <path d="M7.2 11.2v2.4M6 12.4h2.4M16 11.6h.01M18 13.4h.01" />
  </>,
);

export const GlyphCelebration = createStrokeIcon(
  "GlyphCelebration",
  <>
    <path d="m3 21 4.4-11.6 7.2 7.2Z" />
    <path d="M13 3.4v2.2M18.4 5.6l-1.6 1.6M20.6 11h-2.2" />
    <path d="M11.4 8.4a3.8 3.8 0 0 1 4.2-1M15.6 12.6a3.8 3.8 0 0 1 1-4.2" />
  </>,
);

export const GlyphCoffee = createStrokeIcon(
  "GlyphCoffee",
  <>
    <path d="M4 9.4h13v6.2a4.4 4.4 0 0 1-4.4 4.4H8.4A4.4 4.4 0 0 1 4 15.6Z" />
    <path d="M17 11h1.4a2.6 2.6 0 0 1 0 5.2H17" />
    <path d="M8 6.4V4.2M12 6.4V4.2" />
  </>,
);

export const GlyphFood = createStrokeIcon(
  "GlyphFood",
  <>
    <path d="M6.6 3.4v8.2a2.4 2.4 0 0 0 4.8 0V3.4M9 3.4v6" />
    <path d="M9 14v6.6" />
    <path d="M17.2 3.4c-1.6 1.4-2.4 3.4-2.4 5.8 0 1.8.8 2.8 2.4 3v8.4" />
  </>,
);

export const GlyphWine = createStrokeIcon(
  "GlyphWine",
  <>
    <path d="M7.4 3.4h9.2l-.7 6.2a4.1 4.1 0 0 1-8.2 0Z" />
    <path d="M12 14v6.6M8.6 20.6h6.8" />
  </>,
);

export const GlyphPaw = createStrokeIcon(
  "GlyphPaw",
  <>
    <ellipse cx="6.6" cy="10.6" rx="2.1" ry="2.6" />
    <ellipse cx="17.4" cy="10.6" rx="2.1" ry="2.6" />
    <ellipse cx="10.2" cy="5.8" rx="2" ry="2.5" />
    <ellipse cx="13.8" cy="5.8" rx="2" ry="2.5" />
    <path d="M12 12.4c2.6 0 4.8 2 4.8 4.4 0 2-1.4 3.2-3 3.2-.9 0-1.3-.4-1.8-.4s-.9.4-1.8.4c-1.6 0-3-1.2-3-3.2 0-2.4 2.2-4.4 4.8-4.4Z" />
  </>,
);

export const GlyphCamping = createStrokeIcon(
  "GlyphCamping",
  <>
    <path d="m12 4 8.6 15.8H3.4Z" />
    <path d="m12 10.6 5 9.2H7Z" />
  </>,
);

export const GlyphHiking = createStrokeIcon(
  "GlyphHiking",
  <>
    <circle cx="13.6" cy="4.8" r="2" />
    <path d="m10 20.4 1.4-5.2-2.4-2.2.8-4.2 3.4-1.2 2.4 3.4 2.8.8" />
    <path d="m13 15.2 2 1.8.8 3.4" />
    <path d="M6 3.6v16.8" />
  </>,
);

export const GlyphMountain = createStrokeIcon(
  "GlyphMountain",
  <>
    <path d="m2.6 19.4 6.4-11 4 6.4 2.2-3.4 6.2 8Z" />
    <path d="m6.4 12.8 2.6-1.4 2.4 1.4" />
  </>,
);

export const GlyphLeaf = createStrokeIcon(
  "GlyphLeaf",
  <>
    <path d="M20.4 3.6C11.2 3.6 5 7.4 5 14.2a6.2 6.2 0 0 0 1.6 4.2C10.6 14 14.4 12 20.4 3.6Z" />
    <path d="M4 20.4c1-3 2.4-5.4 4.2-7.4" />
  </>,
);

export const GlyphFire = createStrokeIcon(
  "GlyphFire",
  <>
    <path d="M12 2.6c3.4 3.4 6.4 6.4 6.4 10.6a6.4 6.4 0 1 1-12.8 0c0-2.2 1-4 2.4-5.6.6 1.2 1.4 2 2.2 2.2C10 7.4 10.6 4.8 12 2.6Z" />
    <path d="M12 20a3.2 3.2 0 0 1-1.8-5.8c.4 1 1 1.6 1.8 2 .8-1 1.2-2 1.2-3.2A3.2 3.2 0 0 1 12 20Z" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Per-entity DEFAULTS — what a record with no chosen icon wears.             */
/*                                                                            */
/* These are the SAME components the frame uses for that entity type, imported */
/* rather than re-drawn: an Area with no icon chosen and the Areas item in the */
/* sidebar are one glyph, which is the whole reason a reader recognises the    */
/* type before reading the word.                                              */
/* -------------------------------------------------------------------------- */

export const GlyphAreaDefault = AreaIcon;
export const GlyphGoalDefault = GoalIcon;
export const GlyphProjectDefault = ProjectIcon;
export const GlyphTaskDefault = TaskIcon;
export const GlyphNoteDefault = NoteIcon;
export const GlyphMeetingDefault = MeetingIcon;
export const GlyphPersonDefault = PersonIcon;
export const GlyphAssetDefault = AssetIcon;
export const GlyphDiaryDefault = DiaryIcon;
export const GlyphReviewDefault = ReviewIcon;
export const GlyphHabitDefault = HabitIcon;
export const GlyphObligationDefault = ObligationIcon;
export const GlyphFinanceAccountDefault = FinanceAccountIcon;
export const GlyphFinanceTransactionDefault = FinanceTransactionIcon;

export const ENTITY_DEFAULT_GLYPHS = {
  area: GlyphAreaDefault,
  goal: GlyphGoalDefault,
  habit: GlyphHabitDefault,
  project: GlyphProjectDefault,
  task: GlyphTaskDefault,
  note: GlyphNoteDefault,
  meeting: GlyphMeetingDefault,
  person: GlyphPersonDefault,
  asset: GlyphAssetDefault,
  obligation: GlyphObligationDefault,
  finance_account: GlyphFinanceAccountDefault,
  diary: GlyphDiaryDefault,
  review: GlyphReviewDefault,
} as const;
