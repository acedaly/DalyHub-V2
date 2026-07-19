/**
 * DS-05 — Shared Timeline & Activity Feed: the pure presentation contract.
 *
 * This file is the ONE typed presentation/view-model boundary between the FND-05
 * Activity kernel (`~/kernel/activity`) and the renderable activity UI. It maps a
 * stored, workspace-isolated `ActivityRecord` into a renderable `ActivityItem`
 * without weakening the kernel's branded types (`ActivityType` stays branded, the
 * open validated-string `ActivityActorType`/`ActivitySubjectRole` stay as-is) and
 * without ever using `any`.
 *
 * It is deliberately **React-free** — mirroring `~/shared/filters/model`, it is
 * re-exported from `~/shared/activity-feed/model` so a server-side surface can map,
 * group and format activity without resolving any React or UI code (enforced by an
 * import-guard test). The React components live alongside and consume these types.
 *
 * The same item model powers BOTH configurations of the one shared renderer:
 *   - a record-scoped **Timeline** (`activity.listForEntity`), and
 *   - a workspace/scope **Activity Feed** (`activity.listForWorkspace`).
 */

import type {
  ActivityActor,
  ActivityActorType,
  ActivityPayload,
  ActivitySubjectRole,
  ActivityType,
} from "~/kernel/activity";

/**
 * A restrained tone for an event marker. Tones map to DS-01 feedback/accent
 * tokens; meaning is NEVER carried by colour alone (an event always has a text
 * description and a `<time>`), so tone is purely a calm visual accent.
 */
export type ActivityTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * A referenced entity resolved for presentation, or `null` at the resolver when it
 * cannot be resolved (deleted, inaccessible, cross-workspace or simply unknown to
 * the caller). The shared UI NEVER fetches entities itself — the caller resolves
 * them in one batch and supplies this, so no N+1 lookup is introduced by the UI.
 */
export interface ResolvedEntity {
  readonly entityId: string;
  /** The entity's type (e.g. `"task"`); may be an unknown/custom type string. */
  readonly entityType?: string;
  /** The human display label for the entity. */
  readonly label: string;
  /**
   * An opaque DS-03 Drawer key that opens this entity, when it is openable. When
   * omitted the entity renders as plain (non-interactive) text.
   */
  readonly drawerKey?: string;
}

/** The trusted actor, mapped for presentation. Preserves the kernel fields. */
export interface ActivityItemActor {
  /** Preserved kernel actor kind (`system`, `user`, …) — an open validated string. */
  readonly type: ActivityActorType;
  /** Preserved kernel actor id (`null` for the system actor). */
  readonly id: string | null;
  /** A human, non-technical label ("System", "You", a person's name). */
  readonly label: string;
}

/** A subject association mapped for presentation. Preserves the kernel fields. */
export interface ActivityItemSubject {
  /** Preserved subject entity id. */
  readonly entityId: string;
  /** Preserved subject role (`subject`, `source`, `target`, … — open string). */
  readonly role: ActivitySubjectRole;
  /** True when this subject is the Timeline's anchor entity (feed: always false). */
  readonly isAnchor: boolean;
  /** Resolved identity, or `null` when the entity could not be resolved. */
  readonly entity: ResolvedEntity | null;
}

/** A small, safe metadatum derived from an event (never a raw JSON dump). */
export interface ActivityItemMetadatum {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

/**
 * A description segment. The model produces structured segments (never React), so
 * the shared item component can render entity segments as DS-03 Drawer links and
 * plain text as text. This keeps entity-linking in the UI and meaning in the model.
 */
export type ActivityDescriptionSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "actor" }
  | { readonly kind: "emphasis"; readonly text: string }
  | { readonly kind: "entity"; readonly entityId: string };

/** The renderable presentation a descriptor produces for one event. */
export interface ActivityItemPresentation {
  readonly segments: readonly ActivityDescriptionSegment[];
  readonly metadata?: readonly ActivityItemMetadatum[];
  /** Entity type whose identity icon/accent marks the event (optional). */
  readonly entityType?: string;
  /** A restrained tone for the event marker (optional; defaults to neutral). */
  readonly tone?: ActivityTone;
}

/**
 * The mapped-but-not-yet-described core of an event. Passed to a descriptor's
 * `describe` so it can build a presentation from resolved subjects and payload
 * without a circular reference to the finished item.
 */
export interface ActivityBaseItem {
  readonly id: string;
  readonly type: ActivityType;
  readonly occurredAt: Date;
  readonly actor: ActivityItemActor;
  readonly subjects: readonly ActivityItemSubject[];
  readonly primarySubject: ActivityItemSubject | null;
  readonly payload: ActivityPayload;
}

/**
 * A fully mapped, renderable activity item. `id` is the stable dedup/merge key
 * (the kernel activity id); `type` and the actor/subject fields preserve the
 * kernel's types unchanged.
 */
export interface ActivityItem extends ActivityBaseItem {
  /** False when no descriptor matched the type — the safe fallback was used. */
  readonly isKnownType: boolean;
  readonly presentation: ActivityItemPresentation;
}

/** Context a descriptor receives alongside the base item. */
export interface ActivityDescriptorContext {
  readonly actorLabel: string;
  readonly primarySubject: ActivityItemSubject | null;
  readonly subjects: readonly ActivityItemSubject[];
  /** Look up a subject by its role (e.g. `source`/`target` for link events). */
  readonly subjectByRole: (role: string) => ActivityItemSubject | null;
}

/**
 * The presentation rule for one activity type. A module registers a descriptor per
 * event type it owns; unknown types fall back to a conservative generic rendering
 * (see `resolveActivityDescriptor`). `describe` MUST be pure and total — it must
 * never throw on an unfamiliar payload and never emit raw unbounded JSON.
 */
export interface ActivityTypeDescriptor {
  /** A human, non-technical label for the event type. */
  readonly label: string;
  readonly entityType?: string;
  readonly tone?: ActivityTone;
  readonly describe?: (
    base: ActivityBaseItem,
    context: ActivityDescriptorContext,
  ) => ActivityItemPresentation;
}

/** A map from activity-type string to its descriptor. */
export type ActivityDescriptorMap = Readonly<
  Record<string, ActivityTypeDescriptor>
>;

/** Resolves a referenced entity id to its identity, or `null` when unresolvable. */
export type EntityResolver = (entityId: string) => ResolvedEntity | null;

/** Resolves the trusted actor to a human label. */
export type ActorLabelResolver = (actor: ActivityActor) => string;

/** Options controlling how a kernel record is mapped to an item. */
export interface ActivityMapOptions {
  /** Per-type descriptors; missing types use the safe fallback. */
  readonly descriptors?: ActivityDescriptorMap;
  /** Batch entity resolver (no per-item fetching in the UI). */
  readonly resolveEntity?: EntityResolver;
  /** Actor-label resolver; defaults to a conservative built-in. */
  readonly resolveActorLabel?: ActorLabelResolver;
  /**
   * The Timeline anchor entity id. Marks the matching subject as the anchor and
   * biases primary-subject selection toward it. Omitted for the Activity Feed.
   */
  readonly anchorEntityId?: string;
}

/**
 * A page of already-mapped items plus the opaque next cursor. The shared stream
 * hook consumes THIS — never a kernel `ActivityRecord`, a repository, a cursor
 * internals or a Cloudflare binding — so the component API stays entity-agnostic.
 * The route maps records → items (with its resolvers) and returns this shape.
 */
export interface ActivityStreamPage {
  readonly items: readonly ActivityItem[];
  /** Opaque cursor for the next page, or `null` at end-of-feed. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Loads a page. `cursor` is `null` for the first page and otherwise the opaque
 * `nextCursor` from the previous page. Rejections surface as the retryable error
 * state. The loader owns the repository call and record→item mapping.
 */
export type ActivityPageLoader = (
  cursor: string | null,
) => Promise<ActivityStreamPage>;

/** A day group: a stable UTC-day key and the items that fall on that day. */
export interface ActivityDayGroup {
  /** Stable grouping key (UTC calendar day, e.g. `"2026-07-19"`). */
  readonly key: string;
  /** The group's date (midnight UTC of the day) for heading formatting. */
  readonly date: Date;
  readonly items: readonly ActivityItem[];
}

/**
 * A flattened render row — either a day heading or one event. Flattening groups
 * to rows keeps day headings correctly associated with their events while a single
 * windowed list virtualises the whole stream. `posInSet`/`setSize` give the feed
 * accessible position semantics across the whole loaded stream.
 */
export type ActivityRow =
  | {
      readonly kind: "heading";
      readonly key: string;
      readonly group: ActivityDayGroup;
      readonly dayLabel: string;
    }
  | {
      readonly kind: "item";
      readonly key: string;
      readonly item: ActivityItem;
      readonly groupKey: string;
      readonly posInSet: number;
      readonly setSize: number;
    };

/**
 * The central date-formatting seam. All day/timestamp formatting flows through one
 * of these so date logic is not scattered through components, and server & client
 * format identically (hydration-safe). See `createActivityDateFormatter`.
 */
export interface ActivityDateFormatter {
  /** Stable UTC-day grouping key, e.g. `"2026-07-19"`. */
  readonly dayKey: (date: Date) => string;
  /** Midnight-UTC `Date` for a day key (for heading formatting). */
  readonly dayStart: (date: Date) => Date;
  /** Accessible day-group heading, e.g. `"Today"` / `"19 July 2026"`. */
  readonly formatDayHeading: (date: Date) => string;
  /** Short time-of-day, e.g. `"14:32"`. */
  readonly formatTimeOfDay: (date: Date) => string;
  /** Full accessible timestamp, e.g. `"19 July 2026 at 14:32 UTC"`. */
  readonly formatAbsolute: (date: Date) => string;
  /** Machine value for a `<time datetime>` attribute (ISO-8601). */
  readonly toDateTimeAttr: (date: Date) => string;
}
