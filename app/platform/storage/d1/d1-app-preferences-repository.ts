/**
 * Owner application preferences — D1 adapter.
 *
 * AUDIT-07 — this write is a PATCH, not a snapshot replacement.
 *
 * It used to read the whole record, merge the caller's fields into that read
 * and upsert EVERY column from the merged snapshot. `version` was bumped but
 * never compared, so two devices saving different settings from reads of the
 * same version each wrote the other's field back to its stale value, and both
 * calls reported success. Now the statement writes ONLY the columns the patch
 * names, so two independent settings merge instead of colliding — the same
 * shape `updateTask` already uses — and a caller whose new value is DERIVED
 * from the old one can quote `expectedVersion` to make the write a genuine
 * compare-and-set (`AppPreferencesConflictError` when it has moved on).
 *
 * The version precondition and the change predicate both live INSIDE the one
 * statement, evaluated at commit, so nothing can be written between a check and
 * the write. The pre-read exists only to answer "does this patch change
 * anything?" cheaply and to report the current record for an unchanged write;
 * storage, not that read, is the authority.
 */

import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencePatch,
  type AppPreferenceRecord,
  type AppPreferences,
  type AppPreferencesChangeResult,
  type AppPreferencesRepository,
  type UpdateAppPreferencesOptions,
} from "~/kernel/preferences";
import {
  AppPreferencesConflictError,
  AppPreferencesStorageError,
  normaliseStoredPreferences,
  validateAppPreferencesPatch,
  validateOwnerId,
} from "~/kernel/preferences";
import type { WorkspaceContext } from "~/kernel/workspaces";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { systemClock, type Clock } from "~/kernel/spine";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

interface AppPreferencesRow {
  readonly workspace_id: string;
  readonly owner_id: string;
  readonly appearance: string | null;
  readonly color_scheme: string | null;
  readonly timezone: string;
  readonly date_format: string;
  readonly first_day_of_week: string;
  readonly default_landing_destination: string;
  readonly default_tasks_view: string;
  readonly default_task_destination: string | null;
  readonly default_task_view_id: string | null;
  readonly default_task_capture_parent_id: string | null;
  readonly default_task_capture_parent_kind: string | null;
  readonly default_diary_mode: string;
  readonly navigation_config: string;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export type D1AppPreferencesRepositoryOptions = {
  readonly clock?: Clock;
  readonly mutationFault?: "after-write";
};

export class D1AppPreferencesRepository implements AppPreferencesRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #fault?: "after-write";

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1AppPreferencesRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options?.clock ?? systemClock;
    this.#fault = options?.mutationFault;
  }

  async get(ownerId: string): Promise<AppPreferenceRecord> {
    const owner = validateOwnerId(ownerId);
    try {
      const row = await this.#db
        .prepare(
          `SELECT * FROM owner_app_preferences
           WHERE workspace_id = ? AND owner_id = ?`,
        )
        .bind(this.#workspaceId, owner)
        .first<AppPreferencesRow>();
      if (row) return this.#record(row);

      const now = this.#clock();
      return {
        workspaceId: parseWorkspaceId(this.#workspaceId),
        ownerId: owner,
        version: 0,
        createdAt: now,
        updatedAt: now,
        ...DEFAULT_APP_PREFERENCES,
      };
    } catch (error) {
      throw new AppPreferencesStorageError({ cause: error });
    }
  }

  async update(
    ownerId: string,
    patch: AppPreferencePatch,
    options: UpdateAppPreferencesOptions = {},
  ): Promise<AppPreferencesChangeResult> {
    const owner = validateOwnerId(ownerId);
    const safePatch = validateAppPreferencesPatch(patch);
    const expectedVersion = options.expectedVersion;
    const current = await this.get(owner);

    const next = { ...current, ...safePatch };
    if (preferencesEqual(current, next)) {
      // The stored values already say what this patch asks for. Nothing can be
      // lost by agreeing, so a stale version is NOT a conflict here — reporting
      // one would send a caller to resolve a disagreement that does not exist.
      return { preferences: current, changed: false };
    }

    // A quoted version that is already out of date cannot become current, so
    // refuse before writing anything. The SQL guard below is still the
    // authority — this only spares the round trip in the common case.
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new AppPreferencesConflictError();
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    // The columns this patch actually names. Everything else is left exactly as
    // stored, so a concurrent write to another setting survives this one.
    const touched = PATCH_COLUMNS.filter(
      (column) => safePatch[column.key] !== undefined,
    );
    if (touched.length === 0) {
      return { preferences: current, changed: false };
    }
    const assignments = touched
      .map((column) => `${column.column} = excluded.${column.column}`)
      .join(",\n               ");
    // `IS NOT` is SQLite's null-safe inequality, so clearing a nullable setting
    // (or setting one that was null) still counts as a change.
    const changePredicate = touched
      .map(
        (column) =>
          `owner_app_preferences.${column.column} IS NOT excluded.${column.column}`,
      )
      .join(" OR ");
    const versionGuard =
      expectedVersion === undefined
        ? ""
        : ` AND owner_app_preferences.version = ?`;
    const versionBinds = expectedVersion === undefined ? [] : [expectedVersion];

    try {
      const statements = [
        this.#db
          .prepare(
            `INSERT INTO owner_app_preferences (
               workspace_id, owner_id, appearance, color_scheme, timezone,
               date_format, first_day_of_week,
               default_landing_destination, default_tasks_view,
               default_task_destination, default_task_view_id,
               default_task_capture_parent_id, default_task_capture_parent_kind,
               default_diary_mode,
               navigation_config, version, created_at, updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT (workspace_id, owner_id) DO UPDATE SET
               ${assignments},
               version = owner_app_preferences.version + 1,
               updated_at = excluded.updated_at
             WHERE (${changePredicate})${versionGuard}
             RETURNING *`,
          )
          .bind(
            this.#workspaceId,
            owner,
            next.appearance,
            next.colorScheme,
            next.timezone,
            next.dateFormat,
            next.firstDayOfWeek,
            next.defaultLandingDestination,
            next.defaultTasksView,
            next.defaultTaskDestination,
            next.defaultTaskViewId,
            next.defaultTaskCaptureParentId,
            next.defaultTaskCaptureParentKind,
            next.defaultDiaryMode,
            JSON.stringify(next.navigation),
            nowTs,
            nowTs,
            ...versionBinds,
          ),
      ];
      if (this.#fault === "after-write") {
        statements.push(
          this.#db.prepare("SELECT 1 FROM __dalyhub_preferences_fault__"),
        );
      }
      const [result] = await this.#db.batch<AppPreferencesRow>(statements);
      const row = result.results[0];
      if (row) return { preferences: this.#record(row), changed: true };
    } catch (error) {
      throw new AppPreferencesStorageError({ cause: error });
    }

    // Nothing was written. Either the row already holds exactly these values (a
    // genuine no-op that raced our pre-read) or the quoted version has moved on
    // — which must never be reported as a save.
    const refreshed = await this.get(owner);
    if (
      expectedVersion !== undefined &&
      refreshed.version !== expectedVersion &&
      !preferencesEqual(refreshed, { ...refreshed, ...safePatch })
    ) {
      throw new AppPreferencesConflictError();
    }
    return { preferences: refreshed, changed: false };
  }

  #record(row: AppPreferencesRow): AppPreferenceRecord {
    const navigationRaw = safeJson(row.navigation_config);
    const preferences: AppPreferences = normaliseStoredPreferences({
      appearance: row.appearance,
      colorScheme: row.color_scheme,
      timezone: row.timezone,
      dateFormat: row.date_format,
      firstDayOfWeek: row.first_day_of_week,
      defaultLandingDestination: row.default_landing_destination,
      defaultTasksView: row.default_tasks_view,
      defaultTaskDestination: row.default_task_destination,
      defaultTaskViewId: row.default_task_view_id,
      defaultTaskCaptureParentId: row.default_task_capture_parent_id,
      defaultTaskCaptureParentKind: row.default_task_capture_parent_kind,
      defaultDiaryMode: row.default_diary_mode,
      navigation: navigationRaw,
    });
    return {
      workspaceId: parseWorkspaceId(row.workspace_id),
      ownerId: row.owner_id,
      version: row.version,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      ...preferences,
    };
  }
}

/**
 * The patch key → stored column map. It exists so `update` can write exactly
 * the columns a patch names; every entry must stay in step with the INSERT
 * column list above, which supplies the first-row values for ALL of them.
 */
const PATCH_COLUMNS: readonly {
  readonly key: keyof AppPreferencePatch;
  readonly column: string;
}[] = [
  { key: "appearance", column: "appearance" },
  { key: "colorScheme", column: "color_scheme" },
  { key: "timezone", column: "timezone" },
  { key: "dateFormat", column: "date_format" },
  { key: "firstDayOfWeek", column: "first_day_of_week" },
  {
    key: "defaultLandingDestination",
    column: "default_landing_destination",
  },
  { key: "defaultTasksView", column: "default_tasks_view" },
  { key: "defaultTaskDestination", column: "default_task_destination" },
  { key: "defaultTaskViewId", column: "default_task_view_id" },
  {
    key: "defaultTaskCaptureParentId",
    column: "default_task_capture_parent_id",
  },
  {
    key: "defaultTaskCaptureParentKind",
    column: "default_task_capture_parent_kind",
  },
  { key: "defaultDiaryMode", column: "default_diary_mode" },
  { key: "navigation", column: "navigation_config" },
];

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return DEFAULT_APP_PREFERENCES.navigation;
  }
}

function preferencesEqual(a: AppPreferences, b: AppPreferences): boolean {
  return (
    a.appearance === b.appearance &&
    a.colorScheme === b.colorScheme &&
    a.timezone === b.timezone &&
    a.dateFormat === b.dateFormat &&
    a.firstDayOfWeek === b.firstDayOfWeek &&
    a.defaultLandingDestination === b.defaultLandingDestination &&
    a.defaultTasksView === b.defaultTasksView &&
    a.defaultTaskDestination === b.defaultTaskDestination &&
    a.defaultTaskViewId === b.defaultTaskViewId &&
    a.defaultTaskCaptureParentId === b.defaultTaskCaptureParentId &&
    a.defaultTaskCaptureParentKind === b.defaultTaskCaptureParentKind &&
    a.defaultDiaryMode === b.defaultDiaryMode &&
    JSON.stringify(a.navigation) === JSON.stringify(b.navigation)
  );
}
