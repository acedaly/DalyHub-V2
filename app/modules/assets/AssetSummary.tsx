/**
 * ASSET-01 — the Asset "Summary" tab.
 *
 * The at-a-glance overview: the type glyph + label, the real-world status, the
 * manufacturer/model line, owner/responsible Person and Area (resolved to their
 * canonical names by the loader), the plain-text location, the single next
 * meaningful date (via the canonical `asset-dates` evaluator), the tags, and a calm
 * edit action. It NEVER shows a serial/reference number, price or private note — the
 * Summary is a glance, not a data dump (§17). Related records live in the Linked tab.
 */

import { assetTypeIcon } from "./asset-icons";
import { nextMeaningfulDate } from "./asset-dates";
import { assetStatusTone, type SerializedAsset } from "./asset-view";

/** The resolved canonical names the loader supplies for the id-reference fields. */
export interface AssetSummaryContext {
  readonly ownerName: string | null;
  readonly responsibleName: string | null;
  readonly areaName: string | null;
}

interface AssetSummaryProps {
  readonly asset: SerializedAsset;
  readonly names: AssetSummaryContext;
  /** Owner-calendar today (`YYYY-MM-DD`) for due-date phrasing. */
  readonly today: string;
  readonly onEditDetails: () => void;
}

export function AssetSummary({
  asset,
  names,
  today,
  onEditDetails,
}: AssetSummaryProps) {
  const Icon = assetTypeIcon(asset.assetType);
  const nextDate = nextMeaningfulDate(asset, today);
  const modelLine = [asset.manufacturer, asset.model].filter(Boolean).join(" ");

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

  return (
    <div className="dh-asset-summary">
      <h2 className="dh-visually-hidden">Summary</h2>
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

      {nextDate ? (
        <p
          className={`dh-asset-summary__next dh-asset-summary__next--${nextDate.status}`}
        >
          {nextDate.text}
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

      <p className="dh-asset-summary__edit">
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onEditDetails}
        >
          Edit details
        </button>
      </p>
    </div>
  );
}
