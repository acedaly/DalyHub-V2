/**
 * HABITS-01 — the Habits product module manifest.
 *
 * Registers the `habit` entity type, the two structural links a Habit owns
 * (`habit.supports_goal` and `habit.belongs_to_area`, both directed
 * habit -> target) and the five Habit-owned Activity events.
 *
 * ── A Habit is not a Task, and this manifest is where that starts ───────────
 * There is no Task type here, no recurrence contribution and no link to a Task.
 * A Habit generates no Task, so a missed Habit cannot become an overdue Task,
 * cannot enter a Task statistic and cannot move a Project's progress —
 * structurally, because the Task it would have to become does not exist.
 *
 * ── A check-in is deliberately NOT an Activity type ─────────────────────────
 * A daily Habit produces hundreds of check-ins a year, each one bit wide.
 * Appending every one to the ONE shared Activity stream would drown the events
 * that genuinely are the owner's history. A Habit's own completion history is
 * its `habit_completions` rows, rendered in full on the record; the five events
 * below are the owner CHANGING the record, which is what Activity is for
 * (ADR-102 §7).
 */

import { defineModule } from "~/kernel/modules";
import {
  HABIT_ARCHIVED,
  HABIT_BELONGS_TO_AREA,
  HABIT_CREATED,
  HABIT_ENTITY_TYPE,
  HABIT_RESTORED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_SUPPORTS_GOAL,
  HABIT_UPDATED,
} from "~/kernel/habits";
import { AREA, GOAL } from "~/kernel/spine";

import routes from "./routes.manifest";
import { habitsCommands } from "./commands";
import { habitsSearchProvider } from "./search";

export default defineModule({
  id: "habits",
  name: "Habits",
  description: "Behaviours you are practising on a cadence.",
  order: 25,
  routes,
  entityTypes: [
    { type: HABIT_ENTITY_TYPE, singular: "Habit", plural: "Habits" },
  ],
  searchProviders: [habitsSearchProvider],
  commands: habitsCommands,
  entityLinkTypes: [
    {
      type: HABIT_SUPPORTS_GOAL,
      sourceLabel: "supports goal",
      targetLabel: "supported by habit",
      sourceEntityType: HABIT_ENTITY_TYPE,
      targetEntityType: GOAL,
    },
    {
      type: HABIT_BELONGS_TO_AREA,
      sourceLabel: "belongs to area",
      targetLabel: "has habit",
      sourceEntityType: HABIT_ENTITY_TYPE,
      targetEntityType: AREA,
    },
  ],
  activityTypes: [
    {
      type: HABIT_CREATED,
      label: "Habit created",
      description: "A habit was created.",
    },
    {
      type: HABIT_UPDATED,
      label: "Habit updated",
      description: "A habit’s name, notes or context changed.",
    },
    {
      type: HABIT_SCHEDULE_CHANGED,
      label: "Habit schedule changed",
      description:
        "A habit’s cadence changed from today. Earlier days keep the schedule they had.",
    },
    {
      type: HABIT_ARCHIVED,
      label: "Habit archived",
      description: "A habit was put away. Its history is kept.",
    },
    {
      type: HABIT_RESTORED,
      label: "Habit restored",
      description: "An archived habit was made active again.",
    },
  ],
});
