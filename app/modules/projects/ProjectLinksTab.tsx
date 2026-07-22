/**
 * PROJ-01 — the project overview's Key links tab.
 *
 * The project's important relationships, using the existing structural hierarchy and
 * EntityLinks:
 *   - Relationships: the project's REAL Area and (when it advances one) Goal, resolved
 *     from the spine hierarchy — not copied labels — shown with their Entity Identity.
 *   - Related records: the DS-06 `EntityLinkPicker`, wired to the workspace-scoped
 *     link service through the project's resource routes (`project.relates_to`), so
 *     linking/unlinking respect workspace isolation (the server policy is
 *     authoritative). No project-specific link table.
 */

import { EntityIcon, isEntityType } from "~/shared/entity";
import { EntityLinkPicker } from "~/shared/forms";
import type {
  EntityLinkSelection,
  EntityLinkTargetOption,
} from "~/shared/forms/model";
import type { ProjectRelation } from "~/kernel/projects";

import { PROJECT_RELATES_TO } from "./project-links";

interface ProjectLinksTabProps {
  readonly projectId: string;
  readonly area: ProjectRelation | null;
  readonly goal: ProjectRelation | null;
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

function RelationshipRow({
  kind,
  title,
}: {
  readonly kind: string;
  readonly title: string;
}) {
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return (
    <li className="dh-task-drawer__relationship">
      {isEntityType(kind) ? <EntityIcon type={kind} /> : null}
      <span className="dh-task-drawer__relationship-kind">{label}</span>
      <span className="dh-task-drawer__relationship-title">{title}</span>
    </li>
  );
}

export function ProjectLinksTab({
  projectId,
  area,
  goal,
  links,
  searchTargets,
  onLink,
  onUnlink,
}: ProjectLinksTabProps) {
  const relationships = [goal, area].filter(
    (relation): relation is ProjectRelation => relation !== null,
  );

  return (
    <div className="dh-task-drawer__links">
      <section aria-label="Relationships" className="dh-task-drawer__section">
        <h3 className="dh-task-drawer__section-label">Relationships</h3>
        {relationships.length > 0 ? (
          <ul className="dh-task-drawer__relationships">
            {relationships.map((relation) => (
              <RelationshipRow
                key={`${relation.kind}:${relation.id}`}
                kind={relation.kind}
                title={relation.title}
              />
            ))}
          </ul>
        ) : (
          <p className="dh-task-drawer__muted">
            This project isn&rsquo;t linked to an Area or Goal.
          </p>
        )}
      </section>

      <section aria-label="Related records" className="dh-task-drawer__section">
        <EntityLinkPicker
          label="Related records"
          help="Link this project to other records in your workspace."
          anchorId={projectId}
          direction="outgoing"
          linkTypes={[{ type: PROJECT_RELATES_TO, label: "Related to" }]}
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
