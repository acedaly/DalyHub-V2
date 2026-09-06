/**
 * V2.12 — Finance test fixtures and cleanup.
 *
 * Everything a Finance journey creates is removed dependents-first through the
 * shared `d1Execute`, scoped strictly to test-owned title prefixes so a run can
 * never touch a developer's own local data.
 *
 * ── The order below is the CONSTRAINTS', not a preference ────────────────────
 * A budget references a category; an import references an account; a
 * transaction references its account, its category and its import; an obligation
 * may point at a transaction that settled it; and both the account and the
 * transaction reference `entities` with `ON DELETE RESTRICT`. So the settlement
 * pointer clears first, then the transactions, then the budgets, then the
 * imports, then the categories, then the accounts, then the entity rows.
 *
 * ── Every fixture is obviously SYNTHETIC ────────────────────────────────────
 * `Bank of Synthetica`, `NORTHWIND GROCERS`, `SYNTH CAFE`. No real owner
 * financial data exists in this repository, and DEBT-198 is why.
 */

import { d1Execute, sqlLiteral } from "./d1";

export const FINANCE_ACCOUNT_TITLE_PREFIX = "Finance e2e ";

const WORKSPACE_ID = "local-dev-workspace";

let counter = 0;

/** A per-test-unique account title under the shared prefix. */
export function uniqueAccountTitle(label: string): string {
  counter += 1;
  return `${FINANCE_ACCOUNT_TITLE_PREFIX}${label}-${Date.now()}-${counter}`;
}

function cleanupSql(title: string): string {
  const ws = sqlLiteral(WORKSPACE_ID);
  const value = sqlLiteral(title);
  /*
   * Exact match for a per-test title; a trailing `%` means the suite sweep,
   * which needs LIKE. D1 caps LIKE-pattern length well below SQLite's default,
   * so an exact `=` for a full title avoids "LIKE pattern too complex".
   */
  const op = title.endsWith("%") ? "LIKE" : "=";
  const match = `title ${op} ${value}`;
  const accounts = `SELECT id FROM entities WHERE workspace_id = ${ws} AND type = 'finance_account' AND ${match}`;
  const transactions = `SELECT entity_id FROM finance_transaction_details WHERE workspace_id = ${ws} AND account_id IN (${accounts})`;
  return [
    /*
     * The SETTLEMENT pointer first, and it has to be first: an obligation
     * holding `settled_by_transaction_id` keeps a foreign key into the very
     * `entities` row this sweep is about to remove. Only the pointer is
     * cleared — the obligation itself belongs to the Life Admin fixture, which
     * knows the rest of its dependents.
     */
    `UPDATE obligation_details SET settled_by_transaction_id = NULL WHERE workspace_id = ${ws} AND settled_by_transaction_id IN (${transactions});`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${accounts}) OR target_entity_id IN (${accounts}) OR source_entity_id IN (${transactions}) OR target_entity_id IN (${transactions}));`,
    `DELETE FROM attachments WHERE workspace_id = ${ws} AND (owner_entity_id IN (${accounts}) OR owner_entity_id IN (${transactions}));`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND (entity_id IN (${accounts}) OR entity_id IN (${transactions}));`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND id NOT IN (SELECT activity_id FROM activity_subjects WHERE workspace_id = ${ws});`,
    /*
     * The DETAIL rows before their entity rows, which is the constraints'
     * order rather than a preference: `finance_transaction_details` carries a
     * composite foreign key into `entities` with ON DELETE RESTRICT, so an
     * entity row cannot go first.
     *
     * That loses the id list the subselect above provided, so the entity sweep
     * that follows finds them as ORPHANS — a `finance_transaction` entity in
     * this workspace with no detail row. Every transaction entity has one, so
     * the only orphans are the ones the previous statement just created.
     */
    `DELETE FROM finance_transaction_details WHERE workspace_id = ${ws} AND account_id IN (${accounts});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'finance_transaction' AND id NOT IN (SELECT entity_id FROM finance_transaction_details WHERE workspace_id = ${ws});`,
    `DELETE FROM finance_imports WHERE workspace_id = ${ws} AND account_id IN (${accounts});`,
    `DELETE FROM finance_account_details WHERE workspace_id = ${ws} AND entity_id IN (${accounts});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'finance_account' AND ${match};`,
  ].join(" ");
}

/** Remove one account created by a test, and everything that hangs off it. */
export function cleanupAccountByTitle(title: string): void {
  d1Execute(cleanupSql(title));
}

/** Remove every Finance account the suite created, whatever spec created it. */
export function cleanupAllTestAccounts(): void {
  d1Execute(cleanupSql(`${FINANCE_ACCOUNT_TITLE_PREFIX}%`));
  /*
   * The starter CATEGORIES and any budget on them are workspace-level and are
   * seeded once with the workspace's FIRST account, so they are not swept per
   * account. Budgets a journey set are cleared, because a stale budget would
   * make a later spec's variance sentence a question about the run order.
   * The categories themselves are left: they are the product's own starting
   * vocabulary and re-seeding them is exactly what the next first account does.
   */
  const ws = sqlLiteral(WORKSPACE_ID);
  d1Execute(`DELETE FROM finance_budgets WHERE workspace_id = ${ws};`);
}

/* -------------------------------------------------------------------------- */
/* Synthetic statements                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A small, obviously synthetic bank statement.
 *
 * Three money-out rows and one money-in row, in the shape a real Australian
 * bank export takes: `DD/MM/YYYY`, a description column, and a single signed
 * amount column.
 */
export const STATEMENT_CSV = [
  "Date,Description,Amount",
  "01/09/2026,EFTPOS NORTHWIND GROCERS 4821,-84.20",
  "02/09/2026,SYNTH CAFE 001,-12.50",
  "03/09/2026,SYNTHETIC ENERGY CO,-182.40",
  "04/09/2026,SALARY SYNTHETIC HOLDINGS,3200.00",
].join("\n");

/**
 * The SAME statement with one extra row.
 *
 * Re-importing it must add exactly ONE transaction: the four rows already in the
 * account are recognised by fingerprint even though the file's SHA-256 differs,
 * which is the second of the two constraints and the one a "download it again
 * next week" journey actually exercises.
 */
export const STATEMENT_CSV_EXTENDED = [
  STATEMENT_CSV,
  "05/09/2026,NORTHWIND GROCERS 4821,-31.05",
].join("\n");
