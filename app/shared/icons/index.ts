/**
 * PX-02 — public entry for the shared icon set.
 *
 * Import icons from here. Entity icons are also (and preferably) reached through the
 * entity-identity map (app/shared/entity), which pairs each with its accent so a
 * type is recognisable at a glance everywhere it appears.
 */

export { createIcon } from "./Icon";
export type { IconProps } from "./Icon";

export {
  // Entity icons
  AreaIcon,
  GoalIcon,
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
  TagIcon,
  // Subtype glyphs (PX-05) — never an entity glyph re-used for a subtype
  ChatIcon,
  CalendarIcon,
  IdeaIcon,
  DecisionIcon,
  TravelIcon,
  ObservationIcon,
  ReflectionIcon,
  InboxIcon,
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
