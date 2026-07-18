/**
 * DS-02 — public entry for the Shared Record Layout.
 *
 * Consume the layout and its parts from here. The composed `RecordLayout` covers
 * the common case; the individual regions (`RecordHeader`, `RecordSummary`,
 * `RecordTabs`, `RecordContent`) are exported for records that need finer
 * composition. All public types live in `./types`.
 */

export { RecordLayout } from "./RecordLayout";
export { RecordHeader } from "./RecordHeader";
export { RecordSummary } from "./RecordSummary";
export { RecordTabs } from "./RecordTabs";
export { RecordContent } from "./RecordContent";
export { RecordActionButton } from "./RecordAction";

export type {
  RecordAction,
  RecordBreadcrumbItem,
  RecordContentProps,
  RecordHeaderProps,
  RecordLayoutProps,
  RecordMetaItem,
  RecordStatus,
  RecordSummaryProps,
  RecordTab,
  RecordTabsProps,
  RecordTone,
} from "./types";
