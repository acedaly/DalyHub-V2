/**
 * IDENT-01 Identity kernel — the storage-independent ACTOR IDENTITY contract.
 *
 * The FND-05 Activity stream records WHO caused an event as a trusted, stable
 * pair: an actor `type` (`system`, `user`, `ai`, …) and, for an identified actor,
 * an `id` — the authenticated subject (the Cloudflare Access `sub`), never an
 * email, because a subject is stable and an email is not (ADR-016 §5.6).
 *
 * That stable id is deliberately NOT a display name. This module owns the ONE
 * canonical rule that turns an actor reference into a human identity, and the
 * workspace MEMBERSHIP record that makes the rule resolvable:
 *
 *     authenticated session  (subject + email + optional provider name)
 *       → workspace member   (this table: subject ↔ workspace, email snapshot)
 *       → linked Person      (the owner's own People/profile record)
 *       → display name
 *
 * Identity model (ADR-071): activity stores the STABLE ACTOR ID only, and the
 * display name is RESOLVED AT READ TIME from the member/Person record. Renaming
 * a profile therefore renames the actor everywhere, including in history — the
 * product's "one record, many windows" rule (AGENTS.md §3). There is deliberately
 * NO event-time name snapshot on the Activity row: a snapshot would fork the
 * identity and drift.
 *
 * Nothing here imports D1, Cloudflare, React or React Router — it is pure data
 * plus pure functions, so the request boundary, the repositories, the server
 * routes AND the React-free presentation model can all share exactly one rule.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/** The label for genuine, automated system activity. */
export const SYSTEM_ACTOR_LABEL = "System";

/**
 * The label for an identified actor whose identity cannot be recovered — an old
 * record from before workspace membership was persisted, or a member row that has
 * been removed. It is honest about the gap; it never guesses a name, and it is
 * never used for a *resolvable* authenticated actor.
 */
export const UNKNOWN_ACTOR_LABEL = "Unknown user";

/** Labels for the non-human actor kinds the Activity contract already allows. */
export const AI_ACTOR_LABEL = "Assistant";
export const IMPORT_ACTOR_LABEL = "Import";
export const INTEGRATION_ACTOR_LABEL = "Integration";

/** The actor type recorded for an authenticated human. */
export const USER_ACTOR_TYPE = "user";
/** The actor type recorded for the server composition boundary itself. */
export const SYSTEM_ACTOR_TYPE = "system";

/* -------------------------------------------------------------------------- */
/* Contracts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A reference to an actor exactly as the Activity stream stores it. Structurally
 * the kernel's `ActivityActor`, restated here so the identity kernel does not
 * depend on the Activity kernel (and so a repair script can use it over raw rows).
 */
export type ActorRef = {
  readonly type: string;
  readonly id: string | null;
};

/** The coarse kind an actor presents as. Drives avatar/initial treatment only. */
export type ActorKind = "person" | "system" | "automation" | "unknown";

/**
 * WHICH rule produced the display name. Ordered exactly as the canonical
 * resolution order in {@link resolveActorIdentity}; surfaced so tests, the repair
 * script and diagnostics can assert the rule that fired without parsing a string.
 */
export type ActorIdentitySource =
  /** 1. the linked Person/profile record's display name */
  | "person"
  /** 2. the workspace member's explicit display name */
  | "member"
  /** 3. the authenticated user's provider display name */
  | "auth_name"
  /** 4. the authenticated (verified) email address */
  | "email"
  /** 5. genuine automated system activity */
  | "system"
  /** 5b. a non-human, non-system actor kind (ai / import / integration) */
  | "automation"
  /** 6. an identified actor that genuinely cannot be resolved */
  | "unknown";

/**
 * A resolved, presentation-ready actor identity. It carries NO database id, no
 * Cloudflare Access subject and no raw authentication claim — only what is safe
 * to render (AGENTS.md §17).
 */
export type ActorIdentity = {
  /** The human display name. Never `Someone`. */
  readonly displayName: string;
  /** 1–2 letter initials for an avatar chip; empty for non-person actors. */
  readonly initials: string;
  readonly kind: ActorKind;
  readonly source: ActorIdentitySource;
};

/**
 * A workspace MEMBERSHIP record: the durable link between an authenticated
 * subject and this workspace, plus the identity facts needed to name them.
 *
 * `subject` is the SAME value the Activity stream stores as `actor_id`, which is
 * what makes historical events resolvable without rewriting them.
 */
export type WorkspaceMember = {
  readonly workspaceId: WorkspaceId;
  /** The stable authenticated subject (Access `sub`) — equals `activities.actor_id`. */
  readonly subject: string;
  /** The last verified email seen for this subject, or null. */
  readonly email: string | null;
  /** An explicit, owner-curated display name for this member, or null. */
  readonly displayName: string | null;
  /** The display name the identity provider supplied, or null. */
  readonly authDisplayName: string | null;
  /** The linked Person record's entity id, or null when not linked. */
  readonly personEntityId: string | null;
  /** The linked Person record's display name (`entities.title`), or null. */
  readonly personDisplayName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastSeenAt: Date;
};

/** The identity facts an authenticated request offers about its own actor. */
export type AuthenticatedActorFacts = {
  readonly subject: string;
  readonly email: string;
  readonly displayName?: string | null;
};

/* -------------------------------------------------------------------------- */
/* The canonical rule                                                         */
/* -------------------------------------------------------------------------- */

/** Trim and collapse whitespace; returns null when nothing meaningful remains. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Derive 1–2 letter initials from a display name. Total and safe for any string,
 * including an email address (whose local part is used) and non-Latin scripts.
 */
export function actorInitials(displayName: string): string {
  const name = clean(displayName);
  if (name === null) {
    return "";
  }
  const local = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  const words = local
    .split(/[\s._-]+/)
    .map((word) => clean(word))
    .filter((word): word is string => word !== null);
  if (words.length === 0) {
    return local.slice(0, 1).toUpperCase();
  }
  if (words.length === 1) {
    return (words[0] ?? "").slice(0, 1).toUpperCase();
  }
  const first = (words[0] ?? "").slice(0, 1);
  const last = (words[words.length - 1] ?? "").slice(0, 1);
  return `${first}${last}`.toUpperCase();
}

/** The label a non-human actor type presents as, or null when it is not one. */
function automationLabel(actorType: string): string | null {
  switch (actorType) {
    case "ai":
      return AI_ACTOR_LABEL;
    case "import":
      return IMPORT_ACTOR_LABEL;
    case "integration":
      return INTEGRATION_ACTOR_LABEL;
    default:
      return null;
  }
}

/**
 * THE canonical actor-resolution rule. Every surface — the workspace feed, every
 * record Timeline, Diary, People, mobile — resolves an actor through this one
 * function, so no module can invent its own fallback.
 *
 * Order (the documented product rule):
 *   1. the linked Person/profile display name;
 *   2. the workspace member's explicit display name;
 *   3. the authenticated user's provider display name;
 *   4. the verified email address;
 *   5. `System` for genuine automated system activity (and the named labels for
 *      the other non-human actor kinds);
 *   6. `Unknown user` where an identified actor genuinely cannot be resolved.
 *
 * `Someone` is deliberately not in this list and appears nowhere in the product.
 *
 * Pure and total: `member` is whatever the directory found (or null), and no
 * shape of it can throw.
 */
export function resolveActorIdentity(
  actor: ActorRef,
  member: WorkspaceMember | null | undefined,
): ActorIdentity {
  const actorType = clean(actor.type) ?? "";

  if (actorType === SYSTEM_ACTOR_TYPE) {
    return {
      displayName: SYSTEM_ACTOR_LABEL,
      initials: "",
      kind: "system",
      source: "system",
    };
  }

  const automation = automationLabel(actorType);
  if (automation !== null) {
    return {
      displayName: automation,
      initials: "",
      kind: "automation",
      source: "automation",
    };
  }

  const named = (
    [
      ["person", clean(member?.personDisplayName)],
      ["member", clean(member?.displayName)],
      ["auth_name", clean(member?.authDisplayName)],
      ["email", clean(member?.email)],
    ] as const
  ).find(([, value]) => value !== null);

  if (named) {
    const [source, value] = named;
    const displayName = value as string;
    return {
      displayName,
      initials: actorInitials(displayName),
      kind: "person",
      source,
    };
  }

  // An identified actor we hold no identity facts for. Honest, never a guess —
  // and never the viewer's own name.
  return {
    displayName: UNKNOWN_ACTOR_LABEL,
    initials: "",
    kind: "unknown",
    source: "unknown",
  };
}

/**
 * The stable map key for an actor reference. Used wherever a batch of actors is
 * resolved in one query and looked up per record (never an N+1 read).
 */
export function actorKey(actor: ActorRef): string {
  return `${actor.type} ${actor.id ?? ""}`;
}
