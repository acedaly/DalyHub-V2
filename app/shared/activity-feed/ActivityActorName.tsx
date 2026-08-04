/**
 * IDENT-01 / DS-05 — the ONE shared actor presentation.
 *
 * Every surface that renders "who did this" — the workspace Activity Feed, every
 * record Timeline, Diary, People, the compact Today widget, mobile — renders the
 * actor through this component, so the avatar treatment, the accessible name and
 * the calm handling of `System` / `Unknown user` are identical everywhere.
 *
 * It renders ONLY what is safe: the resolved display name and its initials. The
 * actor id (a Cloudflare Access subject) is deliberately not passed in and never
 * appears in the DOM (AGENTS.md §17). The initials chip is `aria-hidden` because
 * it is a duplicate of the adjacent name, not extra information.
 */

import { memo, type ReactNode } from "react";

import type { ActivityItemActor } from "./types";

export interface ActivityActorNameProps {
  readonly actor: ActivityItemActor;
  /**
   * Show the initials chip. Compact surfaces (a dense one-line widget) turn it
   * off; the name is always rendered either way.
   */
  readonly showAvatar?: boolean;
}

export const ActivityActorName = memo(function ActivityActorName({
  actor,
  showAvatar = true,
}: ActivityActorNameProps): ReactNode {
  // A non-person actor (System, an importer) has no initials by design — a
  // letter chip would read as a person who is not one.
  const avatar = showAvatar && actor.initials.length > 0;
  return (
    <span className="dh-activity-actor" data-actor-kind={actor.kind}>
      {avatar ? (
        <span className="dh-activity-actor__avatar" aria-hidden="true">
          {actor.initials}
        </span>
      ) : null}
      <span className="dh-activity-item__actor">{actor.label}</span>
    </span>
  );
});
