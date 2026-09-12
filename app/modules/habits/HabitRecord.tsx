/**
 * HABITS-01 — the canonical Habit record, composed through the shared DS-02
 * Record Layout.
 *
 * It answers the four questions a Habit record exists to answer, in this order:
 *
 *   What am I trying to do?      the title, and the notes under it
 *   How often?                   the cadence, in words, in the header
 *   What does it support?        the Area and the Goal, in the header context
 *   How have I been going?       today, this week, and four weeks of history
 *
 * Presentation and client-side mutation plumbing only: data loading lives in the
 * route, and every write posts to `/habits/:id/mutate` or to the ONE check-in
 * endpoint. Nothing here computes progress — the loader hands it the same
 * serialised reading `/habits` and Today receive.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { useHabitCheckIn } from "~/shared/habits";
import type { SerializedHabitRecord } from "~/shared/habits";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { LinkedItemsTab } from "~/shared/linked-items";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import {
  lifecycleSuccessMessage,
  useRecordLifecycle,
} from "~/shared/record-lifecycle";

import { PeriodicAdherence } from "~/shared/charts";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

import { HabitActivityTab } from "./HabitActivityTab";
import { HabitHistoryStrip } from "./HabitHistoryStrip";
import { HabitScheduleForm } from "./HabitScheduleForm";
import type { HabitMutationResult } from "./routes/mutate";

/**
 * Untitled's bounded card boundary — `TableCard.Root`'s own declaration, and the
 * same one every migrated record panel in the product carries.
 */
const RECORD_CARD = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary";

export interface HabitRecordProps {
  readonly habit: SerializedHabitRecord;
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly onSaved: () => void;
}

export function HabitRecord({
  habit,
  todayIso,
  firstDayOfWeek,
  activeTabId,
  onTabChange,
  onSaved,
}: HabitRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const checkIn = useHabitCheckIn();
  const [pending, setPending] = useState(false);

  const post = useCallback(
    async (intent: string): Promise<HabitMutationResult> => {
      const body = new FormData();
      body.set("intent", intent);
      const response = await fetch(
        `/habits/${encodeURIComponent(habit.id)}/mutate`,
        { method: "POST", body },
      );
      return (await response.json()) as HabitMutationResult;
    },
    [habit.id],
  );

  const onRename = useCallback(
    async (title: string): Promise<InlineSaveOutcome> => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", title);
      let result: HabitMutationResult;
      try {
        const response = await fetch(
          `/habits/${encodeURIComponent(habit.id)}/mutate`,
          { method: "POST", body },
        );
        result = (await response.json()) as HabitMutationResult;
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Your text is safe — try again.",
        };
      }
      if (result.kind === "rename" && result.ok) {
        onSaved();
        return { ok: true };
      }
      return {
        ok: false,
        message:
          (result.kind === "rename" && !result.ok
            ? (result.fieldErrors?.title ?? result.formError)
            : undefined) ??
          "That couldn’t be saved. Your text is safe — try again.",
      };
    },
    [habit.id, onSaved],
  );

  const lifecycleAction = useCallback(
    async (intent: "archive" | "restore") => {
      setPending(true);
      await post(intent)
        .then((result) => {
          if (result.kind === intent && result.ok) {
            feedback.notifySuccess(lifecycleSuccessMessage(intent, "habit"));
            onSaved();
          } else {
            feedback.notifyError(`Couldn’t ${intent} this habit. Try again.`);
          }
        })
        .catch(() =>
          feedback.notifyError(`Couldn’t ${intent} this habit. Try again.`),
        )
        .finally(() => setPending(false));
    },
    [post, feedback, onSaved],
  );

  const onDelete = useCallback(async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/habits");
      return;
    }
    throw new Error("Couldn’t delete this habit.");
  }, [post, navigate]);

  const lifecycle = useRecordLifecycle({
    entityType: "habit",
    title: habit.title,
    archived: habit.archived,
    onArchive: () => lifecycleAction("archive"),
    onRestore: () => lifecycleAction("restore"),
    onDelete,
    pending,
    notifyOnSuccess: false,
  });

  /*
   * The context line: the cadence, then where the behaviour belongs.
   *
   * The Goal is labelled "Supports" rather than shown as progress, because a
   * Habit is EVIDENCE of the behaviour behind a Goal and never a term in its
   * arithmetic. Drawing it as a contribution would state something untrue.
   */
  const metadata: RecordMetaItem[] = [
    { id: "schedule", label: "How often", value: habit.scheduleLabel },
  ];
  if (habit.area !== null) {
    metadata.push({
      id: "area",
      label: "Area",
      value: (
        <a href={`/areas/${encodeURIComponent(habit.area.id)}`}>
          {habit.area.title}
        </a>
      ),
    });
  }
  if (habit.goal !== null) {
    metadata.push({
      id: "goal",
      label: "Supports",
      value: (
        <a href={`/goals/${encodeURIComponent(habit.goal.id)}`}>
          {habit.goal.title}
        </a>
      ),
    });
  }

  const done = checkIn.patches.get(habit.id)?.done ?? habit.today.done;

  return (
    <>
      <RecordLayout
        title={habit.title}
        titleSlot={
          <InlineTextField
            label="Habit name"
            value={habit.title}
            onSave={onRename}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="habit-title-edit"
          />
        }
        icon={<EntityIcon type="habit" />}
        breadcrumb={[{ id: "habits", label: "Habits", href: "/habits" }]}
        status={
          habit.archived ? { label: "Archived", tone: "warning" } : undefined
        }
        metadata={metadata}
        overflowActions={lifecycle.overflowActions}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "summary",
            label: "Summary",
            content: (
              <HabitSummaryTab
                habit={habit}
                todayIso={todayIso}
                firstDayOfWeek={firstDayOfWeek}
                checkIn={checkIn}
                done={done}
              />
            ),
          },
          {
            id: "schedule",
            label: "Schedule",
            content: (
              <HabitScheduleForm
                habit={habit}
                firstDayOfWeek={firstDayOfWeek}
                onSaved={onSaved}
              />
            ),
          },
          {
            id: "linked",
            label: "Linked",
            content: (
              <LinkedItemsTab
                anchorId={habit.id}
                anchorType="habit"
                readOnly={habit.archived}
                linkCommandTarget={{
                  kind: "route",
                  to: `/habits/${habit.id}?tab=linked`,
                }}
              />
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <HabitActivityTab
                habitId={habit.id}
                reloadKey={habit.updatedAt}
              />
            ),
          },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The Summary tab                                                            */
/* -------------------------------------------------------------------------- */

/**
 * UNTITLED-09 — what the record actually says about a behaviour.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 *
 * Four small-caps headings stacked down the left of a panel — TODAY, NOTES,
 * RECENTLY, SCHEDULE HISTORY — and under RECENTLY a four-week grid of SOLID
 * SQUARES. Its own source file insisted "it is NOT a GitHub contribution
 * heatmap"; on a habit kept for a month it is a block of twenty-eight filled
 * purple squares, which is precisely what a contribution heatmap looks like and
 * exactly the gamification HABITS-01 forbids. And for all that ink it could not
 * answer the question a person asks about a behaviour they are trying to keep:
 * *is this getting better or worse?*
 *
 * ── The three questions, in order, in Untitled's grammar ────────────────────
 *
 *   1. **Did I do it today?** — a standing band of three figures (today, this
 *      week, the recent window), the same divided in-card band the Goal record
 *      and the Habits collection use, with the ONE check control beside it.
 *   2. **Is it holding up?** — twelve weeks of adherence, drawn with the shared
 *      Untitled chart foundation (`PeriodicAdherence`). Bars made of COUNTS, not
 *      of a ratio: full height is what the week asked for, the solid part is
 *      what happened.
 *   3. **Which days am I missing?** — the four-week grid, kept, because that is
 *      a question the chart genuinely cannot answer. It is drawn as DOTS at the
 *      week strip's weight rather than as filled squares, so it reads as a
 *      pattern rather than as a score.
 *
 * Notes and schedule history follow, as the working content they are.
 */
function HabitSummaryTab({
  habit,
  todayIso,
  firstDayOfWeek,
  checkIn,
  done,
}: {
  readonly habit: SerializedHabitRecord;
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  readonly checkIn: ReturnType<typeof useHabitCheckIn>;
  readonly done: boolean;
}) {
  const adherence = habit.adherence.filter((week) => week.expected > 0);
  const adherenceTotals = adherence.reduce(
    (total, week) => ({
      expected: total.expected + week.expected,
      completed: total.completed + week.completed,
    }),
    { expected: 0, completed: 0 },
  );

  return (
    <div
      className="dh-habit-summary flex min-w-0 flex-col gap-5"
      data-testid="habit-summary"
    >
      {/*
       * The standing band. Today first and with the only control on the page,
       * because it is the only thing here that is an ACTION — the rest is a
       * reading. There is no streak, no percentage of a lifetime and no
       * celebration: the reward for checking something off is that it is
       * checked off.
       */}
      <section
        className={`${RECORD_CARD} flex min-w-0 flex-col`}
        aria-label="Current state"
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          {habit.archived ? (
            <p className="m-0 text-sm text-tertiary">
              This habit is archived, so it isn’t expected today. Its history
              below is unchanged.
            </p>
          ) : (
            <>
              <label className="dh-check-circle-target">
                <input
                  type="checkbox"
                  className="dh-check-circle"
                  checked={done}
                  disabled={!habit.today.checkable && !done}
                  data-testid="habit-record-check"
                  aria-label={
                    done
                      ? `Undo today’s check-in for ${habit.title}`
                      : `Check in ${habit.title} for today`
                  }
                  onChange={(event) =>
                    checkIn.setChecked({
                      habitId: habit.id,
                      title: habit.title,
                      dateIso: todayIso,
                      checked: event.currentTarget.checked,
                    })
                  }
                />
              </label>
              <p className="m-0 text-base font-medium text-primary">
                {done ? "Done today" : habit.today.label}
              </p>
            </>
          )}
        </div>
        {/*
         * `divide-y` as well as `divide-x`, because at phone width the third
         * figure WRAPS onto a second row rather than being dropped — see the
         * note on "Kept since" below.
         */}
        <dl className="m-0 grid grid-cols-2 divide-x divide-y divide-secondary border-t border-secondary sm:grid-cols-3 sm:divide-y-0">
          <RecordFigure
            label="This week"
            value={
              habit.week.expected === 0
                ? "—"
                : `${habit.week.completed} of ${habit.week.expected}`
            }
            supporting={
              habit.week.expected === 0
                ? "Nothing expected this week"
                : "Expected check-ins completed"
            }
          />
          <RecordFigure
            label="Last four weeks"
            value={
              habit.consistency.expected === 0
                ? "—"
                : `${habit.consistency.completed} of ${habit.consistency.expected}`
            }
            supporting={
              habit.consistency.label ??
              "Nothing expected in the last four weeks"
            }
          />
          {/*
           * NOT the cadence: the record header already states it, as the one
           * editable control for it. Printing "3x weekly" a second line below
           * "How often 3x a week" is the stat duplication UNTITLED-07 removed
           * from the Goal record. How long the behaviour has been kept is a fact
           * nothing else on the page carries.
           *
           * Which is exactly why it is no longer `max-sm:hidden`. That dropped
           * it from the phone ENTIRELY — out of the accessibility tree as well
           * as off the screen — and this comment's own argument is that nothing
           * else says it. It spans the row instead: two figures above, this one
           * beneath them, and the fact survives the width.
           */}
          <RecordFigure
            className="max-sm:col-span-2"
            label="Kept since"
            value={formatCalendarDate(habit.createdAt.slice(0, 10)) ?? "—"}
            supporting={
              habit.scheduleHistory.length > 1
                ? `${habit.scheduleHistory.length} schedules since then`
                : "On this schedule throughout"
            }
          />
        </dl>
      </section>

      {/*
       * Up to twelve weeks — as many as the Habit has actually existed for —
       * and only when there are at least two with an expectation in them. One
       * period is a figure the band already prints, and a chart of it would be
       * a bar on its own claiming to be a trend.
       */}
      {adherence.length < 2 ? null : (
        <section
          className={`${RECORD_CARD} flex min-w-0 flex-col gap-3 px-4 py-4`}
          aria-labelledby="habit-consistency"
        >
          <SectionHeading
            id="habit-consistency"
            level={2}
            title="Consistency"
            /*
             * It said "Twelve weeks." flatly, and a Habit started six weeks ago
             * drew six bars under that sentence with its own caption saying
             * "across 6 weeks" — the heading and the chart disagreeing about
             * the same data. Twelve is the BOUND, not a promise; the caption
             * under the plot states the window the reading actually covers.
             */
            description="Each bar is what the week asked for; the solid part is what happened."
          />
          <PeriodicAdherence
            data-testid="habit-adherence-chart"
            periods={adherence.map((week) => ({
              key: week.startIso,
              /*
               * Day and month only. `formatCalendarDate` appends the year,
               * which on twelve consecutive weeks is the same four digits
               * twelve times — and it is what pushed the axis over its tick
               * budget, so Recharts dropped every other label.
               */
              label: (formatCalendarDate(week.startIso) ?? week.startIso)
                .split(" ")
                .slice(0, 2)
                .join(" "),
              expected: week.expected,
              completed: week.completed,
            }))}
            periodLabel="Week of"
            summary={`Weekly check-ins over ${adherence.length} weeks: ${adherenceTotals.completed} completed of ${adherenceTotals.expected} expected. ${adherence
              .map(
                (week) =>
                  `Week of ${formatCalendarDate(week.startIso) ?? week.startIso}: ${week.completed} of ${week.expected}`,
              )
              .join("; ")}.`}
            caption={`${adherenceTotals.completed} of ${adherenceTotals.expected} expected check-ins across ${adherence.length} weeks.`}
          />
        </section>
      )}

      <section
        className={`${RECORD_CARD} flex min-w-0 flex-col gap-3 px-4 py-4`}
        aria-labelledby="habit-recent-days"
      >
        <SectionHeading
          id="habit-recent-days"
          level={2}
          title="Recent days"
          description="The last four weeks, one dot per day — for the pattern the totals cannot show."
        />
        <HabitHistoryStrip
          days={habit.history}
          firstDayOfWeek={firstDayOfWeek}
          summary={habit.consistency.label}
        />
      </section>

      {habit.notes === null ? null : (
        <section
          className={`${RECORD_CARD} flex min-w-0 flex-col gap-2 px-4 py-4`}
          aria-labelledby="habit-notes"
        >
          <SectionHeading id="habit-notes" level={2} title="Notes" />
          <p className="m-0 text-sm text-secondary">{habit.notes}</p>
        </section>
      )}

      {habit.scheduleHistory.length <= 1 ? null : (
        <section
          className={`${RECORD_CARD} flex min-w-0 flex-col`}
          aria-labelledby="habit-schedule-history"
        >
          <div className="px-4 pt-4 pb-3">
            <SectionHeading
              id="habit-schedule-history"
              level={2}
              title="Schedule history"
              description="Each period kept its own schedule, so the figures above describe what was actually asked for at the time."
            />
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-secondary border-t border-secondary p-0">
            {habit.scheduleHistory.map((version) => (
              <li
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
                key={version.id}
              >
                <span className="text-sm text-primary">{version.label}</span>
                <span className="text-xs text-tertiary tabular-nums">
                  {version.fromIso} → {version.toIso ?? "now"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {checkIn.announcement ?? ""}
      </p>
    </div>
  );
}

/** One figure in the record's standing band. */
function RecordFigure({
  label,
  value,
  supporting,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly supporting: string;
  readonly className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-0.5 px-4 py-3 ${className ?? ""}`}
    >
      <dt className="text-xs font-semibold text-quaternary">{label}</dt>
      <dd className="m-0 truncate text-lg font-semibold text-primary tabular-nums">
        {value}
      </dd>
      <dd className="m-0 text-xs text-tertiary">{supporting}</dd>
    </div>
  );
}
