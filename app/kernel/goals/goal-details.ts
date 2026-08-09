/**
 * AREA-02 Goals kernel — the Goal-owned detail contract.
 *
 * The spine deliberately does not model a target date or a definition of done
 * (`SPINE_MODEL.md`); this is the small, additive, Goal-owned detail slice that
 * fills that gap — mirroring `~/kernel/project-settings`'s relationship to the
 * spine exactly (identity/title/completion stay `SpineRepository`; this module
 * owns only the fields the spine does not).
 *
 * Target semantics (ADR — see `docs/decisions/ARCHITECTURE_DECISIONS.md`): the
 * roadmap's "target" is a nullable OWNER-CALENDAR TARGET DATE, stored as the
 * literal `YYYY-MM-DD` string — never a `Date`, never given an implicit midnight
 * timestamp, never routed through UTC conversion. It is a deadline the owner is
 * aiming for, presented with honest unset/overdue states; it is NEVER read as an
 * automatic completion trigger. There is no numeric target or measurement unit.
 *
 * Definition-of-done semantics: a nullable, validated, PLAIN-TEXT (not Markdown)
 * multiline field. DalyHub's Markdown pipeline is not claimed for this surface —
 * only Task descriptions/Notes currently use it — so this stays plain text with
 * line breaks preserved by the renderer, never parsed into machine-executable
 * rules.
 *
 * ── GOAL-02: the measurement configuration joins this slice ──────────────────
 * "How is this Goal measured?" is Goal-owned detail state in exactly the sense
 * the target date already is, so it lives here rather than in a second per-Goal
 * table that every read would have to join alongside this one. The domain (the
 * four strategies, the units, the direction inference and every validator) lives
 * in `goal-measurement.ts`; this module owns only its place in the details patch,
 * so `GoalDetailsRepository.update` stays the ONE way a Goal's own fields change.
 *
 * The doc comment above said "There is no numeric target or measurement unit."
 * That was true of AREA-02 and is no longer true: a Goal may now carry a
 * baseline, a target VALUE and a unit. The target DATE's semantics are unchanged
 * — still an owner-calendar deadline, still never a completion trigger.
 */

import {
  normalizeGoalMeasurementConfig,
  normalizeGoalMeasurementUnit,
  parseGoalMeasurementDirection,
  parseGoalMeasurementType,
  validateOptionalGoalMeasurementValue,
  UNMEASURED_GOAL,
  type GoalMeasurementConfig,
} from "./goal-measurement";
import type { WorkspaceId } from "~/kernel/workspaces";

/** Activity event appended when a Goal's detail fields (target date and/or
 * definition of done) change. Goal-owned — distinct from the spine's
 * `goal.completed`/`goal.reopened` (kernel/spine) and Projects'
 * `project.status_changed` (kernel/project-settings) precedent. */
export const GOAL_DETAILS_UPDATED = "goal.details_updated";

/**
 * A validated maximum for the definition-of-done plain-text field. Bounded well
 * above the short free-text precedent (`WAITING_NOTE_MAX_LENGTH = 200`, a single
 * waiting reason) but far below the Markdown pipeline's document-scale
 * `MARKDOWN_SOURCE_MAX_BYTES` (1 MiB) — this is a focused "what does done look
 * like" statement, not a document.
 */
export const GOAL_DEFINITION_OF_DONE_MAX_LENGTH = 2000;

/** The Goal-owned detail fields. Both are optional; a Goal with neither set has
 * no `goal_details` row at all (never backfilled — see the migration). */
export type GoalDetails = {
  /** A nullable owner-calendar target date, `YYYY-MM-DD`. Never a completion
   * trigger — see the module doc comment above. */
  readonly targetDate: string | null;
  /** A nullable, plain-text (not Markdown) definition of done. Whitespace-only
   * input normalises to `null`. */
  readonly definitionOfDone: string | null;
  /** GOAL-02 — how this Goal is measured. `type: null` means "not measured",
   * which is the state every Goal created before GOAL-02 is in. */
  readonly measurement: GoalMeasurementConfig;
};

export type GoalDetailsRecord = GoalDetails & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
};

/** A partial patch: an omitted key leaves that field unchanged; `null` clears it. */
export type UpdateGoalDetailsInput = {
  readonly targetDate?: string | null;
  readonly definitionOfDone?: string | null;
  /**
   * GOAL-02 — a partial measurement patch, merged over the current
   * configuration and then RENORMALISED as a whole
   * (`normalizeGoalMeasurementConfig`). Merging before normalising is what makes
   * "change the target to 68" a one-key patch that cannot accidentally clear the
   * unit, while switching the type to `manual` still rewrites the whole slice to
   * the only coherent shape a manual percentage has.
   *
   * `{ type: null }` clears the measurement entirely.
   */
  readonly measurement?: Partial<GoalMeasurementConfig>;
};

export type GoalDetailsChangeResult = {
  readonly details: GoalDetailsRecord;
  readonly changed: boolean;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validate a nullable target-date value. `null`/`undefined`/an empty string
 * clear it. A present value must be a REAL calendar date in `YYYY-MM-DD` form,
 * validated purely by integer component ranges (leap years included) — never
 * routed through `Date`, so it can never shift by a viewer's timezone. This is
 * the kernel-owned date-only parser (mirrors `~/kernel/tasks`'
 * `validateTaskDate` exactly, kept dependency-free rather than importing the
 * DS-06 UI package into the kernel).
 */
export function validateGoalTargetDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new GoalDetailsValidationError(
      "targetDate",
      "must be a date string or null",
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = DATE_ONLY_PATTERN.exec(trimmed);
  if (!match) {
    throw new GoalDetailsValidationError(
      "targetDate",
      "must be a YYYY-MM-DD date",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) {
    throw new GoalDetailsValidationError(
      "targetDate",
      "month must be between 01 and 12",
    );
  }
  const maxDay =
    month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  if (day < 1 || day > maxDay) {
    throw new GoalDetailsValidationError(
      "targetDate",
      "day is out of range for the month",
    );
  }
  return trimmed;
}

/** Is `value` a well-formed, real calendar `YYYY-MM-DD` date-only string? Used
 * to fail honestly (not silently coerce) on a malformed value read back from
 * storage. */
export function isValidGoalTargetDate(value: string): boolean {
  try {
    return validateGoalTargetDate(value) === value;
  } catch {
    return false;
  }
}

/**
 * Normalise a nullable definition-of-done value. `null`/`undefined` clear it. A
 * whitespace-only string normalises to `null` (never stored as an empty/blank
 * string — matches the DB's `goal_details_definition_not_blank` CHECK). The
 * TRIMMED value is what is stored; it must not exceed
 * `GOAL_DEFINITION_OF_DONE_MAX_LENGTH` Unicode code points.
 */
export function normalizeGoalDefinitionOfDone(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new GoalDetailsValidationError(
      "definitionOfDone",
      "must be a string or null",
    );
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const length = [...trimmed].length;
  if (length > GOAL_DEFINITION_OF_DONE_MAX_LENGTH) {
    throw new GoalDetailsValidationError(
      "definitionOfDone",
      `must be at most ${GOAL_DEFINITION_OF_DONE_MAX_LENGTH} characters`,
    );
  }
  return trimmed;
}

/**
 * Merge a measurement patch over the current configuration and renormalise.
 *
 * The ONE place a stored measurement configuration is decided, so the repository,
 * the creation action and any future importer all reach the same coherent shape.
 * Changing the TYPE discards the previous type's fields rather than merging them
 * (a `manual` Goal has no baseline of 85 hiding behind its percentage), because
 * carrying a stale baseline forward is how a Goal ends up claiming a number it
 * never measured.
 */
export function resolveGoalMeasurementConfig(
  current: GoalMeasurementConfig,
  patch: Partial<GoalMeasurementConfig> | undefined,
): GoalMeasurementConfig {
  if (patch === undefined) return current;
  if (patch.type === null) return UNMEASURED_GOAL;
  const nextType = patch.type ?? current.type;
  if (nextType === null) return UNMEASURED_GOAL;
  const base = nextType === current.type ? current : UNMEASURED_GOAL;
  return normalizeGoalMeasurementConfig({
    type: nextType,
    unit: patch.unit !== undefined ? patch.unit : base.unit,
    direction: patch.direction !== undefined ? patch.direction : base.direction,
    baselineValue:
      patch.baselineValue !== undefined
        ? patch.baselineValue
        : base.baselineValue,
    targetValue:
      patch.targetValue !== undefined ? patch.targetValue : base.targetValue,
  });
}

/**
 * Read a stored measurement configuration back into the domain shape.
 *
 * Every column is validated on the way out: an unrecognised type reads as "not
 * measured" and a non-finite stored number reads as absent, so a row written by a
 * future version (or corrupted) degrades to an honest absence rather than
 * painting a broken indicator.
 */
export function readGoalMeasurementConfig(row: {
  readonly measurementType: unknown;
  readonly measurementUnit: unknown;
  readonly measurementDirection: unknown;
  readonly baselineValue: unknown;
  readonly targetValue: unknown;
}): GoalMeasurementConfig {
  const type = parseGoalMeasurementType(row.measurementType);
  if (type === null) return UNMEASURED_GOAL;
  const readNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return normalizeGoalMeasurementConfig({
    type,
    unit:
      typeof row.measurementUnit === "string"
        ? normalizeGoalMeasurementUnit(row.measurementUnit)
        : null,
    direction: parseGoalMeasurementDirection(row.measurementDirection),
    baselineValue: readNumber(row.baselineValue),
    targetValue: readNumber(row.targetValue),
  });
}

/**
 * Build a validated measurement patch from untrusted wire values.
 *
 * Used by the Goal mutation endpoint so form strings ("70", "", "kg") become a
 * domain patch through the SAME validators the repository trusts, and an omitted
 * key stays omitted rather than becoming an accidental `null`.
 */
export function validateGoalMeasurementPatch(fields: {
  readonly measurementType?: unknown;
  readonly unit?: unknown;
  readonly direction?: unknown;
  readonly baselineValue?: unknown;
  readonly targetValue?: unknown;
}): Partial<GoalMeasurementConfig> {
  const patch: {
    type?: GoalMeasurementConfig["type"];
    unit?: string | null;
    direction?: GoalMeasurementConfig["direction"];
    baselineValue?: number | null;
    targetValue?: number | null;
  } = {};

  if (fields.measurementType !== undefined) {
    const raw = fields.measurementType;
    // An empty string is the wire form of "clear the measurement", matching the
    // `emptyToNull` convention every other Goal field posts with.
    const cleared =
      raw === null || (typeof raw === "string" && raw.trim().length === 0);
    if (cleared) {
      return { type: null };
    }
    const type = parseGoalMeasurementType(raw);
    if (type === null) {
      throw new GoalDetailsValidationError(
        "measurementType",
        "is not a supported measurement type",
      );
    }
    patch.type = type;
  }

  if (fields.unit !== undefined) {
    patch.unit = normalizeGoalMeasurementUnit(fields.unit);
  }
  if (fields.direction !== undefined) {
    const direction = parseGoalMeasurementDirection(fields.direction);
    if (direction === null && fields.direction !== null) {
      const blank =
        typeof fields.direction === "string" &&
        fields.direction.trim().length === 0;
      if (!blank) {
        throw new GoalDetailsValidationError(
          "measurementDirection",
          "must be increase or decrease",
        );
      }
    }
    if (direction !== null) patch.direction = direction;
  }
  if (fields.baselineValue !== undefined) {
    patch.baselineValue = validateOptionalGoalMeasurementValue(
      fields.baselineValue,
      "baselineValue",
    );
  }
  if (fields.targetValue !== undefined) {
    patch.targetValue = validateOptionalGoalMeasurementValue(
      fields.targetValue,
      "targetValue",
    );
  }
  return patch;
}

export type GoalDetailsValidationField =
  | "id"
  | "targetDate"
  | "definitionOfDone"
  | "measurementType"
  | "measurementDirection"
  | "unit"
  | "baselineValue"
  | "targetValue";

export class GoalDetailsValidationError extends Error {
  readonly code = "validation" as const;
  readonly field: GoalDetailsValidationField;

  constructor(field: GoalDetailsValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.name = "GoalDetailsValidationError";
    this.field = field;
  }
}

/** No active Goal with the given id exists in the bound workspace — used for a
 * nonexistent id, a deleted Goal, a wrong-kind id AND a cross-workspace id; the
 * cases are never distinguished (fails closed, discloses nothing). */
export class GoalDetailsNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Goal not found");
    this.name = "GoalDetailsNotFoundError";
  }
}

export class GoalDetailsStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A goal details storage error occurred.", options);
    this.name = "GoalDetailsStorageError";
  }
}

export class GoalDetailsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
    this.name = "GoalDetailsConflictError";
  }
}
