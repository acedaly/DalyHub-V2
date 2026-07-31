import type { WorkspaceId } from "~/kernel/workspaces";
import { DEFAULT_THEME, type ThemePreference } from "./theme-preference";

export const APP_PREFERENCES_CHANGED = "settings.preferences_changed";

export const DATE_FORMATS = ["dmy_slash", "d_mmm_yyyy", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const FIRST_DAY_OF_WEEK_OPTIONS = ["monday", "sunday"] as const;
export type FirstDayOfWeek = (typeof FIRST_DAY_OF_WEEK_OPTIONS)[number];

export const LANDING_DESTINATIONS = [
  "today",
  "tasks",
  "diary",
  "projects",
  "notes",
] as const;
export type LandingDestination = (typeof LANDING_DESTINATIONS)[number];

export const TASK_DEFAULT_VIEWS = [
  "focus",
  "matrix",
  "sectors",
  "all",
] as const;
export type TaskDefaultView = (typeof TASK_DEFAULT_VIEWS)[number];

export const TASK_DESTINATIONS = ["inbox", "chosen_parent"] as const;
export type TaskDestination = (typeof TASK_DESTINATIONS)[number];

export const DIARY_DEFAULT_MODES = ["day", "timeline"] as const;
export type DiaryDefaultMode = (typeof DIARY_DEFAULT_MODES)[number];

export const NAVIGATION_CONFIG_VERSION = 1;
export const MANDATORY_NAVIGATION_MODULES = ["today", "settings"] as const;

export interface NavigationPreferences {
  readonly version: typeof NAVIGATION_CONFIG_VERSION;
  readonly hiddenModuleIds: readonly string[];
}

export interface AppPreferences {
  /**
   * THEME-01 — the owner's chosen theme: one of the five curated theme ids, or
   * `system` to follow the operating-system appearance. Stored on the owner record
   * (not device-local) so the theme follows the owner between browsers; a cookie
   * mirrors it only so the first byte of a document can carry the right
   * `data-theme`. Validated against the theme registry on read AND on write, so a
   * removed theme degrades to the default instead of rendering unstyled colour.
   */
  readonly theme: ThemePreference;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly defaultLandingDestination: LandingDestination;
  readonly defaultTasksView: TaskDefaultView;
  readonly defaultTaskDestination: TaskDestination;
  /**
   * TASKS-03 — the owner's chosen DEFAULT Tasks view: either a built-in view id
   * (derived in code) or a saved-view id. `null` means "no default", in which case
   * `defaultTasksView` still chooses the presentation. It is validated on read: a
   * value that no longer resolves to a real view degrades to `null` rather than
   * leaving `/tasks` pointing at something that does not exist.
   */
  readonly defaultTaskViewId: string | null;
  readonly defaultTaskCaptureParentId: string | null;
  readonly defaultTaskCaptureParentKind: "area" | "project" | null;
  readonly defaultDiaryMode: DiaryDefaultMode;
  readonly navigation: NavigationPreferences;
}

export interface AppPreferenceRecord extends AppPreferences {
  readonly workspaceId: WorkspaceId;
  readonly ownerId: string;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  theme: DEFAULT_THEME,
  timezone: "Australia/Sydney",
  dateFormat: "d_mmm_yyyy",
  firstDayOfWeek: "monday",
  defaultLandingDestination: "today",
  defaultTasksView: "focus",
  defaultTaskDestination: "inbox",
  defaultTaskViewId: null,
  defaultTaskCaptureParentId: null,
  defaultTaskCaptureParentKind: null,
  defaultDiaryMode: "day",
  navigation: {
    version: NAVIGATION_CONFIG_VERSION,
    hiddenModuleIds: [],
  },
};

export type AppPreferencePatch = Partial<{
  readonly theme: ThemePreference;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly defaultLandingDestination: LandingDestination;
  readonly defaultTasksView: TaskDefaultView;
  readonly defaultTaskDestination: TaskDestination;
  readonly defaultTaskViewId: string | null;
  readonly defaultTaskCaptureParentId: string | null;
  readonly defaultTaskCaptureParentKind: "area" | "project" | null;
  readonly defaultDiaryMode: DiaryDefaultMode;
  readonly navigation: NavigationPreferences;
}>;

export interface AppPreferencesChangeResult {
  readonly preferences: AppPreferenceRecord;
  readonly changed: boolean;
}

export interface AppPreferencesRepository {
  readonly get: (ownerId: string) => Promise<AppPreferenceRecord>;
  readonly update: (
    ownerId: string,
    patch: AppPreferencePatch,
  ) => Promise<AppPreferencesChangeResult>;
}

export interface NavigationPreferenceItem {
  readonly moduleId: string;
  readonly label: string;
}

export interface ResolvedNavigationPreferenceItem extends NavigationPreferenceItem {
  readonly hidden: boolean;
  readonly mandatory: boolean;
}

export function isMandatoryNavigationModule(moduleId: string): boolean {
  return (MANDATORY_NAVIGATION_MODULES as readonly string[]).includes(moduleId);
}

export function resolveNavigationPreferences(
  saved: NavigationPreferences,
  canonicalItems: readonly NavigationPreferenceItem[],
): {
  readonly preferences: NavigationPreferences;
  readonly items: readonly ResolvedNavigationPreferenceItem[];
} {
  const validModuleIds = new Set(canonicalItems.map((item) => item.moduleId));
  const hidden = new Set<string>();
  for (const moduleId of saved.hiddenModuleIds) {
    if (
      validModuleIds.has(moduleId) &&
      !isMandatoryNavigationModule(moduleId)
    ) {
      hidden.add(moduleId);
    }
  }

  const optionalCount = canonicalItems.filter(
    (item) => !isMandatoryNavigationModule(item.moduleId),
  ).length;
  if (optionalCount > 0 && hidden.size >= optionalCount) {
    hidden.clear();
  }

  const preferences: NavigationPreferences = {
    version: NAVIGATION_CONFIG_VERSION,
    hiddenModuleIds: canonicalItems
      .map((item) => item.moduleId)
      .filter((moduleId) => hidden.has(moduleId)),
  };
  return {
    preferences,
    items: canonicalItems.map((item) => ({
      ...item,
      hidden: hidden.has(item.moduleId),
      mandatory: isMandatoryNavigationModule(item.moduleId),
    })),
  };
}

const LANDING_PATHS: Record<LandingDestination, string> = {
  today: "/today",
  tasks: "/tasks",
  diary: "/diary",
  projects: "/projects",
  notes: "/notes",
};

export function resolveDefaultLandingPath(
  destination: LandingDestination,
  availablePaths: ReadonlySet<string>,
): string {
  const preferred = LANDING_PATHS[destination] ?? LANDING_PATHS.today;
  return availablePaths.has(preferred) ? preferred : LANDING_PATHS.today;
}

export function formatPreferenceDate(
  isoDate: string,
  format: DateFormat,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  if (format === "iso") return isoDate;
  if (format === "dmy_slash") return `${day}/${month}/${year}`;
  const monthLabel =
    [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
}
