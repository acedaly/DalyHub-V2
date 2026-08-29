/**
 * FIND-01 — the recency kernel.
 *
 * One rule for what "recent" means, one bounded read contract behind it, and
 * nothing stored. See [ADR-112] decision 5.
 */

export {
  isRecencyListableType,
  orderRecentRecords,
  RECENCY_EXCLUDED_TYPES,
  RECENCY_LISTABLE_TYPES,
  RECENT_ACTIVITY_SCAN_LIMIT,
  RECENT_RECORD_LIMIT,
  type RecentRecord,
} from "./recent-records";

export { type RecentRecordsRepository } from "./recent-records-repository";
