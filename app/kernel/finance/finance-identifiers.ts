/**
 * V2.12 FIN-00 — the Finance domain's stable identifiers.
 *
 * Entity types, Activity event types, the EntityLink type an obligation's
 * settlement projects into, and the reservation set that stops a bare
 * `EntityRepository.create` producing a Finance entity with no detail slice.
 *
 * Dependency-free on purpose: the module manifest, the D1 adapter, the kernel
 * validators and the client view-models all import from here, and a manifest
 * that dragged React or D1 in would break the module-import boundary.
 */

/** The Finance account entity type. */
export const FINANCE_ACCOUNT_ENTITY_TYPE = "finance_account";

/** The Finance transaction entity type — a LIGHT entity (ADR-120 decision 2). */
export const FINANCE_TRANSACTION_ENTITY_TYPE = "finance_transaction";

/**
 * The entity types reserved for `FinanceRepository`.
 *
 * A bare `EntityRepository.create` of either would produce an entity with no
 * detail slice: an account with no currency and no opening balance, invisible to
 * every Finance read (all of which join the slice) and unable to hold a
 * transaction; or a transaction with no amount, no account and no fingerprint,
 * which is not a transaction at all. Same reasoning as `obligation` (V2.10
 * LIFE-01) and `habit` (HABITS-01).
 */
export const RESERVED_FINANCE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  FINANCE_ACCOUNT_ENTITY_TYPE,
  FINANCE_TRANSACTION_ENTITY_TYPE,
]);

/** True when `type` is reserved for the Finance repository. */
export function isReservedFinanceEntityType(type: string): boolean {
  return RESERVED_FINANCE_ENTITY_TYPES.has(type);
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The FOUR Finance Activity event types, and this is the whole list.
 *
 * There is deliberately no event for a transaction — not on create, not on
 * categorise, not on edit, not on delete. One applied import writes ONE event
 * carrying counts, because an event per transaction would double an import's
 * write volume and fill the feed with a fact nobody reads (ADR-120 decision 2,
 * and the strategy's own decision before it).
 *
 * There is no budget event either. A budget's only interesting fact is its
 * AMOUNT, and an Activity payload may not carry a monetary value — so the event
 * would say "a budget changed" and nothing else, which is not worth a row.
 */
export const FINANCE_ACCOUNT_CREATED = "finance.account.created";
export const FINANCE_ACCOUNT_UPDATED = "finance.account.updated";
export const FINANCE_ACCOUNT_CLOSED = "finance.account.closed";
export const FINANCE_IMPORT_APPLIED = "finance.import.applied";

/** Every Finance Activity type, for the manifest and for the payload test. */
export const FINANCE_ACTIVITY_TYPES = [
  FINANCE_ACCOUNT_CREATED,
  FINANCE_ACCOUNT_UPDATED,
  FINANCE_ACCOUNT_CLOSED,
  FINANCE_IMPORT_APPLIED,
] as const;

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The `obligation.settled_by` projection — an EntityLink from the obligation to
 * the transaction that paid it.
 *
 * It is a PROJECTION of `obligation_details.settled_by_transaction_id`, which is
 * the authority, written and cleared in the same batch. It exists so the
 * transaction's record shows the obligation in its Linked items without a
 * bespoke reverse reader, and it is reserved so nothing else can write it —
 * exactly the shape ADR-118 decision 1 established for the subject.
 */
export const OBLIGATION_SETTLED_BY_LINK = "obligation.settled_by";

/** The deterministic id of one settlement projection. */
export function obligationSettlementLinkId(
  obligationId: string,
  transactionId: string,
): string {
  return `${OBLIGATION_SETTLED_BY_LINK}:${obligationId}:${transactionId}`;
}
