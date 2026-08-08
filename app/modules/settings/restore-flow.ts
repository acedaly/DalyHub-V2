/**
 * SET-02 — the restore flow's pure model: its states, its transitions and the
 * sentences the owner reads.
 *
 * React-free on purpose, for the same reason `confirmation.ts` is: the
 * interesting part of a recovery interface is *which state it is in and what it
 * says*, and that should be assertable without mounting anything. The component
 * is then a thin rendering of these values.
 *
 * The copy lives here too. A restore surface has to answer four different
 * failures — "the file is damaged", "that DalyHub is newer than this one", "that
 * is not a backup", "the restore did not finish" — in words that tell the owner
 * what to do next. Keeping them beside the states is what stops them drifting
 * into a single unhelpful "Something went wrong".
 */

/** The record counts the preview reports, mirroring the server contract. */
export interface RestoreCountsView {
  readonly areas: number;
  readonly goals: number;
  readonly projects: number;
  readonly tasks: number;
  readonly notes: number;
  readonly diaryEntries: number;
  readonly meetings: number;
  readonly people: number;
  readonly assets: number;
  readonly reviews: number;
  readonly other: number;
  readonly links: number;
  readonly activityEvents: number;
  readonly total: number;
}

/** The preview payload the server returns, as the client consumes it. */
export interface RestorePreviewView {
  readonly operationId: string;
  readonly backup: {
    readonly createdAt: string;
    readonly schemaVersion: number;
    readonly applicationVersion: string;
    readonly applicationReleaseName: string;
    readonly sourceWorkspaceId: string;
    readonly counts: RestoreCountsView;
  };
  readonly target: {
    readonly workspaceId: string;
    readonly isEmpty: boolean;
    readonly counts: RestoreCountsView;
  };
  readonly mode: "into-empty" | "replace";
  readonly destructive: boolean;
  readonly safetyBackupRequired: boolean;
}

/** Every state the restore surface can be in. */
export type RestoreFlowState =
  | { readonly kind: "idle" }
  /** The archive is uploading and being validated. Nothing is written yet. */
  | { readonly kind: "checking"; readonly filename: string }
  /** Validated and previewed. Restore is possible. */
  | {
      readonly kind: "ready";
      readonly filename: string;
      readonly preview: RestorePreviewView;
      /** The verified safety backup the owner has saved, when they have. */
      readonly safetyBackupFilename: string | null;
    }
  /** The safety backup is being produced and verified. */
  | {
      readonly kind: "backing-up";
      readonly filename: string;
      readonly preview: RestorePreviewView;
    }
  /** The cutover is running. */
  | {
      readonly kind: "restoring";
      readonly filename: string;
      readonly preview: RestorePreviewView;
    }
  /** The backup was refused. `reason` says which kind of refusal. */
  | {
      readonly kind: "rejected";
      readonly filename: string;
      readonly reason: RestoreRejectionView;
      readonly message: string;
    }
  /** The restore did not complete. */
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly workspaceReplaced: boolean;
    }
  /** The restore completed and verified. */
  | {
      readonly kind: "restored";
      readonly counts: RestoreCountsView;
      readonly safetyBackupFilename: string | null;
    };

/** The refusal kinds the server reports, as the interface distinguishes them. */
export type RestoreRejectionView =
  | "unreadable_archive"
  | "corrupt"
  | "unsupported_version"
  | "incompatible"
  | "too_large";

/** The heading a refusal is shown under. Distinct per kind, deliberately. */
export function rejectionHeading(reason: RestoreRejectionView): string {
  switch (reason) {
    case "corrupt":
      return "This backup failed its integrity check";
    case "unsupported_version":
      return "This backup was made by a different DalyHub";
    case "too_large":
      return "This file is too large to restore";
    case "unreadable_archive":
      return "This file could not be opened";
    default:
      return "This backup cannot be restored";
  }
}

/** Whether the restore action may run in the current state. */
export function canRestore(state: RestoreFlowState): boolean {
  if (state.kind !== "ready") return false;
  if (!state.preview.safetyBackupRequired) return true;
  return state.safetyBackupFilename !== null;
}

/**
 * The phrase a destructive restore requires the owner to type.
 *
 * `REPLACE` rather than a generic "yes": the word names the consequence, and it
 * is the same deliberate, unambiguous pattern DalyHub already uses for every
 * other irreversible setting (`confirmation.ts`).
 */
export const RESTORE_CONFIRM_PHRASE = "REPLACE";

/** The named record counts, in the order the preview lists them. */
export const RESTORE_COUNT_ROWS: readonly (readonly [
  keyof RestoreCountsView,
  string,
])[] = [
  ["areas", "Areas"],
  ["goals", "Goals"],
  ["projects", "Projects"],
  ["tasks", "Tasks"],
  ["notes", "Notes"],
  ["diaryEntries", "Diary entries"],
  ["meetings", "Meetings"],
  ["people", "People"],
  ["assets", "Assets"],
  ["reviews", "Reviews"],
  ["other", "Other records"],
  ["links", "Links"],
  ["activityEvents", "Activity events"],
];

/**
 * The one sentence that says what will happen to the owner's current data.
 *
 * Never "Are you sure?". It names the workspace, the backup's date and the two
 * record counts, because those are the facts that make the decision.
 */
export function consequenceSentence(preview: RestorePreviewView): string {
  const backupDate = formatBackupDate(preview.backup.createdAt);
  if (!preview.destructive) {
    return `This workspace is empty. Restoring will add the ${preview.backup.counts.total.toLocaleString()} record(s) from the backup taken on ${backupDate}.`;
  }
  return `This workspace currently holds ${preview.target.counts.total.toLocaleString()} record(s). Restoring REPLACES all of them with the ${preview.backup.counts.total.toLocaleString()} record(s) from the backup taken on ${backupDate}. Anything created since that backup will be gone.`;
}

/**
 * Format a backup's ISO instant as a readable date.
 *
 * Falls back to the raw string rather than throwing: a preview whose date is
 * unexpected is still worth showing, and this is the one place an odd value
 * could otherwise blank the whole confirmation.
 */
export function formatBackupDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
