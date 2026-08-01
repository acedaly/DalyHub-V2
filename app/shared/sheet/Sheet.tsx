/**
 * MOBILE-01 — the ONE shared phone sheet surface.
 *
 * Every phone-scale overlay MOBILE-01 introduces (Quick Capture, the collection
 * filter/sort/view sheet, the complete-navigation "More" sheet) is this one
 * component. It is a thin, accessible composition — NOT a second modal system:
 * focus, background inerting, body-scroll lock and focus restoration all come from
 * the DS-03 hooks in `app/shared/drawer` (`useDrawerFocus`, `useInertBackground`,
 * `useBodyScrollLock`), exactly as `MobileNav` already does. There is never a
 * second focus trap in DalyHub (DS-11 / ACCESSIBILITY_RESPONSIVE.md).
 *
 * Contract:
 *   - a labelled `role="dialog" aria-modal="true"` panel with an always-present,
 *     44px Close control that is the deterministic initial-focus target (unless an
 *     `initialFocusRef` is supplied — capture focuses its input instead);
 *   - `Escape` closes ONLY this sheet (it stops propagation, so a sheet opened over
 *     a Drawer never closes both), and the scrim click closes it too;
 *   - safe-area aware and keyboard-aware: the panel's height is capped by the
 *     shared `--dh-keyboard-inset` custom property, so an open phone keyboard
 *     shrinks the sheet instead of pushing its actions off-screen;
 *   - a sticky footer slot for the primary action, so Save/Create stays above the
 *     keyboard and above the bottom navigation.
 *
 * It renders only while open (mounting is what makes the focus contract clean), so
 * consumers conditionally render it rather than passing an `open` prop.
 */

import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";
import { CloseIcon } from "~/shared/icons";

export type SheetProps = {
  /** The sheet's accessible name, rendered as its visible heading. */
  readonly title: string;
  /** Optional supporting line beneath the title. */
  readonly description?: string;
  /** The control that opened the sheet, to restore focus to on close. */
  readonly opener: HTMLElement | null;
  /** Close the sheet (scrim click, Close control, Escape). */
  readonly onClose: () => void;
  /**
   * Preferred initial-focus target. Capture panels point this at their first
   * input so the keyboard opens straight onto the field being captured.
   */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Optional leading control in the header (e.g. a Back button within the sheet). */
  readonly leading?: ReactNode;
  /** The sheet body — the only region that scrolls. */
  readonly children: ReactNode;
  /** A sticky, keyboard-safe footer for the sheet's primary action(s). */
  readonly footer?: ReactNode;
  /**
   * `sheet` (default) rises from the bottom and is capped at 92% of the viewport;
   * `full` fills the phone viewport (used for longer capture flows).
   */
  readonly variant?: "sheet" | "full";
  /**
   * UX-01 — make the scrolling body itself a tab stop.
   *
   * The body is the sheet's only scroll container. Every sheet built before UX-01
   * held focusable content (a capture form, a list of options), so a keyboard user
   * could always reach and scroll it. A READ-ONLY sheet — the keyboard-shortcut
   * reference is the first — has no focusable content at all, which makes its
   * scrollable region unreachable by keyboard (WCAG 2.1.1; axe
   * `scrollable-region-focusable`). Such a sheet opts in here rather than every
   * sheet gaining an extra tab stop it does not need.
   */
  readonly bodyFocusable?: boolean;
  /** Extra class on the panel, for surface-specific spacing only. */
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function Sheet({
  title,
  description,
  opener,
  onClose,
  initialFocusRef,
  leading,
  children,
  footer,
  variant = "sheet",
  bodyFocusable = false,
  className,
  ...rest
}: SheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const titleId = `sheet-title-${generatedId}`;
  const descriptionId = `sheet-desc-${generatedId}`;

  // The ONE shared modal machinery (DS-03) — never a second implementation.
  useBodyScrollLock(true);
  useInertBackground(rootRef, true);
  useDrawerFocus({
    containerRef: panelRef,
    active: true,
    ...(initialFocusRef ? { initialFocusRef } : {}),
    closeButtonRef,
    opener,
  });

  // Escape closes ONLY the topmost surface: propagation is stopped so a sheet
  // opened above a Drawer does not also close the Drawer beneath it.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="dh-sheet-layer"
      ref={rootRef}
      data-testid={rest["data-testid"]}
    >
      <div className="dh-sheet__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className={["dh-sheet", className].filter(Boolean).join(" ")}
        data-variant={variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="dh-sheet__header">
          {leading ? <div className="dh-sheet__leading">{leading}</div> : null}
          <div className="dh-sheet__heading">
            <h2 id={titleId} className="dh-sheet__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="dh-sheet__description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="dh-sheet__close"
            ref={closeButtonRef}
            onClick={onClose}
          >
            <span aria-hidden="true">
              <CloseIcon />
            </span>
            <span className="dh-visually-hidden">Close</span>
          </button>
        </div>

        <div
          className="dh-sheet__body"
          {...(bodyFocusable
            ? { tabIndex: 0, role: "group", "aria-labelledby": titleId }
            : {})}
        >
          {children}
        </div>

        {footer ? <div className="dh-sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
