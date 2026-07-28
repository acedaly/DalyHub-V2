/**
 * PX-05 — the shared structural-relationship row.
 *
 * "Area · Home" / "Goal · Run a half-marathon" — the row that shows where a record
 * sits in the spine. Tasks and Projects each had their own byte-identical copy of
 * this (`TaskLinksTab`/`ProjectLinksTab`), each deriving the type label by
 * upper-casing the slug rather than reading the one identity map. It is now ONE
 * component: the glyph and the label both come from `ENTITY_IDENTITY`, and the
 * title is the shared `EntityLink`.
 *
 * The glyph lives on the row (its own icon column), so the link inside renders
 * without a second one — the documented `showIcon={false}` case.
 */

import { EntityIcon } from "./EntityIcon";
import { EntityLink } from "./EntityLink";
import { getEntityIdentity, isEntityType } from "./identity";

export interface EntityRelationshipRowProps {
  /** The related record's entity type slug (e.g. "area", "goal"). */
  readonly kind: string;
  readonly id: string;
  readonly title: string;
  /** Optional class on the `li`, for surface-specific rhythm only. */
  readonly className?: string;
}

export function EntityRelationshipRow({
  kind,
  id,
  title,
  className,
}: EntityRelationshipRowProps) {
  // The identity map is the source of the user-facing noun; an unrecognised kind
  // degrades to a capitalised slug rather than rendering nothing.
  const label =
    getEntityIdentity(kind)?.label ??
    kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <li
      className={["dh-entity-relationship", className]
        .filter(Boolean)
        .join(" ")}
    >
      {isEntityType(kind) ? <EntityIcon type={kind} /> : null}
      <span className="dh-entity-relationship__kind">{label}</span>
      {/* Opening a Project/Area/Goal navigates to its canonical record; a Task
       * opens the shared Drawer. Unsupported kinds stay plain text. */}
      <EntityLink
        type={kind}
        id={id}
        title={title}
        showIcon={false}
        className="dh-entity-relationship__title"
      />
    </li>
  );
}
