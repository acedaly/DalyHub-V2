/**
 * DS-05 — the record → presentation-item mapper (React-free).
 *
 * `toActivityItem` is the single boundary that turns a stored FND-05
 * `ActivityRecord` into a renderable `ActivityItem`. It:
 *   - preserves the branded `ActivityType`, the open actor/subject strings, the
 *     UTC `occurredAt` and the validated `payload` unchanged (no `any`, no
 *     down-branding);
 *   - resolves each subject's entity identity through the caller's batch resolver
 *     (so the UI never fetches per item — no N+1);
 *   - selects a primary subject deterministically (anchor first);
 *   - applies the matching descriptor, or a conservative generic fallback for an
 *     unknown/newly-registered type that never crashes and never dumps raw JSON.
 */

import type {
  ActivityActor,
  ActivityRecord,
  ActivitySubject,
} from "~/kernel/activity";

import {
  buildFallbackPresentation,
  resolveActivityDescriptor,
} from "./activity-type-registry";
import type {
  ActivityBaseItem,
  ActivityDescriptorContext,
  ActivityItem,
  ActivityItemActor,
  ActivityItemPresentation,
  ActivityItemSubject,
  ActivityMapOptions,
  ResolvedEntity,
} from "./types";

/** A conservative default actor label when the caller supplies no resolver. */
function defaultActorLabel(actor: ActivityActor): string {
  switch (actor.type) {
    case "system":
      return "System";
    case "user":
      return "Someone";
    case "ai":
      return "Assistant";
    case "import":
      return "Import";
    case "integration":
      return "Integration";
    default: {
      const t = actor.type.trim();
      if (t.length === 0) {
        return "Someone";
      }
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
  }
}

function mapSubject(
  subject: ActivitySubject,
  anchorEntityId: string | undefined,
  resolveEntity: ((entityId: string) => ResolvedEntity | null) | undefined,
): ActivityItemSubject {
  return {
    entityId: subject.entityId,
    role: subject.role,
    isAnchor:
      anchorEntityId !== undefined && subject.entityId === anchorEntityId,
    entity: resolveEntity ? (resolveEntity(subject.entityId) ?? null) : null,
  };
}

/**
 * Deterministic primary-subject selection: the anchor entity (Timeline) wins;
 * then a `subject`-role association, then a `source`, then the first subject.
 */
function selectPrimarySubject(
  subjects: readonly ActivityItemSubject[],
): ActivityItemSubject | null {
  if (subjects.length === 0) {
    return null;
  }
  return (
    subjects.find((s) => s.isAnchor) ??
    subjects.find((s) => s.role === "subject") ??
    subjects.find((s) => s.role === "source") ??
    subjects[0]
  );
}

/**
 * Map one kernel `ActivityRecord` to a renderable `ActivityItem`. Pure and total:
 * it never throws on an unfamiliar type or payload.
 */
export function toActivityItem(
  record: ActivityRecord,
  options: ActivityMapOptions = {},
): ActivityItem {
  const actor: ActivityItemActor = {
    type: record.actor.type,
    id: record.actor.id,
    label: (options.resolveActorLabel ?? defaultActorLabel)(record.actor),
  };

  const subjects: readonly ActivityItemSubject[] = record.subjects.map(
    (subject) =>
      mapSubject(subject, options.anchorEntityId, options.resolveEntity),
  );
  const primarySubject = selectPrimarySubject(subjects);

  const base: ActivityBaseItem = {
    id: record.id,
    type: record.type,
    occurredAt: record.occurredAt,
    actor,
    subjects,
    primarySubject,
    payload: record.payload,
  };

  const context: ActivityDescriptorContext = {
    actorLabel: actor.label,
    primarySubject,
    subjects,
    subjectByRole: (role) => subjects.find((s) => s.role === role) ?? null,
  };

  const { descriptor, isKnown } = resolveActivityDescriptor(
    options.descriptors,
    record.type,
  );

  let presentation: ActivityItemPresentation;
  if (descriptor?.describe) {
    presentation = descriptor.describe(base, context);
  } else if (descriptor) {
    // A registered type with a label but no custom renderer: a calm default line.
    presentation = {
      segments: [
        { kind: "actor" },
        { kind: "text", text: " · " },
        { kind: "emphasis", text: descriptor.label },
        ...(primarySubject
          ? ([
              { kind: "text", text: " — " },
              { kind: "entity", entityId: primarySubject.entityId },
            ] as const)
          : []),
      ],
      tone: descriptor.tone,
      entityType: descriptor.entityType ?? primarySubject?.entity?.entityType,
    };
  } else {
    presentation = buildFallbackPresentation(base, context);
  }

  return { ...base, isKnownType: isKnown, presentation };
}

/** Map a batch of records, preserving order. */
export function toActivityItems(
  records: readonly ActivityRecord[],
  options: ActivityMapOptions = {},
): ActivityItem[] {
  return records.map((record) => toActivityItem(record, options));
}
