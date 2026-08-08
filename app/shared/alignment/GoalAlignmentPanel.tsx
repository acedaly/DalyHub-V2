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
      {/*
        RECORD-01 — the state pill and the reason list are NOT rendered here.

        The Goal record now states them once, in its compact summary band: the
        pill as the band's state chip beside the contribution meter it explains,
        and the reasons as the band's signal line. This panel keeps the half the
        band cannot carry — the EVIDENCE, the actual recent Tasks that did or
        did not contribute — which is the part an owner clicks into.

        On a 320px phone the old arrangement (a heading, a pill on its own row,
        then a bulleted list) put the Goal's Projects tab 1022px down the page.
      */}
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
