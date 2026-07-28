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
  /** PROJ-05: an archived project is read-only — link/unlink is always rejected
   * server-side, so the picker's add/remove controls are HIDDEN, not disabled. */
  readonly archived?: boolean;
}

export function ProjectLinksTab({
  projectId,
  area,
  goal,
  links,
  searchTargets,
  onLink,
  onUnlink,
  archived = false,
}: ProjectLinksTabProps) {
  const relationships = [goal, area].filter(
    (relation): relation is ProjectRelation => relation !== null,
  );

  return (
    <div className="dh-record-stack">
      <h2 className="dh-visually-hidden">Key links</h2>
      <section aria-label="Relationships" className="dh-record-section">
        <h3 className="dh-record-section__label">Relationships</h3>
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
            This project isn’t linked to an Area or Goal.
          </p>
        )}
      </section>

      <section aria-label="Related records" className="dh-record-section">
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
          readOnly={archived}
          renderTargetIcon={(type) =>
            isEntityType(type) ? <EntityIcon type={type} /> : null
          }
        />
      </section>
    </div>
  );
}
