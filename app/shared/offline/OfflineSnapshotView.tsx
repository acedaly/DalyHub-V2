/**
 * PWA-04 — the offline snapshot, rendered.
 *
 * ── Honesty rules this component holds ───────────────────────────────────────
 *   - It states, at the top and unmissably, that this is a STORED SNAPSHOT and
 *     when it was last synchronised. It never presents cached data as live.
 *   - It says which identity and workspace the data belongs to, because on a
 *     shared browser profile the stored copy belongs to whoever last signed in.
 *   - It shows a stale warning when the copy is old enough to be misleading.
 *   - It says when a section was bounded, rather than implying completeness.
 *   - It renders NO control that would silently fail: there is no complete
 *     button, no edit, no delete and no link into a route that cannot load. The
 *     only actions are the ones that genuinely work offline.
 *   - Nothing is fabricated. A section with no stored records says so.
 *
 * Search, filter and sort operate entirely on the in-memory dataset, so they keep
 * working offline — the one interaction that is genuinely lossless here.
 */

import { useMemo, useState } from "react";

import { calendarDaysBetween, isSnapshotStale } from "~/kernel/offline";
import { EmptyState } from "~/shared/empty-state";

import { useOffline } from "./OfflineProvider";
import type { OfflineDataset } from "./offline-store";

/** Format an ISO instant as an owner-readable local date and time. */
function formatInstant(iso: string | null): string {
  if (!iso) return "never";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "an unknown time";
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

/** Case-insensitive substring match across the fields a card shows. */
function matches(
  haystack: readonly (string | null | undefined)[],
  needle: string,
) {
  if (needle.trim().length === 0) return true;
  const query = needle.trim().toLowerCase();
  return haystack.some((value) => (value ?? "").toLowerCase().includes(query));
}

export interface OfflineSnapshotViewProps {
  /** Render a specific dataset (the offline shell passes the stored one). */
  readonly dataset?: OfflineDataset;
  readonly className?: string;
}

export function OfflineSnapshotView({
  dataset: datasetOverride,
  className,
}: OfflineSnapshotViewProps) {
  const offline = useOffline();
  const [query, setQuery] = useState("");

  const dataset = datasetOverride ?? offline?.dataset;
  const meta = dataset?.meta ?? null;

  const filtered = useMemo(() => {
    if (!dataset) return null;
    return {
      tasks: dataset.tasks.filter((task) =>
        matches([task.title, task.parentLabel], query),
      ),
      notes: dataset.notes.filter((note) =>
        matches([note.title, note.excerpt, ...note.tags], query),
      ),
      diary: dataset.diary.filter((entry) =>
        matches([entry.title, entry.excerpt, entry.entryType], query),
      ),
      meetings: dataset.meetings.filter((meeting) =>
        matches([meeting.title, ...meeting.attendeeLabels], query),
      ),
    };
  }, [dataset, query]);

  if (!dataset || !meta || !filtered) {
    return (
      <EmptyState
        title="No offline copy on this device"
        description="DalyHub stores a seven-day snapshot after you have opened it online while signed in. Once you have, this page works without a connection."
      />
    );
  }

  const stale = isSnapshotStale(meta.lastSyncedAt, new Date());
  const openTasks = filtered.tasks.filter((task) => task.status === "open");
  const overdue = openTasks.filter(
    (task) =>
      (task.scheduledDate ?? task.dueDate) !== null &&
      (task.scheduledDate ?? task.dueDate)! < meta.window.todayIso,
  );
  const today = openTasks.filter(
    (task) => (task.scheduledDate ?? task.dueDate) === meta.window.todayIso,
  );
  const upcoming = openTasks.filter(
    (task) =>
      (task.scheduledDate ?? task.dueDate) !== null &&
      (task.scheduledDate ?? task.dueDate)! > meta.window.todayIso,
  );
  const completed = filtered.tasks.filter(
    (task) => task.status === "completed",
  );

  return (
    <div className={`dh-offline-snapshot${className ? ` ${className}` : ""}`}>
      <div className="dh-offline-snapshot__banner" role="note">
        <p className="dh-offline-snapshot__banner-title">
          Offline snapshot — stored on this device
        </p>
        <p className="dh-offline-snapshot__banner-body">
          Last synchronised {formatInstant(meta.lastSyncedAt)}. Covering{" "}
          {meta.window.startIso} to {meta.window.endIso} in{" "}
          {meta.window.timezone}. Signed in as {meta.identityLabel} ·{" "}
          {meta.workspaceLabel}.
        </p>
        {stale && (
          <p className="dh-offline-snapshot__banner-warning">
            This copy is{" "}
            {Math.max(
              1,
              Math.round(
                (Date.now() - Date.parse(meta.lastSyncedAt)) / 86_400_000,
              ),
            )}{" "}
            day(s) old, so “today” may have moved on since it was stored.
            Reconnect to refresh it.
          </p>
        )}
        {meta.bounded && (
          <p className="dh-offline-snapshot__banner-warning">
            Some sections were larger than the offline limit, so this snapshot
            is partial. Reconnect to see everything.
          </p>
        )}
        <p className="dh-offline-snapshot__banner-body">
          Creating, editing, completing and deleting records need a connection.
          You can still capture a new Inbox task, note or diary entry — it is
          queued on this device and synchronises when DalyHub is reachable.
        </p>
      </div>

      <div className="dh-offline-snapshot__search">
        <label htmlFor="dh-offline-search">Search this snapshot</label>
        <input
          id="dh-offline-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stored tasks, notes, diary and meetings"
          autoComplete="off"
        />
      </div>

      <Section
        title="Overdue"
        emptyText="Nothing overdue in this snapshot."
        count={overdue.length}
      >
        {overdue.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Section>
      <Section
        title="Today"
        emptyText="Nothing was planned for today when this snapshot was stored."
        count={today.length}
      >
        {today.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Section>
      <Section
        title="Next seven days"
        emptyText="Nothing planned in the coming week."
        count={upcoming.length}
      >
        {upcoming.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Section>
      <Section
        title="Meetings"
        emptyText="No meetings in this snapshot's window."
        count={filtered.meetings.length}
      >
        {filtered.meetings.map((meeting) => (
          <li key={meeting.id} className="dh-offline-row">
            <span className="dh-offline-row__title">{meeting.title}</span>
            <span className="dh-offline-row__meta">
              {formatInstant(meeting.startsAt)}
              {meeting.attendeeLabels.length > 0
                ? ` · ${meeting.attendeeLabels.join(", ")}`
                : ""}
            </span>
          </li>
        ))}
      </Section>
      <Section
        title="Recent notes"
        emptyText="No notes were created or changed in the last seven days."
        count={filtered.notes.length}
      >
        {filtered.notes.map((note) => (
          <li key={note.id} className="dh-offline-row">
            <span className="dh-offline-row__title">{note.title}</span>
            {note.excerpt && (
              <span className="dh-offline-row__body">
                {note.excerpt}
                {note.truncated ? "…" : ""}
              </span>
            )}
            <span className="dh-offline-row__meta">
              {note.tags.length > 0 ? `${note.tags.join(", ")} · ` : ""}
              Updated {formatInstant(note.updatedAt)}
              {note.truncated ? " · full note needs a connection" : ""}
            </span>
          </li>
        ))}
      </Section>
      <Section
        title="Recent diary"
        emptyText="No diary entries in this snapshot's window."
        count={filtered.diary.length}
      >
        {filtered.diary.map((entry) => (
          <li key={entry.id} className="dh-offline-row">
            <span className="dh-offline-row__title">{entry.title}</span>
            {entry.excerpt && (
              <span className="dh-offline-row__body">
                {entry.excerpt}
                {entry.truncated ? "…" : ""}
              </span>
            )}
            <span className="dh-offline-row__meta">
              {entry.entryType} · {formatInstant(entry.occurredAt)}
            </span>
          </li>
        ))}
      </Section>
      <Section
        title="Completed recently"
        emptyText="Nothing was completed in the last seven days."
        count={completed.length}
      >
        {completed.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </Section>

      <p className="dh-offline-snapshot__footnote">
        This snapshot holds {dataset.tasks.length} tasks, {dataset.notes.length}{" "}
        notes, {dataset.diary.length} diary entries and{" "}
        {dataset.meetings.length} meetings, covering{" "}
        {calendarDaysBetween(meta.window.startIso, meta.window.endIso) + 1}{" "}
        calendar days.
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  emptyText,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly emptyText: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="dh-offline-section">
      <h2 className="dh-offline-section__title">
        {title} <span className="dh-offline-section__count">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="dh-offline-section__empty">{emptyText}</p>
      ) : (
        <ul className="dh-offline-section__list">{children}</ul>
      )}
    </section>
  );
}

function TaskRow({ task }: { readonly task: OfflineDataset["tasks"][number] }) {
  const planned = task.scheduledDate ?? task.dueDate;
  return (
    <li className="dh-offline-row" data-status={task.status}>
      <span className="dh-offline-row__title">{task.title}</span>
      <span className="dh-offline-row__meta">
        {[
          task.parentLabel ?? "Inbox",
          planned ? `Planned ${planned}` : null,
          task.priority ? `Priority ${task.priority}` : null,
          task.waiting ? "Waiting" : null,
          task.status === "completed" ? "Completed" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </li>
  );
}
