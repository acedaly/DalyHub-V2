/**
 * DHDS-08 — a dismissed toast LEAVES rather than vanishing.
 *
 * The feedback provider owns the queue: it adds a notification, runs its timer,
 * and removes it on expiry or dismissal. That removal is correct and this hook
 * does not touch it. What it adds is presentation-only — the removed record is
 * kept in the RENDERED list for the length of one exit animation, marked
 * `data-dh-exit`, so `motion.css` can fade it out instead of the toast simply
 * ceasing to exist.
 *
 * ── Why here rather than in the provider ────────────────────────────────────
 * Because it is not a queue concern. `FeedbackProvider` owns Undo windows,
 * commit handlers, coalescing and bounded eviction — the semantics of the
 * feedback system — and none of that should learn what an animation is. The
 * provider's queue is the truth; this is a view of it that lags by 140ms.
 *
 * ── Why the TOAST and not the panels ────────────────────────────────────────
 * A toast is the one overlay in DalyHub with no focus contract to honour: it is
 * not focus-trapped, it does not lock scroll, it does not inert the page, and
 * it restores focus to nothing. So holding one on screen for an extra frame or
 * two costs nothing an owner can feel. The Drawer, the Inspector, the Sheet and
 * the mobile navigation all restore focus to their opener ON UNMOUNT, and
 * delaying that would delay the focus restoration with it — which §19 rules
 * out. Their exits are recorded as deferred in the DHDS-08 record rather than
 * bolted on here.
 *
 * ── Interaction ─────────────────────────────────────────────────────────────
 * A leaving toast is `inert`, so its Undo cannot be clicked after the decision
 * to dismiss has been taken, and it cannot be tabbed into. It is out of the
 * queue the moment the provider says so; only its pixels remain.
 */

import { useEffect, useRef, useState } from "react";

import { DH_MOTION_EXIT_MS, useReducedMotion } from "~/shared/motion";

/** The minimum shape this hook needs: something with a stable identity. */
interface Identified {
  readonly id: string;
}

export interface LeavingList<T extends Identified> {
  /** What to render: the live records, plus any still on their way out. */
  readonly rendered: readonly T[];
  /** Is this record leaving? Drives `data-dh-exit` and `inert`. */
  readonly isLeaving: (id: string) => boolean;
}

export function useLeavingRecords<T extends Identified>(
  records: readonly T[],
  durationMs: number = DH_MOTION_EXIT_MS,
): LeavingList<T> {
  /*
   * There is no exit animation to wait for under reduced motion, so there is no
   * wait: the toast goes when the queue says it went. The delay is real even
   * when the motion is not.
   */
  const reducedMotion = useReducedMotion();
  const [leaving, setLeaving] = useState<readonly T[]>([]);
  /*
   * The previous live list, so the effect can tell what DISAPPEARED. Held in a
   * ref rather than in state: it is bookkeeping about the last render, not
   * something the render reads, and putting it in state would loop.
   */
  const previous = useRef<readonly T[]>(records);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = new Set(records.map((record) => record.id));
    const departed = previous.current.filter(
      (record) => !live.has(record.id) && !timers.current.has(record.id),
    );
    previous.current = records;

    /*
     * A record that came BACK — the same id re-added while its predecessor was
     * still fading — cancels its own exit, so it is not rendered twice and does
     * not disappear when the stale timer fires.
     */
    for (const record of records) {
      const timer = timers.current.get(record.id);
      if (timer === undefined) continue;
      clearTimeout(timer);
      timers.current.delete(record.id);
      setLeaving((current) => current.filter((item) => item.id !== record.id));
    }

    if (departed.length === 0 || reducedMotion || durationMs <= 0) return;
    setLeaving((current) => [...current, ...departed]);
    for (const record of departed) {
      timers.current.set(
        record.id,
        setTimeout(() => {
          timers.current.delete(record.id);
          setLeaving((current) =>
            current.filter((item) => item.id !== record.id),
          );
        }, durationMs),
      );
    }
  }, [records, durationMs, reducedMotion]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const leavingIds = new Set(leaving.map((record) => record.id));
  return {
    // Live records first, so a fading toast never displaces a new one.
    rendered: leaving.length === 0 ? records : [...records, ...leaving],
    isLeaving: (id: string) => leavingIds.has(id),
  };
}
