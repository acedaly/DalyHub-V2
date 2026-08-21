/**
 * DHDS-11 — a completed row LEAVES; it does not vanish.
 *
 * This closes [DEBT-177](../../../docs/product/PRODUCT_DEBT.md), which DHDS-08
 * opened deliberately: it shipped steps 1–4 and 6 of the completion sequence
 * (the control responds, the ink recedes, the strike draws, the Undo toast) and
 * left step 5 — the row departing and its neighbours closing the gap — because
 * the two things standing in the way were interaction decisions rather than
 * motion ones. Both are decided here, and both are written down.
 *
 * ── Decision 1 — WHICH rows depart ──────────────────────────────────────────
 * DHDS-08's objection was that the surfaces disagree about what completion
 * means: `/tasks` in All-active removes the row, a Completed section keeps it, a
 * Project's history keeps it forever, and animating a row out of existence on a
 * surface that did not remove it would be a lie about what happened.
 *
 * The answer is not a per-surface opt-in flag. It is that a row departs when it
 * ACTUALLY LEFT — when the id the owner just acted on is no longer in the list
 * the loader answered with. A surface that keeps completed work never produces a
 * departure, because the id is still there; a surface that removes it produces
 * exactly one. The animation can therefore never disagree with what happened,
 * because it is derived from what happened.
 *
 * `watch` is the second half of that, and it is what stops every other kind of
 * removal borrowing the motion: only ids the surface has just mutated are
 * eligible. Changing a filter, switching a view, paging, or navigating removes
 * rows too, and those are not departures — the collection is a different
 * collection. A row also departs when it MOVES between buckets of a grouped
 * view, which is correct and is the object-continuity half of this phase: it
 * leaves the group it is no longer in and appears in the one it now belongs to.
 *
 * ── Decision 2 — where FOCUS goes ───────────────────────────────────────────
 * The control the owner just pressed is inside the row that is about to go, and
 * `AGENTS.md` §15 forbids guessing. The rule is the one the product already
 * uses when a checklist step is deleted (`TaskChecklistSection`): focus moves to
 * **the row that takes this one's place** — the next live row's completion
 * control — and, when there is no next row, to the previous one, and when the
 * list is now empty, to the list itself. Nothing ever lands on `<body>`.
 *
 * The leaving row is `aria-hidden` and pointer-inert rather than `inert`,
 * precisely so this hook can still SEE that focus is inside it: `inert` blurs
 * its subtree synchronously, so by the time any effect ran the answer would
 * already be `<body>` and the successor could not be chosen. The row is
 * pointer-inert from the same commit, so nothing in it can be clicked after it
 * has been reported gone.
 *
 * ── Why the departure is derived DURING RENDER, and in place ────────────────
 * Two properties depend on it, and both were defects in the first version.
 *
 * A departing row must never leave the DOM, not even for one commit. If the
 * render that drops it from `rows` commits before an effect puts it back, the
 * browser has already detached the element the owner's focus was inside — and
 * `document.activeElement` is `<body>` before any effect can read it, so the
 * successor cannot be chosen at all. Deriving the leaving set from `rows`
 * during render (React's documented "adjust state when props change" escape
 * hatch) means the node is simply never removed.
 *
 * And it is spliced back at the index it HELD, not appended. Same keys, same
 * order, so React moves no DOM node — which is the second half of keeping
 * focus — and the row collapses where the owner left it rather than jumping to
 * the bottom of the list to do it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { DH_MOTION_DELIBERATE_MS, useReducedMotion } from "~/shared/motion";

/** The minimum shape: something with a stable canonical id. */
interface Identified {
  readonly id: string;
}

export interface DepartingRows<T extends Identified> {
  /** What to render: the live rows, with any departing ones still in place. */
  readonly rendered: readonly T[];
  /** Is this row leaving? Drives `data-dh-exit`, `aria-hidden` and the collapse. */
  readonly isLeaving: (id: string) => boolean;
}

/** The attribute a departing row hands focus to on the row that replaces it. */
const FOCUS_TARGET = "[data-testid='task-complete']";

/** A row on its way out, and where it was when it left. */
interface Departure<T> {
  readonly row: T;
  readonly index: number;
}

interface DepartureState<T extends Identified> {
  /** The `rows` this state was derived from, compared by identity. */
  readonly source: readonly T[];
  readonly departures: readonly Departure<T>[];
}

export function useDepartingRows<T extends Identified>(
  rows: readonly T[],
  /** Ids the surface has just mutated. Only these are eligible to depart. */
  watch: ReadonlySet<string>,
  /** The list element, so focus can land on it when nothing is left. */
  container: RefObject<HTMLElement | null>,
  durationMs: number = DH_MOTION_DELIBERATE_MS,
): DepartingRows<T> {
  /*
   * Under reduced motion there is no animation to wait for, so there is no
   * wait: the row goes when the loader says it went, exactly as it did before
   * DHDS-11. The wait is real even when the motion is not.
   */
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<DepartureState<T>>({
    source: rows,
    departures: [],
  });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Ids already given a focus decision, so it is taken exactly once. */
  const focused = useRef(new Set<string>());

  /*
   * Derive the departures from the new `rows`, DURING RENDER.
   *
   * React's documented pattern for adjusting state when a prop changes: the
   * re-render happens before anything is committed, so the departing row is
   * never absent from the DOM for even one paint.
   */
  if (state.source !== rows) {
    const live = new Set(rows.map((row) => row.id));
    const held = new Set(state.departures.map((entry) => entry.row.id));
    const previous = renderRows(state);

    // A row that came BACK — reopened, or moved back — stops leaving.
    const kept = state.departures.filter((entry) => !live.has(entry.row.id));
    const departed: Departure<T>[] = [];
    previous.forEach((row, index) => {
      if (live.has(row.id) || held.has(row.id)) return;
      if (!watch.has(row.id)) return;
      if (reducedMotion || durationMs <= 0) return;
      departed.push({ row, index });
    });

    setState({ source: rows, departures: [...kept, ...departed] });
  }

  const departures = state.source === rows ? state.departures : [];
  const leavingIds = new Set(departures.map((entry) => entry.row.id));

  /* Retire each departure once its exit has had time to run. */
  useEffect(() => {
    const pending = timers.current;
    for (const entry of departures) {
      if (pending.has(entry.row.id)) continue;
      pending.set(
        entry.row.id,
        setTimeout(() => {
          pending.delete(entry.row.id);
          setState((current) => ({
            source: current.source,
            departures: current.departures.filter(
              (candidate) => candidate.row.id !== entry.row.id,
            ),
          }));
        }, durationMs),
      );
    }
    // A row that came back cancels its own timer, so the stale one cannot take
    // the row that returned.
    for (const [id, timer] of pending) {
      if (leavingIds.has(id)) continue;
      clearTimeout(timer);
      pending.delete(id);
    }
  });

  /*
   * Focus, BEFORE the browser paints the departure.
   *
   * A layout effect rather than an ordinary one: the row is on its way out and
   * the owner may already be pressing Tab. Reading `document.activeElement`
   * here is what makes the decision possible at all — see the banner above.
   */
  useLayoutEffect(() => {
    const root = container.current;
    const fresh = departures.filter(
      (entry) => !focused.current.has(entry.row.id),
    );
    for (const entry of departures) focused.current.add(entry.row.id);
    for (const id of [...focused.current]) {
      if (!leavingIds.has(id)) focused.current.delete(id);
    }
    if (fresh.length === 0 || root === null) return;

    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !root.contains(active)) return;
    const leavingRow = active.closest<HTMLElement>("[data-dh-exit='true']");
    if (leavingRow === null) return;

    const successor =
      nextControl(leavingRow, "nextElementSibling") ??
      nextControl(leavingRow, "previousElementSibling");
    if (successor !== null) {
      successor.focus();
      return;
    }
    // Nothing left to hand it to. The list itself is a named region and takes
    // focus programmatically, so the next Tab continues from HERE rather than
    // from the top of the document.
    root.focus();
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return {
    rendered: renderRows({ source: rows, departures }),
    isLeaving: (id: string) => leavingIds.has(id),
  };
}

/** The live rows, with each departing row spliced back at the index it held. */
function renderRows<T extends Identified>(
  state: DepartureState<T>,
): readonly T[] {
  if (state.departures.length === 0) return state.source;
  const rendered = [...state.source];
  // Ascending, so each splice lands at the index the entry actually recorded.
  for (const entry of [...state.departures].sort((a, b) => a.index - b.index)) {
    rendered.splice(Math.min(entry.index, rendered.length), 0, entry.row);
  }
  return rendered;
}

/** The nearest live row's completion control in one direction, or null. */
function nextControl(
  from: HTMLElement,
  direction: "nextElementSibling" | "previousElementSibling",
): HTMLElement | null {
  let sibling = from[direction];
  while (sibling instanceof HTMLElement) {
    if (sibling.getAttribute("data-dh-exit") !== "true") {
      const control = sibling.querySelector<HTMLElement>(FOCUS_TARGET);
      if (control !== null) return control;
    }
    sibling = sibling[direction];
  }
  return null;
}
