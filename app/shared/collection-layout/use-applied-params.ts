/**
 * V2.3-GATE-01 — the parameters a collection's controls treat as APPLIED.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * `CollectionControlsPopover` LIVE-APPLIES: each choice is committed as it is
 * made, because the popover sits beside the list rather than over it
 * (CONTROL-01). Committing means writing the URL, and the base that write is
 * composed over is the collection's COMMITTED state — for Tasks, the canonical
 * parameters derived from the loader's own `config`, so the controls can never
 * claim a filter the query did not actually apply.
 *
 * Both of those are right, and together they lost data. A collection's committed
 * state only advances when the navigation COMPLETES, and a navigation completes
 * only after its loader has answered. So between "the owner chose Priority 1"
 * and "the server came back", the committed state still describes the PREVIOUS
 * query — and a second choice made in that window is composed over a base that
 * does not contain the first one, which deletes it.
 *
 * MEASURED on `main` @ bcdba66, with the revalidation held for 1.5 s:
 *
 *     choose Priority = P1    → GET /tasks.data?group=due_state&priority=p1
 *     choose Due = Overdue    → GET /tasks.data?group=due_state&due=overdue
 *     final URL                 /tasks?group=due_state&due=overdue
 *
 * The first write carried `priority=p1`; the second was built from a base that
 * had never heard of it. That is a lost update, not a test artefact: a person
 * choosing two filters inside one loader round trip loses the first one, and on
 * a slower connection the window is wider, not narrower. The canonical contract
 * is that filters COMBINE (`DESIGN_SYSTEM.md → Filters: one filter system`).
 *
 * ── What this hook is ────────────────────────────────────────────────────────
 * ONE answer to "what is applied right now", for every surface of the shared
 * controls to read: the committed parameters, EXCEPT while this collection is
 * still waiting on a write these controls themselves made, in which case it is
 * that write.
 *
 * It is not a second filter model and it stores no filter state: the value it
 * remembers is a `URLSearchParams` this component already produced through the
 * one shared `applyDraft`, held only for the length of one in-flight
 * same-route navigation. The moment the router settles, the committed state is
 * the truth again — including any canonicalisation the server applied, so a
 * value the query rejected still disappears from the chips and the badge.
 *
 * "In flight" is the same question `useCollectionLoading` already asks, and the
 * same answer: a loading navigation whose target pathname is the one being
 * looked at. A navigation AWAY from the collection is not this collection's
 * write, so it drops the pending base rather than carrying it to another route.
 */

import { useCallback, useRef } from "react";
import { useLocation, useNavigation } from "react-router";

export type AppliedParams = {
  /**
   * The parameters every control surface reads: what is committed, or what this
   * collection last wrote while it is still waiting on it.
   */
  readonly applied: URLSearchParams;
  /**
   * The same answer, asked at EVENT TIME rather than at render time.
   *
   * V2.4-GATE-01 — `applied` above is computed during render, so a handler that
   * closed over it is only as current as the last render. `record` writes a ref
   * and deliberately does not re-render (see below), and React Router does not
   * report `loading` synchronously either, so between a choice and the render
   * that reflects it there is a window in which NOTHING has re-rendered. A
   * second choice made in that window runs a handler holding the pre-choice
   * parameters, composes over them, and deletes the first — which is the very
   * lost update this hook was written to close, arriving through the one door it
   * left open.
   *
   * So every write composes over THIS, never over a captured value. Same rule,
   * same precedence, read at the moment it is used.
   */
  readonly current: () => URLSearchParams;
  /**
   * Record the parameters just written, so the next choice composes over them
   * instead of over the state the loader has not yet replaced. Call it with the
   * exact value handed to `setSearchParams`.
   */
  readonly record: (written: URLSearchParams) => void;
};

export function useAppliedParams(committed: URLSearchParams): AppliedParams {
  const navigation = useNavigation();
  const location = useLocation();
  /*
   * A ref rather than state, deliberately. This is a CACHE of a value the
   * component has already produced, not a second source of filter truth: making
   * it state would render twice per choice to show what the write already shows,
   * and would invite something to start reading it as the state itself.
   */
  const pendingRef = useRef<URLSearchParams | null>(null);
  /*
   * The latest committed parameters, reachable from an event handler. `current`
   * has to be referentially stable — every write callback depends on it — so it
   * cannot close over `committed` directly.
   */
  const committedRef = useRef(committed);
  committedRef.current = committed;

  const inFlight =
    navigation.state === "loading" &&
    navigation.location?.pathname === location.pathname;

  // Clearing during render is safe because it is idempotent and derived: once
  // the router is no longer loading THIS collection, the committed parameters
  // are authoritative and the remembered write has nothing left to add.
  if (!inFlight && pendingRef.current !== null) {
    pendingRef.current = null;
  }

  const record = useCallback((written: URLSearchParams) => {
    pendingRef.current = new URLSearchParams(written);
  }, []);

  /*
   * A remembered write outranks the committed parameters until a render has
   * retired it — which is the same precedence `applied` applies, minus the
   * dependence on a render having happened. `pendingRef` is only ever non-null
   * between a write and the render that supersedes it, so there is no state here
   * that outlives the round trip it belongs to.
   */
  const current = useCallback(
    () => pendingRef.current ?? committedRef.current,
    [],
  );

  return {
    applied: inFlight && pendingRef.current ? pendingRef.current : committed,
    current,
    record,
  };
}
