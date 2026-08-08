import type { WorkspaceId } from "~/kernel/workspaces";

import { DEFAULT_APPEARANCE, type AppearancePreference } from "./appearance";

export const APP_PREFERENCES_CHANGED = "settings.preferences_changed";

/**
 * AUDIT-14 — the ONE fallback owner timezone, and the only place this product
 * names a specific zone as a default.
 *
 * DalyHub stores the owner's timezone (SET-01), and that stored value is the
 * authority for every "what calendar day is it for the owner?" question. This
 * constant answers only the narrow case where there is no stored value yet: a
 * workspace with no preferences row, or a system-actor scope with no owner. It
 * is deliberately NOT importable as "the application's timezone" — the owner's
 * day comes from the resolved preference, never from a constant, which is
 * exactly the confusion that let Asset and Task paths disagree about today.
 */
export const DEFAULT_OWNER_TIME_ZONE = "Australia/Sydney";

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
   * APPEARANCE-01 — which half of the one generated M3 pair to paint: follow the
   * device, or pin light/dark. Stored here (rather than device-locally) so the
   * choice follows the owner between browsers; mirrored into a first-paint cookie
   * by the appearance action.
   */
  readonly appearance: AppearancePreference;
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
  appearance: DEFAULT_APPEARANCE,
  timezone: DEFAULT_OWNER_TIME_ZONE,
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
  readonly appearance: AppearancePreference;
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

/**
 * AUDIT-07 — optional optimistic-concurrency options for a preference write.
 *
 * `expectedVersion` is the {@link AppPreferenceRecord.version} the caller read
 * and based its patch on. Supplying it turns the write into a compare-and-set:
 * it commits only against that exact version, and raises
 * `AppPreferencesConflictError` when the stored record has moved on. Omit it —
 * as every independent single-field patch does — and the write merges safely
 * instead, because a patch writes only the columns it names and therefore
 * cannot carry a stale value for a field it did not touch.
 *
 * Quote it whenever the new value is DERIVED from the old one (a set being
 * added to, a counter, a toggle over a composite field), because that is the
 * only case where two writers can both be "right" about their own field and
 * still lose one another's work.
 */
export interface UpdateAppPreferencesOptions {
  readonly expectedVersion?: number;
}

export interface AppPreferencesRepository {
  readonly get: (ownerId: string) => Promise<AppPreferenceRecord>;
  readonly update: (
    ownerId: string,
    patch: AppPreferencePatch,
    options?: UpdateAppPreferencesOptions,
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
