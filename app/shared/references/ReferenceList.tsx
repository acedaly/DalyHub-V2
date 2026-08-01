/**
 * NOTES-02 — the shared REFERENCE LIST: the one way DalyHub renders "who points
 * at this record" and "what does this record point at".
 *
 * Presentation only. It receives already-resolved, already-authorised references
 * from a trusted server loader and renders each as a compact, accessible row:
 * the counterpart's identity glyph and type label, its title as the shared
 * navigable `EntityLink`, the relationship name, an optional bounded context
 * line, and when the link was made. Icons are never the only carrier of meaning
 * — every row states its type and its relationship in words.
 *
 * Grouping by counterpart type is opt-in (`groupByType`), because a Note's
 * Backlinks read better as one chronological list while its Outgoing links read
 * better grouped by what they point at.
 */

import {
  EntityIcon,
  EntityLink,
  getEntityIdentity,
  isEntityType,
} from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";

import {
  groupReferencesByFamily,
  groupReferencesByType,
  type RecordReference,
} from "./references-model";

export interface ReferenceListProps {
  readonly references: readonly RecordReference[];
  /** Group rows by the counterpart's entity type. Defaults to `false`. */
  readonly groupByType?: boolean;
  /**
   * NOTES-05 §6 — group rows by MODULE FAMILY (Notes; Projects, Areas and Goals;
   * People and Meetings; …) instead of by raw entity type. This is what the
   * Backlinks surface uses: fifty backlinks over eight types produce eight
   * one-row groups by type, which is a table of contents rather than an aid.
   * Ignored when `groupByType` is set.
   */
  readonly groupByFamily?: boolean;
  /** Heading level for group headings, so the page hierarchy stays logical. */
  readonly groupHeadingLevel?: 3 | 4 | 5;
  /** Rendered when there are no references. */
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  /** Accessible name for the list itself (e.g. "Records linking to this note"). */
  readonly label: string;
}

function typeLabel(type: string): string {
  return getEntityIdentity(type)?.label ?? type;
}

function pluralLabel(type: string): string {
  return getEntityIdentity(type)?.pluralLabel ?? `${type}s`;
}

function linkedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ReferenceRow({ reference }: { readonly reference: RecordReference }) {
  const { record } = reference;
  const date = linkedDate(reference.linkedAt);
  return (
    <li className="dh-reference">
      <span className="dh-reference__icon" aria-hidden="true">
        {isEntityType(record.type) ? <EntityIcon type={record.type} /> : null}
      </span>
      <span className="dh-reference__body">
        <span className="dh-reference__title">
          <EntityLink
            type={record.type}
            id={record.id}
            title={record.title}
            showIcon={false}
          />
          {record.archived ? (
            <span className="dh-reference__state">Archived</span>
          ) : null}
        </span>
        <span className="dh-reference__meta">
          <span className="dh-reference__kind">{typeLabel(record.type)}</span>
          <span aria-hidden="true">·</span>
          <span className="dh-reference__relationship">
            {reference.relationshipLabel}
          </span>
          {date ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="dh-reference__date">Linked {date}</span>
            </>
          ) : null}
        </span>
        {reference.context ? (
          <span className="dh-reference__context">{reference.context}</span>
        ) : null}
      </span>
    </li>
  );
}

export function ReferenceList({
  references,
  groupByType = false,
  groupByFamily = false,
  groupHeadingLevel = 4,
  emptyTitle,
  emptyDescription,
  label,
}: ReferenceListProps) {
  if (references.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        headingLevel={3}
        size="compact"
      />
    );
  }

  if (groupByFamily && !groupByType) {
    const FamilyHeading = `h${groupHeadingLevel}` as "h4";
    return (
      <div className="dh-reference-groups">
        {groupReferencesByFamily(references).map((group) => (
          <section key={group.id} className="dh-reference-group">
            <FamilyHeading className="dh-reference-group__heading">
              {group.label}
              <span className="dh-reference-group__count">
                {" "}
                ({group.items.length})
              </span>
            </FamilyHeading>
            <ul
              className="dh-reference-list"
              aria-label={`${label}: ${group.label}`}
            >
              {group.items.map((reference) => (
                <ReferenceRow key={reference.linkId} reference={reference} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  if (!groupByType) {
    return (
      <ul className="dh-reference-list" aria-label={label}>
        {references.map((reference) => (
          <ReferenceRow key={reference.linkId} reference={reference} />
        ))}
      </ul>
    );
  }

  const Heading = `h${groupHeadingLevel}` as "h4";
  return (
    <div className="dh-reference-groups">
      {groupReferencesByType(references).map((group) => (
        <section key={group.type} className="dh-reference-group">
          <Heading className="dh-reference-group__heading">
            {pluralLabel(group.type)}
            <span className="dh-reference-group__count">
              {" "}
              ({group.items.length})
            </span>
          </Heading>
          <ul
            className="dh-reference-list"
            aria-label={`${label}: ${pluralLabel(group.type)}`}
          >
            {group.items.map((reference) => (
              <ReferenceRow key={reference.linkId} reference={reference} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
