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

import type { AssetsTodayData } from "~/kernel/assets";

import type {
  AreaHealthItem,
  DiaryWidgetData,
  GoalsWidgetData,
  MeetingsWidgetData,
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

/**
 * POLISH-02 — "Open diary" moved OUT of this body and into the widget header,
 * where every list widget now carries its one destination. It used to sit at the
 * foot of the diary body while Notes, Areas and Goals had no equivalent at all,
 * which is the kind of inconsistency that makes a dashboard read as assembled
 * rather than designed.
 */
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
              {/* The review cue is a WORD in its own emphasised run, not a phrase
                  buried at the end of a sentence — so it is scannable down a
                  column and survives greyscale and a screen reader alike. */}
              {area.needsReview ? (
                <>
                  <span className="dh-today-signal dh-today-signal--quiet">
                    Worth a review
                  </span>
                  <span aria-hidden="true"> · </span>
                </>
              ) : null}
              <span>
                {area.goalTotal} {area.goalTotal === 1 ? "goal" : "goals"} ·{" "}
                {area.activeProjectCount} active
              </span>
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
              {/* Whether recent action matches the goal is the thing worth
                  scanning for, so it leads the line; the roll-up and the Area
                  follow it as supporting fact. */}
              <span
                className={
                  goal.atRisk
                    ? "dh-today-signal dh-today-signal--quiet"
                    : undefined
                }
              >
                {goal.alignmentLabel}
              </span>
              {goal.projectTotal > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {Math.round(
                      (goal.projectCompleted / goal.projectTotal) * 100,
                    )}
                    % complete
                  </span>
                </>
              ) : null}
              {goal.areaLabel ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span>{goal.areaLabel}</span>
                </>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Meetings (UX-01)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What is actually on today.
 *
 * Today answers "what should I do now?", and for most days part of that answer is
 * "you are in a meeting at 2". Meetings had shipped for weeks with no presence on
 * the landing page at all, so the owner had to open a second screen to find out
 * what their day already contained.
 *
 * A meeting whose start time has passed is labelled in WORDS ("Started"), never by
 * a colour or a dimmed row alone, so the distinction survives every theme and a
 * screen reader (§24).
 */
export function MeetingsWidget({
  data,
}: {
  readonly data: MeetingsWidgetData;
}) {
  if (data.meetings.length === 0) {
    return (
      <WidgetEmpty
        entityType="meeting"
        title="Nothing scheduled today"
        description="Meetings you plan will appear here on the day, in order."
        action={
          <Link className="dh-btn dh-btn--secondary" to="/meetings">
            Open Meetings
          </Link>
        }
      />
    );
  }
  return (
    <ol className="dh-schedule" aria-label="Today’s meetings">
      {data.meetings.map((meeting) => (
        <li
          key={meeting.id}
          className="dh-schedule__item"
          data-started={meeting.started ? "true" : undefined}
        >
          <Link
            className="dh-schedule__link"
            to={`/meeting/${encodeURIComponent(meeting.id)}`}
          >
            {/* The time is a fixed, tabular gutter with a rail beside it, so a
                day reads down the column as a sequence rather than as a list of
                sentences that happen to begin with a number. */}
            <span className="dh-schedule__time">{meeting.timeLabel}</span>
            <span className="dh-schedule__body">
              <span className="dh-schedule__title">{meeting.title}</span>
              {meeting.started || meeting.context ? (
                <span className="dh-schedule__meta">
                  {meeting.started ? (
                    <span className="dh-today-signal dh-today-signal--quiet">
                      Started
                    </span>
                  ) : null}
                  {meeting.started && meeting.context ? (
                    <span aria-hidden="true"> · </span>
                  ) : null}
                  {meeting.context ? <span>{meeting.context}</span> : null}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ol>
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

/* -------------------------------------------------------------------------- */
/* Assets (ASSET-02)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Maintenance and renewals that need the owner now.
 *
 * Deliberately NOT a list of every future obligation: the loader bounds it to a
 * 30-day horizon and five rows, and the shared deduplication rule has already
 * removed anything whose linked Task is carrying it in My Day. The suppressed
 * count is STATED in words rather than silently dropped, so nothing vanishes
 * without the owner being told (§8).
 *
 * Each row's urgency is a WORD ("Overdue", "Due soon", "Reading needed") beside
 * the sentence, never a colour on its own — so it survives all five themes,
 * greyscale and a screen reader alike (§24).
 */
export function AssetsWidget({ data }: { readonly data: AssetsTodayData }) {
  if (data.items.length === 0) {
    return (
      <WidgetEmpty
        entityType="asset"
        title={
          data.trackedAsTasksCount > 0
            ? "Nothing outstanding here"
            : "Nothing due soon"
        }
        description={
          data.trackedAsTasksCount > 0
            ? `${data.trackedAsTasksCount} asset ${data.trackedAsTasksCount === 1 ? "obligation is already tracked as a task" : "obligations are already tracked as tasks"} in My day.`
            : "Assets with a service interval, registration or warranty will remind you here when they are due."
        }
        action={
          <Link className="dh-btn dh-btn--secondary" to="/assets">
            Open Assets
          </Link>
        }
      />
    );
  }
  return (
    <>
      <ul className="dh-today-list" aria-label="Assets needing attention">
        {data.items.map((item) => (
          <li key={item.obligationId} className="dh-today-list__item">
            <Link
              className="dh-today-list__link dh-today-list__link--with-icon"
              to={item.href}
            >
              <span className="dh-today-list__icon" aria-hidden="true">
                <EntityIcon type="asset" />
              </span>
              <span className="dh-today-list__body">
                <span className="dh-today-list__title">{item.assetTitle}</span>
                <span className="dh-today-list__meta">
                  <span
                    className={`dh-today-signal dh-today-signal--${item.state}`}
                  >
                    {item.stateLabel}
                  </span>
                  <span aria-hidden="true"> · </span>
                  <span>{item.text}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {data.trackedAsTasksCount > 0 ? (
        <p className="dh-today-list__note">
          {data.trackedAsTasksCount === 1
            ? "1 more is tracked as a task in My day."
            : `${data.trackedAsTasksCount} more are tracked as tasks in My day.`}
        </p>
      ) : null}
    </>
  );
}
