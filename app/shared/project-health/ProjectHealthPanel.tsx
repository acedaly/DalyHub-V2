/**
 * PROJ-02 Project Health — the detailed health region for the project record.
 *
 * Integrated into the DS-02 Record Layout Summary, this EXPLAINS a project's health
 * rather than repeating a coloured badge: the primary state, every current reason
 * (primary first, no duplicates), and the supporting facts the reasons stand on —
 * progress, last meaningful activity, blockers, overdue/slipped work and upcoming
 * commitments. A calm, on-track project still gets a clear, reassuring statement.
 * All meaning is text + tone (never colour alone); nothing here re-derives health.
 */

import { formatCalendarDate } from "~/shared/task-record/task-view";
import type { ProjectHealth } from "~/kernel/project-health";

import { healthReasonText } from "./health-view";

interface ProjectHealthPanelProps {
  readonly health: ProjectHealth;
  /** Heading id, so the Summary region can label the panel. */
  readonly headingId?: string;
}

function factItems(health: ProjectHealth): { label: string; value: string }[] {
  const s = health.summary;
  const items: { label: string; value: string }[] = [];

  items.push({
    label: "Progress",
    value:
      s.progressPercent === null
        ? "No tasks yet"
        : `${s.progressPercent}% — ${s.taskCompleted} of ${s.taskTotal} complete`,
  });

  items.push({
    label: "Last activity",
    value: s.lastActivityDate
      ? (formatCalendarDate(s.lastActivityDate) ?? "—")
      : "No recorded activity",
  });

  if (s.waitingOpen > 0) {
    const longest =
      s.longestWaitingDays !== null && s.longestWaitingDays > 0
        ? `, longest ${s.longestWaitingDays} ${s.longestWaitingDays === 1 ? "day" : "days"}`
        : "";
    items.push({
      label: "Waiting",
      value: `${s.waitingOpen} of ${s.openTotal} open${longest}`,
    });
  }
  if (s.overdueOpen > 0) {
    items.push({
      label: "Overdue",
      value: `${s.overdueOpen} ${s.overdueOpen === 1 ? "task" : "tasks"} past due`,
    });
  }
  if (s.slippedOpen > 0) {
    items.push({
      label: "Slipped",
      value: `${s.slippedOpen} planned ${s.slippedOpen === 1 ? "task" : "tasks"} past date`,
    });
  }
  if (s.upcomingDueOpen > 0) {
    items.push({
      label: "Due soon",
      value: `${s.upcomingDueOpen} ${s.upcomingDueOpen === 1 ? "task" : "tasks"}`,
    });
  }
  if (s.upcomingScheduledOpen > 0) {
    items.push({
      label: "Scheduled soon",
      value: `${s.upcomingScheduledOpen} ${s.upcomingScheduledOpen === 1 ? "task" : "tasks"}`,
    });
  }
  return items;
}

export function ProjectHealthPanel({
  health,
  headingId,
}: ProjectHealthPanelProps) {
  const facts = factItems(health);

  return (
    <section
      className="dh-health-panel"
      aria-labelledby={headingId}
      data-state={health.state}
    >
      <div className="dh-health-panel__header">
        <span className="dh-health__pill" data-tone={health.tone}>
          <span className="dh-health__dot" aria-hidden="true" />
          {health.label}
        </span>
      </div>

      <ul className="dh-health-panel__reasons">
        {health.reasons.map((reason) => (
          <li
            key={reason.code}
            className="dh-health-panel__reason"
            data-tone={reason.tone}
          >
            {healthReasonText(reason)}
          </li>
        ))}
      </ul>

      <dl className="dh-health-panel__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="dh-health-panel__fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
