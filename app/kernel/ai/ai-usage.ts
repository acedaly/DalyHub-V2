/**
 * AI-01 kernel — the AI request state machine and the usage ledger contract.
 *
 * The ledger is OPERATIONAL METADATA, not Activity. Running an AI request,
 * reading an answer, rejecting a proposal and hitting a budget limit are all
 * things that happened to the *system*, not meaningful history of the owner's
 * records — so none of them writes an Activity event (FND-05 / ADR-012). Activity
 * appears only when the owner ACCEPTS a proposal and an ordinary domain mutation
 * runs, with the owner as the actor, through the module's existing repository.
 *
 * What the ledger deliberately does NOT store: prompts, responses, record
 * content, API keys, cookies, JWTs, provider auth headers, hidden reasoning, or
 * any workspace data beyond a bounded set of source record ids.
 */

import type { WorkspaceId } from "~/kernel/workspaces";
import type { AiErrorCode } from "./ai-errors";
import type { AiFeatureId } from "./ai-features";
import type { AiModelTier, AiProvider } from "./ai-models";

/**
 * The lifecycle of one AI request. A row moves forward only; there is no path
 * back from a terminal state.
 *
 *   planned ─▶ budget_reserved ─▶ running ─┬─▶ succeeded
 *      │              │             │      ├─▶ failed
 *      └──────────────┴─────────────┴──────┴─▶ cancelled
 *
 *   reused is terminal on its own: a validated earlier result was returned and
 *   no provider was contacted.
 */
export const AI_REQUEST_STATES = [
  "planned",
  "budget_reserved",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "reused",
] as const;

export type AiRequestState = (typeof AI_REQUEST_STATES)[number];

/** True when `value` names a request state. */
export function isAiRequestState(value: unknown): value is AiRequestState {
  return (
    typeof value === "string" &&
    (AI_REQUEST_STATES as readonly string[]).includes(value)
  );
}

/** States from which nothing further may happen. */
const TERMINAL_STATES: ReadonlySet<AiRequestState> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "reused",
]);

/** True when a state is terminal. */
export function isTerminalRequestState(state: AiRequestState): boolean {
  return TERMINAL_STATES.has(state);
}

/** The legal transitions. Anything absent is refused by {@link canTransition}. */
const TRANSITIONS: Readonly<Record<AiRequestState, readonly AiRequestState[]>> =
  {
    planned: ["budget_reserved", "failed", "cancelled", "reused"],
    budget_reserved: ["running", "failed", "cancelled"],
    running: ["succeeded", "failed", "cancelled"],
    succeeded: [],
    failed: [],
    cancelled: [],
    reused: [],
  };

/** True when `to` may follow `from`. PURE. */
export function canTransition(
  from: AiRequestState,
  to: AiRequestState,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Advance the state machine, or refuse. Returns `null` on an illegal move so the
 * caller decides how to report it — the machine itself never throws, because a
 * late cancellation racing a completion is normal, not exceptional.
 */
export function transition(
  from: AiRequestState,
  to: AiRequestState,
): AiRequestState | null {
  return canTransition(from, to) ? to : null;
}

/** Which provider attempt a ledger row describes. */
export const AI_ATTEMPT_KINDS = ["primary", "retry", "fallback"] as const;
export type AiAttemptKind = (typeof AI_ATTEMPT_KINDS)[number];

/**
 * One usage row. Every field is either operational metadata or a bounded record
 * reference — never content.
 */
export interface AiUsageRecord {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  /**
   * The authenticated actor's stable subject — the SAME value the Activity
   * stream stores as an actor id (IDENT-01). Never an email.
   */
  readonly ownerId: string;
  readonly featureId: AiFeatureId;
  readonly promptVersion: string;
  readonly provider: AiProvider;
  /** The DalyHub-internal model id, never the provider's own string. */
  readonly modelId: string;
  readonly tier: AiModelTier;
  readonly state: AiRequestState;
  readonly attempt: AiAttemptKind;
  /** The owner action this row belongs to; repeats are deduplicated on it. */
  readonly idempotencyKey: string;
  readonly requestedAt: Date;
  readonly completedAt: Date | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** USD reserved before the call. */
  readonly reservedUsd: number;
  /** USD after reconciliation against provider-reported usage. */
  readonly estimatedUsd: number;
  /** The pricing registry version the estimate was computed under. */
  readonly pricingVersion: string;
  /** Set when a validated earlier result was returned instead of a new call. */
  readonly reusedFromId: string | null;
  /** A bounded failure category — never a provider message. */
  readonly failureCode: AiErrorCode | null;
  /** A stable digest of the exact evidence the request was built from. */
  readonly sourceFingerprint: string | null;
  /** Up to a bounded number of source record ids. No titles, no content. */
  readonly sourceEntityIds: readonly string[];
  /** How the owner disposed of a proposal, where the feature produces one. */
  readonly proposalOutcome: AiProposalOutcome | null;
}

/** What became of a proposal. `null` until the owner decides. */
export const AI_PROPOSAL_OUTCOMES = [
  "accepted",
  "partially_accepted",
  "rejected",
] as const;
export type AiProposalOutcome = (typeof AI_PROPOSAL_OUTCOMES)[number];

/** True when `value` names a proposal outcome. */
export function isAiProposalOutcome(
  value: unknown,
): value is AiProposalOutcome {
  return (
    typeof value === "string" &&
    (AI_PROPOSAL_OUTCOMES as readonly string[]).includes(value)
  );
}

/** The maximum source ids one row records. Beyond this the fingerprint stands in. */
export const MAX_RECORDED_SOURCE_IDS = 24;

/** What opening a ledger row needs. */
export interface StartAiRequestInput {
  readonly ownerId: string;
  readonly featureId: AiFeatureId;
  readonly promptVersion: string;
  readonly provider: AiProvider;
  readonly modelId: string;
  readonly tier: AiModelTier;
  readonly attempt: AiAttemptKind;
  readonly idempotencyKey: string;
  readonly reservedUsd: number;
  readonly pricingVersion: string;
  readonly sourceFingerprint: string | null;
  readonly sourceEntityIds: readonly string[];
}

/** What closing a ledger row needs. */
export interface CompleteAiRequestInput {
  readonly state: Extract<
    AiRequestState,
    "succeeded" | "failed" | "cancelled" | "reused"
  >;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly estimatedUsd?: number | null;
  readonly failureCode?: AiErrorCode | null;
  readonly reusedFromId?: string | null;
}

/** Per-feature usage, for the Settings breakdown. */
export interface AiFeatureUsageTotal {
  readonly featureId: AiFeatureId;
  readonly requests: number;
  readonly estimatedUsd: number;
}

/**
 * The ledger port. It is workspace-scoped, records NO Activity, and its
 * `reserve`/`complete` pair is the only way budget headroom moves.
 */
export interface AiUsageRepository {
  /**
   * Open a row in `budget_reserved`, atomically with the concurrency and period
   * checks the adapter performs. Returns the EXISTING row when `idempotencyKey`
   * has already been used, so a refresh or a double-submit cannot buy a second
   * paid request.
   */
  readonly reserve: (
    input: StartAiRequestInput,
  ) => Promise<{ record: AiUsageRecord; created: boolean }>;
  /** Move a reserved row to `running`. */
  readonly markRunning: (id: string) => Promise<AiUsageRecord | null>;
  /** Close a row and reconcile its cost. */
  readonly complete: (
    id: string,
    input: CompleteAiRequestInput,
  ) => Promise<AiUsageRecord | null>;
  /** Record how the owner disposed of a proposal. Never writes Activity. */
  readonly recordProposalOutcome: (
    id: string,
    outcome: AiProposalOutcome,
  ) => Promise<boolean>;
  /** Read one row in this workspace. */
  readonly get: (id: string) => Promise<AiUsageRecord | null>;
  /** The period totals used by the budget check. */
  readonly totals: (input: {
    readonly day: string;
    readonly month: string;
    readonly featureId: AiFeatureId;
  }) => Promise<{
    readonly monthUsd: number;
    readonly dayUsd: number;
    readonly monthPremiumUsd: number;
    readonly inFlight: number;
    readonly featureRequestsToday: number;
  }>;
  /** Per-feature totals for the current month. */
  readonly featureTotals: (
    month: string,
  ) => Promise<readonly AiFeatureUsageTotal[]>;
  /**
   * The most recent SUCCEEDED row matching this fingerprint, for result reuse.
   * `null` when nothing reusable exists.
   */
  readonly findReusable: (input: {
    readonly ownerId: string;
    readonly featureId: AiFeatureId;
    readonly sourceFingerprint: string;
    readonly notBefore: Date;
  }) => Promise<AiUsageRecord | null>;
  /** Release a stale in-flight row so a crashed request cannot block forever. */
  readonly expireStale: (olderThan: Date) => Promise<number>;
}
