/**
 * DS-05 — activity-type descriptors, the conservative unknown-type fallback, and
 * the safe payload summariser (React-free).
 *
 * A descriptor is the ONLY place a specific event type gets a specialised
 * rendering. There is deliberately NO large product switch statement over Tasks,
 * Projects, Goals, Areas, People, Notes or Diary — modules register descriptors for
 * the types they own, and every unregistered or newly-invented type gets a readable
 * generic fallback. The kernel's own lifecycle types ship a default descriptor set.
 */

import type {
  ActivityBaseItem,
  ActivityDescriptionSegment,
  ActivityDescriptorContext,
  ActivityDescriptorMap,
  ActivityItemMetadatum,
  ActivityItemPresentation,
  ActivityItemSubject,
  ActivityTypeDescriptor,
} from "./types";

/**
 * Turn a machine event type into a readable phrase without leaking dotted syntax:
 * `"entity_link.created"` → `"Entity link created"`, `"task.completed"` →
 * `"Task completed"`. Total and safe for ANY string (including an empty one).
 */
export function humanizeActivityType(type: string): string {
  const words = type
    .split(".")
    .join(" ")
    .split("_")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
  if (words.length === 0) {
    return "Activity";
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MAX_SUMMARY_ENTRIES = 4;
const MAX_SUMMARY_VALUE_LENGTH = 80;

function truncate(value: string): string {
  if (value.length <= MAX_SUMMARY_VALUE_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_SUMMARY_VALUE_LENGTH - 1).trimEnd()}…`;
}

function humanizeKey(key: string): string {
  const words = key
    .split("_")
    .join(" ")
    .split(".")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
  if (words.length === 0) {
    return key;
  }
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Derive a SMALL, bounded set of metadata from a payload for at-a-glance display.
 *
 * Safety guarantees (the "never dump raw unbounded JSON" rule):
 *   - only top-level entries whose value is a string, finite number or boolean are
 *     shown — nested objects and arrays are skipped entirely, never stringified;
 *   - at most `MAX_SUMMARY_ENTRIES` entries, each value truncated;
 *   - total and non-throwing on any shape, including a non-object payload.
 */
export function summarizeActivityPayload(
  payload: unknown,
  keys?: readonly string[],
): ActivityItemMetadatum[] {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  const source = payload as Record<string, unknown>;
  const candidateKeys = keys && keys.length > 0 ? keys : Object.keys(source);
  const out: ActivityItemMetadatum[] = [];
  for (const key of candidateKeys) {
    if (out.length >= MAX_SUMMARY_ENTRIES) {
      break;
    }
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const value = source[key];
    let text: string | null = null;
    if (typeof value === "string") {
      text = value.trim();
    } else if (typeof value === "number" && Number.isFinite(value)) {
      text = String(value);
    } else if (typeof value === "boolean") {
      text = value ? "Yes" : "No";
    }
    if (text === null || text.length === 0) {
      continue;
    }
    out.push({ id: key, label: humanizeKey(key), value: truncate(text) });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Default descriptors for the kernel's reserved lifecycle types               */
/* -------------------------------------------------------------------------- */

function subjectSegment(
  subject: ActivityItemSubject | null,
  fallbackText: string,
): ActivityDescriptionSegment {
  if (subject) {
    return { kind: "entity", entityId: subject.entityId };
  }
  return { kind: "emphasis", text: fallbackText };
}

function lifecycle(
  verb: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label: humanizeActivityType(verb),
    tone,
    describe: (_base, context) => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: ` ${verb} ` },
        subjectSegment(context.primarySubject, "a record"),
      ],
      entityType: context.primarySubject?.entity?.entityType,
    }),
  };
}

function link(
  verb: string,
  joiner: string,
  tone: ActivityTypeDescriptor["tone"],
): ActivityTypeDescriptor {
  return {
    label: humanizeActivityType(verb),
    tone,
    describe: (_base, context) => {
      const source = context.subjectByRole("source") ?? context.primarySubject;
      const target = context.subjectByRole("target");
      const segments: ActivityDescriptionSegment[] = [
        { kind: "actor" },
        { kind: "text", text: ` ${verb} ` },
        subjectSegment(source, "a record"),
      ];
      if (target) {
        segments.push({ kind: "text", text: ` ${joiner} ` });
        segments.push(subjectSegment(target, "a record"));
      }
      return { segments, entityType: source?.entity?.entityType };
    },
  };
}

/**
 * Descriptors for the seven kernel-reserved lifecycle Activity types (see
 * MODULES.md → kernel-reserved types). Modules extend this via
 * `createActivityDescriptorMap`; they never edit it.
 */
export const DEFAULT_ACTIVITY_DESCRIPTORS: ActivityDescriptorMap = {
  "entity.created": lifecycle("created", "success"),
  "entity.updated": lifecycle("updated", "accent"),
  "entity.deleted": lifecycle("deleted", "danger"),
  "entity.restored": lifecycle("restored", "info"),
  "entity_link.created": link("linked", "to", "accent"),
  "entity_link.unlinked": link("unlinked", "from", "warning"),
  "entity_link.restored": link("re-linked", "to", "info"),
};

/**
 * Merge module descriptor maps over the kernel defaults. Later maps win, so a
 * module can override a default rendering for its own scope if it must.
 */
export function createActivityDescriptorMap(
  ...maps: readonly ActivityDescriptorMap[]
): ActivityDescriptorMap {
  return Object.freeze(
    Object.assign({}, DEFAULT_ACTIVITY_DESCRIPTORS, ...maps),
  );
}

/**
 * The conservative generic fallback for a type with no specialised descriptor.
 *
 * It stays readable, shows the (humanised) event type safely, keeps the actor and
 * available subjects, never crashes on an unfamiliar payload, and NEVER dumps raw
 * JSON — it emits no payload metadata at all. Time is rendered by the row.
 */
export function buildFallbackPresentation(
  base: ActivityBaseItem,
  context: ActivityDescriptorContext,
): ActivityItemPresentation {
  const phrase = humanizeActivityType(base.type);
  const segments: ActivityDescriptionSegment[] = [
    { kind: "actor" },
    { kind: "text", text: " · " },
    { kind: "emphasis", text: phrase },
  ];
  if (context.primarySubject) {
    segments.push({ kind: "text", text: " — " });
    segments.push({
      kind: "entity",
      entityId: context.primarySubject.entityId,
    });
  }
  return {
    segments,
    tone: "neutral",
    entityType: context.primarySubject?.entity?.entityType,
  };
}

/** The result of resolving a type to a descriptor. */
export interface ResolvedActivityDescriptor {
  readonly descriptor: ActivityTypeDescriptor | null;
  readonly isKnown: boolean;
}

/** Resolve a type to its descriptor (or `null` → the fallback is used). */
export function resolveActivityDescriptor(
  descriptors: ActivityDescriptorMap | undefined,
  type: string,
): ResolvedActivityDescriptor {
  const descriptor = descriptors?.[type];
  if (descriptor) {
    return { descriptor, isKnown: true };
  }
  return { descriptor: null, isKnown: false };
}
