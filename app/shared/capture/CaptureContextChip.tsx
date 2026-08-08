/**
 * ADR-060 / DEBT-45 — the ONE capture-context chip.
 *
 * Whenever a creation surface was opened FROM a record, this chip is what tells
 * the user the relationship will be made: "Related to Vaughn Smith". It is the
 * same component on the phone and the desktop, in the Quick Capture sheet and in
 * every module's fuller creation form, because a hand-off that changed how the
 * context looked would be a hand-off the user had to re-read.
 *
 * The chip is deliberately VISIBLE and, unless the source declared the context
 * `fixed`, deliberately removable: relationship creation is never a hidden side
 * effect of pressing Create (AGENTS.md §7 — the user is always in control).
 */

import { EntityIcon } from "~/shared/entity";

import type { CaptureType } from "./capture-model";
import {
  contextPresentation,
  type CaptureContextContract,
} from "./capture-context";

export interface CaptureContextChipProps {
  /** The capture type the chip is describing (decides the relationship wording). */
  readonly captureType: CaptureType;
  readonly context: CaptureContextContract;
  /**
   * Remove the context. Omitted (or a `fixed` context) renders the chip as a
   * statement instead of an editable control.
   */
  readonly onRemove?: () => void;
}

export function CaptureContextChip({
  captureType,
  context,
  onRemove,
}: CaptureContextChipProps) {
  const removable = context.mode !== "fixed" && onRemove !== undefined;
  return (
    <div
      className="dh-capture-context"
      role="status"
      data-testid="capture-context-chip"
    >
      <EntityIcon type={context.sourceEntityType} />
      <span className="dh-capture-context__label">
        {contextPresentation(captureType, context)}
      </span>
      {removable ? (
        <button
          type="button"
          className="dh-capture-context__remove"
          onClick={onRemove}
          aria-label={`Remove capture context ${context.sourceEntityTitle}`}
        >
          Remove
        </button>
      ) : (
        <span className="dh-capture-context__fixed">Fixed</span>
      )}
    </div>
  );
}
