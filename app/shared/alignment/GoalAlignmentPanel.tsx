/**
 * AREA-03 Alignment — the detailed alignment region for the Goal record
 * (ADR-040 §40.7).
 *
 * Integrated into the DS-02 Record Layout Summary, this EXPLAINS a Goal's
 * alignment rather than repeating a coloured badge: the primary state, every
 * current reason (primary first), and up to a handful of real contributing
 * Tasks — direct navigation to the Task and its Project, never a raw
 * Activity payload. Mirrors `ProjectHealthPanel` exactly.
 */

import type { GoalAlignment } from "~/kernel/alignment";

import {
  alignmentReasonText,
  evidenceDateLabel,
  type SerializedGoalAlignmentEvidence,
} from "./alignment-view";

interface GoalAlignmentPanelProps {
  readonly alignment: GoalAlignment;
  readonly evidence: readonly SerializedGoalAlignmentEvidence[];
  readonly evidenceHasMore: boolean;
  readonly todayIso: string;
  /** Heading id, so the Summary region can label the panel. */
  readonly headingId?: string;
  readonly onOpenTask: (taskId: string) => void;
}

export function GoalAlignmentPanel({
  alignment,
  evidence,
  evidenceHasMore,
  todayIso,
  headingId,
  onOpenTask,
}: GoalAlignmentPanelProps) {
  return (
    <section
      className="dh-alignment-panel"
      aria-labelledby={headingId}
      data-state={alignment.state}
    >
      <div className="dh-alignment-panel__header">
        <span className="dh-alignment__pill" data-tone={alignment.tone}>
          <span className="dh-alignment__dot" aria-hidden="true" />
          {alignment.label}
        </span>
      </div>

      <ul className="dh-alignment-panel__reasons">
        {alignment.reasons.map((reason) => (
          <li
            key={reason.code}
            className="dh-alignment-panel__reason"
            data-tone={reason.tone}
          >
            {alignmentReasonText(reason)}
          </li>
        ))}
      </ul>

      {evidence.length > 0 ? (
        <div className="dh-alignment-panel__evidence">
          <h3 className="dh-alignment-panel__evidence-heading">
            Recent contributing Tasks
          </h3>
          <ul className="dh-alignment-panel__evidence-list">
            {evidence.map((item) => (
              <li
                key={item.taskId}
                className="dh-alignment-panel__evidence-item"
              >
                <button
                  type="button"
                  className="dh-alignment-panel__evidence-task"
                  onClick={() => onOpenTask(item.taskId)}
                >
                  {item.taskTitle}
                </button>
                <span className="dh-alignment-panel__evidence-context">
                  <a
                    className="dh-alignment-panel__evidence-project"
                    href={`/projects/${encodeURIComponent(item.projectId)}`}
                  >
                    {item.projectTitle}
                  </a>
                  {" · "}
                  <span className="dh-alignment-panel__evidence-date">
                    {evidenceDateLabel(item.occurredAt, todayIso)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {evidenceHasMore ? (
            <p className="dh-alignment-panel__evidence-note" role="note">
              More contributing Tasks exist. This panel shows the most recent
              ones.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
