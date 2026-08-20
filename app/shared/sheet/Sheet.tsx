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
 *     shared `--app-keyboard-inset` custom property, so an open phone keyboard
 *     shrinks the sheet instead of pushing its actions off-screen;
 *   - a sticky footer slot for the primary action, so Save/Create stays above the
 *     keyboard and above the bottom navigation.
 *
 * It renders only while open (mounting is what makes the focus contract clean), so
 * consumers conditionally render it rather than passing an `open` prop.
 *
 * ── EDIT-03 — and it renders into `<body>` ───────────────────────────────────
 * `position: fixed` is not absolute in the way it reads: an ancestor with a
 * `transform` becomes the containing block for its fixed descendants, and an
 * ancestor with `overflow: hidden` then clips them. A swipeable card has both —
 * `.dh-card-swipe > .dh-card` is translated by the swipe hook and the wrapper
 * clips the tray — so a sheet opened from a task row was laid out inside a 45px
 * row and cut to it: a bottom sheet with no scrim, no panel and three buttons
 * floating over the list. Portalling is the only fix, because both properties on
 * the row are load-bearing.
 *
 * The DS-03 Drawer's decision NOT to portal is unchanged and is not the same
 * decision: a drawer is server-rendered so a deep link works without JavaScript.
 * A sheet is mounted only after a user gesture, so it has no first-byte to
 * protect. Everything else is untouched — `useInertBackground` still walks from
 * the panel up to `<body>`, which from a portal root simply means "everything
 * else in the document", which is what `aria-modal="true"` already promised.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, RefObject } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";
import { CloseIcon } from "~/shared/icons";
import { IconButton } from "~/shared/ui/IconButton";
import { PanelHeading } from "~/shared/ui/PanelHeading";

/**
 * The open sheets, oldest first. Module-scoped because "which sheet is on top"
 * is a property of the SCREEN, not of any one sheet — the same reason there is
 * one focus trap rather than one per surface.
 */
const OPEN_SHEETS: object[] = [];

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
  /**
   * UIX-01 — the sheet's PRIMARY action, in the header's trailing corner.
   *
   * A phone sheet that asks for something has a Cancel and a Save at the top,
   * and every native platform puts them there. A `<button form="…">` submits a
   * form it is not inside, so the action can live in the chrome while the form
   * lives in the body, with no portal, no lifted state and no second submit
   * path — which is what keeps this a slot rather than a feature.
   *
   * The sticky {@link SheetProps.footer} remains for sheets whose primary
   * action genuinely belongs at the bottom (a long form the owner scrolls
   * through). A sheet should use one or the other, never both.
   */
  readonly trailing?: ReactNode;
  /**
   * The close control's visible text. Omitted draws the ✕ glyph.
   *
   * A sheet whose header carries a Save reads better with a worded Cancel
   * opposite it than with a glyph, and the reference draws exactly that. It is
   * the SAME control either way — always present, always ≥44px, still the
   * deterministic initial-focus target, still what Escape and the scrim run —
   * so the accessibility contract in this file's header is unchanged.
   */
  readonly closeLabel?: string;
  /** Which end of the header the close control sits at. Defaults to `trailing`. */
  readonly closePlacement?: "leading" | "trailing";
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
  trailing,
  closeLabel,
  closePlacement = "trailing",
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

  /*
   * Escape closes ONLY the topmost surface.
   *
   * Stopping propagation is what protects a Drawer BENEATH a sheet, but it is
   * not enough between two sheets: both listen on `document` in the capture
   * phase, and `stopPropagation` does not stop other listeners on the SAME node
   * — so a sheet opened from inside another sheet (ASSET-03's Asset-type picker
   * inside Quick Capture) closed both at once, throwing away a half-written
   * capture for one Escape. The open sheets are therefore kept in a small stack
   * and only the last one registered acts; every sheet below returns without
   * touching the event.
   *
   * Registered once on mount (the close callback is read through a ref) so the
   * stack order stays the order the sheets actually opened in.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const token = {};
    OPEN_SHEETS.push(token);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (OPEN_SHEETS[OPEN_SHEETS.length - 1] !== token) return;
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      const index = OPEN_SHEETS.indexOf(token);
      if (index >= 0) OPEN_SHEETS.splice(index, 1);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  /*
   * ONE close control, drawn as a glyph or as a word. Declared before the
   * markup so both placements render the identical element — two copies in two
   * branches is how a focus-restoration ref quietly starts pointing at the one
   * that is not on screen.
   */
  const closeControl =
    closeLabel === undefined ? (
      <IconButton
        ref={closeButtonRef}
        className="dh-sheet__close dh-panel-close"
        icon={<CloseIcon />}
        label="Close"
        onClick={onClose}
      />
    ) : (
      <button
        type="button"
        className="dh-sheet__close dh-sheet__close--worded dh-panel-close"
        ref={closeButtonRef}
        onClick={onClose}
      >
        {closeLabel}
      </button>
    );

  const layer = (
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
        {/* M3's DRAG HANDLE. Decorative: the sheet is dismissed by the close
            button, Escape and the scrim, all of which are real controls — the
            handle is the affordance that says "this is a sheet", not a second
            way to close it. */}
        {variant === "full" ? null : (
          <div className="dh-sheet__handle" aria-hidden="true" />
        )}
        <header
          className="dh-sheet__header dh-panel-header"
          data-close={closePlacement}
        >
          {leading ? <div className="dh-sheet__leading">{leading}</div> : null}
          {closePlacement === "leading" ? closeControl : null}
          <PanelHeading
            title={title}
            titleId={titleId}
            description={description}
            descriptionId={descriptionId}
            className="dh-sheet__heading"
            titleClassName="dh-sheet__title"
            descriptionClassName="dh-sheet__description"
          />
          {trailing ? (
            <div className="dh-sheet__trailing">{trailing}</div>
          ) : null}
          {closePlacement === "trailing" ? closeControl : null}
        </header>

        <div
          className="dh-sheet__body dh-panel-body"
          {...(bodyFocusable
            ? { tabIndex: 0, role: "group", "aria-labelledby": titleId }
            : {})}
        >
          {children}
        </div>

        {footer ? (
          <div className="dh-sheet__footer dh-panel-footer">{footer}</div>
        ) : null}
      </div>
    </div>
  );

  // The sheet only ever mounts in the browser (it is rendered in response to a
  // gesture), so there is no server render to guard — but the check keeps the
  // component safe to import from anything the server touches.
  return typeof document === "undefined"
    ? layer
    : createPortal(layer, document.body);
}
