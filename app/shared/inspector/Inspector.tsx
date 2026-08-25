/**
 * DS-10 Inspector — the panel (presentational).
 *
 * ONE panel, two presentations chosen by viewport:
 *   - desktop (docked): a non-modal, resizable right-side `complementary`
 *     landmark. The page stays interactive (multi-select/bulk edit is possible);
 *     content reflows via the layout's padding, so the panel never covers it.
 *   - mobile (compact): a modal sheet — focus-trapped, background inert,
 *     body-scroll-locked — REUSING the DS-03 Drawer hooks (no second focus-trap).
 *
 * Focus is moved into the panel on open and restored to the opener on close in
 * BOTH presentations (the DS-03 focus hook does focus-in/restore regardless of
 * `active`; `active` gates only the Tab trap). Escape closes (honouring
 * `preventClose`). Motion is CSS and disabled under reduced-motion.
 */

import { useEffect, useRef } from "react";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";
import { CloseIcon } from "~/shared/icons";
import { IconButton } from "~/shared/ui/IconButton";
import { PanelHeading } from "~/shared/ui/PanelHeading";

import type { InspectorRenderResult } from "./inspector-context";
import type { InspectorResize } from "./use-inspector-resize";

export type InspectorPanelProps = {
  readonly result: InspectorRenderResult;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly compact: boolean;
  readonly resize: InspectorResize;
  readonly opener: HTMLElement | null;
  readonly onRequestClose: () => void;
};

export function Inspector({
  result,
  titleId,
  descriptionId,
  compact,
  resize,
  opener,
  onRequestClose,
}: InspectorPanelProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Reuse the DS-03 modal machinery. Trap/lock/inert engage ONLY when compact
  // (modal sheet); focus-in + restore happen in both presentations.
  useDrawerFocus({
    containerRef,
    active: compact,
    closeButtonRef,
    opener,
  });
  useBodyScrollLock(compact);
  useInertBackground(containerRef, compact);

  // Escape closes. In the modal sheet it always closes the top surface; docked
  // (non-modal) it closes only when focus is inside the panel, so it never hijacks
  // a global Escape while the user is working elsewhere on the page.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const container = containerRef.current;
      if (
        !compact &&
        (!container || !container.contains(document.activeElement))
      ) {
        return;
      }
      event.stopPropagation();
      onRequestClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [compact, onRequestClose]);

  // See the comment on the container below: the element type follows the
  // semantics rather than a role being layered onto a fixed one.
  const Container = (compact ? "div" : "aside") as "aside";

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="dh-inspector-scrim dh-motion-scrim"
          aria-label="Close inspector"
          onClick={onRequestClose}
        />
      ) : null}
      {/*
       * The element TYPE follows the semantics, rather than a role being layered
       * onto a fixed one: docked, the Inspector is genuinely complementary
       * content beside the record, so it is an `aside`; compact, it is a modal
       * sheet, so it is a plain `div` carrying `role="dialog"`.
       *
       * `role="dialog"` on an `aside` is an `aria-allowed-role` violation —
       * surfaced by MOBILE-01's first axe scan of a phone-width Inspector sheet,
       * which is the only configuration where the compact branch renders.
       */}
      <Container
        ref={containerRef}
        className="dh-inspector dh-motion-edge-inline"
        data-compact={compact ? "true" : "false"}
        style={{ ["--app-inspector-width" as string]: `${resize.width}px` }}
        role={compact ? "dialog" : undefined}
        aria-modal={compact ? true : undefined}
        aria-labelledby={titleId}
        aria-describedby={result.description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {compact ? null : (
          <div className="dh-inspector__resize" {...resize.handleProps} />
        )}
        <header className="dh-inspector__header dh-panel-header">
          <PanelHeading
            title={result.title}
            titleId={titleId}
            description={result.description}
            descriptionId={descriptionId}
            className="dh-inspector__heading"
            titleClassName="dh-inspector__title"
            descriptionClassName="dh-inspector__description"
          />
          <IconButton
            ref={closeButtonRef}
            className="dh-inspector__close dh-panel-close md-state-layer"
            icon={<CloseIcon />}
            label="Close inspector"
            onClick={onRequestClose}
          />
        </header>
        <div className="dh-inspector__body dh-panel-body">
          {result.children}
        </div>
        {result.footer ? (
          <footer className="dh-inspector__footer dh-panel-footer">
            {result.footer}
          </footer>
        ) : null}
      </Container>
    </>
  );
}
