/**
 * DS-05 — the ONE shared event item. Both the Timeline and the Activity Feed render
 * every event through this single component; there is no separate Timeline/Feed
 * item. It renders the calm, dense event line from the presentation view-model:
 * actor + action description (with entity links), a semantic `<time>`, an entity
 * marker, and restrained safe metadata. It never dumps raw payload JSON and never
 * conveys meaning by colour alone (every event has a text description and a time).
 */

import { memo, type ReactNode } from "react";

import { isEntityType, EntityIcon } from "~/shared/entity";
import { DrawerTrigger } from "~/shared/drawer";

import type {
  ActivityDateFormatter,
  ActivityDescriptionSegment,
  ActivityItem,
  ActivityItemSubject,
  ResolvedEntity,
} from "./types";

/** How an entity reference is turned into a link (defaults to the DS-03 Drawer). */
export type RenderEntityLink = (
  entity: ResolvedEntity,
  label: string,
) => ReactNode;

export interface ActivityEventItemProps {
  readonly item: ActivityItem;
  readonly formatter: ActivityDateFormatter;
  readonly posInSet?: number;
  readonly setSize?: number;
  /** Override entity-link rendering; by default resolved entities open the Drawer. */
  readonly renderEntityLink?: RenderEntityLink;
}

const UNRESOLVED_LABEL = "an unavailable item";

function subjectMap(
  subjects: readonly ActivityItemSubject[],
): Map<string, ActivityItemSubject> {
  const map = new Map<string, ActivityItemSubject>();
  for (const subject of subjects) {
    if (!map.has(subject.entityId)) {
      map.set(subject.entityId, subject);
    }
  }
  return map;
}

/** Plain-text form of a segment, for the article's accessible name. */
function segmentText(
  segment: ActivityDescriptionSegment,
  actorLabel: string,
  subjects: Map<string, ActivityItemSubject>,
): string {
  switch (segment.kind) {
    case "actor":
      return actorLabel;
    case "text":
      return segment.text;
    case "emphasis":
      return segment.text;
    case "entity": {
      const entity = subjects.get(segment.entityId)?.entity ?? null;
      return entity ? entity.label : UNRESOLVED_LABEL;
    }
  }
}

function DefaultEntityLink({
  entity,
  label,
}: {
  entity: ResolvedEntity;
  label: string;
}): ReactNode {
  if (!entity.drawerKey) {
    return <span className="dh-activity-item__entity">{label}</span>;
  }
  return (
    <DrawerTrigger
      drawerKey={entity.drawerKey}
      className="dh-activity-item__entity dh-activity-item__entity--link"
    >
      {label}
    </DrawerTrigger>
  );
}

export const ActivityEventItem = memo(function ActivityEventItem({
  item,
  formatter,
  posInSet,
  setSize,
  renderEntityLink,
}: ActivityEventItemProps): ReactNode {
  const subjects = subjectMap(item.subjects);
  const { presentation } = item;
  const tone = presentation.tone ?? "neutral";

  const renderSegment = (
    segment: ActivityDescriptionSegment,
    index: number,
  ): ReactNode => {
    switch (segment.kind) {
      case "actor":
        return (
          <span key={index} className="dh-activity-item__actor">
            {item.actor.label}
          </span>
        );
      case "text":
        return <span key={index}>{segment.text}</span>;
      case "emphasis":
        return (
          <strong key={index} className="dh-activity-item__emphasis">
            {segment.text}
          </strong>
        );
      case "entity": {
        const entity = subjects.get(segment.entityId)?.entity ?? null;
        if (!entity) {
          return (
            <span
              key={index}
              className="dh-activity-item__entity dh-activity-item__entity--unresolved"
            >
              {UNRESOLVED_LABEL}
            </span>
          );
        }
        return (
          <span key={index}>
            {renderEntityLink ? (
              renderEntityLink(entity, entity.label)
            ) : (
              <DefaultEntityLink entity={entity} label={entity.label} />
            )}
          </span>
        );
      }
    }
  };

  const accessibleName = `${presentation.segments
    .map((segment) => segmentText(segment, item.actor.label, subjects))
    .join("")} — ${formatter.formatAbsolute(item.occurredAt)}`;

  const markerType =
    presentation.entityType && isEntityType(presentation.entityType)
      ? presentation.entityType
      : null;

  return (
    <article
      className="dh-activity-item"
      data-tone={tone}
      data-known={item.isKnownType ? "true" : "false"}
      aria-label={accessibleName}
      {...(posInSet !== undefined && setSize !== undefined
        ? { "aria-posinset": posInSet, "aria-setsize": setSize }
        : {})}
    >
      <span className="dh-activity-item__marker" aria-hidden="true">
        {markerType ? (
          <EntityIcon type={markerType} variant="badge" />
        ) : (
          <span className="dh-activity-item__dot" data-tone={tone} />
        )}
      </span>
      <div className="dh-activity-item__body">
        <p className="dh-activity-item__description">
          {presentation.segments.map(renderSegment)}
        </p>
        {presentation.metadata && presentation.metadata.length > 0 ? (
          <dl className="dh-activity-item__meta">
            {presentation.metadata.map((entry) => (
              <div key={entry.id} className="dh-activity-item__meta-entry">
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <time
        className="dh-activity-item__time"
        dateTime={formatter.toDateTimeAttr(item.occurredAt)}
        title={formatter.formatAbsolute(item.occurredAt)}
      >
        {formatter.formatTimeOfDay(item.occurredAt)}
      </time>
      {!item.isKnownType ? (
        <span className="dh-activity-item__unknown">Unrecognised event</span>
      ) : null}
    </article>
  );
});
