/**
 * The Universal Relationship System — the shared Hover Card.
 *
 * An entity-agnostic, accessible summary card shown for a linked record on
 * pointer hover AND keyboard focus (never hover-only, so it is reachable without
 * a mouse). The card is a non-interactive `role="tooltip"` associated with its
 * trigger via `aria-describedby`, so it supplements the link without trapping
 * focus. It opens after a short intent delay, closes on blur / pointer-leave /
 * Escape, and lazily fetches its summary the first time it opens (caching the
 * result). Motion honours `prefers-reduced-motion` (CSS).
 *
 * It knows nothing about D1, workspaces or a specific entity type: the consumer
 * supplies the trigger, a `loadSummary` callback and a `renderSummary` renderer.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { LinkSummary } from "./linked-items-model";

const OPEN_DELAY_MS = 250;

export interface HoverCardProps {
  /** The trigger (typically an `EntityLink`). Must contain the focusable link. */
  readonly children: ReactNode;
  /** Lazily load the summary the first time the card opens. */
  readonly loadSummary: (signal: AbortSignal) => Promise<LinkSummary | null>;
  /** Render the loaded summary body. */
  readonly renderSummary: (summary: LinkSummary) => ReactNode;
  readonly className?: string;
}

type SummaryState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly summary: LinkSummary }
  | { readonly status: "empty" }
  | { readonly status: "error" };

export function HoverCard({
  children,
  loadSummary,
  renderSummary,
  className,
}: HoverCardProps) {
  const cardId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SummaryState>({ status: "idle" });
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (openTimer.current) clearTimeout(openTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  const startLoad = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    loadSummary(controller.signal).then(
      (summary) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setState(summary ? { status: "ready", summary } : { status: "empty" });
      },
      () => {
        if (!mountedRef.current || controller.signal.aborted) return;
        // A retry is allowed on the next open.
        loadedRef.current = false;
        setState({ status: "error" });
      },
    );
  }, [loadSummary]);

  const scheduleOpen = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
      startLoad();
    }, OPEN_DELAY_MS);
  }, [startLoad]);

  const openNow = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    setOpen(true);
    startLoad();
  }, [startLoad]);

  const close = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    setOpen(false);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Escape" && open) {
      // Escape dismisses the card but leaves focus on the trigger.
      close();
      event.stopPropagation();
    }
  };

  const rootClassName = ["dh-hover-card", className].filter(Boolean).join(" ");

  return (
    // This wrapper is a hover/focus CONTAINER, not an interactive control — the
    // actual interactive element is the nested link (children). The handlers only
    // manage the supplementary tooltip's open state and Escape-to-dismiss (the
    // tooltip is non-interactive and focus never leaves the link), so a role/tabbing
    // affordance would be misleading. This mirrors the codebase's documented pattern
    // of a targeted a11y disable for a non-interactive container.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      className={rootClassName}
      onMouseEnter={scheduleOpen}
      onMouseLeave={close}
      onFocusCapture={openNow}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next)) close();
      }}
      onKeyDown={handleKeyDown}
    >
      <span
        className="dh-hover-card__trigger"
        aria-describedby={open ? cardId : undefined}
      >
        {children}
      </span>
      {open ? (
        <span
          id={cardId}
          role="tooltip"
          className="dh-hover-card__panel"
          data-status={state.status}
        >
          {state.status === "loading" ? (
            <span className="dh-hover-card__loading">Loading…</span>
          ) : state.status === "ready" ? (
            renderSummary(state.summary)
          ) : state.status === "empty" ? (
            <span className="dh-hover-card__muted">
              This item is no longer available.
            </span>
          ) : state.status === "error" ? (
            <span className="dh-hover-card__muted">
              Couldn’t load a preview.
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
