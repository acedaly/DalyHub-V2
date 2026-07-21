/**
 * TODAY-05 — the roving-focus controller for the Today task collection (React).
 *
 * Wraps the pure {@link roving-model} with the small amount of stateful, DOM-aware
 * glue a real keyboard-navigable collection needs, WITHOUT re-implementing any focus
 * primitive: it holds the single "focused" task position, keeps it reconciled as the
 * planning buckets change, resolves the ONE roving tab stop, and moves DOM focus to
 * the active card's primary open control. The whole task collection is therefore one
 * tab stop; Arrow Up/Down/Home/End move within it; Enter opens; Space toggles
 * selection — the accessible roving-focus pattern the design system already uses for
 * RecordTabs and Card reorder, applied to the Today list.
 *
 * Direct action shortcuts (P / Shift+P / C) are NOT handled here — they flow through
 * the ONE shared command dispatcher (CommandShortcutLayer) against the focused task,
 * so keyboard and mouse actions share one execution path (ADR-024).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  nextId,
  prevId,
  reconcileFocus,
  sectionFirstId,
  sectionLastId,
  tabStopId,
  type RovingOrder,
} from "./roving-model";

/** The class of a card's primary open control (a link or button). */
const OPEN_SELECTOR = ".dh-card__open";

export interface UseTodayRovingFocusOptions {
  /** The ordered, section-grouped open-task collection to navigate. */
  readonly order: RovingOrder;
  /** Open the given task (Enter). */
  readonly onOpen: (id: string) => void;
  /** Toggle selection of the given task (Space). */
  readonly onToggleSelect: (id: string) => void;
  /** Escape while focus is in the collection (e.g. clear selection). */
  readonly onEscape?: () => void;
}

export interface TodayRovingFocus {
  /**
   * The ref to spread onto the plain wrapper around the task sections. The keyboard
   * and focus listeners are attached to it imperatively (so the wrapper stays a plain
   * container with no interactive role of its own — the cards are the interactive
   * elements), and cleaned up on unmount.
   */
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  /** The currently focused task id, or null when none is focused yet. */
  readonly focusedId: string | null;
  /** Move focus to a task by id (updates state and moves DOM focus). */
  readonly focusTask: (id: string | null) => void;
  /** The roving `tabIndex` for a card: 0 for the single tab stop, -1 otherwise. */
  readonly tabIndexFor: (id: string) => number;
}

/** The task id owning the given DOM node's enclosing card, or null. */
function cardIdOf(node: EventTarget | null): string | null {
  if (!(node instanceof HTMLElement)) {
    return null;
  }
  const card = node.closest<HTMLElement>("[data-card-id]");
  return card?.dataset.cardId ?? null;
}

export function useTodayRovingFocus({
  order,
  onOpen,
  onToggleSelect,
  onEscape,
}: UseTodayRovingFocusOptions): TodayRovingFocus {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Reconcile the focused task whenever the order changes (a mutation re-buckets the
  // cards). If it vanished, drop to null so the tab stop returns to the first task.
  useEffect(() => {
    setFocusedId((prev) => reconcileFocus(order, prev));
  }, [order]);

  /** Move DOM focus to a task's open control (no-op when it is not rendered). */
  const focusDom = useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const cards = container.querySelectorAll<HTMLElement>("[data-card-id]");
    for (const card of cards) {
      if (card.dataset.cardId === id) {
        card.querySelector<HTMLElement>(OPEN_SELECTOR)?.focus();
        return;
      }
    }
  }, []);

  const focusTask = useCallback(
    (id: string | null) => {
      if (id === null) {
        return;
      }
      setFocusedId(id);
      focusDom(id);
    },
    [focusDom],
  );

  const tabIndexFor = useCallback(
    (id: string): number => (tabStopId(order, focusedId) === id ? 0 : -1),
    [order, focusedId],
  );

  const handleFocusIn = useCallback((event: FocusEvent) => {
    const id = cardIdOf(event.target);
    if (id !== null) {
      setFocusedId((prev) => (prev === id ? prev : id));
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Never hijack a shortcut that carries a command modifier (Meta/Ctrl/Alt) —
      // those belong to the browser or the shared command dispatcher.
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const current = cardIdOf(event.target);
      const target = event.target;
      const onOpenControl =
        target instanceof HTMLElement &&
        target.classList.contains("dh-card__open");

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusTask(nextId(order, current ?? focusedId));
          return;
        case "ArrowUp":
          event.preventDefault();
          focusTask(prevId(order, current ?? focusedId));
          return;
        case "Home":
          event.preventDefault();
          focusTask(sectionFirstId(order, current ?? focusedId));
          return;
        case "End":
          event.preventDefault();
          focusTask(sectionLastId(order, current ?? focusedId));
          return;
        case "Enter":
          // Only when the primary open control is focused — a quick-action button
          // keeps its own native Enter behaviour.
          if (onOpenControl && current !== null && !event.shiftKey) {
            event.preventDefault();
            onOpen(current);
          }
          return;
        case " ":
          // Space toggles selection from the open control (a link, where Space is
          // otherwise inert); it is never hijacked from a real button/checkbox.
          if (onOpenControl && current !== null && !event.shiftKey) {
            event.preventDefault();
            onToggleSelect(current);
          }
          return;
        case "Escape":
          if (onEscape) {
            onEscape();
          }
          return;
        default:
          return;
      }
    },
    [order, focusedId, focusTask, onOpen, onToggleSelect, onEscape],
  );

  // Attach the keyboard + focus listeners to the plain wrapper imperatively, so the
  // wrapper carries no interactive role and the cards remain the interactive
  // elements. Re-attaches when the handlers change (a mutation re-buckets the order),
  // which also covers the container mounting once planning data first arrives.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    el.addEventListener("keydown", handleKeyDown);
    el.addEventListener("focusin", handleFocusIn);
    return () => {
      el.removeEventListener("keydown", handleKeyDown);
      el.removeEventListener("focusin", handleFocusIn);
    };
  }, [handleKeyDown, handleFocusIn]);

  return { containerRef, focusedId, focusTask, tabIndexFor };
}
