/**
 * HABITS-01 Habits kernel — the public surface.
 *
 * A Habit is a BEHAVIOUR the owner is practising, not a Task they must not
 * forget (ADR-102). Nothing in this kernel creates, reads or counts a Task, and
 * nothing in the Tasks kernel knows Habits exist.
 */

export {
  HABIT_ENTITY_TYPE,
  RESERVED_HABIT_ENTITY_TYPES,
  isReservedHabitEntityType,
  HABIT_CREATED,
  HABIT_UPDATED,
  HABIT_SCHEDULE_CHANGED,
  HABIT_ARCHIVED,
  HABIT_RESTORED,
  HABIT_ACTIVITY_TYPES,
  HABIT_SUPPORTS_GOAL,
  HABIT_BELONGS_TO_AREA,
  HABIT_LINK_TYPES,
} from "./habit-identifiers";

export {
  HabitError,
  HabitValidationError,
  HabitNotFoundError,
  HabitArchivedError,
  HabitConflictError,
  HabitStorageError,
  InvalidHabitCursorError,
  type HabitErrorCode,
  type HabitValidationField,
} from "./habit-errors";

export {
  HABIT_SCHEDULE_KINDS,
  HABIT_MAX_TIMES_PER_WEEK,
  currentScheduleVersion,
  habitDateRange,
  habitDaysBetween,
  habitFirstEffectiveDate,
  habitScheduleLabel,
  habitScheduleShortLabel,
  habitWeek,
  habitWeekdayIndex,
  habitWeekdayName,
  habitWeekdayOrder,
  habitWeekdayShortName,
  isHabitDate,
  isScheduledOn,
  scheduleVersionForDate,
  weekScheduleVersion,
  type HabitSchedule,
  type HabitScheduleKind,
  type HabitScheduleVersion,
} from "./habit-schedule";

export {
  HABIT_RECENT_WINDOW_DAYS,
  UNAVAILABLE_HABIT_PERIOD_CONSISTENCY,
  buildHabitHistory,
  evaluateHabitConsistency,
  evaluateHabitToday,
  evaluateHabitWeek,
  type HabitCalendarContext,
  type HabitConsistency,
  type HabitPeriodConsistency,
  type HabitFacts,
  type HabitHistoryDay,
  type HabitHistoryDayState,
  type HabitTodayKind,
  type HabitTodayState,
  type HabitWeekProgress,
} from "./habit-progress";

export {
  HABIT_NOTES_MAX_LENGTH,
  habitSchedulesEqual,
  normaliseHabitQuery,
  validateHabitCheckInDate,
  validateHabitDateWindow,
  validateHabitId,
  validateHabitLimit,
  validateHabitNotes,
  validateHabitSchedule,
  validateHabitStatus,
  validateHabitTitle,
} from "./habit-validation";

export {
  HABIT_CURSOR_VERSION,
  decodeHabitCursor,
  decodeHabitCursorForScope,
  encodeHabitCursor,
  habitCursorScopeMatches,
  type DecodedHabitCursor,
  type HabitCursorPosition,
  type HabitCursorScope,
} from "./habit-cursor";

export type {
  CreateHabitInput,
  GetHabitOptions,
  Habit,
  HabitChangeResult,
  HabitCheckInOutcome,
  HabitCheckInResult,
  HabitCompletion,
  HabitCompletionRangeInput,
  HabitLifecycleOutcome,
  HabitLifecycleResult,
  HabitLinkedRecord,
  HabitListItem,
  HabitListStatus,
  HabitPage,
  HabitScheduleChangeOutcome,
  HabitScheduleChangeResult,
  ListHabitsInput,
  UpdateHabitInput,
} from "./habit";

export type { HabitRepository } from "./habit-repository";
