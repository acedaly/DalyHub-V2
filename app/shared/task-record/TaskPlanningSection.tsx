/**
 * TODAY-04 — the Task Drawer's Planning section.
 *
 * A focused, shared-primitive composition (NOT a new form framework) shown in the
 * DS-02 Record Layout Summary, beside completion and waiting. It presents the
 * task's plan — its Scheduled (committed) date and its Due date, kept clearly
 * distinct — and offers calm quick actions to plan the task: Today, Tomorrow,
 * Next week and Clear.
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
 * ── What the de-duplication does and does NOT remove ────────────────────────
 * "Custom date…" is gone. It was a disclosure that opened a SECOND date picker
 * for a value that is now itself a date picker — the textbook duplicate §7 asks
 * us to remove once direct manipulation lands.
 *
 * **Clear stays.** An earlier revision of this change removed it too, on the
 * grounds that the inline field's popover carries its own Clear. That reasoning
 * was wrong, and `command-palette.spec.ts` caught it. The quick actions are one
 * family — Today / Tomorrow / Next week / Clear are four one-press answers to
 * "what is the plan?", and Clear is the "no plan" member of that set, not a
 * duplicate of the picker. Removing it turned a routine one-press action into
 * open-popover-then-press, which is exactly the "do not make routine task
 * editing slower" rule (§13) that Tasks are singled out for. The popover's Clear
 * serves the arbitrary-date path; this one serves the fast path. They are the
 * same relationship "Today" already has with the picker.
 */

import { useMemo, useState } from "react";

import { FormButton } from "~/shared/forms";
import { InlineDateField, type InlineSaveOutcome } from "~/shared/inline-edit";

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
  /**
   * AUDIT-14 — the OWNER's calendar day (`YYYY-MM-DD`), resolved SERVER-side from
   * their stored timezone and handed down. It used to be derived here from the
   * browser's clock through a helper that defaulted to `Australia/Sydney`, so
   * "Today" in this control could name a different date from the one the same
   * record's urgency chip had just rendered.
   */
  readonly todayIso: string;
}

export function TaskPlanningSection({
  scheduledDate,
  dueDate,
  completed,
  onPlan,
  onClear,
  onSetDue,
  todayIso,
}: TaskPlanningSectionProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The quick-plan target dates, derived from the server-resolved owner day, so
  // "Today"/"Tomorrow"/"Next week" match the day this record is displaying.
  const targets = useMemo(() => planTargets(todayIso), [todayIso]);

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
            {/* The "no plan" member of the quick-action family. Shown only when
                there IS a plan to clear, exactly as the inline field's own Clear
                command is. */}
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
