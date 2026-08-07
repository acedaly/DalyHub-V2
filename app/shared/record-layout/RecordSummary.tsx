/**
 * DS-02 — the Summary region.
 *
 * The at-a-glance essence of a record: an optional description/rich summary and
 * an optional key/value metadata list, both wrapping safely for long content. If
 * the region is requested but has no content, it renders a calm empty state
 * rather than a blank gap (DESIGN_SYSTEM.md → Summary Panel).
 *
 * ── M3-INT (PR #127) — a sparse summary is not a card ────────────────────────
 * A record could previously read as three stacked containers of identical
 * weight: a summary card, then a tab strip, then a working-surface card, each
 * with the same fill, the same hairline and the same large radius. The strongest
 * single cause was this region, because most records give it nothing but a few
 * short key/value pairs — "Created · Updated · Tags" — and four small words in a
 * full dashboard card claim as much of the page as the record's actual content.
 *
 * So the container is earned rather than automatic. A summary carrying real
 * PROSE (a Goal's definition of done, a Project's description, an archived
 * banner) is a substantial region and keeps its card; a summary that is only
 * metadata renders as a plain metadata row on the page canvas. Same component,
 * same data, same accessible region — one less box. M3's own instruction is to
 * reach for spacing and typography before reaching for another surface.
 */

import type { RecordSummaryProps } from "./types";

export function RecordSummary({
  description,
  metadata,
  emptyLabel = "No summary yet.",
}: RecordSummaryProps) {
  const hasDescription = description !== undefined && description !== null;
  const hasMetadata = metadata !== undefined && metadata.length > 0;

  return (
    <section
      className="record-summary"
      aria-label="Summary"
      data-density={hasDescription ? "full" : "sparse"}
    >
      {!hasDescription && !hasMetadata ? (
        <p className="record-summary__empty muted">{emptyLabel}</p>
      ) : (
        <>
          {hasDescription && (
            <div className="record-summary__description">{description}</div>
          )}
          {hasMetadata && (
            <dl className="record-summary__meta">
              {metadata.map((item) => (
                <div key={item.id} className="record-summary__meta-item">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  );
}
