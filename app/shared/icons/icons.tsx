/**
 * UNTITLED-15 — the DalyHub icon set, drawn by `@untitledui/icons`.
 *
 * Two groups, exactly as before:
 *   - ENTITY icons — one per entity type; consumed only through the
 *     entity-identity map (app/shared/entity), never hand-picked at a call site.
 *   - UI icons — the frame's affordances, record actions, content kinds and
 *     asset kinds.
 *
 * Plus ONE exception: `BrandMark`, the product identity. It is not a library
 * glyph and does not take `currentColor` — see its own note.
 *
 * ── Why the geometry changed, again ─────────────────────────────────────────
 *
 * PX-02 shipped an in-house outline set. M3-01 replaced it with Material
 * Symbols paths copied byte-for-byte out of `@material-symbols/svg-400`, and
 * recorded that the SET was swappable while the entity-identity MAPPING was the
 * durable contract. This is that swap made a third and final time, and this time
 * it swaps TO a library the product already depends on and already pays for:
 * every vendored Untitled component in `app/shared/ui/untitled` draws its icons
 * from `@untitledui/icons`, so until now DalyHub shipped two complete icon
 * vocabularies side by side — a stroked one inside its components and a filled
 * Material one around them.
 *
 * Every component NAME, prop and accessibility behaviour below is unchanged, so
 * no call site moved; `fromUntitled` (see `Icon.tsx`) is the adapter that keeps
 * DalyHub's `size` / `title` / `aria-hidden` contract over Untitled's glyph.
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 *
 * `@untitledui/icons@0.0.22`, MIT, already a direct dependency. Nothing is
 * copied, transcribed or re-drawn: each line below names a REAL export of that
 * package, and `test/unit/entity-icons` walks the map so a name that stops
 * existing fails the build rather than rendering nothing.
 *
 * Add an icon by naming an upstream export here; never inline a one-off SVG at a
 * call site, and never guess a name — `mcp search_icons` and the package's own
 * `dist/index.d.ts` are the catalogue.
 */

import {
  Annotation,
  Archive,
  Bank,
  BarChart01,
  Bell01,
  Bold01,
  BookOpen01,
  Calendar,
  CalendarCheck01,
  CalendarDate,
  CalendarPlus01,
  Car01,
  Check,
  CheckCircle,
  CheckSquare,
  CheckSquareBroken,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClockRewind,
  Code01,
  CodeBrowser,
  CodeSquare01,
  Columns03,
  Command,
  Copy01,
  CpuChip01,
  Dotpoints01,
  Dotpoints02,
  DotsGrid,
  DotsHorizontal,
  Download01,
  Edit01,
  Eraser,
  Eye,
  File02,
  FileCheck02,
  FilterFunnel01,
  Flag05,
  Folder,
  Grid01,
  Heading01,
  HelpCircle,
  Home01,
  Inbox01,
  InfoCircle,
  Italic01,
  LayersThree01,
  LayoutAlt01,
  Lightbulb02,
  Link01,
  List,
  LogOut01,
  Luggage01,
  Menu01,
  MessageCircle01,
  MessageSmileCircle,
  Monitor01,
  Moon01,
  Package,
  Plus,
  Power01,
  Printer,
  RefreshCcw01,
  RefreshCw01,
  Repeat01,
  ReverseLeft,
  ReverseRight,
  SearchMd,
  Settings01,
  Shield01,
  Stars01,
  Strikethrough01,
  Sun,
  SwitchHorizontal01,
  Table,
  Tag01,
  Tool01,
  Tool02,
  Trash01,
  TrendUp01,
  Truck01,
  User01,
  Users01,
  XClose,
} from "@untitledui/icons";

import { fromUntitled } from "./Icon";

/* -------------------------------------------------------------------------- */
/* Entity icons (one per entity type — consumed via the entity-identity map). */
/* -------------------------------------------------------------------------- */

/** Area — stacked layers (a permanent domain of life). `@untitledui/icons` `LayersThree01`. */
export const AreaIcon = fromUntitled("AreaIcon", LayersThree01);

/** Goal — a flag planted at a desired outcome. `@untitledui/icons` `Flag05`. */
export const GoalIcon = fromUntitled("GoalIcon", Flag05);

/** Project — a folder of finite work. `@untitledui/icons` `Folder`. */
export const ProjectIcon = fromUntitled("ProjectIcon", Folder);

/** Task — a box you tick. `@untitledui/icons` `CheckSquare`. */
export const TaskIcon = fromUntitled("TaskIcon", CheckSquare);

/** Note — a page of writing. `@untitledui/icons` `File02`. */
export const NoteIcon = fromUntitled("NoteIcon", File02);

/** Meeting — people, together. `@untitledui/icons` `Users01`. */
export const MeetingIcon = fromUntitled("MeetingIcon", Users01);

/** Person — one human. `@untitledui/icons` `User01`. */
export const PersonIcon = fromUntitled("PersonIcon", User01);

/** Asset — a thing you own. `@untitledui/icons` `Package`. */
export const AssetIcon = fromUntitled("AssetIcon", Package);

/** Diary — an open book. `@untitledui/icons` `BookOpen01`. */
export const DiaryIcon = fromUntitled("DiaryIcon", BookOpen01);

/** Habit — something that comes round again. `@untitledui/icons` `Repeat01`. */
export const HabitIcon = fromUntitled("HabitIcon", Repeat01);

/** Obligation — a checked clipboard: something owed and verifiable. `@untitledui/icons` `ClipboardCheck`. */
export const ObligationIcon = fromUntitled("ObligationIcon", ClipboardCheck);

/** Finance account — a bank. `@untitledui/icons` `Bank`. */
export const FinanceAccountIcon = fromUntitled("FinanceAccountIcon", Bank);

/** Finance transaction — value moving between two places. `@untitledui/icons` `SwitchHorizontal01`. */
export const FinanceTransactionIcon = fromUntitled(
  "FinanceTransactionIcon",
  SwitchHorizontal01,
);

/** Review — a clipboard worked through. `@untitledui/icons` `ClipboardCheck`. */
export const ReviewIcon = fromUntitled("ReviewIcon", ClipboardCheck);

/* -------------------------------------------------------------------------- */
/* UI icons — the frame, record actions, editor controls and asset kinds.     */
/*                                                                            */
/* Each names its upstream export. Where DalyHub's name and Untitled's differ */
/* the DalyHub one is the product's word for the act ("Restore", "More"), and  */
/* the upstream one is the drawing — which is exactly the split that lets the  */
/* drawing change again without a call site moving.                           */
/* -------------------------------------------------------------------------- */
export const SearchIcon = fromUntitled("SearchIcon", SearchMd);
export const CommandIcon = fromUntitled("CommandIcon", Command);
export const SettingsIcon = fromUntitled("SettingsIcon", Settings01);
export const MenuIcon = fromUntitled("MenuIcon", Menu01);
export const CloseIcon = fromUntitled("CloseIcon", XClose);
export const ChevronDownIcon = fromUntitled("ChevronDownIcon", ChevronDown);
export const ChevronRightIcon = fromUntitled("ChevronRightIcon", ChevronRight);
export const SunIcon = fromUntitled("SunIcon", Sun);
export const MoonIcon = fromUntitled("MoonIcon", Moon01);
export const MonitorIcon = fromUntitled("MonitorIcon", Monitor01);
export const TodayIcon = fromUntitled("TodayIcon", CalendarDate);
export const HelpIcon = fromUntitled("HelpIcon", HelpCircle);
export const InfoIcon = fromUntitled("InfoIcon", InfoCircle);
export const ListIcon = fromUntitled("ListIcon", List);
export const BoardIcon = fromUntitled("BoardIcon", Columns03);
export const GridIcon = fromUntitled("GridIcon", Grid01);
export const PlusIcon = fromUntitled("PlusIcon", Plus);
export const SignOutIcon = fromUntitled("SignOutIcon", LogOut01);
export const MoreIcon = fromUntitled("MoreIcon", DotsHorizontal);
export const ArchiveIcon = fromUntitled("ArchiveIcon", Archive);
export const RestoreIcon = fromUntitled("RestoreIcon", RefreshCcw01);
export const TrashIcon = fromUntitled("TrashIcon", Trash01);
export const EditIcon = fromUntitled("EditIcon", Edit01);
export const CheckIcon = fromUntitled("CheckIcon", Check);
export const DownloadIcon = fromUntitled("DownloadIcon", Download01);
export const CopyIcon = fromUntitled("CopyIcon", Copy01);
export const PrinterIcon = fromUntitled("PrinterIcon", Printer);
export const TagIcon = fromUntitled("TagIcon", Tag01);
export const BoldIcon = fromUntitled("BoldIcon", Bold01);
export const ItalicIcon = fromUntitled("ItalicIcon", Italic01);
export const StrikethroughIcon = fromUntitled(
  "StrikethroughIcon",
  Strikethrough01,
);
export const HeadingIcon = fromUntitled("HeadingIcon", Heading01);
export const BulletListIcon = fromUntitled("BulletListIcon", Dotpoints01);
export const NumberedListIcon = fromUntitled("NumberedListIcon", Dotpoints02);
export const ChecklistIcon = fromUntitled("ChecklistIcon", CheckSquareBroken);
export const QuoteIcon = fromUntitled("QuoteIcon", Annotation);
export const LinkIcon = fromUntitled("LinkIcon", Link01);
export const CodeIcon = fromUntitled("CodeIcon", Code01);
export const CodeBlockIcon = fromUntitled("CodeBlockIcon", CodeSquare01);
export const TableIcon = fromUntitled("TableIcon", Table);
export const ClearFormattingIcon = fromUntitled("ClearFormattingIcon", Eraser);
export const UndoIcon = fromUntitled("UndoIcon", ReverseLeft);
export const RedoIcon = fromUntitled("RedoIcon", ReverseRight);
export const HistoryIcon = fromUntitled("HistoryIcon", ClockRewind);
export const ScheduleIcon = fromUntitled("ScheduleIcon", CalendarCheck01);
export const RepeatIcon = fromUntitled("RepeatIcon", Repeat01);
export const CheckCircleIcon = fromUntitled("CheckCircleIcon", CheckCircle);
export const TrendingUpIcon = fromUntitled("TrendingUpIcon", TrendUp01);
export const FilterIcon = fromUntitled("FilterIcon", FilterFunnel01);
export const DragHandleIcon = fromUntitled("DragHandleIcon", DotsGrid);
export const FlagIcon = fromUntitled("FlagIcon", Flag05);
export const ChatIcon = fromUntitled("ChatIcon", MessageCircle01);
export const CalendarIcon = fromUntitled("CalendarIcon", Calendar);
export const IdeaIcon = fromUntitled("IdeaIcon", Lightbulb02);
export const DecisionIcon = fromUntitled("DecisionIcon", CheckCircle);
export const TravelIcon = fromUntitled("TravelIcon", Luggage01);
export const ObservationIcon = fromUntitled("ObservationIcon", Eye);
export const ReflectionIcon = fromUntitled(
  "ReflectionIcon",
  MessageSmileCircle,
);
export const InboxIcon = fromUntitled("InboxIcon", Inbox01);
export const UpcomingIcon = fromUntitled("UpcomingIcon", CalendarPlus01);
export const SparkleIcon = fromUntitled("SparkleIcon", Stars01);
export const AnalyticsIcon = fromUntitled("AnalyticsIcon", BarChart01);
export const ViewsIcon = fromUntitled("ViewsIcon", LayoutAlt01);
export const BellIcon = fromUntitled("BellIcon", Bell01);
export const VehicleIcon = fromUntitled("VehicleIcon", Car01);
export const TrailerIcon = fromUntitled("TrailerIcon", Truck01);
export const EquipmentIcon = fromUntitled("EquipmentIcon", Tool02);
export const ApplianceIcon = fromUntitled("ApplianceIcon", Power01);
export const ElectronicsIcon = fromUntitled("ElectronicsIcon", CpuChip01);
export const ToolIcon = fromUntitled("ToolIcon", Tool01);
export const PropertyIcon = fromUntitled("PropertyIcon", Home01);
export const DocumentIcon = fromUntitled("DocumentIcon", File02);
export const LicenceIcon = fromUntitled("LicenceIcon", FileCheck02);
export const ShieldIcon = fromUntitled("ShieldIcon", Shield01);
export const SubscriptionIcon = fromUntitled("SubscriptionIcon", RefreshCw01);
export const SoftwareIcon = fromUntitled("SoftwareIcon", CodeBrowser);

/**
 * BRAND-01 — the DalyHub brand mark: the white "D" with its connected
 * three-node network, in the approved blue-to-teal gradient.
 *
 * Re-exported here, not defined here, and the reason is payload rather than
 * taste. Every icon in this module is created by a top-level `fromUntitled(...)`
 * CALL, which a bundler cannot prove is side-effect free — so importing any one
 * icon pulls the whole set into the chunk. The offline shell needs the brand
 * mark and nothing else from this set, and precaching the whole set to draw one
 * glyph cost 13.5 kB on a device that by definition has no connection to spare.
 * `./BrandMark` is a standalone module, so that import costs what the mark
 * costs.
 *
 * It is the one mark here that is NOT a library glyph and does not take
 * `currentColor`: it is the product's identity, drawn from the same generated
 * geometry as the favicon and every PWA icon.
 *
 * The export stays here so that every existing `~/shared/icons` import keeps
 * working and this file still answers "where is the brand mark".
 */
export { BrandMark } from "./BrandMark";
