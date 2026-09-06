/**
 * V2.12 FIN-00 — the one thing the money kernel does not have: a TOTAL over
 * many amounts that may be in different currencies.
 *
 * `~/kernel/money` (ASSET-01, ADR-049) owns the representation: integer minor
 * units, an explicit ISO-4217 code, no float, no conversion. Finance invents
 * none of that and imports all of it. What Finance adds is the question Assets
 * answers per record and Finance must answer per month: *what is the total?* —
 * when the amounts are not all in one currency.
 *
 * ## The rule
 *
 * **Nothing converts. Ever.** There is no exchange rate anywhere in DalyHub, no
 * rate provider, no network dependency and no implicit conversion. So a total
 * over unlike money is not one number: it is one number PER CURRENCY, and
 * whichever one a surface leads with must state what it left out.
 *
 * A total that quietly added A$100 and NZ$100 to make 200 of nothing would be
 * the first place a figure in this product is simply wrong, and it would be
 * wrong in a way nobody could see. So the shape below makes the exclusion
 * TRAVEL WITH the number, the way `Series` makes its bound travel with its
 * points (ADR-079 decision 11) — a surface that wants to print one figure has to
 * ignore a field rather than merely forget a rule.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { formatMinorUnits } from "~/kernel/money";

/** One currency's share of a total, and how many amounts produced it. */
export interface CurrencyTotal {
  readonly currencyCode: string;
  readonly minorUnits: number;
  /** How many amounts were summed. Never a row list, never an amount list. */
  readonly count: number;
}

/**
 * A total over amounts that may be in different currencies.
 *
 * `totals` is ordered by currency code, so two reads of unchanged data produce
 * the same value and a surface's order is not an accident of insertion.
 */
export interface MoneyTotal {
  readonly totals: readonly CurrencyTotal[];
  /** True when more than one currency contributed. */
  readonly mixed: boolean;
}

/** The empty total — no amounts at all. */
export const EMPTY_MONEY_TOTAL: MoneyTotal = { totals: [], mixed: false };

/** One amount and its currency, as this module consumes them. */
export interface MoneyAmount {
  readonly minorUnits: number;
  readonly currencyCode: string;
}

/**
 * Sum amounts, grouped by currency, in deterministic currency order.
 *
 * An amount whose currency is blank is DROPPED rather than folded into another
 * currency's total: money with no currency is a number, and the boundary refuses
 * to store one, so reaching this function means something upstream is already
 * wrong and quietly attributing it would hide that.
 */
export function totalMoney(amounts: Iterable<MoneyAmount>): MoneyTotal {
  const byCurrency = new Map<string, { minorUnits: number; count: number }>();
  for (const amount of amounts) {
    const code = amount.currencyCode;
    if (typeof code !== "string" || code.length !== 3) continue;
    if (!Number.isFinite(amount.minorUnits)) continue;
    const existing = byCurrency.get(code);
    if (existing) {
      existing.minorUnits += amount.minorUnits;
      existing.count += 1;
    } else {
      byCurrency.set(code, { minorUnits: amount.minorUnits, count: 1 });
    }
  }
  const totals = [...byCurrency.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currencyCode, value]) => ({
      currencyCode,
      minorUnits: value.minorUnits,
      count: value.count,
    }));
  return { totals, mixed: totals.length > 1 };
}

/** Add two totals, keeping the per-currency split AND the amount counts. */
export function addMoneyTotals(a: MoneyTotal, b: MoneyTotal): MoneyTotal {
  const byCurrency = new Map<string, { minorUnits: number; count: number }>();
  for (const entry of [...a.totals, ...b.totals]) {
    const existing = byCurrency.get(entry.currencyCode);
    if (existing) {
      existing.minorUnits += entry.minorUnits;
      existing.count += entry.count;
    } else {
      byCurrency.set(entry.currencyCode, {
        minorUnits: entry.minorUnits,
        count: entry.count,
      });
    }
  }
  const totals = [...byCurrency.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([currencyCode, value]) => ({ currencyCode, ...value }));
  return { totals, mixed: totals.length > 1 };
}

/**
 * The share of a total in ONE currency, or a zero share when that currency
 * contributed nothing.
 *
 * A caller asking for AUD gets AUD or zero — never another currency's figure,
 * and never a sum of everything.
 */
export function shareIn(
  total: MoneyTotal,
  currencyCode: string,
): CurrencyTotal {
  return (
    total.totals.find((entry) => entry.currencyCode === currencyCode) ?? {
      currencyCode,
      minorUnits: 0,
      count: 0,
    }
  );
}

/**
 * Everything in a total EXCEPT one currency — what a single-currency figure
 * left out, so the surface can say so.
 */
export function excludedFrom(
  total: MoneyTotal,
  currencyCode: string,
): readonly CurrencyTotal[] {
  return total.totals.filter((entry) => entry.currencyCode !== currencyCode);
}

/**
 * The sentence a surface prints beside a single-currency figure when other
 * currencies were excluded, or `null` when nothing was.
 *
 * It names every excluded currency and how many amounts each covered. It does
 * NOT apologise, hedge or offer to convert, because there is nothing to offer.
 */
export function exclusionSentence(
  total: MoneyTotal,
  currencyCode: string,
  locale = "en-AU",
): string | null {
  const excluded = excludedFrom(total, currencyCode);
  if (excluded.length === 0) return null;
  const parts = excluded.map(
    (entry) =>
      `${formatMinorUnits(entry.minorUnits, entry.currencyCode, locale)} in ` +
      `${entry.count} ${entry.count === 1 ? "transaction" : "transactions"}`,
  );
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return (
    `${list} — shown separately, because DalyHub never converts between ` +
    `currencies.`
  );
}

/**
 * The currency a single-figure surface should lead with: the one carrying the
 * most amounts, then the lowest code, so the choice is deterministic rather
 * than an accident of which row was read first. `null` for an empty total.
 */
export function leadingCurrency(total: MoneyTotal): string | null {
  if (total.totals.length === 0) return null;
  return [...total.totals].sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : a.currencyCode < b.currencyCode
        ? -1
        : 1,
  )[0]!.currencyCode;
}

/** Negate every share — turning "money out as a negative" into a magnitude. */
export function negateMoneyTotal(total: MoneyTotal): MoneyTotal {
  return {
    totals: total.totals.map((entry) => ({
      ...entry,
      minorUnits: -entry.minorUnits,
    })),
    mixed: total.mixed,
  };
}
