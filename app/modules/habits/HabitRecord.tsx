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

import { HabitActivityTab } from "./HabitActivityTab";
import { HabitHistoryStrip } from "./HabitHistoryStrip";
import { HabitScheduleForm } from "./HabitScheduleForm";
import type { HabitMutationResult } from "./routes/mutate";

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
              <div className="dh-habit-summary" data-testid="habit-summary">
                {/*
                  TODAY, first — the only thing on this page that is an action.
                  A single control, worded, with the week's factual line beside
                  it. There is no streak, no percentage and no celebration: the
                  reward for checking something off is that it is checked off.
                */}
                <section className="dh-habit-summary__today">
                  <h2 className="dh-habit-summary__heading">Today</h2>
                  {habit.archived ? (
                    <p className="dh-habit-summary__quiet">
                      This habit is archived, so it isn’t expected today. Its
                      history below is unchanged.
                    </p>
                  ) : (
                    <div className="dh-habit-summary__check">
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
                      <p className="dh-habit-summary__state">
                        {done ? "Done today" : habit.today.label}
                        {habit.week.label === null
                          ? null
                          : ` · ${habit.week.label}`}
                      </p>
                    </div>
                  )}
                </section>

                {habit.notes === null ? null : (
                  <section className="dh-habit-summary__notes">
                    <h2 className="dh-habit-summary__heading">Notes</h2>
                    <p>{habit.notes}</p>
                  </section>
                )}

                <section className="dh-habit-summary__history">
                  <h2 className="dh-habit-summary__heading">Recently</h2>
                  <p className="dh-habit-summary__consistency">
                    {habit.consistency.label ??
                      "Nothing was expected in the last four weeks."}
                  </p>
                  <HabitHistoryStrip
                    days={habit.history}
                    firstDayOfWeek={firstDayOfWeek}
                    summary={habit.consistency.label}
                  />
                </section>

                {habit.scheduleHistory.length <= 1 ? null : (
                  <section className="dh-habit-summary__versions">
                    <h2 className="dh-habit-summary__heading">
                      Schedule history
                    </h2>
                    <p className="dh-habit-summary__quiet">
                      Each period kept its own schedule, so the figures above
                      describe what was actually asked for at the time.
                    </p>
                    <ul className="dh-habit-versions">
                      {habit.scheduleHistory.map((version) => (
                        <li key={version.id}>
                          <span className="dh-habit-versions__label">
                            {version.label}
                          </span>
                          <span className="dh-habit-versions__range">
                            {version.fromIso} → {version.toIso ?? "now"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <p
                  className="dh-visually-hidden"
                  role="status"
                  aria-live="polite"
                >
                  {checkIn.announcement ?? ""}
                </p>
              </div>
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
