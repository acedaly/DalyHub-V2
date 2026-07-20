/**
 * DS-10 Inspector — shared types (React-free).
 *
 * The Inspector is the standard depth-editing surface for any record (Task,
 * Project, Person, Note, Meeting, Goal, …). No module builds its own edit drawer
 * after this — a module supplies a `renderInspector(entry)` callback and the one
 * shared Inspector renders it as a resizable right-side panel (desktop) or a
 * bottom/full sheet (mobile).
 *
 * The React render-result type (which carries `ReactNode`) lives in
 * `inspector-context.ts`; this file stays React-free.
 */

/** The opaque key identifying what the Inspector is showing (e.g. `task:123`). */
export type InspectorKey = string;

/** The entry passed to `renderInspector`. */
export type InspectorEntry = {
  readonly key: InspectorKey;
};

/** Resize bounds for the docked (desktop) panel, in pixels. */
export const INSPECTOR_MIN_WIDTH = 320;
export const INSPECTOR_MAX_WIDTH = 720;
export const INSPECTOR_DEFAULT_WIDTH = 400;
/** Keyboard resize step (px) for the separator. */
export const INSPECTOR_RESIZE_STEP = 24;
/** localStorage key for the persisted docked width. */
export const INSPECTOR_WIDTH_STORAGE_KEY = "dh-inspector-width";

/** Clamp a width to the allowed docked range. */
export function clampInspectorWidth(width: number): number {
  if (Number.isNaN(width)) {
    return INSPECTOR_DEFAULT_WIDTH;
  }
  return Math.min(
    INSPECTOR_MAX_WIDTH,
    Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)),
  );
}

/** The imperative controller a consumer uses to drive the Inspector. */
export type InspectorController = {
  readonly openKey: InspectorKey | null;
  readonly isOpen: boolean;
  /** Open (or switch) the Inspector to `key`. */
  openInspector(key: InspectorKey): void;
  /** Replace the current key without a new history entry. */
  replaceInspector(key: InspectorKey): void;
  /** Close the Inspector. */
  closeInspector(): void;
};
