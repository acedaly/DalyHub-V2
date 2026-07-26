/**
 * PEOPLE-01 People kernel — the storage-independent Person contract.
 *
 * Defines the application-facing shape of a Person: the shared entity header
 * (id, workspaceId, title, timestamps, deletedAt) plus the structured
 * relationship detail slice owned by `person_details`, and the closed
 * vocabularies (relationship, favourite contact method, follow-up frequency).
 * It speaks only domain terms — camelCase, `Date`s, closed string unions — and
 * imports no D1, Cloudflare, SQL or storage-row types. The D1 adapter
 * (`app/platform/storage/d1`) is the only place snake_case rows exist.
 *
 * The Person's DISPLAY NAME is the shared `entities.title` (so a Person renders
 * with the same Record Header identity as every other entity). Everything else —
 * names, contact points, relationship, follow-up cadence, avatar — is the
 * additive detail slice this contract describes. `archivedAt` is a reversible
 * put-away state distinct from `deletedAt` soft-deletion (mirrors a Project's
 * archive flag): an archived Person still exists and is readable; a deleted
 * Person reads as "not found" everywhere.
 *
 * Every field is optional (`| null`) except identity/lifecycle — a Person can be
 * captured from a single name and enriched over time (care, not data-entry).
 */

import type { WorkspaceId } from "~/kernel/workspaces";

/* -------------------------------------------------------------------------- */
/* Closed vocabularies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How the owner relates to a Person. A closed union in TypeScript (so rendering
 * is exhaustive) while the stored column stays an ordinary validated string. The
 * language reflects care and real relationships, never a sales pipeline.
 */
export type PersonRelationship =
  | "friend"
  | "family"
  | "colleague"
  | "volunteer"
  | "customer"
  | "supplier"
  | "manager"
  | "direct_report"
  | "mentor"
  | "mentee"
  | "professional"
  | "government"
  | "emergency"
  | "other";

/** Every relationship type, in display order, with a human label. */
export const PERSON_RELATIONSHIPS: readonly {
  readonly value: PersonRelationship;
  readonly label: string;
}[] = [
  { value: "friend", label: "Friend" },
  { value: "family", label: "Family" },
  { value: "colleague", label: "Colleague" },
  { value: "volunteer", label: "Volunteer" },
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "manager", label: "Manager" },
  { value: "direct_report", label: "Direct Report" },
  { value: "mentor", label: "Mentor" },
  { value: "mentee", label: "Mentee" },
  { value: "professional", label: "Professional" },
  { value: "government", label: "Government" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
];

/** The preferred way to reach a Person. Maps to one of the contact fields. */
export type ContactMethod =
  "email" | "secondary_email" | "mobile" | "work_phone" | "address" | "website";

/** Every favourite contact method, in display order, with a human label. */
export const CONTACT_METHODS: readonly {
  readonly value: ContactMethod;
  readonly label: string;
}[] = [
  { value: "email", label: "Email" },
  { value: "secondary_email", label: "Secondary email" },
  { value: "mobile", label: "Mobile" },
  { value: "work_phone", label: "Work phone" },
  { value: "address", label: "Address" },
  { value: "website", label: "Website" },
];

/** How often the owner wants to stay in touch. Drives the (future) follow-up. */
export type FollowUpFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "biannually"
  | "annually";

/** Every follow-up frequency, in display order, with a human label. */
export const FOLLOW_UP_FREQUENCIES: readonly {
  readonly value: FollowUpFrequency;
  readonly label: string;
}[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "biannually", label: "Every 6 months" },
  { value: "annually", label: "Yearly" },
];

/* -------------------------------------------------------------------------- */
/* The Person record                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The structured detail slice a Person carries beyond the shared entity header.
 * Every field is optional. `tags` is always an array (possibly empty). Date-like
 * fields (`birthday`, `nextFollowUp`, `lastInteraction`) are stored as calendar
 * `YYYY-MM-DD` strings — they are dates on a wall calendar, not instants, so they
 * never carry a timezone.
 */
export type PersonDetails = {
  readonly preferredName: string | null;
  readonly firstName: string | null;
  readonly middleName: string | null;
  readonly lastName: string | null;
  readonly pronouns: string | null;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly department: string | null;
  readonly email: string | null;
  readonly secondaryEmail: string | null;
  readonly mobile: string | null;
  readonly workPhone: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly birthday: string | null;
  readonly relationship: PersonRelationship | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly favouriteContactMethod: ContactMethod | null;
  readonly followUpFrequency: FollowUpFrequency | null;
  readonly nextFollowUp: string | null;
  readonly lastInteraction: string | null;
  readonly photoUrl: string | null;
};

/**
 * A Person: the shared entity header plus the structured detail slice and the
 * archive/soft-delete lifecycle state.
 *
 * Invariants (enforced by validation, the D1 adapter and the schema together):
 *   - the underlying `entities.type` is always `person`.
 *   - `title` is the display name — required, trimmed, shared header rules.
 *   - `archivedAt` (reversible put-away) is independent of `deletedAt`
 *     (soft-deletion): archiving is not deletion; deletion is not archiving.
 *   - a soft-deleted Person reads as "not found" through normal reads.
 *
 * Every field is `readonly`: a stored record is an immutable snapshot. Mutations
 * go through the `PersonRepository` and return a fresh record.
 */
export type Person = PersonDetails & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly archivedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* Creation & update inputs                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The editable detail fields, all optional. `undefined` means "leave unchanged"
 * on update (and "unset" on create); an explicit `null` clears a field; `tags`
 * replaces the whole set. There is deliberately NO `workspaceId` — scope comes
 * from the repository's bound `WorkspaceContext` (ADR-010).
 */
export type PersonDetailsInput = {
  readonly preferredName?: string | null;
  readonly firstName?: string | null;
  readonly middleName?: string | null;
  readonly lastName?: string | null;
  readonly pronouns?: string | null;
  readonly organisation?: string | null;
  readonly role?: string | null;
  readonly department?: string | null;
  readonly email?: string | null;
  readonly secondaryEmail?: string | null;
  readonly mobile?: string | null;
  readonly workPhone?: string | null;
  readonly address?: string | null;
  readonly website?: string | null;
  readonly birthday?: string | null;
  readonly relationship?: string | null;
  readonly tags?: readonly string[];
  readonly notes?: string | null;
  readonly favouriteContactMethod?: string | null;
  readonly followUpFrequency?: string | null;
  readonly nextFollowUp?: string | null;
  readonly lastInteraction?: string | null;
  readonly photoUrl?: string | null;
};

/** Input to create a Person: a required display name plus optional details. */
export type CreatePersonInput = PersonDetailsInput & {
  readonly title: string;
};

/** Input to update a Person's detail slice (never its title or lifecycle). */
export type UpdatePersonInput = PersonDetailsInput;

/** Result of a detail update: the fresh Person and whether anything changed. */
export type PersonChangeResult = {
  readonly person: Person;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Lifecycle (archive / restore)                                              */
/* -------------------------------------------------------------------------- */

/** What an archive / restore call actually did. */
export type PersonLifecycleOutcome =
  "archived" | "already_archived" | "restored" | "already_active";

/** Result of an archive or restore. `changed` distinguishes a real transition
 * from an idempotent no-op. */
export type PersonLifecycleResult = {
  readonly person: Person;
  readonly outcome: PersonLifecycleOutcome;
  readonly changed: boolean;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Options for reading a single Person. */
export type GetPersonOptions = {
  /** When true, a soft-deleted Person is returned too. Defaults to false. */
  readonly includeDeleted?: boolean;
};

/**
 * Which lifecycle bucket a collection query returns.
 *   - `active`   — not archived, not deleted (the default People collection).
 *   - `archived` — archived, not deleted (the Archived view).
 *   - `all`      — active and archived (not deleted).
 */
export type PersonListStatus = "active" | "archived" | "all";

/**
 * Input to list People within the bound workspace, using bounded cursor
 * pagination ordered deterministically by `(createdAt, id)` newest-first. Scope
 * comes from the bound `WorkspaceContext`, never a `workspaceId` parameter.
 */
export type ListPeopleInput = {
  /** Lifecycle bucket to return. Defaults to `active`. */
  readonly status?: PersonListStatus;
  /**
   * Optional case-insensitive text filter matched across the display name and
   * the searchable detail fields (preferred name, organisation, role, email,
   * tags). Trimmed; an empty/whitespace value is ignored.
   */
  readonly query?: string;
  /** Maximum records to return. Clamped to `[1, MAX_PEOPLE_PAGE_SIZE]`. */
  readonly limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. Scope-bound. */
  readonly cursor?: string;
};

/** A bounded page of People plus the next-page cursor. */
export type PersonPage = {
  readonly items: readonly Person[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};
