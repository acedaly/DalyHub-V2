/**
 * ASSET-02 — the Asset value history.
 *
 * A deliberately modest presentation of recorded valuations: the current recorded
 * value, a plain-language summary, and the dated list. No depreciation curve, no
 * market estimate, no inferred worth (§16, §29) — DalyHub shows what the owner
 * recorded and nothing it cannot know.
 *
 * The bar shape is a SUPPLEMENT, never the content. It appears only when there are
 * MORE THAN TWO points, because two points are two points and not a trend; below
 * that the numbers stand alone. The bars are `aria-hidden` and every value is also
 * present as text, so a screen reader and a greyscale print lose nothing. Widths
 * come from a plain percentage and the fill from a shared semantic token, so the
 * shape renders identically in all five themes.
 */

import type { SerializedValueHistory } from "./asset-history-view";

interface AssetValueHistoryProps {
  readonly history: SerializedValueHistory;
}

export function AssetValueHistory({ history }: AssetValueHistoryProps) {
  if (history.points.length === 0) {
    return (
      <p className="dh-asset-values__empty">
        No valuations recorded yet. Record one from the History tab to start
        tracking what this asset is worth.
      </p>
    );
  }

  const max = Math.max(...history.points.map((point) => point.minor), 1);

  return (
    <div className="dh-asset-values">
      {history.currentAmount ? (
        <p className="dh-asset-values__current">
          <span className="dh-asset-values__current-label">
            Current recorded value
          </span>{" "}
          <span className="dh-asset-values__current-amount">
            {history.currentAmount}
          </span>
        </p>
      ) : null}

      {/* The text summary IS the accessible version of the shape above. */}
      {history.summary ? (
        <p className="dh-asset-values__summary">{history.summary}</p>
      ) : null}

      <ol className="dh-asset-values__list">
        {history.points.map((point) => (
          <li key={point.eventId} className="dh-asset-values__point">
            <span className="dh-asset-values__date">{point.dateLabel}</span>
            <span className="dh-asset-values__amount">{point.amount}</span>
            {point.source ? (
              <span className="dh-asset-values__source">{point.source}</span>
            ) : null}
            {history.hasTrend ? (
              <span className="dh-asset-values__bar" aria-hidden="true">
                <span
                  className="dh-asset-values__bar-fill"
                  style={{
                    width: `${Math.max(4, Math.round((point.minor / max) * 100))}%`,
                  }}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
