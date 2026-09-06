/**
 * V2.12 FIN-00 — the Finance domain's errors.
 *
 * Every one of them names a FIELD or a REASON the owner can act on. None of
 * them carries a monetary value, a payee, a memo or a CSV cell: an error message
 * reaches a log and a toast, and both are places an amount must not be.
 */

/** A Finance value crossing the boundary is malformed. */
export class FinanceValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(`${field} ${message}`);
    this.name = "FinanceValidationError";
  }
}

/** A Finance record does not exist in this workspace. */
export class FinanceNotFoundError extends Error {
  constructor(readonly subject: string) {
    // "not found", never "forbidden": a workspace must not be able to learn
    // that a record exists somewhere else by the shape of its refusal.
    super(`That ${subject} could not be found.`);
    this.name = "FinanceNotFoundError";
  }
}

/**
 * A Finance operation was refused for a stated product reason — not a
 * validation failure and not a missing record, but a rule.
 */
export class FinanceRefusedError extends Error {
  constructor(
    readonly reason: FinanceRefusalReason,
    message: string,
  ) {
    super(message);
    this.name = "FinanceRefusedError";
  }
}

/** The closed set of reasons a Finance operation is refused. */
export type FinanceRefusalReason =
  /** The same file has already been applied to this account. */
  | "import_already_applied"
  /** The account still holds transactions, so it can be closed but not deleted. */
  | "account_in_use"
  /** The account is closed, so it takes no new transactions and no import. */
  | "account_closed"
  /** The category still has transactions, so it can be archived but not deleted. */
  | "category_in_use"
  /** A transfer leg is already paired, or the two legs are not a valid pair. */
  | "transfer_invalid"
  /** The transaction cannot settle this obligation. */
  | "settlement_invalid"
  /** The field may not be edited on an imported transaction. */
  | "import_provenance"
  /** Two amounts are in different currencies, and DalyHub never converts. */
  | "currency_mismatch";

/** The Finance store failed for a reason the caller cannot act on. */
export class FinanceStorageError extends Error {
  constructor(message = "The Finance store could not complete that request.") {
    super(message);
    this.name = "FinanceStorageError";
  }
}
