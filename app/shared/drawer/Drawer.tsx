/**
 * DS-03 — a single drawer panel (internal).
 *
 * One accessible modal-dialog panel: a labelled `role="dialog"` with an accessible
 * name (its title) and an optional description, a sticky header carrying the
 * always-present close control, and a scrollable body that hosts a DS-02
 * Record Layout. It owns its own focus contract (via {@link useDrawerFocus}) and
 * Escape handling; the surrounding {@link DrawerStack} owns scroll-locking,
 * background inertness and the backdrop.
 *
 * Only the top panel is interactive: lower panels are `inert` (removed from focus
 * and the accessibility tree) and carry no `aria-modal`, so a stacked drawer never
 * exposes the drawer beneath it. Consumers never render this directly — they map a
 * key to content through the provider's `renderDrawer`.
 */

import { useEffect, useId, useRef } from "react";

import { CloseIcon } from "~/shared/icons";
import { IconButton } from "~/shared/ui/IconButton";
import { PanelHeading } from "~/shared/ui/PanelHeading";

import { useDrawerFocus } from "./use-drawer-focus";
import type { DrawerEntry, DrawerRenderResult } from "./types";

/** The coherent fallback shown when a deep link resolves to no known record. */
function DrawerNotFound() {
  return (
    <div className="drawer-empty" role="note">
      <p className="drawer-empty__title">We couldn’t find that record.</p>
      <p className="drawer-empty__body">
        It may have been removed, or the link may be out of date. Close this
        drawer to return to where you were.
      </p>
    </div>
  );
}

export interface DrawerProps {
  readonly entry: DrawerEntry;
  /** The consumer-provided content, or `null` for an unknown record. */
  readonly result: DrawerRenderResult | null;
  /** The control that opened this drawer, for focus restoration on close. */
  readonly opener: HTMLElement | null;
  /** Guarded close attempt (honours `preventClose`); used by Escape and the button. */
  readonly onClose: () => void;
}

export function Drawer({ entry, result, opener, onClose }: DrawerProps) {
  const generatedId = useId();
  const titleId = `drawer-title-${generatedId}`;
  const descriptionId = `drawer-desc-${generatedId}`;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const { isTop } = entry;
  const title = result?.title ?? "This record isn’t available";
  const description = result?.description;
  const size = result?.size ?? "default";
  // MOBILE-01: the phone Drawer is the record's whole screen, so it can carry the
  // record's contextual actions in its own compact header and pin the record's
  // primary commitment to a keyboard-safe sticky region.
  const headerActions = result?.headerActions;
  const stickyActions = result?.stickyActions;

  useDrawerFocus({
    containerRef: panelRef,
    active: isTop,
    initialFocusRef: result?.initialFocusRef,
    closeButtonRef,
    opener,
  });

  // Escape closes only the top drawer, and only when closing is not prevented
  // (the prevention check lives in `onClose`). Lower drawers are inert and never
  // register this listener, so Escape acts on the top level alone.
  useEffect(() => {
    if (!isTop || typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isTop, onClose]);

  return (
    <div
      ref={panelRef}
      className="drawer dh-motion-edge-inline"
      role="dialog"
      aria-modal={isTop ? true : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-size={size}
      data-top={isTop ? "true" : "false"}
      data-depth={entry.depth}
      // Styling hook (MOBILE-01): when the record's title lives only in this
      // header, the body's own record header collapses on a phone rather than
      // repeating it.
      data-title-in-header={result?.titleInHeaderOnly ? "true" : undefined}
      inert={!isTop ? true : undefined}
      tabIndex={-1}
    >
      <header className="drawer__header dh-panel-header">
        <PanelHeading
          title={title}
          titleId={titleId}
          description={description}
          descriptionId={descriptionId}
          className="drawer__heading"
          titleClassName="drawer__title"
          descriptionClassName="drawer__description"
        />
        {headerActions !== undefined && (
          <div className="drawer__header-actions">{headerActions}</div>
        )}
        <IconButton
          ref={closeButtonRef}
          className="drawer__close dh-panel-close md-state-layer"
          icon={<CloseIcon />}
          label="Close"
          onClick={onClose}
        />
      </header>
      <div className="drawer__body dh-panel-body">
        {result === null ? <DrawerNotFound /> : result.children}
      </div>
      {stickyActions !== undefined && (
        // Pinned OUTSIDE the scrolling body so it never scrolls away, and
        // keyboard-safe by construction (see drawer.css).
        <div className="drawer__sticky-actions dh-panel-footer">
          {stickyActions}
        </div>
      )}
    </div>
  );
}
