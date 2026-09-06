/**
 * V2.12 FIN-01 — payee normalisation, and the occurrence-aware row identity.
 *
 * This is the module where importing a statement twice either does or does not
 * duplicate the owner's money, so it is written to be read.
 *
 * ## Payee normalisation is DELIBERATELY conservative
 *
 * It exists for exactly two jobs — the `occ:` fingerprint, and the deterministic
 * "last category for this payee" suggestion — and it does nothing else. There is
 * **no fuzzy matching, no edit distance, no merchant directory, no merchant
 * entity and no learning.** Two strings that normalise differently are two
 * payees, and the owner can rename the display payee on either.
 *
 * `source_description` is stored verbatim beside the key and is never
 * overwritten, so a better normalisation in a later release can be re-derived
 * from the ORIGINAL rather than from a lossy one.
 *
 * ## The fingerprint
 *
 *     id:<sourceTransactionId>                       when the bank supplied one
 *     occ:<occurredOn>:<amountMinor>:<payeeKey>:<n>  otherwise
 *     man:<entityId>                                 for a row the owner typed
 *
 * All three are scoped to the ACCOUNT by the unique index
 * `(workspace_id, account_id, fingerprint)`, so the same bank id in two accounts
 * is two transactions and a row from another account can never collide.
 *
 * ## `n`, and the algorithm that is easy to get wrong
 *
 * `n` is an occurrence index WITHIN its `(date, amount, payeeKey)` group. It is
 * **not** "existing rows plus this row's position in the file". The algorithm
 * is:
 *
 * > For each group a file contributes `k` rows to, the candidates are
 * > `n = 0 … k−1`. Each candidate is checked against the account: one that
 * > already exists is SKIPPED as already imported, one that does not is
 * > INSERTED.
 *
 * The rejected alternative passes the first test anyone writes — two identical
 * rows in one file both import — and fails the one that matters, because
 * re-importing that file produces `n = 2` and `n = 3` and two more rows. Both
 * cases are pinned by test.
 *
 * The limitation, stated rather than left to be discovered: because `n` is
 * positional within its group, a file whose window BEGINS MID-GROUP
 * under-counts. An export containing only the third identical purchase offers
 * `n = 0`, which collides. A bank-supplied id bypasses it entirely, the preview
 * SHOWS the row rather than hiding it, and the owner can add it by hand.
 *
 * Pure: no storage, no clock, no JSX.
 */

/** The most characters a normalised payee key may hold. */
export const PAYEE_KEY_MAX_LENGTH = 64;

/**
 * Terminal and payment-method prefixes worth removing before the key is taken.
 *
 * A CLOSED list, and short. Every entry is a prefix a bank prepends to describe
 * HOW the money moved rather than WHO it moved to, so removing it makes two
 * descriptions of one merchant agree. Anything not on this list is left alone:
 * guessing which words are noise is how a merchant's actual name gets eaten.
 */
const METHOD_PREFIXES: readonly string[] = [
  "EFTPOS",
  "VISA PURCHASE",
  "VISA DEBIT",
  "VISA CREDIT",
  "MASTERCARD",
  "CARD PURCHASE",
  "PURCHASE AUTHORISED",
  "POS PURCHASE",
  "POS",
  "DIRECT DEBIT",
  "DIRECT CREDIT",
  "OSKO PAYMENT",
  "OSKO",
  "BPAY",
  "PAYPAL *",
  "SQ *",
  "SP ",
  "TFR",
  "TRANSFER",
  "WITHDRAWAL",
  "DEPOSIT",
  "PAYMENT",
];

/**
 * Normalise a bank description into the key used for fingerprinting and for the
 * previous-category suggestion.
 *
 * The steps, in order:
 *
 *   1. Upper-case, so casing differences between two exports of one merchant do
 *      not make two payees.
 *   2. Strip ONE leading method prefix from the closed list above.
 *   3. Drop tokens that are pure digits, or that mix letters and digits and are
 *      short — card fragments, terminal ids, reference numbers. A token is kept
 *      when it is four or more characters of letters only, so `NSW` and `DUBBO`
 *      survive and `1234` and `X4821` do not.
 *   4. Collapse punctuation and whitespace to single spaces, and trim.
 *   5. Cap at {@link PAYEE_KEY_MAX_LENGTH}.
 *
 * `WOOLWORTHS 1234 DUBBO` and `WOOLWORTHS DUBBO NSW` both become
 * `WOOLWORTHS DUBBO NSW`-shaped keys that agree on the merchant. They do not
 * become identical in every case, and that is accepted: this is a bounded
 * normalisation, not merchant intelligence.
 *
 * An input that normalises to nothing at all (a description that is only digits
 * and punctuation) falls back to the trimmed, upper-cased, capped original, so a
 * key is never empty — an empty key would make every such row one payee.
 */
export function normalisePayee(sourceDescription: string): string {
  const upper = sourceDescription.trim().toUpperCase();
  if (upper.length === 0) return "";

  let body = upper;
  for (const prefix of METHOD_PREFIXES) {
    if (body.startsWith(prefix)) {
      body = body.slice(prefix.length);
      break;
    }
  }

  const tokens = body
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length > 0)
    .filter((token) => {
      if (/^\d+$/.test(token)) return false;
      if (/\d/.test(token) && token.length <= 6) return false;
      return true;
    });

  const key = tokens.join(" ").trim();
  if (key.length === 0) {
    return upper.replace(/\s+/g, " ").slice(0, PAYEE_KEY_MAX_LENGTH);
  }
  return key.slice(0, PAYEE_KEY_MAX_LENGTH);
}

/**
 * The display payee an import proposes, derived from the source description.
 *
 * Deliberately gentler than the key: it keeps the merchant's own words and only
 * tidies whitespace and casing, because this is what the owner reads and a key
 * is not a name. The owner may rename it, and their rename is never overwritten
 * by a later import — a re-import never updates a row at all.
 */
export function proposeDisplayPayee(sourceDescription: string): string {
  const tidy = sourceDescription.trim().replace(/\s+/g, " ");
  if (tidy.length === 0) return "Unknown payee";
  return tidy.slice(0, 200);
}

/** The fingerprint of a row the bank gave a stable identifier. */
export function sourceIdFingerprint(sourceTransactionId: string): string {
  return `id:${sourceTransactionId}`;
}

/**
 * The fingerprint of a row with no bank identifier, at occurrence `n` within its
 * `(date, amount, payee)` group.
 */
export function occurrenceFingerprint(
  occurredOn: string,
  amountMinor: number,
  payeeKey: string,
  occurrence: number,
): string {
  return `occ:${occurredOn}:${amountMinor}:${payeeKey}:${occurrence}`;
}

/** The fingerprint of a row the owner typed. Content-independent by design. */
export function manualFingerprint(entityId: string): string {
  return `man:${entityId}`;
}

/** The group a row belongs to for occurrence counting. */
export function occurrenceGroupKey(
  occurredOn: string,
  amountMinor: number,
  payeeKey: string,
): string {
  return `${occurredOn}:${amountMinor}:${payeeKey}`;
}

/** One candidate row, as the fingerprint pass consumes it. */
export interface FingerprintCandidate {
  readonly occurredOn: string;
  readonly amountMinor: number;
  readonly payeeKey: string;
  readonly sourceTransactionId: string | null;
}

/**
 * Assign a fingerprint to every candidate row in a file, in file order.
 *
 * Rows with a bank identifier take `id:`; the rest take `occ:` with an
 * occurrence index counted **within this file**, from zero, per group. The
 * caller then checks each fingerprint against the account: one that exists is
 * already imported, one that does not is new.
 *
 * Counting from zero within the file — rather than from the account's existing
 * count — is the whole decision. See this module's header.
 */
export function assignFingerprints(
  candidates: readonly FingerprintCandidate[],
): readonly string[] {
  const seen = new Map<string, number>();
  return candidates.map((candidate) => {
    if (candidate.sourceTransactionId !== null) {
      return sourceIdFingerprint(candidate.sourceTransactionId);
    }
    const group = occurrenceGroupKey(
      candidate.occurredOn,
      candidate.amountMinor,
      candidate.payeeKey,
    );
    const occurrence = seen.get(group) ?? 0;
    seen.set(group, occurrence + 1);
    return occurrenceFingerprint(
      candidate.occurredOn,
      candidate.amountMinor,
      candidate.payeeKey,
      occurrence,
    );
  });
}
