/**
 * DS-02 — the Summary region.
 *
 * The at-a-glance essence of a record: an optional description/rich summary and
 * an optional key/value metadata list, both wrapping safely for long content. If
 * the region is requested but has no content, it renders a calm empty state
 * rather than a blank gap (DESIGN_SYSTEM.md → Summary Panel).
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
    <section className="record-summary" aria-label="Summary">
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
