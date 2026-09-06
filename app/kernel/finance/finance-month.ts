/**
 * V2.12 FIN-02 — the MONTH, V2.12's primary reporting period.
 *
 * ## This is the V2.9 vocabulary, not a second one
 *
 * `~/kernel/history` owns "over time": a window, a grain, the buckets a window
 * cuts into, and a series of points carrying its bound. Finance uses that
 * vocabulary — `bucketWindow` with grain `month`, and `Series` for anything with
 * more than one bucket — and does **not** get a private analytics layer
 * (ADR-116 decision 2, ADR-117).
 *
 * What lives here is the small amount the history kernel deliberately does not
 * have: how to name one calendar month, how to step between months, and the
 * shape of a month's Finance answer. The history kernel's own contract says the
 * READS live on the repository that owns the store, so the reads are on
 * `FinanceRepository` rather than here.
 *
 * ## Why a calendar month and not a rolling 30 days
 *
 * Because that is how the owner's money already works. Rent, salary, the card
 * statement, the school fee and the electricity bill are all monthly, and a
 * rolling window would put half a salary in each of two periods every time.
 *
 * Pure: no storage, no clock, no JSX.
 */

/** `YYYY-MM`. */
export type FinanceMonth = string;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** True when `value` is a well-formed `YYYY-MM`. */
export function isFinanceMonth(value: unknown): value is FinanceMonth {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

/** The month an owner-calendar day falls in. */
export function monthOf(isoDate: string): FinanceMonth {
  return isoDate.slice(0, 7);
}

/** The first day of a month, as an owner-calendar ISO date. */
export function monthStart(month: FinanceMonth): string {
  return `${month}-01`;
}

/** The last day of a month, as an owner-calendar ISO date. */
export function monthEnd(month: FinanceMonth): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  // Day 0 of the next month is the last day of this one, and `Date.UTC` handles
  // leap years and December → January without a table.
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return `${month}-${String(last.getUTCDate()).padStart(2, "0")}`;
}

/** Step `delta` months. Negative goes back. */
export function addMonths(month: FinanceMonth, delta: number): FinanceMonth {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const zero = year * 12 + (monthNumber - 1) + delta;
  const newYear = Math.floor(zero / 12);
  const newMonth = zero - newYear * 12 + 1;
  return `${String(newYear).padStart(4, "0")}-${String(newMonth).padStart(2, "0")}`;
}

/** "September 2026". The heading, and the words a screen reader says. */
export function monthLabel(month: FinanceMonth, locale = "en-AU"): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/**
 * Narrow an untrusted month — a query parameter — falling back to the owner's
 * current month rather than refusing. A bad `?month=` in a shared URL should
 * show this month, not an error page.
 */
export function resolveMonth(value: unknown, todayIso: string): FinanceMonth {
  return isFinanceMonth(value) ? value : monthOf(todayIso);
}

/* -------------------------------------------------------------------------- */
/* The month's answer                                                         */
/* -------------------------------------------------------------------------- */

/** One category's contribution to a month, in one currency. */
export interface CategoryMonthTotal {
  /** `null` is uncategorised, which is reported and never folded in. */
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly categoryKind: "spending" | "income" | null;
  readonly currencyCode: string;
  /** SIGNED, as stored. A surface takes the magnitude it wants to print. */
  readonly netMinor: number;
  readonly transactionCount: number;
}

/**
 * A month, as the Finance home and the budget screen BOTH read it.
 *
 * One function computes this and both surfaces call it, which is what makes
 * "the budget and the home agree" a property of the code rather than a rule two
 * screens have to remember. A test asserts it on a fixture designed to expose a
 * second implementation: transfers, a refund, an archived category, an
 * uncategorised row and two currencies, all at once.
 */
export interface FinanceMonthSummary {
  readonly month: FinanceMonth;
  /** Every category with activity, plus the uncategorised line. */
  readonly categories: readonly CategoryMonthTotal[];
  /**
   * How many transactions in the month are uncategorised, and their magnitudes.
   * Reported separately and folded into neither total, because a month with
   * forty uncategorised rows must say so rather than understate spend.
   */
  readonly uncategorisedCount: number;
  /** How many transactions were excluded because they are transfer legs. */
  readonly transferCount: number;
}

/** Money out and money in for a month, per currency, from its categories. */
export function monthDirectionTotals(summary: FinanceMonthSummary): {
  readonly out: readonly {
    currencyCode: string;
    minorUnits: number;
    count: number;
  }[];
  readonly in: readonly {
    currencyCode: string;
    minorUnits: number;
    count: number;
  }[];
  readonly uncategorisedOut: readonly {
    currencyCode: string;
    minorUnits: number;
    count: number;
  }[];
  readonly uncategorisedIn: readonly {
    currencyCode: string;
    minorUnits: number;
    count: number;
  }[];
} {
  const bucket = () => new Map<string, { minorUnits: number; count: number }>();
  const outMap = bucket();
  const inMap = bucket();
  const uncatOut = bucket();
  const uncatIn = bucket();

  const add = (
    map: Map<string, { minorUnits: number; count: number }>,
    code: string,
    minor: number,
    count: number,
  ) => {
    const existing = map.get(code);
    if (existing) {
      existing.minorUnits += minor;
      existing.count += count;
    } else {
      map.set(code, { minorUnits: minor, count });
    }
  };

  for (const entry of summary.categories) {
    if (entry.categoryKind === "spending") {
      // Spend is the magnitude of a negative net. A refund in a spending
      // category makes the net less negative, so it reduces spend — which is
      // the whole refund model.
      add(outMap, entry.currencyCode, -entry.netMinor, entry.transactionCount);
    } else if (entry.categoryKind === "income") {
      add(inMap, entry.currencyCode, entry.netMinor, entry.transactionCount);
    } else if (entry.netMinor < 0) {
      add(
        uncatOut,
        entry.currencyCode,
        -entry.netMinor,
        entry.transactionCount,
      );
    } else {
      add(uncatIn, entry.currencyCode, entry.netMinor, entry.transactionCount);
    }
  }

  const flatten = (map: Map<string, { minorUnits: number; count: number }>) =>
    [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([currencyCode, value]) => ({ currencyCode, ...value }));

  return {
    out: flatten(outMap),
    in: flatten(inMap),
    uncategorisedOut: flatten(uncatOut),
    uncategorisedIn: flatten(uncatIn),
  };
}
