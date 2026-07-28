/**
 * TODAY-02 — the task Drawer's Links tab.
 *
 * Two parts, both using accepted shared patterns:
 *   - Relationships: the task's REAL project / goal / area, resolved from the spine
 *     hierarchy (not copied labels), shown with their Entity Identity. Each title
 *     opens the related record (Project/Area/Goal → canonical record) via the shared
 *     `EntityLink`, degrading to plain text when no destination exists.
 *   - Related records: the DS-06 `EntityLinkPicker`, wired to the workspace-scoped
 *     link service through the Drawer's resource routes, so linking and unlinking
 *     respect workspace isolation (the server policy is authoritative).
 */

import {
  EntityIcon,
  EntityRelationshipRow,
  isEntityType,
} from "~/shared/entity";
import { EntityLinkPicker } from "~/shared/forms";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";

import { TASK_RELATES_TO, type SerializedTaskView } from "./task-view";

interface TaskLinksTabProps {
  readonly task: SerializedTaskView;
  readonly links: readonly EntityLinkSelection[];
  readonly searchTargets: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  readonly onLink: (params: {
    readonly target: EntityLinkTargetOption;
    readonly linkType: string;
    readonly direction: "outgoing" | "incoming";
  }) => Promise<void>;
  readonly onUnlink: (link: EntityLinkSelection) => Promise<void>;
}

export function TaskLinksTab({
  task,
  links,
  searchTargets,
  onLink,
  onUnlink,
}: TaskLinksTabProps) {
  const relationships = [task.area, task.goal, task.project].filter(
    (relation): relation is NonNullable<typeof relation> => relation !== null,
  );

  return (
    <div className="dh-record-stack">
      <section aria-label="Relationships" className="dh-record-section">
        <h4 className="dh-record-section__label">Relationships</h4>
        {relationships.length > 0 ? (
          <ul className="dh-entity-relationships">
            {relationships.map((relation) => (
              <EntityRelationshipRow
                key={`${relation.kind}:${relation.id}`}
                kind={relation.kind}
                id={relation.id}
                title={relation.title}
              />
            ))}
          </ul>
        ) : (
          <p className="dh-record-muted">
            This task isn’t linked to a project, goal or area yet.
          </p>
        )}
      </section>

      <section aria-label="Related records" className="dh-record-section">
        <EntityLinkPicker
          label="Related records"
          help="Link this task to other records in your workspace."
          anchorId={task.id}
          direction="outgoing"
          linkTypes={[{ type: TASK_RELATES_TO, label: "Related to" }]}
          existingLinks={links}
          searchTargets={searchTargets}
          onLink={onLink}
          onUnlink={onUnlink}
          renderTargetIcon={(type) =>
            isEntityType(type) ? <EntityIcon type={type} /> : null
          }
        />
      </section>
    </div>
  );
}
