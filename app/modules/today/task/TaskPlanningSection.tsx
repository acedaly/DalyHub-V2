/**
 * TODAY-04 — the Task Drawer's Planning section.
 *
 * A focused, shared-primitive composition (NOT a new form framework) shown in the
 * DS-02 Record Layout Summary, beside completion and waiting. It presents the
 * task's plan — its Scheduled (committed) date and its Due date, kept clearly
 * distinct — and offers calm quick actions to plan the task: Today, Tomorrow, Next
 * week, Clear, and a Custom date through the shared DS-06 date control (no
 * modal-in-modal; the picker is inline).
 *
 * The control owns only local pending/error state; persistence goes through the
 * callbacks the Drawer supplies (which post `plan`/`clear_plan` to the trusted task
 * action). Planning never changes the due date, waiting state or completion; a
 * completed task shows its plan read-only (planning applies to open work).
 */

import { useMemo, useState } from "react";

import { DateField, FormButton } from "~/shared/forms";

import { ownerCalendarIso } from "../date";
import { planTargets } from "./planning-view";
import { formatCalendarDate } from "./task-view";

/** The outcome the Drawer's planning mutations return to this control. */
export interface PlanningActionOutcome {
  readonly ok: boolean;
  readonly formError?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

interface TaskPlanningSectionProps {
  readonly scheduledDate: string | null;
  readonly dueDate: string | null;
  readonly completed: boolean;
  readonly onPlan: (scheduledDate: string) => Promise<PlanningActionOutcome>;
  readonly onClear: () => Promise<PlanningActionOutcome>;
  /** Injectable "now" for the target dates (a fixed value keeps tests deterministic). */
  readonly now?: Date;
}

export function TaskPlanningSection({
  scheduledDate,
  dueDate,
  completed,
  onPlan,
  onClear,
  now,
}: TaskPlanningSectionProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");

  // The quick-plan target dates, resolved in the owner's calendar zone (client-side
  // Intl), so "Today"/"Tomorrow"/"Next week" match the pane-header day. Only used in
  // click handlers, never rendered, so there is no hydration text to mismatch.
  const targets = useMemo(
    () => planTargets(ownerCalendarIso(now ?? new Date())),
    [now],
  );

  const scheduledLabel = scheduledDate
    ? formatCalendarDate(scheduledDate)
    : null;
  const dueLabel = dueDate ? formatCalendarDate(dueDate) : null;

  const run = async (mutate: () => Promise<PlanningActionOutcome>) => {
    setPending(true);
    setError(null);
    try {
      const outcome = await mutate();
      if (!outcome.ok) {
        setError(
          outcome.fieldErrors?.["scheduledDate"] ??
            outcome.formError ??
            "That couldn't be saved.",
        );
      } else {
        setCustomOpen(false);
        setCustom("");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="dh-task-planning" role="group" aria-label="Planning">
      <dl className="dh-task-planning__dates">
        <div className="dh-task-planning__date">
          <dt>Scheduled</dt>
          <dd>{scheduledLabel ?? "Not planned"}</dd>
        </div>
        <div className="dh-task-planning__date">
          <dt>Due</dt>
          <dd>{dueLabel ?? "No due date"}</dd>
        </div>
      </dl>

      {completed ? (
        <p className="dh-task-planning__muted">
          Planning applies to open tasks.
        </p>
      ) : (
        <>
          <div className="dh-task-planning__actions">
            <FormButton
              type="button"
              variant="secondary"
              pending={pending}
              onClick={() => void run(() => onPlan(targets.today))}
            >
              Today
            </FormButton>
            <FormButton
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void run(() => onPlan(targets.tomorrow))}
            >
              Tomorrow
            </FormButton>
            <FormButton
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void run(() => onPlan(targets.nextWeek))}
            >
              Next week
            </FormButton>
            {scheduledDate !== null ? (
              <FormButton
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => void run(() => onClear())}
              >
                Clear
              </FormButton>
            ) : null}
            <FormButton
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setCustomOpen((open) => !open)}
            >
              Custom date…
            </FormButton>
          </div>

          {customOpen ? (
            <div className="dh-task-planning__custom">
              <DateField
                label="Choose a date"
                value={custom}
                onChange={(value) => {
                  setCustom(value);
                  if (value !== "") {
                    void run(() => onPlan(value));
                  }
                }}
              />
            </div>
          ) : null}

          {error ? (
            <p className="dh-task-planning__error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
