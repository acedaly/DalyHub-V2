/**
 * ASSET-01 — the ONE canonical Asset date-status evaluator (pure, React-free).
 *
 * The collection card, the record Summary and the record Dates tab ALL derive
 * "is this date overdue / due soon / future / historical" from this single module
 * — due-date logic is never duplicated across components. Dates are wall-calendar
 * `YYYY-MM-DD` strings compared as integers (never routed through `Date` for
 * comparison), so a status never shifts by a timezone (ADR-022 §22.7). "Today" is
 * always supplied by the caller as the owner-calendar day (`ownerCalendarIso`), so
 * the whole app agrees on what "today" means.
 */

/** DUE-soon threshold: a future due date within this many days reads as "due soon". */
export const DUE_SOON_DAYS = 30;

/** The status of a single date relative to the owner-calendar "today". */
export type AssetDateStatus =
  "overdue" | "due_soon" | "today" | "future" | "historical" | "none";

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); positive means `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...ymd(from));
  const b = Date.UTC(...ymd(to));
  return Math.round((b - a) / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return [y, (m ?? 1) - 1, d ?? 1];
}

function isValidIso(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Classify a DUE date (warranty expiry, renewal, next service) against today:
 * past → overdue, today → today, within the threshold → due_soon, else future.
 */
export function evaluateDueDate(
  iso: string | null | undefined,
  today: string,
): AssetDateStatus {
  if (!isValidIso(iso)) return "none";
  const diff = daysBetween(today, iso);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= DUE_SOON_DAYS) return "due_soon";
  return "future";
}

/**
 * Classify a PAST-event date (acquisition, issue, last service, disposal): future
 * → future, today/past → historical.
 */
export function evaluatePastDate(
  iso: string | null | undefined,
  today: string,
): AssetDateStatus {
  if (!isValidIso(iso)) return "none";
  const diff = daysBetween(today, iso);
  return diff > 0 ? "future" : "historical";
}

/** Format a `YYYY-MM-DD` for display ("12 September 2027"), or null when unset. */
export function formatAssetDate(iso: string | null | undefined): string | null {
  if (!isValidIso(iso)) return null;
  const [y, m, d] = ymd(iso);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m, d)));
}

/** Short date ("12 Sep"), used inside the calm relative phrasings. */
function formatShort(iso: string): string {
  const [y, m, d] = ymd(iso);
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m, d)));
}

/** The phrasing config for one kind of due date. */
type DuePhrasing = {
  readonly overdue: string;
  readonly today: string;
  readonly soon: (days: number) => string;
  readonly future: (date: string) => string;
};

const WARRANTY: DuePhrasing = {
  overdue: "Warranty expired",
  today: "Warranty expires today",
  soon: (n) => `Warranty expires in ${n} day${n === 1 ? "" : "s"}`,
  future: (date) => `Warranty expires ${date}`,
};
const RENEWAL: DuePhrasing = {
  overdue: "Renewal overdue",
  today: "Renewal due today",
  soon: (n) => `Renewal due in ${n} day${n === 1 ? "" : "s"}`,
  future: (date) => `Renewal due ${date}`,
};
const SERVICE: DuePhrasing = {
  overdue: "Service overdue",
  today: "Service due today",
  soon: (n) => `Service due in ${n} day${n === 1 ? "" : "s"}`,
  future: (date) => `Service due ${date}`,
};

/** A described due date: the field it came from, its status and its calm text. */
export type AssetDueDate = {
  readonly kind: "warranty" | "renewal" | "service";
  readonly iso: string;
  readonly status: AssetDateStatus;
  /** Explicit text — never relies on colour alone (AGENTS.md accessibility). */
  readonly text: string;
};

function describeDue(
  kind: AssetDueDate["kind"],
  iso: string,
  today: string,
  phrasing: DuePhrasing,
): AssetDueDate {
  const status = evaluateDueDate(iso, today);
  const diff = daysBetween(today, iso);
  let text: string;
  if (status === "overdue") text = phrasing.overdue;
  else if (status === "today") text = phrasing.today;
  else if (status === "due_soon") text = phrasing.soon(diff);
  else text = phrasing.future(formatShort(iso));
  return { kind, iso, status, text };
}

/**
 * The single most meaningful upcoming/overdue date for an Asset — the one the
 * collection card and Summary surface. Picks the SOONEST of warranty expiry,
 * renewal date and next service (overdue dates sort first, being smallest), or
 * `null` when the Asset has none. Never reads a private field.
 */
export function nextMeaningfulDate(
  asset: {
    readonly warrantyExpiry: string | null;
    readonly renewalDate: string | null;
    readonly nextServiceDate: string | null;
  },
  today: string,
): AssetDueDate | null {
  const candidates: AssetDueDate[] = [];
  if (isValidIso(asset.warrantyExpiry)) {
    candidates.push(
      describeDue("warranty", asset.warrantyExpiry, today, WARRANTY),
    );
  }
  if (isValidIso(asset.renewalDate)) {
    candidates.push(describeDue("renewal", asset.renewalDate, today, RENEWAL));
  }
  if (isValidIso(asset.nextServiceDate)) {
    candidates.push(
      describeDue("service", asset.nextServiceDate, today, SERVICE),
    );
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return candidates[0];
}
