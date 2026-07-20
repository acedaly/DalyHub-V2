/**
 * DS-10 Inspector — the React-FREE model entry.
 *
 * A re-export-only barrel forwarding the pure Inspector model: the URL contract
 * and the shared value types/bounds. Import-guarded by
 * `test/unit/inspector/react-free.test.ts`; keep that file list in sync.
 */

export {
  DEFAULT_INSPECTOR_PARAM,
  MAX_INSPECTOR_KEY_LENGTH,
  readInspectorKey,
  withInspector,
  withoutInspector,
} from "./inspector-url";

export type {
  InspectorKey,
  InspectorEntry,
  InspectorController,
} from "./types";

export {
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_RESIZE_STEP,
  INSPECTOR_WIDTH_STORAGE_KEY,
  clampInspectorWidth,
} from "./types";
