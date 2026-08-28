/**
 * STEER-04 — the ONE way a surface names a next action.
 *
 * Today's "Continue working" cards and a Goal's record both answer the same
 * practical question — *"what can I actually do next?"* — from the same
 * kernel rule (`~/kernel/tasks/next-action`), so they say it in the same words,
 * open the same canonical Task record, and state the same honest absence.
 *
 * ── What it does, and what it deliberately does not ────────────────────────
 * It opens the shared Task Drawer (`task:<id>`, the DS-03 URL contract) and
 * MUTATES NOTHING. There is no checkbox here and no inline edit: the row is a
 * pointer at the canonical record, which is where a Task is worked. That keeps
 * this a presentation component with no domain authority, and it is why adding
 * a next action to a card costs the card no new state.
 *
 * ── The absence is a first-class state ─────────────────────────────────────
 * `task === null` renders REVIEW-02's established sentence, or nothing at all
 * when the surface is too small to spend a line on an absence. A next action is
 * never invented, and "there is nothing eligible" is never dressed up as
 * "nothing to do": a Project whose every open Task is blocked has plenty to do
 * and none of it now, which is exactly what the words say.
 *
 * ── Never colour alone ─────────────────────────────────────────────────────
 * The row is led by the WORD "Next", not by a tint. `AGENTS.md` §15.
 */

import { NO_NEXT_ACTION_TEXT } from "~/kernel/tasks";
import { DrawerTrigger } from "~/shared/drawer";

/** The bounded, JSON-safe next action a surface receives. */
export interface SerializedNextAction {
  readonly id: string;
  readonly title: string;
  /**
   * The Project the Task belongs to, when the surface is showing several
   * Projects at once (a Goal's record). `null` where the surface IS one
   * Project, because naming it again would be a label repeating its own page.
   */
  readonly projectId?: string | null;
  readonly projectTitle?: string | null;
}

export function NextActionLine({
  task,
  absence = "hide",
  label = "Next",
  className,
  "data-testid": testId = "next-action",
}: {
  readonly task: SerializedNextAction | null;
  /**
   * What to do when there is no eligible next action:
   *
   * - `hide` — render nothing. The right answer on a dense list where a row of
   *   absences would cost more than it says (Today's cards).
   * - `state` — say so, in REVIEW-02's words. The right answer on a record,
   *   where the owner asked about this one thing and deserves an answer.
   */
  readonly absence?: "hide" | "state";
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  if (task === null) {
    if (absence === "hide") return null;
    return (
      <p
        className={["dh-next-action", "dh-next-action--absent", className]
          .filter(Boolean)
          .join(" ")}
        data-testid={`${testId}-absent`}
      >
        {NO_NEXT_ACTION_TEXT}
      </p>
    );
  }
  return (
    <p
      className={["dh-next-action", className].filter(Boolean).join(" ")}
      data-testid={testId}
      data-next-action-id={task.id}
    >
      <span className="dh-next-action__label">{label}</span>
      <DrawerTrigger
        drawerKey={`task:${task.id}`}
        className="dh-next-action__open"
        /*
         * The accessible name says what opening it DOES and which Task it is —
         * "Next" alone would be four identical links on one screen. The
         * Project's name is included where the surface shows several Projects,
         * because there the Task's own title is not enough to place it.
         */
        aria-label={
          task.projectTitle
            ? `Open ${task.title} in ${task.projectTitle}`
            : `Open ${task.title}`
        }
      >
        {task.title}
      </DrawerTrigger>
      {task.projectTitle ? (
        <span className="dh-next-action__parent">{task.projectTitle}</span>
      ) : null}
    </p>
  );
}
