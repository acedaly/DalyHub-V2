/**
 * ASSET-01 / UNTITLED-16 — the Asset "Dates" tab.
 *
 * A focused, chronological view of the Asset's meaningful dates — acquisition,
 * warranty expiry, issue, renewal/expiry, last service, next service and
 * disposal — each classified by the ONE canonical `asset-dates` evaluator
 * (overdue / due soon / today / future / historical). Status is conveyed by
 * explicit TEXT, never colour alone (AGENTS.md accessibility). Rows with no date
 * are omitted, so the tab stays calm; an Asset with no dates shows a gentle
 * empty line.
 *
 * ── UNTITLED-16: it was a table pretending to be a list ─────────────────────
 *
 * Three aligned columns — a label, a date, a status — in an `<ol>` of `<span>`s,
 * with the status ALSO painted as a coloured left border by a rule per state
 * (`.dh-asset-dates__row--overdue` and four siblings). So the one place a screen
 * reader needed a column relationship ("Warranty expires … 3 March 2027 …
 * Upcoming") had none, and the visual emphasis was a stripe rather than the
 * word.
 *
 * It is the genuine Untitled `application/table` now, with the WHEN leading —
 * a dates tab is read by date, not by field name — and the status as the shared
 * Untitled badge, so the emphasis is on the word that carries the meaning. §28's
 * rule holds: only a date that has been missed or is about to be gets a strong
 * tone; an ordinary upcoming date stays neutral and calm.
 */

import { UntitledStatusBadge } from "~/shared/pill";
import type { BadgeTone } from "~/shared/ui/Badge";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

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

/**
 * The badge tone for a date's status.
 *
 * `overdue` is DANGER and `due_soon`/`today` are WARNING; everything else is
 * neutral — including `future`, which used to carry its own painted arm. §28:
 * "overdue/urgent items may use stronger status; normal upcoming dates should
 * remain calm". A tab where every row is tinted has no emphasis left for the one
 * row that needs it.
 *
 * `today` is warning rather than danger because something due today has not yet
 * been missed — the same distinction the collection card's `DATE_TONE` makes,
 * and deliberately the same answer.
 */
const STATUS_TONE: Record<AssetDateStatus, BadgeTone> = {
  overdue: "danger",
  due_soon: "warning",
  today: "warning",
  future: "neutral",
  historical: "neutral",
  none: "neutral",
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
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="sr-only">Dates</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-tertiary">
          No dates recorded yet. Add warranty, renewal or service dates on the
          Details tab.
        </p>
      ) : (
        // Adapted from the Untitled UI React `application/table` source.
        // Changes: DalyHub's Asset date columns, and no card edge — see below.
        <TableCard.Root
          size="sm"
          /*
           * UNTITLED-16 — NO ring and NO shadow on this surface.
           *
           * `TableCard.Root` draws a bounded card, which is right on a page and
           * wrong inside a record: this table lives inside a disclosure inside a
           * record panel, both of which already draw a boundary. A ring inside a
           * ring is the frame-inside-a-frame the migration guide names. The
           * card's overflow clipping and its divided body are kept; only its own
           * edge is dropped.
           */
          className="overflow-hidden rounded-lg bg-primary"
          data-untitled-source="application/table:table-card"
        >
          <Table
            aria-label="This asset's recorded dates, oldest first, with what each one is and where it stands."
            size="sm"
            className="table-fixed bg-primary"
            data-testid="asset-dates-list"
          >
            <Table.Header className="bg-secondary [&_th]:px-5">
              {/*
               * The date leads. A dates tab is read chronologically — the rows
               * are sorted by it — so the column the order is in should be the
               * column the eye starts at.
               */}
              <LabelledTableHead
                id="when"
                label="When"
                isRowHeader
                className="w-[34%] whitespace-nowrap"
              />
              <LabelledTableHead id="what" label="What" className="w-[40%]" />
              <LabelledTableHead
                id="status"
                label="Status"
                className="w-[26%]"
              />
            </Table.Header>
            <Table.Body>
              {rows.map((row) => (
                <Table.Row
                  key={row.id}
                  id={row.id}
                  size="sm"
                  className="h-auto min-h-12 bg-primary hover:bg-secondary"
                  data-status={row.status}
                >
                  <Table.Cell className="px-5 py-3 text-sm font-medium whitespace-nowrap text-primary tabular-nums">
                    {formatAssetDate(row.iso)}
                  </Table.Cell>
                  <Table.Cell className="px-5 py-3 text-sm break-words text-secondary">
                    {row.label}
                  </Table.Cell>
                  <Table.Cell className="px-5 py-3">
                    {STATUS_TEXT[row.status] ? (
                      <UntitledStatusBadge tone={STATUS_TONE[row.status]}>
                        {STATUS_TEXT[row.status]}
                      </UntitledStatusBadge>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </TableCard.Root>
      )}
    </div>
  );
}
