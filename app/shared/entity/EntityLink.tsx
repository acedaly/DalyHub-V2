/**
 * The ONE shared relationship link (deliverable 4).
 *
 * Renders a related record's name as an accessible navigation control when a genuine
 * destination exists (via the storage-independent {@link entityDestination} helper),
 * and degrades calmly to plain, non-interactive text when it does not (an
 * unsupported entity type, or a missing/blank id). It never exposes an internal id
 * in visible text.
 *
 *   - **Route destinations** (Area / Goal / Project / Note) → a React Router `Link`
 *     to the canonical record, so navigation is a normal SPA transition with correct
 *     Back/Forward.
 *   - **Task destinations** → the shared `DrawerTrigger`, opening the Task Drawer
 *     over the current record context (shareable href + in-app open) and restoring
 *     focus to this link on close (the DrawerProvider captures the opener).
 *   - **No destination** → a `span`, identical text, no broken link.
 *
 * The accessible name always carries the record TYPE plus the title (e.g.
 * "Project: Website relaunch"), so a screen-reader user hears what kind of record a
 * relationship points to. The visible content defaults to the title but can be
 * overridden via `children` (e.g. a "Goal: <title>" context label).
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { DrawerTrigger } from "~/shared/drawer";

import { EntityIcon } from "./EntityIcon";
import { entityDestination } from "./destination";
import { getEntityIdentity, isEntityType } from "./identity";

export interface EntityLinkProps {
  /** The related record's entity type slug (e.g. "goal", "task"). */
  readonly type: string;
  /** The related record's id (already resolved by a trusted loader). */
  readonly id: string;
  /** The related record's display title (the visible + accessible text). */
  readonly title: string;
  readonly className?: string;
  /** Visible content override; defaults to the plain title. */
  readonly children?: ReactNode;
  /**
   * PX-05 — the leading entity-identity glyph, **on by default**. Related-record
   * rows used to drift between iconned (a Links tab that hand-composed an
   * `EntityIcon`) and bare text (a record summary that didn't), so relationships
   * — "DalyHub's value is in the links" — looked inconsistent. The icon now lives
   * in the shared link, and call sites no longer compose their own. Pass `false`
   * only where the surrounding line already carries the entity's identity (an
   * inline sentence, a row whose own icon column shows the same type).
   */
  readonly showIcon?: boolean;
}

export function EntityLink({
  type,
  id,
  title,
  className,
  children,
  showIcon = true,
}: EntityLinkProps) {
  const destination = entityDestination(type, id);
  const identity = getEntityIdentity(type);
  const accessibleName = identity ? `${identity.label}: ${title}` : title;
  // The glyph is decorative: the accessible name above already says the type.
  const icon =
    showIcon && isEntityType(type) ? (
      <EntityIcon type={type} className="dh-entity-link__icon" />
    ) : null;
  const content = (
    <>
      {icon}
      <span className="dh-entity-link__label">{children ?? title}</span>
    </>
  );

  // No genuine destination → plain, non-interactive text (no link affordance).
  if (!destination) {
    return (
      <span
        className={["dh-entity-link__text", className]
          .filter(Boolean)
          .join(" ")}
      >
        {content}
      </span>
    );
  }

  // The `dh-entity-link` base class carries the shared link affordance (colour,
  // hover underline, visible focus ring) on top of any consumer className.
  const linkClassName = ["dh-entity-link", className].filter(Boolean).join(" ");

  if (destination.kind === "drawer") {
    return (
      <DrawerTrigger
        drawerKey={destination.drawerKey}
        className={linkClassName}
        aria-label={accessibleName}
      >
        {content}
      </DrawerTrigger>
    );
  }

  return (
    <Link
      className={linkClassName}
      to={destination.to}
      aria-label={accessibleName}
    >
      {content}
    </Link>
  );
}
