/**
 * DHDS-09 — the ONE popover.
 *
 * **A popover makes a short contextual choice that is not a list.** A date, a
 * small set of grouped filters, a compact editor of two or three controls. It is
 * the surface for the interactions that are too structured for a {@link Menu}
 * (they contain more than one KIND of control) and too small for a Drawer or an
 * Inspector (they are one decision, not a record).
 *
 * The test, when it is not obvious: if every row in the surface is the same kind
 * of thing and choosing one finishes the job, it is a Menu or a Picker. If the
 * surface contains a grid, a field, or two controls that are not alternatives to
 * each other, it is a Popover.
 *
 * ── Semantics ───────────────────────────────────────────────────────────────
 * `role="dialog"` with an accessible name, non-modal: nothing behind it becomes
 * inert and there is no second focus trap in the product (DS-03 owns the one
 * there is). Escape closes and restores focus to the trigger; an outside
 * pointer press dismisses without pulling focus back, because the person is
 * already on their way elsewhere; Tab moves through the popover's own controls
 * and then out of it naturally.
 *
 * Initial focus lands on the FIRST focusable control rather than on the surface,
 * because a popover's first control is almost always the common answer — the
 * date presets, the first filter. A surface whose first control is a destination
 * rather than an answer passes `initialFocusRef`.
 *
 * ── Desktop → phone ─────────────────────────────────────────────────────────
 * Below `md` the same contents are the shared bottom {@link Sheet}. Not a
 * shrunken popover: full width, the sheet's own scroll, a 44px close, and the
 * safe-area and keyboard insets a phone overlay needs and a non-modal anchored
 * box cannot have.
 */

import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { AnchoredSurface } from "~/shared/anchored";
import { Sheet } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import type { FloatingAlign, FloatingPresentation } from "./types";

export interface PopoverProps {
  readonly anchorRef: RefObject<HTMLElement | null>;
  /**
   * The surface's accessible name, e.g. "Edit due date".
   *
   * Deliberately NOT the field's own name: the dialog and the control inside it
   * are two different things, and giving them one name makes "the due date"
   * ambiguous to anything navigating by name — including tests.
   */
  readonly label: string;
  /**
   * Close. `restoreFocus` is true for Escape and for a committed choice, false
   * for an outside press and for Tab.
   */
  readonly onClose: (restoreFocus: boolean) => void;
  /** Where focus should land, when the first focusable control is wrong. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly align?: FloatingAlign;
  readonly matchAnchorWidth?: boolean;
  readonly presentation?: FloatingPresentation;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

export function Popover({
  anchorRef,
  label,
  onClose,
  initialFocusRef,
  align = "start",
  matchAnchorWidth = false,
  presentation = "auto",
  id,
  className,
  children,
  ...rest
}: PopoverProps) {
  const compact = useCompactViewport() && presentation === "auto";
  const generatedId = useId();
  const surfaceId = id ?? `${generatedId}-popover`;
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // The Sheet owns its own initial focus (DS-03), so only the anchored
    // presentation reaches in.
    if (compact) return;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
      return;
    }
    bodyRef.current
      ?.querySelector<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      ?.focus();
  }, [compact, initialFocusRef]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    // Only this popover closes — Escape never reaches an enclosing Drawer while
    // the popover owns focus (DHDS-09 §34).
    event.stopPropagation();
    onClose(true);
  };

  const body = (
    <div
      ref={bodyRef}
      className={["dh-floating", "dh-popover", className]
        .filter(Boolean)
        .join(" ")}
      data-presentation={compact ? "sheet" : "anchored"}
      data-testid={rest["data-testid"]}
    >
      {children}
    </div>
  );

  if (compact) {
    return (
      <Sheet
        title={label}
        opener={anchorRef.current}
        onClose={() => onClose(true)}
        {...(initialFocusRef ? { initialFocusRef } : {})}
        className="dh-popover-sheet"
        data-testid={
          rest["data-testid"] ? `${rest["data-testid"]}-sheet` : undefined
        }
      >
        {body}
      </Sheet>
    );
  }

  return (
    <AnchoredSurface
      anchorRef={anchorRef}
      align={align}
      matchAnchorWidth={matchAnchorWidth}
      onDismiss={() => onClose(false)}
      id={surfaceId}
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {body}
    </AnchoredSurface>
  );
}
