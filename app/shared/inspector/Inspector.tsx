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

import { CloseGlyph } from "./inspector-icons";
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

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="dh-inspector-scrim"
          aria-label="Close inspector"
          onClick={onRequestClose}
        />
      ) : null}
      <aside
        ref={containerRef}
        className="dh-inspector"
        data-compact={compact ? "true" : "false"}
        style={{ ["--dh-inspector-width" as string]: `${resize.width}px` }}
        role={compact ? "dialog" : undefined}
        aria-modal={compact ? true : undefined}
        aria-labelledby={titleId}
        aria-describedby={result.description ? descriptionId : undefined}
        tabIndex={-1}
      >
        {compact ? null : (
          <div className="dh-inspector__resize" {...resize.handleProps} />
        )}
        <header className="dh-inspector__header">
          <div className="dh-inspector__heading">
            <h2 id={titleId} className="dh-inspector__title">
              {result.title}
            </h2>
            {result.description ? (
              <p id={descriptionId} className="dh-inspector__description">
                {result.description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="dh-inspector__close"
            aria-label="Close inspector"
            onClick={onRequestClose}
          >
            <CloseGlyph />
          </button>
        </header>
        <div className="dh-inspector__body">{result.children}</div>
        {result.footer ? (
          <footer className="dh-inspector__footer">{result.footer}</footer>
        ) : null}
      </aside>
    </>
  );
}
