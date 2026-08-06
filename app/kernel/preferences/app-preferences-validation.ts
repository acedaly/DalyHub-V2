import {
  DATE_FORMATS,
  DEFAULT_APP_PREFERENCES,
  DIARY_DEFAULT_MODES,
  FIRST_DAY_OF_WEEK_OPTIONS,
  LANDING_DESTINATIONS,
  NAVIGATION_CONFIG_VERSION,
  TASK_DESTINATIONS,
  TASK_DEFAULT_VIEWS,
  type AppPreferencePatch,
  type AppPreferences,
  type DateFormat,
  type DiaryDefaultMode,
  type FirstDayOfWeek,
  type LandingDestination,
  type NavigationPreferences,
  type TaskDestination,
  type TaskDefaultView,
} from "./app-preferences";
import { AppPreferencesValidationError } from "./app-preferences-errors";

const OWNER_ID_MAX_LENGTH = 256;

let supportedTimezones: ReadonlySet<string> | null = null;

function timezoneSet(): ReadonlySet<string> {
  if (supportedTimezones !== null) return supportedTimezones;
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  supportedTimezones = new Set(
    intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? [],
  );
  return supportedTimezones;
}

export function validateOwnerId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppPreferencesValidationError(
      "ownerId",
      "Owner identity is required.",
    );
  }
  if (value.length > OWNER_ID_MAX_LENGTH) {
    throw new AppPreferencesValidationError(
      "ownerId",
      `Owner identity must be at most ${OWNER_ID_MAX_LENGTH} characters.`,
    );
  }
  return value;
}

export function isSupportedTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return false;
  }
  const supported = timezoneSet();
  if (supported.size > 0) return supported.has(value);
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function parseTimezone(value: unknown): string {
  if (isSupportedTimezone(value)) return value;
  throw new AppPreferencesValidationError(
    "timezone",
    "Choose a valid IANA timezone.",
  );
}

function parseEnum<T extends string>(
  field: AppPreferencesValidationError["field"],
  value: unknown,
  allowed: readonly T[],
  message: string,
): T {
  if (
    typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  throw new AppPreferencesValidationError(field, message);
}

export function parseDateFormat(value: unknown): DateFormat {
  return parseEnum(
    "dateFormat",
    value,
    DATE_FORMATS,
    "Choose a supported date display format.",
  );
}

export function parseFirstDayOfWeek(value: unknown): FirstDayOfWeek {
  return parseEnum(
    "firstDayOfWeek",
    value,
    FIRST_DAY_OF_WEEK_OPTIONS,
    "Choose Monday or Sunday.",
  );
}

export function parseLandingDestination(value: unknown): LandingDestination {
  return parseEnum(
    "defaultLandingDestination",
    value,
    LANDING_DESTINATIONS,
    "Choose an available landing page.",
  );
}

export function parseTaskDefaultView(value: unknown): TaskDefaultView {
  return parseEnum(
    "defaultTasksView",
    value,
    TASK_DEFAULT_VIEWS,
    "Choose a supported Tasks view.",
  );
}

export function parseTaskDestination(value: unknown): TaskDestination {
  return parseEnum(
    "defaultTaskDestination",
    value,
    TASK_DESTINATIONS,
    "Choose Inbox or a chosen parent.",
  );
}

/**
 * The shared rule for a nullable, bounded, id-safe preference value — the same
 * shape `parseEnum` gives the closed-set preferences. An empty or absent value is
 * a real state (no default chosen), not an error.
 */
function parseBoundedId(
  field: AppPreferencesValidationError["field"],
  value: unknown,
  message: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value === "string" &&
    value.length <= 128 &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  ) {
    return value;
  }
  throw new AppPreferencesValidationError(field, message);
}

export function parseTaskCaptureParentId(value: unknown): string | null {
  return parseBoundedId(
    "defaultTaskCaptureParentId",
    value,
    "Choose a valid default capture parent.",
  );
}

/**
 * TASKS-03 — the owner's default Tasks view id: a built-in view id or a saved-view
 * id. Shape-validated only (bounded, id-safe characters); whether it still RESOLVES
 * to a real view is checked at read time, because a saved view can be deleted after
 * the preference was written.
 */
export function parseDefaultTaskViewId(value: unknown): string | null {
  return parseBoundedId(
    "defaultTaskViewId",
    value,
    "Choose a valid default Tasks view.",
  );
}

export function parseTaskCaptureParentKind(
  value: unknown,
): "area" | "project" | null {
  if (value === null || value === "") return null;
  if (value === "area" || value === "project") return value;
  throw new AppPreferencesValidationError(
    "defaultTaskCaptureParentKind",
    "Choose a valid default capture parent.",
  );
}

export function parseDiaryDefaultMode(value: unknown): DiaryDefaultMode {
  return parseEnum(
    "defaultDiaryMode",
    value,
    DIARY_DEFAULT_MODES,
    "Choose Day or Timeline.",
  );
}

export function parseNavigationPreferences(
  value: unknown,
): NavigationPreferences {
  if (value === null || typeof value !== "object") {
    throw new AppPreferencesValidationError(
      "navigation",
      "Navigation preferences must be an object.",
    );
  }
  const raw = value as {
    readonly version?: unknown;
    readonly hiddenModuleIds?: unknown;
  };
  if (raw.version !== NAVIGATION_CONFIG_VERSION) {
    return DEFAULT_APP_PREFERENCES.navigation;
  }
  if (!Array.isArray(raw.hiddenModuleIds)) {
    throw new AppPreferencesValidationError(
      "navigation",
      "Hidden navigation modules must be a list.",
    );
  }
  const hiddenModuleIds: string[] = [];
  const seen = new Set<string>();
  for (const moduleId of raw.hiddenModuleIds) {
    if (
      typeof moduleId === "string" &&
      moduleId.length > 0 &&
      moduleId.length <= 64 &&
      /^[a-z][a-z0-9_-]*$/.test(moduleId) &&
      !seen.has(moduleId)
    ) {
      seen.add(moduleId);
      hiddenModuleIds.push(moduleId);
    }
  }
  return { version: NAVIGATION_CONFIG_VERSION, hiddenModuleIds };
}

export function validateAppPreferencesPatch(
  patch: AppPreferencePatch,
): AppPreferencePatch {
  const out: {
    -readonly [K in keyof AppPreferencePatch]: AppPreferencePatch[K];
  } = {};
  if (patch.timezone !== undefined)
    out.timezone = parseTimezone(patch.timezone);
  if (patch.dateFormat !== undefined)
    out.dateFormat = parseDateFormat(patch.dateFormat);
  if (patch.firstDayOfWeek !== undefined)
    out.firstDayOfWeek = parseFirstDayOfWeek(patch.firstDayOfWeek);
  if (patch.defaultLandingDestination !== undefined)
    out.defaultLandingDestination = parseLandingDestination(
      patch.defaultLandingDestination,
    );
  if (patch.defaultTasksView !== undefined)
    out.defaultTasksView = parseTaskDefaultView(patch.defaultTasksView);
  if (patch.defaultTaskDestination !== undefined)
    out.defaultTaskDestination = parseTaskDestination(
      patch.defaultTaskDestination,
    );
  if (patch.defaultTaskViewId !== undefined)
    out.defaultTaskViewId = parseDefaultTaskViewId(patch.defaultTaskViewId);
  if (patch.defaultTaskCaptureParentId !== undefined)
    out.defaultTaskCaptureParentId = parseTaskCaptureParentId(
      patch.defaultTaskCaptureParentId,
    );
  if (patch.defaultTaskCaptureParentKind !== undefined)
    out.defaultTaskCaptureParentKind = parseTaskCaptureParentKind(
      patch.defaultTaskCaptureParentKind,
    );
  if (
    (out.defaultTaskCaptureParentId === null &&
      out.defaultTaskCaptureParentKind !== undefined) ||
    (out.defaultTaskCaptureParentKind === null &&
      out.defaultTaskCaptureParentId !== undefined)
  ) {
    out.defaultTaskCaptureParentId = null;
    out.defaultTaskCaptureParentKind = null;
  }
  if (patch.defaultDiaryMode !== undefined)
    out.defaultDiaryMode = parseDiaryDefaultMode(patch.defaultDiaryMode);
  if (patch.navigation !== undefined)
    out.navigation = parseNavigationPreferences(patch.navigation);
  return out;
}

export function normaliseStoredPreferences(input: {
  readonly timezone: unknown;
  readonly dateFormat: unknown;
  readonly firstDayOfWeek: unknown;
  readonly defaultLandingDestination: unknown;
  readonly defaultTasksView: unknown;
  readonly defaultTaskDestination?: unknown;
  readonly defaultTaskViewId?: unknown;
  readonly defaultTaskCaptureParentId?: unknown;
  readonly defaultTaskCaptureParentKind?: unknown;
  readonly defaultDiaryMode: unknown;
  readonly navigation: unknown;
}): AppPreferences {
  return {
    timezone: isSupportedTimezone(input.timezone)
      ? input.timezone
      : DEFAULT_APP_PREFERENCES.timezone,
    dateFormat:
      typeof input.dateFormat === "string" &&
      (DATE_FORMATS as readonly string[]).includes(input.dateFormat)
        ? (input.dateFormat as DateFormat)
        : DEFAULT_APP_PREFERENCES.dateFormat,
    firstDayOfWeek:
      typeof input.firstDayOfWeek === "string" &&
      (FIRST_DAY_OF_WEEK_OPTIONS as readonly string[]).includes(
        input.firstDayOfWeek,
      )
        ? (input.firstDayOfWeek as FirstDayOfWeek)
        : DEFAULT_APP_PREFERENCES.firstDayOfWeek,
    defaultLandingDestination:
      typeof input.defaultLandingDestination === "string" &&
      (LANDING_DESTINATIONS as readonly string[]).includes(
        input.defaultLandingDestination,
      )
        ? (input.defaultLandingDestination as LandingDestination)
        : DEFAULT_APP_PREFERENCES.defaultLandingDestination,
    defaultTasksView:
      typeof input.defaultTasksView === "string" &&
      (TASK_DEFAULT_VIEWS as readonly string[]).includes(input.defaultTasksView)
        ? (input.defaultTasksView as TaskDefaultView)
        : DEFAULT_APP_PREFERENCES.defaultTasksView,
    defaultTaskDestination: (() => {
      try {
        return parseTaskDestination(
          (input as { readonly defaultTaskDestination?: unknown })
            .defaultTaskDestination,
        );
      } catch {
        return DEFAULT_APP_PREFERENCES.defaultTaskDestination;
      }
    })(),
    defaultTaskViewId: (() => {
      try {
        return parseDefaultTaskViewId(
          (input as { readonly defaultTaskViewId?: unknown }).defaultTaskViewId,
        );
      } catch {
        return DEFAULT_APP_PREFERENCES.defaultTaskViewId;
      }
    })(),
    defaultTaskCaptureParentId: (() => {
      try {
        return parseTaskCaptureParentId(
          (input as { readonly defaultTaskCaptureParentId?: unknown })
            .defaultTaskCaptureParentId,
        );
      } catch {
        return DEFAULT_APP_PREFERENCES.defaultTaskCaptureParentId;
      }
    })(),
    defaultTaskCaptureParentKind: (() => {
      try {
        return parseTaskCaptureParentKind(
          (input as { readonly defaultTaskCaptureParentKind?: unknown })
            .defaultTaskCaptureParentKind,
        );
      } catch {
        return DEFAULT_APP_PREFERENCES.defaultTaskCaptureParentKind;
      }
    })(),
    defaultDiaryMode:
      typeof input.defaultDiaryMode === "string" &&
      (DIARY_DEFAULT_MODES as readonly string[]).includes(
        input.defaultDiaryMode,
      )
        ? (input.defaultDiaryMode as DiaryDefaultMode)
        : DEFAULT_APP_PREFERENCES.defaultDiaryMode,
    navigation: (() => {
      try {
        return parseNavigationPreferences(input.navigation);
      } catch {
        return DEFAULT_APP_PREFERENCES.navigation;
      }
    })(),
  };
}
