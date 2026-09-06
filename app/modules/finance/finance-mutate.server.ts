/**
 * V2.12 — the ONE server-side shape every Finance mutation endpoint answers in.
 *
 * Four resource routes post here-shaped JSON (`/finance/transactions/mutate`,
 * `/finance/budgets/mutate`, `/finance/categories/mutate`,
 * `/finance/accounts/:accountId/mutate`). This module holds what all four share:
 * the JSON envelope, the body reader, and the mapping from a named domain
 * refusal to a sentence the owner reads.
 *
 * ## Why JSON rather than a form post
 *
 * A Finance mutation carries an amount and a payee. A form post would put them
 * in a body React Router logs on a failed action and a browser re-sends on a
 * Back-onto-POST; the JSON body is read once, by one route, and never round
 * trips. CSRF is unaffected: `evaluateMutationProvenance` runs at the request
 * boundary on every unsafe method regardless of content type, and both signals
 * it reads (`Origin`, `Sec-Fetch-Site`) are forbidden header names.
 *
 * ## The refusal is the domain's own sentence
 *
 * `FinanceRefusedError` already carries the owner's words — "432 transactions
 * use that category", "the date and amount came from your bank". This maps the
 * error to `{ ok: false, message }` verbatim and NEVER substitutes a generic
 * one, because every Finance refusal is a rule with a reason and a reason the
 * owner cannot see is a rule they cannot act on.
 *
 * ## Nothing sensitive is logged, and nothing sensitive is thrown
 *
 * An unexpected error becomes one calm sentence. The message never carries the
 * amount, the payee, the description or the CSV row that produced it: a
 * Worker's `console.error` is a broad log, and a broad log is exactly where an
 * owner's week must not end up.
 */

import {
  FinanceNotFoundError,
  FinanceRefusedError,
  FinanceStorageError,
  FinanceValidationError,
} from "~/kernel/finance";

/** The discriminated outcome every Finance client consumes. */
export type FinanceMutateResult =
  | { readonly ok: true; readonly [key: string]: unknown }
  | { readonly ok: false; readonly message: string };

export function financeJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function financeOk(extra: Record<string, unknown> = {}): Response {
  return financeJson({ ok: true, ...extra });
}

export function financeFailure(message: string, status = 200): Response {
  return financeJson({ ok: false, message }, status);
}

/**
 * Read the JSON body of a mutation, or refuse it.
 *
 * A body that is not a JSON object is refused rather than coerced: `null`, an
 * array and a bare string all reach `String(body.intent)` as `undefined`, and
 * an endpoint that answers "unknown action" to malformed input is an endpoint
 * whose refusals no longer distinguish a bug from a typo.
 */
export async function readFinanceBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A required string field, trimmed. `""` when absent — never `"undefined"`. */
export function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

/** A field that is meaningfully absent versus meaningfully `null`. */
export function optionalId(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function flag(body: Record<string, unknown>, key: string): boolean {
  return body[key] === true;
}

/**
 * Map a thrown error to the sentence the owner sees.
 *
 * The three named domain errors carry their own words and are passed through
 * verbatim. Everything else — a storage failure, a bug, a runtime fault — gets
 * ONE calm sentence that promises what the atomic batch actually guarantees:
 * nothing has been changed.
 */
export function financeErrorMessage(error: unknown): string {
  if (
    error instanceof FinanceRefusedError ||
    error instanceof FinanceValidationError ||
    error instanceof FinanceNotFoundError
  ) {
    return error.message;
  }
  if (error instanceof FinanceStorageError) {
    return "That could not be saved just now. Nothing has been changed.";
  }
  return "That could not be saved. Nothing has been changed.";
}

/** Run a mutation and answer in the shared envelope, whatever happens. */
export async function financeAttempt(
  run: () => Promise<Record<string, unknown> | void>,
): Promise<Response> {
  try {
    const extra = await run();
    return financeOk(extra ?? {});
  } catch (error) {
    return financeFailure(financeErrorMessage(error));
  }
}
