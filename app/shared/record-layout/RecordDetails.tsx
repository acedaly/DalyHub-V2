/**
 * RECORD-01 — the record's administrative details, in one place.
 *
 * The convergence's rule for metadata is that a fact appears in exactly one
 * tier: current state is prominent, secondary context is quiet, and
 * ADMINISTRATIVE history — Created, Updated, the raw workflow state, the last
 * recorded activity — is demoted. Demoted, never deleted: every record that
 * loses a "Created 2 Mar 2026" from its header gains it here, in its Settings
 * tab, where a reader goes when they want the record's paperwork.
 *
 * It exists as a shared component only because eight modules were about to need
 * the same three lines of markup. It has no behaviour and no opinion about
 * which facts belong in it — the module decides that; this decides how they look.
 */

import type { RecordMetaItem } from "./types";

export interface RecordDetailsProps {
  readonly items: readonly RecordMetaItem[];
  /** Accessible name for the list. Defaults to "Record details". */
  readonly label?: string;
}

export function RecordDetails({
  items,
  label = "Record details",
}: RecordDetailsProps) {
  if (items.length === 0) {
    return null;
  }
  return (
    <dl className="dh-record-details" aria-label={label}>
      {items.map((item) => (
        <div key={item.id} className="dh-record-details__item">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
