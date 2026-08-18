/**
 * HABITS-01 — Quick Capture: Habit.
 *
 * The panel is deliberately THIN, for the reason `AssetCapturePanel` gives: the
 * canonical New Habit form ALREADY asks for the least that can work — a name and
 * a cadence — and reveals the rest progressively, so capture composes that exact
 * component rather than re-implementing a second, thinner Habit form that would
 * immediately drift from the real one. There is no capture-only Habit model,
 * validator or create path.
 *
 * ── Creating a Habit is DELIBERATE ──────────────────────────────────────────
 * This panel is the only place capture knows Habits exist. Nothing parses "gym
 * every Monday" out of a captured Task and quietly turns it into a Habit: the
 * deterministic Task capture language is a Task language, and inferring a
 * behavioural commitment from a sentence the owner meant as a to-do would be the
 * product deciding what they intended. Choosing "Habit" is the whole gesture.
 *
 * It lives in the module, not in `app/shared/capture`, because it is Habits'
 * creation surface; the shared sheet reaches it through a LAZY import, so the
 * shell never statically depends on a module and no Habit form enters the
 * initial bundle.
 */

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import {
  CaptureResult,
  type CapturePanelProps,
  type CaptureSuccess,
} from "~/shared/capture";

import { HabitForm, type HabitLinkOption } from "./HabitForm";

/** The bounded option lists the optional relationships offer, fetched once. */
interface HabitCaptureOptions {
  readonly areas: readonly HabitLinkOption[];
  readonly goals: readonly HabitLinkOption[];
  readonly firstDayOfWeek: FirstDayOfWeek;
}

const EMPTY_OPTIONS: HabitCaptureOptions = {
  areas: [],
  goals: [],
  firstDayOfWeek: DEFAULT_APP_PREFERENCES.firstDayOfWeek,
};

export default function HabitCapturePanel({
  firstFieldRef,
  onClose,
}: CapturePanelProps) {
  const [success, setSuccess] = useState<CaptureSuccess | null>(null);
  /** Bumped by "Add another": a new key remounts the form, clearing its state. */
  const [formKey, setFormKey] = useState(0);
  const [options, setOptions] = useState<HabitCaptureOptions>(EMPTY_OPTIONS);

  /*
   * The pickers' options come from the module's own `/habits/new` loader, read
   * as data rather than duplicated: capture has no second query for Areas and
   * Goals, and a failure simply leaves both pickers empty — a Habit needs
   * neither, so the form still works.
   */
  useEffect(() => {
    let cancelled = false;
    void fetch("/habits/new", { headers: { accept: "application/json" } })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as Partial<HabitCaptureOptions>)
          : null,
      )
      .then((data) => {
        if (cancelled || data === null) return;
        setOptions({
          areas: data.areas ?? [],
          goals: data.goals ?? [],
          firstDayOfWeek: data.firstDayOfWeek ?? EMPTY_OPTIONS.firstDayOfWeek,
        });
      })
      .catch(() => {
        // Both relationships are optional; an empty picker is a narrower control,
        // never a broken one.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Focus the name field once this panel has actually arrived.
   *
   * The sheet moves focus to `firstFieldRef` a frame after a type becomes
   * active. This panel is LAZY, so on the load frame the ref is still null and
   * focus would sit on the sheet's Close button; the panel therefore claims
   * focus itself when it mounts.
   */
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      firstFieldRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [firstFieldRef]);

  const addAnother = useCallback(() => {
    setSuccess(null);
    setFormKey((key) => key + 1);
    window.requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [firstFieldRef]);

  if (success) {
    return (
      <CaptureResult
        success={success}
        onAddAnother={addAnother}
        onDone={onClose}
      />
    );
  }

  return (
    <HabitForm
      key={formKey}
      surface="sheet"
      firstFieldRef={firstFieldRef}
      areas={options.areas}
      goals={options.goals}
      firstDayOfWeek={options.firstDayOfWeek}
      onCreated={(habitId) =>
        setSuccess({
          id: habitId,
          href: `/habits/${encodeURIComponent(habitId)}`,
          openLabel: "Open habit",
          message: "Habit created.",
        })
      }
    />
  );
}
