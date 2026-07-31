/**
 * ASSET-02 Assets kernel — the Asset Event contract (storage-independent).
 *
 * An Asset Event is one thing that HAPPENED to an Asset: a service, a repair, a
 * registration renewal, a valuation, a note about the day it got hail damage. It
 * is the Asset's history, and it is deliberately ONE model with ONE table for
 * every category (AGENTS.md §9.8) — not a service table plus a repair table plus a
 * valuation table, each with its own workflow to learn and maintain.
 *
 * WHAT AN EVENT IS NOT: it is not the Asset's current state. DalyHub is not
 * event-sourced (a deliberate architectural boundary — see ADR-063). The Asset's
 * current warranty expiry, next service date and meter reading live on
 * `asset_details` and are read directly. An event may ASSERT a new canonical fact
 * (`warrantyExpiry`, `nextDueDate`, a meter reading) and the repository applies
 * that forward-only in the same transaction — but nothing is ever recomputed by
 * replaying the stream.
 *
 * Every field beyond identity, category, title and date is optional, because the
 * categories genuinely differ: a repair has a cost and a provider, an inspection
 * may be a date and a sentence. Forms show only what the category needs (§13).
 */

import type { WorkspaceId } from "~/kernel/workspaces";

import type { AssetMeterUnit } from "./asset-meter";

/* -------------------------------------------------------------------------- */
/* Category vocabulary                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What kind of thing happened. A closed, stable set of stored keys. `history` is
 * the deliberate catch-all — a general dated entry for anything that matters but
 * does not fit a named category, so the owner is never forced to mis-file.
 */
export const ASSET_EVENT_CATEGORIES = [
  "purchase",
  "service",
  "repair",
  "inspection",
  "registration",
  "renewal",
  "warranty",
  "insurance",
  "upgrade",
  "modification",
  "damage",
  "valuation",
  "disposal",
  "history",
] as const;

export type AssetEventCategory = (typeof ASSET_EVENT_CATEGORIES)[number];

/** Every event category, in display order, with an owner-facing label. */
export const ASSET_EVENT_CATEGORY_OPTIONS: readonly {
  readonly value: AssetEventCategory;
  readonly label: string;
}[] = [
  { value: "service", label: "Service" },
  { value: "repair", label: "Repair" },
  { value: "inspection", label: "Inspection" },
  { value: "registration", label: "Registration" },
  { value: "renewal", label: "Renewal" },
  { value: "warranty", label: "Warranty" },
  { value: "insurance", label: "Insurance" },
  { value: "upgrade", label: "Upgrade" },
  { value: "modification", label: "Modification" },
  { value: "damage", label: "Damage" },
  { value: "valuation", label: "Valuation" },
  { value: "purchase", label: "Purchase" },
  { value: "disposal", label: "Sale or disposal" },
  { value: "history", label: "History entry" },
];

const CATEGORY_LABELS = new Map<string, string>(
  ASSET_EVENT_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

/** The owner-facing label for an event category, or null when unknown. */
export function assetEventCategoryLabel(value: string | null): string | null {
  return value ? (CATEGORY_LABELS.get(value) ?? null) : null;
}

/** True when `value` is a supported event category. */
export function isAssetEventCategory(
  value: unknown,
): value is AssetEventCategory {
  return (
    typeof value === "string" &&
    (ASSET_EVENT_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * The categories whose cost counts as ONGOING OWNERSHIP COST, grouped for the
 * recorded-cost summary (§15). `purchase` is deliberately absent: the purchase
 * price is a canonical ownership fact, not a running cost, and the two are only
 * ever added together under an explicitly-labelled lifetime total.
 */
export const ASSET_COST_GROUPS = {
  service: ["service", "inspection"],
  repair: ["repair", "damage"],
  renewal: ["registration", "renewal", "warranty", "insurance"],
  upgrade: ["upgrade", "modification"],
} as const satisfies Record<string, readonly AssetEventCategory[]>;

/** The cost-summary groups, in display order. */
export type AssetCostGroup = keyof typeof ASSET_COST_GROUPS;

/** Owner-facing labels for the cost groups. */
export const ASSET_COST_GROUP_LABELS: Record<AssetCostGroup, string> = {
  service: "Service and maintenance",
  repair: "Repairs",
  renewal: "Renewals and registration",
  upgrade: "Upgrades and modifications",
};

/**
 * Which canonical Asset fact this event category's `nextDueDate` updates.
 *
 * The bridge from history back to current facts (§3): recording a service moves
 * the Asset's next-service date; recording a registration renewal moves its
 * renewal date. Categories with no canonical home update nothing — a `damage`
 * event is history, not a schedule.
 */
export function canonicalFactForEventCategory(
  category: AssetEventCategory,
): "nextServiceDate" | "renewalDate" | null {
  switch (category) {
    case "service":
    case "inspection":
      return "nextServiceDate";
    case "registration":
    case "renewal":
    case "insurance":
      return "renewalDate";
    default:
      return null;
  }
}

/**
 * The categories that advance the Asset's `lastServiceDate` when recorded. A
 * repair is not a service, so it deliberately does not.
 */
export const SERVICE_EVENT_CATEGORIES: readonly AssetEventCategory[] = [
  "service",
  "inspection",
];

/** Which cost group a category belongs to, or null when its cost is not ongoing. */
export function costGroupForCategory(
  category: AssetEventCategory,
): AssetCostGroup | null {
  for (const [group, members] of Object.entries(ASSET_COST_GROUPS)) {
    if ((members as readonly string[]).includes(category)) {
      return group as AssetCostGroup;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One event in an Asset's life.
 *
 * Dates: `eventDate` is a wall-calendar `YYYY-MM-DD` (the day the thing happened,
 * which is what a person remembers and what the timeline sorts by). `completedAt`
 * is an OPTIONAL precise instant for the cases where the time of day matters.
 * `warrantyExpiry` and `nextDueDate` are calendar dates the event asserts.
 *
 * Money: `costMinor` (what was spent) and `valueMinor` (what a valuation asserts)
 * are separate integers in `currencyCode`'s minor units, never floats, never
 * summed together — a valuation is not a cost (ADR-049, §15).
 *
 * Relations: `personId`, `taskId` and `noteId` are POINTERS to canonical records.
 * `provider` is plain text, which may coexist with `personId` — a provider does
 * NOT have to be a Person, and typing a name never mints one (§14).
 */
export type AssetEvent = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly assetId: string;
  readonly category: AssetEventCategory;
  readonly title: string;
  readonly eventDate: string;
  readonly completedAt: Date | null;
  /** Markdown SOURCE, rendered through the one shared sanitising pipeline. */
  readonly description: string | null;
  readonly provider: string | null;
  readonly personId: string | null;
  readonly costMinor: number | null;
  readonly valueMinor: number | null;
  readonly currencyCode: string | null;
  readonly meterValue: number | null;
  readonly meterUnit: AssetMeterUnit | null;
  readonly warrantyExpiry: string | null;
  readonly nextDueDate: string | null;
  readonly taskId: string | null;
  readonly noteId: string | null;
  readonly obligationId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The editable event fields. Money arrives as a plain decimal STRING ("189.50")
 * which the boundary parses to integer minor units against `currencyCode`; the
 * `*Minor` fields never appear here. A meter reading arrives as a string or number
 * and is validated to a non-negative integer.
 *
 * On update, `undefined` means "leave unchanged" and an explicit `null` clears.
 */
export type AssetEventInput = {
  readonly category?: string;
  readonly title?: string;
  readonly eventDate?: string;
  readonly completedAt?: string | null;
  readonly description?: string | null;
  readonly provider?: string | null;
  readonly personId?: string | null;
  readonly cost?: string | null;
  readonly value?: string | null;
  readonly currencyCode?: string | null;
  readonly meterValue?: string | number | null;
  readonly meterUnit?: string | null;
  readonly warrantyExpiry?: string | null;
  readonly nextDueDate?: string | null;
  readonly taskId?: string | null;
  readonly noteId?: string | null;
};

/** Input to create an event against an Asset. Category, title and date required. */
export type CreateAssetEventInput = AssetEventInput & {
  readonly category: string;
  readonly title: string;
  readonly eventDate: string;
  /** Set when the event is the completion proof for an obligation. */
  readonly obligationId?: string | null;
};

/** Input to edit an existing event. */
export type UpdateAssetEventInput = AssetEventInput;

/** Result of an event edit: the fresh record and whether anything changed. */
export type AssetEventChangeResult = {
  readonly event: AssetEvent;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Which slice of an Asset's history to read. */
export type AssetEventFilters = {
  /** Restrict to these categories (empty/omitted means every category). */
  readonly categories?: readonly string[];
  /** Include archived events (default false). Deleted events are never returned. */
  readonly includeArchived?: boolean;
};

/**
 * A bounded timeline read. History is always paged — the record never loads an
 * Asset's whole life at once, and a collection card never loads history at all
 * (AGENTS.md §16).
 */
export type ListAssetEventsInput = {
  readonly assetId: string;
  readonly filters?: AssetEventFilters;
  readonly limit?: number;
  readonly cursor?: string;
};

/** A bounded page of events, newest first, plus the next-page cursor. */
export type AssetEventPage = {
  readonly items: readonly AssetEvent[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/** The default and maximum page size for a timeline read. */
export const DEFAULT_ASSET_EVENTS_PAGE_SIZE = 20;
export const MAX_ASSET_EVENTS_PAGE_SIZE = 100;

/* -------------------------------------------------------------------------- */
/* Recorded costs                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The RECORDED cost summary for one Asset. Named "recorded" everywhere, and
 * rendered that way, because DalyHub cannot know whether every receipt was
 * entered — claiming a "total cost of ownership" would be a lie the data cannot
 * support (§15).
 *
 * `currencyCode` is the single currency every total is expressed in. When an Asset
 * has events in more than one currency, `mixedCurrency` is true and the totals
 * cover ONLY `currencyCode`; the rest are reported as excluded rather than being
 * silently converted and added (ADR-049 — the kernel never converts).
 */
export type AssetCostSummary = {
  readonly currencyCode: string | null;
  /** Ongoing ownership cost by group. Every group is present, possibly zero. */
  readonly byGroup: Readonly<Record<AssetCostGroup, number>>;
  /** The sum of every ongoing group — excludes the purchase price. */
  readonly ongoingTotalMinor: number;
  /** The canonical purchase price from the Asset, when recorded. */
  readonly purchasePriceMinor: number | null;
  /** Purchase + ongoing, only meaningful when a purchase price exists. */
  readonly lifetimeTotalMinor: number | null;
  /** How many events contributed a cost. */
  readonly costedEventCount: number;
  /** True when events exist in a currency other than `currencyCode`. */
  readonly mixedCurrency: boolean;
  /** The other currencies present, so the UI can name what it left out. */
  readonly excludedCurrencies: readonly string[];
};

/** One point in an Asset's recorded value history. */
export type AssetValuationPoint = {
  readonly eventId: string;
  readonly date: string;
  readonly valueMinor: number;
  readonly currencyCode: string;
  readonly source: string | null;
};
