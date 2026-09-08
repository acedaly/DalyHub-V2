/**
 * V2.15 ASSIST-00 kernel — the CLOSED proposal vocabulary, and its registry.
 *
 * Before this file the vocabulary was a ternary inside the apply engine:
 *
 * ```ts
 * const kind = item.kind === "link" ? "link" : item.kind === "note" ? "note" : "task";
 * ```
 *
 * Three consequences followed, and each is a defect rather than a style
 * preference. An unrecognised kind silently became a Task, so a typo in a
 * browser payload produced a record instead of a refusal. Nothing declared what
 * a kind may target, which feature may produce it or which privacy categories
 * generating it discloses, so those rules lived — where they lived at all — in
 * comments. And nothing declared how a kind is UNDONE, which is why AI-01 and
 * AI-02 shipped with no undo at all.
 *
 * This registry is the answer to all three. It is PURE: no storage, no clock, no
 * React, no repository. It states what a proposal kind IS; the apply engine
 * states what one DOES.
 *
 * ## The release invariant, expressed as a type
 *
 * V2.15's governing rule is that **every applied proposal must be undoable**. A
 * rule in a document decays; a rule in a type cannot. `undo` is a REQUIRED field
 * whose type is a closed union of implemented strategies, so a kind with no undo
 * contract is not merely discouraged — it does not typecheck.
 *
 * ## What a kind is NOT
 *
 * It is not a description of where a suggestion came from. `obligation_task` is
 * named for the mutation it performs (create a Task, and point an obligation at
 * it), not for the record that inspired it. The V2.9 sketch proposed an
 * `obligation` kind; the mutation an obligation follow-up actually performs has
 * nothing to do with changing the obligation, and a vocabulary that names
 * sources rather than mutations is a vocabulary that cannot describe its own
 * inverse.
 */

import type { PrivacyCategory } from "./ai-evidence";
import type { AiFeatureId } from "./ai-features";

/**
 * Every proposal item kind the product ships. A CLOSED set.
 *
 * The first three are AI-01/AI-02's, unchanged in meaning and brought under
 * this contract by V2.15. The last three are V2.15's own.
 */
export const PROPOSAL_KINDS = [
  /** Create a Task the owner reviewed. */
  "task",
  /** Create a Note the owner reviewed, linked to its source Meeting. */
  "note",
  /** Assert one `link.related` EntityLink between two live records. */
  "link",
  /** Set ONE uncategorised transaction's category. */
  "transaction_category",
  /** Create a Task for an overdue obligation, and point the obligation at it. */
  "obligation_task",
  /** Write ONE Review reflection section the owner approved. */
  "review_reflection",
] as const;

export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** True when `value` names a shipped proposal kind. */
export function isProposalKind(value: unknown): value is ProposalKind {
  return (
    typeof value === "string" &&
    (PROPOSAL_KINDS as readonly string[]).includes(value)
  );
}

/**
 * How an applied item is REVERSED.
 *
 * Each member names an inverse that already exists as an ordinary DalyHub
 * operation. There is no `none`, and adding one would be the change that lets
 * V2.15's invariant quietly lapse.
 *
 *   - `delete_created` — soft-delete the record the acceptance created.
 *   - `remove_link` — unlink the relationship the acceptance asserted.
 *   - `restore_previous` — write the previous value back, under the same
 *     expectation guard the forward write used.
 *   - `unlink_and_delete` — clear the pointer, then soft-delete the record.
 */
export const PROPOSAL_UNDO_STRATEGIES = [
  "delete_created",
  "remove_link",
  "restore_previous",
  "unlink_and_delete",
] as const;

export type ProposalUndoStrategy = (typeof PROPOSAL_UNDO_STRATEGIES)[number];

/**
 * What a kind targets, as the SERVER resolves it.
 *
 * `null` means the item creates something with no pre-existing target of its
 * own — a Task or a Note, whose only server-resolved context is the proposal's
 * source record.
 */
export type ProposalTargetKind =
  "transaction" | "obligation" | "review" | "entity" | null;

/** One row of the registry. Everything a kind declares about itself. */
export interface ProposalKindDescriptor {
  readonly kind: ProposalKind;
  /** The owner-facing noun. Used in review surfaces and undo notifications. */
  readonly label: string;
  /**
   * What the item's target id must resolve to server-side, or `null` for a
   * kind that creates a record rather than changing one.
   */
  readonly targetKind: ProposalTargetKind;
  /**
   * `create` or `update`.
   *
   * The distinction is not cosmetic: an `update` kind CHANGES something the
   * owner may have touched since the proposal was generated, so a stale guard
   * is mandatory for it and merely available to a `create`.
   */
  readonly mutates: "create" | "update";
  /**
   * The features permitted to produce this kind.
   *
   * Enforced at acceptance against the feature recorded on the ledger row, not
   * against anything the browser says — so a Finance categorisation payload
   * submitted under a Meeting extraction's usage id is refused.
   */
  readonly features: readonly AiFeatureId[];
  /** The privacy categories generating this kind discloses. */
  readonly categories: readonly PrivacyCategory[];
  /** How an applied item of this kind is reversed. REQUIRED. */
  readonly undo: ProposalUndoStrategy;
  /**
   * True when a `current → proposed` difference view is meaningful.
   *
   * False for a creation: there is no current value to show, and rendering
   * "nothing → a Task" as a diff is noise.
   */
  readonly showsDifference: boolean;
  /**
   * True when acceptance MUST carry an expectation of the target's prior state.
   *
   * Exactly `mutates === "update"`, stated separately so the apply engine reads
   * an intention rather than inferring one from a word.
   */
  readonly requiresExpectedState: boolean;
}

const DESCRIPTORS: Readonly<Record<ProposalKind, ProposalKindDescriptor>> = {
  task: {
    kind: "task",
    label: "Task",
    targetKind: null,
    mutates: "create",
    features: ["meeting-action-extraction", "note-action-extraction"],
    categories: ["general"],
    undo: "delete_created",
    showsDifference: false,
    requiresExpectedState: false,
  },
  note: {
    kind: "note",
    label: "Note",
    targetKind: null,
    mutates: "create",
    features: ["meeting-action-extraction"],
    categories: ["general"],
    undo: "delete_created",
    showsDifference: false,
    requiresExpectedState: false,
  },
  link: {
    kind: "link",
    label: "Link",
    targetKind: "entity",
    mutates: "create",
    features: ["meeting-action-extraction", "note-action-extraction"],
    categories: ["general"],
    undo: "remove_link",
    showsDifference: false,
    requiresExpectedState: false,
  },
  transaction_category: {
    kind: "transaction_category",
    label: "Category",
    targetKind: "transaction",
    mutates: "update",
    features: ["finance-categorisation"],
    // A payee, an amount and a category name are financial content, so the
    // owner's `financial` allowance decides whether this feature can run at
    // all. The consent gate is `runAiRequest`'s and is not re-implemented here.
    categories: ["general", "financial"],
    undo: "restore_previous",
    showsDifference: true,
    requiresExpectedState: true,
  },
  obligation_task: {
    kind: "obligation_task",
    label: "Follow-up Task",
    targetKind: "obligation",
    mutates: "create",
    features: ["obligation-follow-up"],
    categories: ["general"],
    undo: "unlink_and_delete",
    showsDifference: false,
    requiresExpectedState: false,
  },
  review_reflection: {
    kind: "review_reflection",
    label: "Reflection",
    targetKind: "review",
    mutates: "update",
    features: ["review-reflection-draft"],
    // A Review reflection is authored personal reflection (AI-04's
    // `reflection` category), and the facts it is drafted from are the Weekly
    // Review's own — the same categories V2.14's Review assistant declares.
    categories: ["general", "reflection"],
    undo: "restore_previous",
    showsDifference: true,
    requiresExpectedState: true,
  },
};

/** The descriptor for a kind. Total: every declared kind has a row. */
export function proposalKindDescriptor(
  kind: ProposalKind,
): ProposalKindDescriptor {
  return DESCRIPTORS[kind];
}

/** Every descriptor, in declaration order. */
export function allProposalKinds(): readonly ProposalKindDescriptor[] {
  return PROPOSAL_KINDS.map((kind) => DESCRIPTORS[kind]);
}

/**
 * Narrow an untrusted browser value to a kind, or `null`.
 *
 * `null` means REFUSE. It does not mean "assume Task", which is what the code
 * this replaces did.
 */
export function parseProposalKind(value: unknown): ProposalKind | null {
  return isProposalKind(value) ? value : null;
}

/**
 * True when `feature` is permitted to produce `kind`.
 *
 * The feature comes from the LEDGER ROW the acceptance names, never from the
 * request body: a browser that could choose the feature could choose the
 * permission.
 */
export function proposalKindAllowedForFeature(
  kind: ProposalKind,
  feature: AiFeatureId,
): boolean {
  return DESCRIPTORS[kind].features.includes(feature);
}

/** Every kind a feature may produce, in vocabulary order. */
export function proposalKindsForFeature(
  feature: AiFeatureId,
): readonly ProposalKind[] {
  return PROPOSAL_KINDS.filter((kind) =>
    DESCRIPTORS[kind].features.includes(feature),
  );
}

/**
 * The kinds a proposal may carry when NO ledger row resolves.
 *
 * Deliberately the three CREATE kinds AI-01 and AI-02 shipped, and deliberately
 * not the two update kinds V2.15 adds. A creation with no traceable generation
 * is an ordinary record the owner asked for; a CHANGE to a record that already
 * exists, with no generation behind it, is a mutation nothing can audit — so it
 * is refused rather than accepted on trust.
 */
export const UNTRACEABLE_PROPOSAL_KINDS: readonly ProposalKind[] = [
  "task",
  "note",
  "link",
];
