/**
 * DHDS-11 — the one grip glyph in DalyHub.
 *
 * Visually subordinate to the content it moves: `text-muted` at rest, the text
 * colour on engagement, the accent only while it is actually holding something.
 * It occupies its geometry at rest, so revealing it moves nothing — the same
 * contract every DHDS-08 row affordance has.
 *
 * It is a real `<button>` and it is never named by the glyph: the accessible
 * name comes from `useDragHandle`, in the product's words ("Reorder Prepare
 * training brief"), and the SVG is `aria-hidden`.
 */

import type { ButtonHTMLAttributes } from "react";

import { DragHandleIcon } from "~/shared/icons";

export type DragHandleProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function DragHandle({ className, type, ...rest }: DragHandleProps) {
  return (
    <button
      type={type ?? "button"}
      className={["dh-drag-handle", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <DragHandleIcon size={16} />
    </button>
  );
}
