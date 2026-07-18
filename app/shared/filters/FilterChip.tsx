/**
 * DS-07 — an active filter chip.
 *
 * Shows readable field/operator/value text, edits on activation, and carries its
 * own labelled remove control. The chip's accessible name is the full readable
 * clause (e.g. "Status is Open"); the remove button is separately labelled. State
 * is never conveyed by colour alone — the text says everything.
 */

import type { MouseEvent } from "react";

import type { ClauseDescription } from "./display";

interface FilterChipProps {
  readonly description: ClauseDescription;
  readonly accessibleName: string;
  readonly onEdit: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly onRemove: () => void;
}

function RemoveGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M2.5 2.5l7 7M9.5 2.5l-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
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
        className="dh-filter-chip__edit"
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
