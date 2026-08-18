/**
 * HABITS-01 — the shared Habit presentation surface.
 *
 * The row, the check-in authority and the serialised shape they both speak.
 * A module that shows a Habit composes these; it never draws its own row and
 * never posts its own check-in.
 */

export { HabitRow, type HabitRowProps } from "./HabitRow";
export { HabitList, type HabitListProps } from "./HabitList";
export { HabitWeekStrip, type HabitWeekStripProps } from "./HabitWeekStrip";
export {
  SupportingHabits,
  type SupportingHabitsProps,
} from "./SupportingHabits";
export {
  useHabitCheckIn,
  type HabitCheckInController,
  type HabitCheckPatch,
} from "./use-habit-check-in";
export {
  habitConsistencyLabel,
  habitConsistencyPercent,
  habitDueToday,
  habitFactsFor,
  habitHistoryDayLabel,
  habitOpenToday,
  habitWeekLabel,
  serializeHabit,
  serializeHabitRecord,
  type SerializedHabit,
  type SerializeHabitOptions,
  type SerializedHabitConsistency,
  type SerializedHabitContext,
  type SerializedHabitHistoryDay,
  type SerializedHabitRecord,
  type SerializedHabitToday,
  type SerializedHabitWeek,
} from "./habit-view";
