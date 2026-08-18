/**
 * HABITS-01 — the ONE client-side check-in authority.
 *
 * Every surface that can tick a Habit — Today, the `/habits` collection, the
 * Habit record — calls this hook, and this hook posts to `/habits/:id/check-in`.
 * There is no second poster, no per-surface fetch and no optimistic store that
 * outlives the answer, which is what makes "Today and /habits agree" structural
 * rather than a thing to remember (the same rule `useTaskSurfaceActions`
 * establishes for Tasks).
 *
 * ── Optimism, and its limit ─────────────────────────────────────────────────
 * The tick applies immediately, because a check-in that waits for a round trip
 * feels like a control that did not work. The optimistic value lives ONLY until
 * the server answers: a refusal clears the patch and announces why, and a
 * success revalidates so the week's counts come from the loader rather than from
 * arithmetic done in the browser. A patch never survives fresh data (ADR-086).
 *
 * ── No offline queue ────────────────────────────────────────────────────────
 * PWA-12's offline mutation queue is deliberately Task-only and says so in as
 * many words. Extending it is a decision with its own conflict semantics, so
 * HABITS-01 does NOT claim offline check-ins and does NOT start a second,
 * habit-shaped localStorage queue beside it. Offline, the request fails and the
 * surface says so honestly — see DEBT-155.
 */

import { useCallback, useState } from "react";
import { useRevalidator } from "react-router";

/** The optimistic override for one Habit, held until the loader answers. */
export interface HabitCheckPatch {
  readonly done: boolean;
}

export interface HabitCheckInController {
  /** Optimistic overrides by Habit id — empty once fresh data arrives. */
  readonly patches: ReadonlyMap<string, HabitCheckPatch>;
  /** True while any check-in is in flight. */
  readonly pending: boolean;
  /** The last outcome, for the surface's single polite live region. */
  readonly announcement: string | null;
  /** Tick or untick one Habit for one owner-local date. */
  readonly setChecked: (input: {
    readonly habitId: string;
    readonly title: string;
    readonly dateIso: string;
    readonly checked: boolean;
  }) => void;
  /** Drop every patch — called when the loader's data changes. */
  readonly clearPatches: () => void;
}

interface CheckInResponse {
  readonly ok: boolean;
  readonly outcome?: string;
  readonly message?: string;
}

export function useHabitCheckIn(): HabitCheckInController {
  const revalidator = useRevalidator();
  const [patches, setPatches] = useState<ReadonlyMap<string, HabitCheckPatch>>(
    new Map(),
  );
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const clearPatches = useCallback(() => {
    setPatches((current) => (current.size === 0 ? current : new Map()));
  }, []);

  const setChecked = useCallback(
    ({
      habitId,
      title,
      dateIso,
      checked,
    }: {
      readonly habitId: string;
      readonly title: string;
      readonly dateIso: string;
      readonly checked: boolean;
    }) => {
      setPatches((current) => {
        const next = new Map(current);
        next.set(habitId, { done: checked });
        return next;
      });
      setPending(true);

      const body = new FormData();
      body.set("intent", checked ? "check_in" : "undo");
      body.set("date", dateIso);

      void fetch(`/habits/${encodeURIComponent(habitId)}/check-in`, {
        method: "POST",
        body,
      })
        .then(async (response) => (await response.json()) as CheckInResponse)
        .then((result) => {
          setPending(false);
          if (result.ok) {
            setAnnouncement(
              checked ? `${title} checked in.` : `${title} check-in removed.`,
            );
            // The loader is the truth. Revalidating is what makes the week's
            // counts — which depend on the schedule that governed the week, not
            // on a number the browser could add up — correct after every tick.
            revalidator.revalidate();
            return;
          }
          setPatches((current) => {
            const next = new Map(current);
            next.delete(habitId);
            return next;
          });
          setAnnouncement(
            result.message ?? "That couldn’t be saved. Nothing was changed.",
          );
        })
        .catch(() => {
          setPending(false);
          setPatches((current) => {
            const next = new Map(current);
            next.delete(habitId);
            return next;
          });
          setAnnouncement(
            "That couldn’t be saved — you may be offline. Nothing was changed.",
          );
        });
    },
    [revalidator],
  );

  return { patches, pending, announcement, setChecked, clearPatches };
}
