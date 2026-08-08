/**
 * TASKS-03 / X-02 — the Tasks configuration's saved-view CODEC.
 *
 * The shared storage adapter is codec-driven: it stores "a name plus a validated
 * config of a kind" and knows nothing about what a Tasks configuration means. This
 * file is the whole of what the `tasks` kind adds to it.
 */

import type { SavedViewCodec } from "~/kernel/views";

import {
  TASK_VIEW_CONFIG_VERSION,
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  taskViewConfigsEqual,
  type TaskViewConfig,
} from "./task-view-config";
import { validateTaskViewConfigForWrite } from "./task-view-validation";

export const TASK_VIEW_CODEC: SavedViewCodec<TaskViewConfig> = {
  kind: "tasks",
  version: TASK_VIEW_CONFIG_VERSION,
  parse: parseTaskViewConfig,
  validateForWrite: validateTaskViewConfigForWrite,
  serialise: serialiseTaskViewConfig,
  equals: taskViewConfigsEqual,
};
