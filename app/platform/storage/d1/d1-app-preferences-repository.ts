import {
  DEFAULT_APP_PREFERENCES,
  type AppPreferencePatch,
  type AppPreferenceRecord,
  type AppPreferences,
  type AppPreferencesChangeResult,
  type AppPreferencesRepository,
} from "~/kernel/preferences";
import {
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
  ): Promise<AppPreferencesChangeResult> {
    const owner = validateOwnerId(ownerId);
    const safePatch = validateAppPreferencesPatch(patch);
    const current = await this.get(owner);
    const next = { ...current, ...safePatch };
    if (preferencesEqual(current, next)) {
      return { preferences: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const navigationConfig = JSON.stringify(next.navigation);

    try {
      const statements = [
        this.#db
          .prepare(
            `INSERT INTO owner_app_preferences (
               workspace_id, owner_id, appearance, timezone, date_format,
               first_day_of_week,
               default_landing_destination, default_tasks_view,
               default_task_destination, default_task_view_id,
               default_task_capture_parent_id, default_task_capture_parent_kind,
               default_diary_mode,
               navigation_config, version, created_at, updated_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT (workspace_id, owner_id) DO UPDATE SET
               appearance = excluded.appearance,
               timezone = excluded.timezone,
               date_format = excluded.date_format,
               first_day_of_week = excluded.first_day_of_week,
               default_landing_destination = excluded.default_landing_destination,
               default_tasks_view = excluded.default_tasks_view,
               default_task_destination = excluded.default_task_destination,
               default_task_view_id = excluded.default_task_view_id,
               default_task_capture_parent_id = excluded.default_task_capture_parent_id,
               default_task_capture_parent_kind = excluded.default_task_capture_parent_kind,
               default_diary_mode = excluded.default_diary_mode,
               navigation_config = excluded.navigation_config,
               version = owner_app_preferences.version + 1,
               updated_at = excluded.updated_at
             RETURNING *`,
          )
          .bind(
            this.#workspaceId,
            owner,
            next.appearance,
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
            navigationConfig,
            nowTs,
            nowTs,
          ),
      ];
      if (this.#fault === "after-write") {
        statements.push(
          this.#db.prepare("SELECT 1 FROM __dalyhub_preferences_fault__"),
        );
      }
      const [result] = await this.#db.batch<AppPreferencesRow>(statements);
      const row = result.results[0];
      if (!row) throw new Error("Preference write returned no row.");
      return { preferences: this.#record(row), changed: true };
    } catch (error) {
      throw new AppPreferencesStorageError({ cause: error });
    }
  }

  #record(row: AppPreferencesRow): AppPreferenceRecord {
    const navigationRaw = safeJson(row.navigation_config);
    const preferences: AppPreferences = normaliseStoredPreferences({
      appearance: row.appearance,
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
