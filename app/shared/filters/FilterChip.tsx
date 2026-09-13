/**
 * DS-07 — an active filter chip.
 *
 * Shows readable field/operator/value text, edits on activation, and carries its
 * own labelled remove control. The chip's accessible name is the full readable
 * clause (e.g. "Status is Open"); the remove button is separately labelled. State
 * is never conveyed by colour alone — the text says everything.
 */

import type { MouseEvent } from "react";

import { XClose } from "@untitledui/icons";

import type { ClauseDescription } from "./display";

interface FilterChipProps {
  readonly description: ClauseDescription;
  readonly accessibleName: string;
  readonly onEdit: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onRemove: () => void;
}

/**
 * UNTITLED-15 — the chip's remove mark, from the shared set.
 *
 * A hand-drawn ✕ at a bespoke 12px on a bespoke 12-unit grid. It is the most
 * generic glyph in the product and the library already draws it; the size stays
 * 12px so the chip's geometry is unchanged.
 */
function RemoveGlyph() {
  return <XClose width={12} height={12} aria-hidden="true" focusable="false" />;
}

export function FilterChip({
  description,
  accessibleName,
  onEdit,
  onRemove,
}: FilterChipProps) {
  const { fieldLabel, operatorLabel, valueText } = description;
  return (
    <span className="dh-filter-chip">
      <button
        type="button"
        className="dh-filter-chip__edit md-state-layer"
        aria-label={`Edit filter: ${accessibleName}`}
        onClick={onEdit}
      >
        <span className="dh-filter-chip__field">{fieldLabel}</span>
        <span className="dh-filter-chip__op">{operatorLabel}</span>
        {valueText ? (
          <span className="dh-filter-chip__value">{valueText}</span>
        ) : null}
      </button>
      <button
        type="button"
        className="dh-filter-chip__remove"
        aria-label={`Remove filter: ${accessibleName}`}
        onClick={onRemove}
      >
        <RemoveGlyph />
      </button>
    </span>
  );
}
