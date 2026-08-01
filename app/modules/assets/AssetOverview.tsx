/**
 * ASSET-02 — the Asset "Overview" tab (ASSET-01's Summary, grown up).
 *
 * The one screen that answers "what is this thing, and does it need me?". It leads
 * with the identity and the single most urgent obligation, then the facts that
 * apply to THIS asset, and only then the deeper detail behind progressive
 * disclosure.
 *
 * The discipline that keeps it calm: **a row that does not apply is not rendered.**
 * A software licence has no odometer and a hand tool has no registration, so
 * neither shows an empty enterprise-style field for one (§9). Everything below the
 * fold — the full date list, the recorded costs, the value history — sits inside a
 * `<details>` disclosure the owner opens when they want it.
 *
 * Every state is carried by TEXT as well as tone (§24): "Overdue", "Due soon",
 * "Reading needed" are words, so the meaning survives a colour-blind reader, a
 * greyscale print and all five themes.
 */

import { AssetDatesTab } from "./AssetDatesTab";
import { AssetValueHistory } from "./AssetValueHistory";
import { assetTypeIcon } from "./asset-icons";
import { nextMeaningfulDate } from "./asset-dates";
import {
  obligationStateTone,
  type SerializedAssetEvent,
  type SerializedAssetObligation,
  type SerializedCostSummary,
  type SerializedValueHistory,
} from "./asset-history-view";
import { assetStatusTone, type SerializedAsset } from "./asset-view";

/** The resolved canonical names the loader supplies for the id-reference fields. */
export interface AssetSummaryContext {
  readonly ownerName: string | null;
  readonly responsibleName: string | null;
  readonly areaName: string | null;
}

/** Everything the overview renders, all derived server-side. */
export interface AssetOverviewData {
  readonly obligations: readonly SerializedAssetObligation[];
  readonly recentEvents: readonly SerializedAssetEvent[];
  readonly costs: SerializedCostSummary;
  readonly values: SerializedValueHistory;
  readonly meterDisplay: string | null;
  readonly meterDateLabel: string | null;
  readonly openTaskCount: number;
}

interface AssetOverviewProps {
  readonly asset: SerializedAsset;
  readonly names: AssetSummaryContext;
  readonly data: AssetOverviewData;
  /** Owner-calendar today (`YYYY-MM-DD`) for due-date phrasing. */
  readonly today: string;
  readonly onEditDetails: () => void;
  readonly onOpenObligations: () => void;
  readonly onOpenHistory: () => void;
}

export function AssetOverview({
  asset,
  names,
  data,
  today,
  onEditDetails,
  onOpenObligations,
  onOpenHistory,
}: AssetOverviewProps) {
  const Icon = assetTypeIcon(asset.assetType);
  const modelLine = [asset.manufacturer, asset.model].filter(Boolean).join(" ");

  const open = data.obligations.filter((o) => o.status === "open");
  const overdue = open.filter((o) => o.state === "overdue");
  // The obligations arrive due-date ascending, so the first open one is next.
  const next = open[0] ?? null;
  // Only fall back to the canonical single dates when there is no obligation to
  // show — otherwise the same commitment would be stated twice (§10).
  const fallbackDate = next === null ? nextMeaningfulDate(asset, today) : null;

  const lastService =
    data.recentEvents.find(
      (event) => event.category === "service" || event.category === "repair",
    ) ?? null;

  const facts: { id: string; label: string; value: string }[] = [];
  if (names.ownerName) {
    facts.push({ id: "owner", label: "Owner", value: names.ownerName });
  }
  if (names.responsibleName) {
    facts.push({
      id: "responsible",
      label: "Responsible",
      value: names.responsibleName,
    });
  }
  if (asset.location) {
    facts.push({ id: "location", label: "Location", value: asset.location });
  }
  if (names.areaName) {
    facts.push({ id: "area", label: "Area", value: names.areaName });
  }
  if (data.meterDisplay) {
    facts.push({
      id: "meter",
      label: "Current meter",
      value: data.meterDateLabel
        ? `${data.meterDisplay} · read ${data.meterDateLabel}`
        : data.meterDisplay,
    });
  }
  if (asset.acquisitionDate || asset.purchasePriceDisplay) {
    facts.push({
      id: "purchase",
      label: "Purchased",
      value: [asset.acquisitionDate, asset.purchasePriceDisplay]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (asset.warrantyExpiry) {
    facts.push({
      id: "warranty",
      label: "Warranty",
      value: `Expires ${asset.warrantyExpiry}`,
    });
  }
  if (asset.renewalDate) {
    facts.push({
      id: "renewal",
      label: "Renewal",
      value: `Due ${asset.renewalDate}`,
    });
  }
  if (lastService) {
    facts.push({
      id: "lastService",
      label: `Last ${lastService.category === "repair" ? "repair" : "service"}`,
      value: [lastService.dateLabel, lastService.provider]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return (
    <div className="dh-asset-summary">
      <h2 className="dh-visually-hidden">Overview</h2>

      <div className="dh-asset-summary__head">
        <span className="dh-asset-summary__icon" aria-hidden="true">
          <Icon size={40} />
        </span>
        <div className="dh-asset-summary__identity">
          <p className="dh-asset-summary__type">{asset.assetTypeLabel}</p>
          {modelLine ? (
            <p className="dh-asset-summary__model">{modelLine}</p>
          ) : null}
          <p className="dh-asset-summary__status">
            <span
              className={`dh-asset-badge dh-asset-badge--${assetStatusTone(asset.status)}`}
            >
              {asset.statusLabel}
            </span>
          </p>
        </div>
      </div>

      {/* The one thing that might need the owner today. */}
      {next ? (
        <div className="dh-asset-next" data-testid="asset-next-obligation">
          <p
            className={`dh-asset-next__line dh-asset-next__line--${next.state}`}
          >
            <span
              className={`dh-asset-badge dh-asset-badge--${obligationStateTone(next.state)}`}
            >
              {next.stateLabel}
            </span>{" "}
            <span className="dh-asset-next__title">{next.title}</span>{" "}
            <span className="dh-asset-next__text">{next.stateText}</span>
          </p>
          <p className="dh-asset-next__meta">
            {overdue.length > 0
              ? `${overdue.length} of ${open.length} ${open.length === 1 ? "obligation is" : "obligations are"} overdue.`
              : `${open.length} open ${open.length === 1 ? "obligation" : "obligations"}.`}{" "}
            <button
              type="button"
              className="dh-btn dh-btn--ghost dh-btn--sm"
              onClick={onOpenObligations}
            >
              View obligations
            </button>
          </p>
        </div>
      ) : fallbackDate ? (
        <p
          className={`dh-asset-summary__next dh-asset-summary__next--${fallbackDate.status}`}
        >
          {fallbackDate.text}
        </p>
      ) : (
        <p className="dh-asset-summary__next dh-asset-summary__next--none">
          No maintenance or renewals tracked yet.{" "}
          <button
            type="button"
            className="dh-btn dh-btn--ghost dh-btn--sm"
            onClick={onOpenObligations}
          >
            Add one
          </button>
        </p>
      )}

      {data.openTaskCount > 0 ? (
        <p className="dh-asset-summary__tasks">
          {data.openTaskCount === 1
            ? "1 open task is linked to this asset."
            : `${data.openTaskCount} open tasks are linked to this asset.`}
        </p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="dh-asset-summary__facts">
          {facts.map((fact) => (
            <div key={fact.id} className="dh-asset-summary__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {asset.tags.length > 0 ? (
        <ul className="dh-asset-summary__tags" aria-label="Tags">
          {asset.tags.map((tag) => (
            <li key={tag} className="dh-asset-summary__tag">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}

      {/* -- Progressive disclosure: the depth, only when asked for --------- */}

      {!data.costs.isEmpty ? (
        <details className="dh-asset-disclosure">
          <summary>Recorded costs</summary>
          <div className="dh-asset-disclosure__body">
            {/* "Recorded", never "total cost of ownership": DalyHub cannot know
                whether every receipt was entered, and must not imply it (§15). */}
            <p className="dh-asset-costs__caveat">
              These are the costs recorded in DalyHub
              {data.costs.costedEventCount === 0
                ? ""
                : ` across ${data.costs.costedEventCount} ${data.costs.costedEventCount === 1 ? "entry" : "entries"}`}
              . They are not a complete cost of ownership.
            </p>
            {data.costs.lines.length > 0 ? (
              <dl className="dh-asset-costs">
                {data.costs.lines.map((line) => (
                  <div key={line.group} className="dh-asset-costs__row">
                    <dt>{line.label}</dt>
                    <dd>{line.amount}</dd>
                  </div>
                ))}
                {data.costs.ongoingTotal ? (
                  <div className="dh-asset-costs__row dh-asset-costs__row--total">
                    <dt>Recorded ongoing cost</dt>
                    <dd>{data.costs.ongoingTotal}</dd>
                  </div>
                ) : null}
                {data.costs.purchasePrice ? (
                  <div className="dh-asset-costs__row">
                    <dt>Purchase price</dt>
                    <dd>{data.costs.purchasePrice}</dd>
                  </div>
                ) : null}
                {data.costs.lifetimeTotal ? (
                  <div className="dh-asset-costs__row dh-asset-costs__row--total">
                    <dt>Recorded lifetime total</dt>
                    <dd>{data.costs.lifetimeTotal}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {data.costs.mixedCurrency ? (
              <p className="dh-asset-costs__mixed" role="note">
                Some entries are recorded in{" "}
                {data.costs.excludedCurrencies.join(", ")}. They are shown in
                the timeline but are not added to these totals, because DalyHub
                never converts between currencies.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {data.values.points.length > 0 ? (
        <details className="dh-asset-disclosure">
          <summary>Value history</summary>
          <div className="dh-asset-disclosure__body">
            <AssetValueHistory history={data.values} />
          </div>
        </details>
      ) : null}

      <details className="dh-asset-disclosure">
        <summary>All dates</summary>
        <div className="dh-asset-disclosure__body">
          <AssetDatesTab asset={asset} today={today} />
        </div>
      </details>

      <p className="dh-asset-summary__edit">
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onEditDetails}
        >
          Edit details
        </button>{" "}
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onOpenHistory}
        >
          View history
        </button>
      </p>
    </div>
  );
}
