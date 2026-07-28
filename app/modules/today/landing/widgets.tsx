/**
 * TODAY-08 — the calm list widgets for the Today command centre.
 *
 * Each component renders only the BODY of its widget (the `TodayWidget` chrome owns
 * the `h2` heading, count and collapse). They compose plain, accessible lists of
 * links to canonical records over the REAL loader data, in the established Today
 * rhythm — no new visual language, no charts, no colour-only state. Sensitive body
 * text (note bodies, diary bodies) is never surfaced here; only titles and calm
 * metadata cross the boundary.
 */

import { Link } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, type EntityType } from "~/shared/entity";

import type {
  AreaHealthItem,
  DiaryWidgetData,
  GoalsWidgetData,
  RecentNoteItem,
} from "./types";
import type { InsightSignal } from "./insights";

/**
 * PX-06 — every widget's empty state is the SHARED `EmptyState` (compact), not a
 * bare paragraph. Today was the last surface in the product still rendering its
 * own, so a quiet dashboard read as unfinished rather than calm. Each one now
 * carries the entity glyph, a heading and the next action, exactly like every
 * other module's empty state.
 */
function WidgetEmpty({
  entityType,
  title,
  description,
  action,
}: {
  readonly entityType: EntityType;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <EmptyState
      size="compact"
      headingLevel={3}
      icon={<EntityIcon type={entityType} />}
      title={title}
      description={description}
      primaryAction={action}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export function NotesWidget({
  notes,
}: {
  readonly notes: readonly RecentNoteItem[];
}) {
  if (notes.length === 0) {
    return (
      <WidgetEmpty
        entityType="note"
        title="No Notes yet"
        description="Notes hold what you know and think — references, drafts, research, ideas."
        action={
          <Link className="dh-btn dh-btn--secondary" to="/notes/new">
            New Note
          </Link>
        }
      />
    );
  }
  return (
    <ul className="dh-today-list" aria-label="Recent notes">
      {notes.map((note) => (
        <li key={note.id} className="dh-today-list__item">
          <Link
            className="dh-today-list__link"
            to={`/notes/${encodeURIComponent(note.id)}`}
          >
            <span className="dh-today-list__title">{note.title}</span>
            <span className="dh-today-list__meta">{note.createdLabel}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Diary                                                                      */
/* -------------------------------------------------------------------------- */

export function DiaryWidget({ data }: { readonly data: DiaryWidgetData }) {
  const hasAny = data.today.length > 0 || data.recent.length > 0;
  if (!hasAny) {
    return (
      <WidgetEmpty
        entityType="diary"
        title="No moments captured yet"
        description="Your diary is where you note what actually happened — a meeting, a decision, an idea."
        action={
          <Link className="dh-btn dh-btn--secondary" to="/diary">
            Open Diary
          </Link>
        }
      />
    );
  }
  return (
    <div className="dh-diary-widget">
      {!data.capturedToday ? (
        <p className="dh-diary-widget__nudge">
          Nothing in your diary today yet. <Link to="/diary">Add a moment</Link>
          .
        </p>
      ) : null}
      {data.today.length > 0 ? (
        <div className="dh-diary-widget__group">
          <p className="dh-diary-widget__group-label">Today</p>
          <DiaryList label="Today’s diary moments" items={data.today} />
        </div>
      ) : null}
      {data.recent.length > 0 ? (
        <div className="dh-diary-widget__group">
          <p className="dh-diary-widget__group-label">Recent</p>
          <DiaryList label="Recent diary moments" items={data.recent} />
        </div>
      ) : null}
      <Link className="dh-today-list__all" to="/diary">
        Open diary
      </Link>
    </div>
  );
}

function DiaryList({
  label,
  items,
}: {
  readonly label: string;
  readonly items: DiaryWidgetData["today"];
}) {
  return (
    <ul className="dh-today-list" aria-label={label}>
      {items.map((moment) => (
        <li key={moment.id} className="dh-today-list__item">
          <Link
            className="dh-today-list__link"
            to={`/diary/${encodeURIComponent(moment.id)}`}
          >
            <span className="dh-today-list__title">{moment.title}</span>
            <span className="dh-today-list__meta">
              {moment.typeLabel} · {moment.timeLabel}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Areas                                                                      */
/* -------------------------------------------------------------------------- */

export function AreasWidget({
  areas,
}: {
  readonly areas: readonly AreaHealthItem[];
}) {
  if (areas.length === 0) {
    return (
      <WidgetEmpty
        entityType="area"
        title="No Areas yet"
        description="Areas are the ongoing domains of your life — Health, Career, Home, Finance."
        action={
          <Link className="dh-btn dh-btn--secondary" to="/areas">
            Browse Areas
          </Link>
        }
      />
    );
  }
  return (
    <ul className="dh-today-list" aria-label="Area health summary">
      {areas.map((area) => (
        <li key={area.id} className="dh-today-list__item">
          <Link
            className="dh-today-list__link"
            to={`/areas/${encodeURIComponent(area.id)}`}
          >
            <span className="dh-today-list__title">{area.title}</span>
            <span className="dh-today-list__meta">
              {area.goalTotal} {area.goalTotal === 1 ? "goal" : "goals"} ·{" "}
              {area.activeProjectCount} active
              {area.needsReview ? " · quiet — worth a review" : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

export function GoalsWidget({ data }: { readonly data: GoalsWidgetData }) {
  if (data.goals.length === 0) {
    return (
      <WidgetEmpty
        entityType="goal"
        title="No Goals yet"
        description="Goals give your Projects a direction and a definition of done."
        action={
          <Link className="dh-btn dh-btn--secondary" to="/goals">
            Browse Goals
          </Link>
        }
      />
    );
  }
  return (
    <ul className="dh-today-list" aria-label="Goals in progress">
      {data.goals.map((goal) => (
        <li key={goal.id} className="dh-today-list__item">
          <Link
            className="dh-today-list__link"
            to={`/goals/${encodeURIComponent(goal.id)}`}
          >
            <span className="dh-today-list__title">{goal.title}</span>
            <span className="dh-today-list__meta">
              {goal.areaLabel ? `${goal.areaLabel} · ` : ""}
              {goal.alignmentLabel}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Focus (placeholder)                                                        */
/* -------------------------------------------------------------------------- */

export function FocusWidget() {
  return (
    <div className="dh-focus-widget">
      <p className="dh-focus-widget__lead">
        A calm place to start a focus session — coming soon.
      </p>
      <ul className="dh-focus-widget__list">
        <li>Focus mode to mute the rest of DalyHub</li>
        <li>Deep-work sessions tied to a task</li>
        <li>A Pomodoro timer for timeboxed work</li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

export function InsightsWidget({
  signals,
}: {
  readonly signals: readonly InsightSignal[];
}) {
  if (signals.length === 0) {
    return (
      <WidgetEmpty
        entityType="task"
        title="Nothing needs your attention"
        description="A calm day. Insights appear here when something slips, stalls or comes due."
      />
    );
  }
  return (
    <ul className="dh-insights" aria-label="Insights">
      {signals.map((signal) => {
        const body = (
          <>
            <span className="dh-insights__count">{signal.count}</span>
            <span className="dh-insights__label">{signal.label}</span>
          </>
        );
        return (
          <li
            key={signal.id}
            className="dh-insights__item"
            data-tone={signal.tone}
          >
            {signal.href ? (
              <Link className="dh-insights__link" to={signal.href}>
                {body}
              </Link>
            ) : (
              <span className="dh-insights__static">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
