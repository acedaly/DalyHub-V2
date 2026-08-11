/**
 * TASKS-04 — Review Inbox, the focused Inbox triage surface.
 *
 * One unassigned Task at a time, with everything needed to decide about it and
 * nothing else: file it under a Project or Area, set its priority, dates, Time Sector,
 * commitment or repeat, complete it, or skip to the next one. Progress through the
 * current Inbox set is always visible, so triage has an end rather than a feeling.
 *
 * It is composed entirely from the shared frame — the PX-02 CollectionLayout for the
 * page chrome, the shared EmptyState for the finished state, and the ONE shared
 * `TaskQuickEditPanel` for the controls, the same panel a `/tasks` row opens. There is
 * no Review-only Task model and no Review-only mutation: every change posts to the
 * canonical task routes, so a Task triaged here is indistinguishable from one triaged
 * anywhere else.
 *
 * A Task LEAVES the queue as soon as it is no longer unassigned-and-active. That is
 * decided by the SERVER: after each mutation the loader is revalidated, and the queue
 * is the loader's Inbox page — never a client-side guess about whether the Task still
 * belongs there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { FormButton } from "~/shared/forms";
import { TaskQuickEditPanel } from "~/shared/task-record/TaskQuickEditPanel";

import type { TasksReviewData } from "./tasks-contract";

export function TasksReviewWorkspace({
  data,
}: {
  readonly data: TasksReviewData;
}) {
  const revalidator = useRevalidator();
  const completion = useFetcher();
  const [searchParams] = useSearchParams();
  const [index, setIndex] = useState(0);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const settled = useRef<unknown>(null);

  const items = data.items;
  const total = items.length;
  // The queue shrinks under us as Tasks are filed, so the cursor is clamped rather
  // than allowed to run off the end.
  const position = total === 0 ? 0 : Math.min(index, total - 1);
  const current = total === 0 ? null : items[position];

  useEffect(() => {
    if (index > 0 && index > total - 1) setIndex(Math.max(0, total - 1));
  }, [index, total]);

  // Focus lands on the queue heading whenever the reviewed Task changes, so a
  // keyboard or screen-reader user is never left focused on a control that has moved
  // to a different Task.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current?.id]);

  /**
   * Announce from the QUEUE, not from the control that changed it.
   *
   * A mutation inside the panel revalidates this loader, and a Task that is no longer
   * unassigned-and-active leaves the Inbox page — which replaces the keyed panel, and
   * with it whatever the panel was about to say. Watching the queue instead means the
   * announcement is the SERVER's answer by construction: the Task is gone from Inbox
   * because the server says it is, and that is exactly what the reviewer needs to hear.
   */
  const reviewing = useRef<{ id: string; title: string } | null>(null);
  useEffect(() => {
    const previous = reviewing.current;
    if (
      previous !== null &&
      previous.id !== current?.id &&
      !items.some((item) => item.id === previous.id)
    ) {
      setAnnouncement(`${previous.title} is filed and has left the Inbox.`);
    }
    reviewing.current = current
      ? { id: current.id, title: current.title }
      : null;
  }, [current?.id, current, items]);

  useEffect(() => {
    if (completion.state !== "idle" || !completion.data) return;
    if (settled.current === completion.data) return;
    settled.current = completion.data;
    setAnnouncement("Task completed.");
    revalidator.revalidate();
  }, [completion.state, completion.data, revalidator]);

  const skip = useCallback(() => {
    setIndex((value) => value + 1);
    setAnnouncement("Skipped to the next task.");
  }, []);

  const back = useCallback(() => {
    setIndex((value) => Math.max(0, value - 1));
  }, []);

  const complete = useCallback(() => {
    if (!current) return;
    const body = new FormData();
    body.set("intent", "complete");
    completion.submit(body, {
      method: "post",
      action: `/tasks/${current.id}`,
    });
  }, [completion, current]);

  // Keyboard workflow: `j`/`k` (or the arrow keys) walk the queue, `c` completes.
  // Never while the user is typing into a control.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        skip();
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        back();
      } else if (event.key === "c") {
        event.preventDefault();
        complete();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [back, complete, skip]);

  const backToTasks = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("cursor");
    next.set("system", "inbox");
    return `/tasks?${next.toString()}`;
  }, [searchParams]);

  const subtitle = data.failed
    ? "We couldn’t load your Inbox."
    : total === 0
      ? "Nothing to review."
      : `Task ${position + 1} of ${total}`;

  return (
    <CollectionLayout
      title="Review Inbox"
      subtitle={subtitle}
      primaryAction={
        <Link className="dh-btn dh-btn--secondary" to={backToTasks}>
          Back to Tasks
        </Link>
      }
    >
      <p className="dh-visually-hidden" role="status">
        {announcement ?? ""}
      </p>

      {data.failed ? (
        <EmptyState
          title="We couldn’t load your Inbox"
          description="Nothing was changed. Try again in a moment."
          primaryAction={
            <FormButton
              type="button"
              variant="secondary"
              onClick={() => revalidator.revalidate()}
            >
              Try again
            </FormButton>
          }
        />
      ) : current === null || current === undefined ? (
        <EmptyState
          title="Inbox is clear"
          description="Every captured task has a home. New captures land here for triage."
          primaryAction={
            <Link className="dh-btn dh-btn--primary" to="/tasks">
              Back to Tasks
            </Link>
          }
        />
      ) : (
        <div className="dh-task-review">
          <h2
            className="dh-task-review__progress"
            tabIndex={-1}
            ref={headingRef}
          >
            Reviewing task {position + 1} of {total}
          </h2>

          <TaskQuickEditPanel
            key={current.id}
            task={current}
            todayIso={data.todayIso}
            onChanged={(message) => {
              setAnnouncement(message);
              revalidator.revalidate();
            }}
            footer={
              <div className="dh-task-review__actions">
                <FormButton
                  type="button"
                  variant="primary"
                  disabled={completion.state !== "idle"}
                  onClick={complete}
                >
                  Complete
                </FormButton>
                <FormButton
                  type="button"
                  variant="secondary"
                  onClick={skip}
                  disabled={position >= total - 1 && data.nextCursor === null}
                >
                  Skip
                </FormButton>
                <FormButton
                  type="button"
                  variant="ghost"
                  onClick={back}
                  disabled={position === 0}
                >
                  Previous
                </FormButton>
                <Link
                  className="dh-btn dh-btn--ghost"
                  to={`/tasks?system=inbox&drawer=task:${current.id}`}
                >
                  Open record
                </Link>
              </div>
            }
          />

          {position >= total - 1 && data.nextCursor !== null ? (
            <p className="dh-task-review__more">
              <Link
                className="dh-btn dh-btn--secondary"
                to={`/tasks/review?cursor=${encodeURIComponent(data.nextCursor)}`}
              >
                Load the next {total === 1 ? "task" : "page"}
              </Link>
            </p>
          ) : null}
        </div>
      )}
    </CollectionLayout>
  );
}
