/**
 * TODAY-04 — the Task Drawer's Planning section.
 *
 * A focused, shared-primitive composition (NOT a new form framework) shown in the
 * DS-02 Record Layout Summary, beside completion and waiting. It presents the
 * task's plan — its Scheduled (committed) date and its Due date, kept clearly
 * distinct — and offers calm quick actions to plan the task: Today, Tomorrow and
 * Next week.
 *
 * The control owns only local pending/error state; persistence goes through the
 * callbacks the Drawer supplies (which post `plan`/`clear_plan` to the trusted task
 * action). Planning never changes the due date, waiting state or completion; a
 * completed task shows its plan read-only (planning applies to open work).
 *
 * ── EDIT-02: both dates are now edited here ──────────────────────────────────
 * The Scheduled and Due values were plain `<dd>` text, and the quick actions
 * only ever moved the SCHEDULED date. Setting a deadline therefore meant opening
 * the Details tab, pressing "Edit details", finding one of twelve controls and
 * submitting the whole record — a form transition for a value already printed
 * two lines above (§4). Both values are now shared DS-16 inline date fields:
 * clear at rest, direct to change, clearable, and keyboard-operable through the
 * same anchored popover every other date in the product uses.
 *
 * The quick actions stay, because "Today / Tomorrow / Next week" is faster than
 * any date picker for the plan a task most often gets. The "Custom date…"
 * disclosure and its own Clear do NOT: the Scheduled value is now the picker and
 * carries its own Clear, so keeping them would be a second control for the
 * direct manipulation the value already offers (§7).
 */

import { useMemo, useState } from "react";

import { FormButton } from "~/shared/forms";
import { InlineDateField, type InlineSaveOutcome } from "~/shared/inline-edit";

import { ownerCalendarIso } from "~/shared/datetime";

import { planTargets } from "./plan-targets";
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
  /**
   * Set or clear the DUE date (TASKS-03's deadline, distinct from the plan).
   * Optional so a host that genuinely cannot offer it renders the value as
   * read-only text rather than a control that would fail.
   */
  readonly onSetDue?: (dueDate: string | null) => Promise<InlineSaveOutcome>;
  /** Injectable "now" for the target dates (a fixed value keeps tests deterministic). */
  readonly now?: Date;
}

export function TaskPlanningSection({
  scheduledDate,
  dueDate,
  completed,
  onPlan,
  onClear,
  onSetDue,
  now,
}: TaskPlanningSectionProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The quick-plan target dates, resolved in the owner's calendar zone (client-side
  // Intl), so "Today"/"Tomorrow"/"Next week" match the pane-header day. Only used in
  // click handlers, never rendered, so there is no hydration text to mismatch.
  const targets = useMemo(
    () => planTargets(ownerCalendarIso(now ?? new Date())),
    [now],
  );

  /**
   * Adapt the plan callbacks to the shared inline-field contract. Clearing is a
   * real outcome (`null`), so it routes to `onClear` rather than posting an
   * empty date the server would have to interpret.
   */
  const saveScheduled = async (
    next: string | null,
  ): Promise<InlineSaveOutcome> => {
    const outcome = next === null ? await onClear() : await onPlan(next);
    return outcome.ok
      ? { ok: true }
      : {
          ok: false,
          message:
            outcome.fieldErrors?.["scheduledDate"] ??
            outcome.formError ??
            "That couldn’t be saved. Your change is still here — try again.",
        };
  };

  const run = async (mutate: () => Promise<PlanningActionOutcome>) => {
    setPending(true);
    setError(null);
    try {
      const outcome = await mutate();
      if (!outcome.ok) {
        setError(
          outcome.fieldErrors?.["scheduledDate"] ??
            outcome.formError ??
            "That couldn’t be saved.",
        );
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
          <dd>
            <InlineDateField
              label="Scheduled date"
              value={scheduledDate}
              onSave={saveScheduled}
              format={(iso) => formatCalendarDate(iso) ?? iso}
              emptyLabel="Not planned"
              // Planning applies to OPEN work: a completed task shows its plan
              // as plain text, with no tab stop and no hover container.
              readOnly={completed}
              data-testid="task-scheduled-edit"
            />
          </dd>
        </div>
        <div className="dh-task-planning__date">
          <dt>Due</dt>
          <dd>
            <InlineDateField
              label="Due date"
              value={dueDate}
              onSave={onSetDue ?? (async () => ({ ok: true }))}
              format={(iso) => formatCalendarDate(iso) ?? iso}
              emptyLabel="No due date"
              readOnly={completed || onSetDue === undefined}
              data-testid="task-due-edit"
            />
          </dd>
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
          </div>

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
