/**
 * PX-02 — public entry for the shared icon set.
 *
 * Import icons from here. Entity icons are also (and preferably) reached through the
 * entity-identity map (app/shared/entity), which pairs each with its accent so a
 * type is recognisable at a glance everywhere it appears.
 */

export { createIcon, createStrokeIcon } from "./Icon";
export type { IconProps } from "./Icon";

/* UIX-01 — the widget accent tone and the tonal icon tile it paints. */
export { ToneIcon, TONE_NAMES, toneForKey } from "./ToneIcon";
export type { ToneIconProps, ToneName } from "./ToneIcon";

export {
  // Entity icons
  AreaIcon,
  GoalIcon,
  HabitIcon,
  ProjectIcon,
  TaskIcon,
  NoteIcon,
  MeetingIcon,
  PersonIcon,
  AssetIcon,
  DiaryIcon,
  ReviewIcon,
  // UI icons
  SearchIcon,
  CommandIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  TodayIcon,
  HelpIcon,
  InfoIcon,
  ListIcon,
  BoardIcon,
  GridIcon,
  PlusIcon,
  SignOutIcon,
  MoreIcon,
  ArchiveIcon,
  RestoreIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  DownloadIcon,
  CopyIcon,
  PrinterIcon,
  TagIcon,
  // Editor formatting glyphs (the shared writing surface's compact toolbar)
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  HeadingIcon,
  BulletListIcon,
  NumberedListIcon,
  ChecklistIcon,
  QuoteIcon,
  LinkIcon,
  CodeIcon,
  CodeBlockIcon,
  TableIcon,
  ClearFormattingIcon,
  UndoIcon,
  RedoIcon,
  // Card metadata glyphs
  HistoryIcon,
  RepeatIcon,
  ScheduleIcon,
  CheckCircleIcon,
  // UIX-01 — trajectory, filtering and priority-as-a-mark
  TrendingUpIcon,
  FilterIcon,
  DragHandleIcon,
  FlagIcon,
  // Subtype glyphs (PX-05) — never an entity glyph re-used for a subtype
  ChatIcon,
  CalendarIcon,
  IdeaIcon,
  DecisionIcon,
  TravelIcon,
  ObservationIcon,
  ReflectionIcon,
  InboxIcon,
  /* POLISH-01 — the four glyphs that make the collapsed rail readable without
   * labels: Upcoming, AI, Analytics and Views each had a shared or borrowed
   * glyph before this. */
  UpcomingIcon,
  SparkleIcon,
  AnalyticsIcon,
  ViewsIcon,
  BellIcon,
  BrandMark,
  // Asset subtype icons
  VehicleIcon,
  TrailerIcon,
  EquipmentIcon,
  ApplianceIcon,
  ElectronicsIcon,
  ToolIcon,
  PropertyIcon,
  DocumentIcon,
  LicenceIcon,
  ShieldIcon,
  SubscriptionIcon,
  SoftwareIcon,
} from "./icons";
