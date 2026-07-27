/**
 * ASSET-01 — the Asset "Dates" tab.
 *
 * A focused, chronological view of the Asset's meaningful dates — acquisition,
 * warranty expiry, issue, renewal/expiry, last service, next service and disposal —
 * each classified by the ONE canonical `asset-dates` evaluator (overdue / due soon /
 * today / future / historical). Status is conveyed by explicit TEXT, never colour
 * alone (AGENTS.md accessibility). Rows with no date are omitted, so the tab stays
 * calm; an Asset with no dates shows a gentle empty line.
 */

import {
  evaluateDueDate,
  evaluatePastDate,
  formatAssetDate,
  type AssetDateStatus,
} from "./asset-dates";
import type { SerializedAsset } from "./asset-view";

interface AssetDatesTabProps {
  readonly asset: SerializedAsset;
  /** Owner-calendar today (`YYYY-MM-DD`). */
  readonly today: string;
}

type DateRow = {
  readonly id: string;
  readonly label: string;
  readonly iso: string;
  readonly status: AssetDateStatus;
};

const STATUS_TEXT: Record<AssetDateStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  today: "Today",
  future: "Upcoming",
  historical: "Past",
  none: "",
};

export function AssetDatesTab({ asset, today }: AssetDatesTabProps) {
  const rows: DateRow[] = [];
  const pushDue = (id: string, label: string, iso: string | null) => {
    if (iso) rows.push({ id, label, iso, status: evaluateDueDate(iso, today) });
  };
  const pushPast = (id: string, label: string, iso: string | null) => {
    if (iso)
      rows.push({ id, label, iso, status: evaluatePastDate(iso, today) });
  };

  pushPast("acquisition", "Acquired", asset.acquisitionDate);
  pushPast("issue", "Issued", asset.issueDate);
  pushDue("warranty", "Warranty expires", asset.warrantyExpiry);
  pushDue("renewal", "Renewal or expiry", asset.renewalDate);
  pushPast("lastService", "Last service", asset.lastServiceDate);
  pushDue("nextService", "Next service", asset.nextServiceDate);
  pushPast("disposal", "Disposed", asset.disposalDate);

  rows.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));

  return (
    <div className="dh-asset-dates">
      <h2 className="dh-visually-hidden">Dates</h2>
      {rows.length === 0 ? (
        <p className="dh-asset-dates__empty">
          No dates recorded yet. Add warranty, renewal or service dates on the
          Details tab.
        </p>
      ) : (
        <ol className="dh-asset-dates__list">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`dh-asset-dates__row dh-asset-dates__row--${row.status}`}
            >
              <span className="dh-asset-dates__label">{row.label}</span>
              <span className="dh-asset-dates__value">
                {formatAssetDate(row.iso)}
              </span>
              <span className="dh-asset-dates__status">
                {STATUS_TEXT[row.status]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
