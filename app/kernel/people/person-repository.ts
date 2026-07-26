/**
 * PEOPLE-01 People kernel — the authoritative domain repository contract.
 *
 * The storage-independent interface that owns a Person's structured detail slice
 * and its archive lifecycle. It speaks only domain terms (camelCase `Person`s,
 * closed unions, typed errors) and never exposes D1, SQL or Cloudflare types. The
 * D1 adapter (`app/platform/storage/d1`) implements it; the generic Entity
 * repository refuses to CREATE a `person` (so a Person can never exist without its
 * detail row), but still owns a Person's rename, soft-delete and restore —
 * exactly mirroring Diary's create-only reservation.
 *
 * The repository is WORKSPACE-BOUND (ADR-010): constructed with a single
 * `WorkspaceContext`, every method operates only within that workspace, no method
 * accepts a `workspaceId`, and the trusted Activity actor is bound at
 * construction — module code cannot pass, select or spoof scope or actor.
 *
 * Extension points (future PRs add these WITHOUT breaking this contract):
 *   - Organisations become their own entity + a `person.works_at` link.
 *   - Meetings/Calls/Emails append to the shared Activity Timeline via new event
 *     types and `person.linked_*` EntityLinks.
 *   - Follow-up and birthday reminders read `nextFollowUp` / `birthday` and the
 *     `followUpFrequency` cadence; no schema change is needed to add them.
 */

import type {
  CreatePersonInput,
  GetPersonOptions,
  ListPeopleInput,
  Person,
  PersonChangeResult,
  PersonLifecycleResult,
  PersonPage,
  UpdatePersonInput,
} from "./person";

/**
 * The kernel's authoritative Person storage contract.
 *
 * Atomicity (ADR-012): `create` writes the `entities` row, the `person_details`
 * row and one `person.created` event as ONE D1 transaction that rolls back
 * entirely on any failure. `update`, `archive` and `restore` fold their
 * precondition and change-detection into the mutating SQL, atomic with their
 * Activity append; an idempotent no-op changes nothing and appends no Activity.
 *
 * Error semantics (thrown as the typed errors in `person-errors.ts`):
 *   - invalid input               → `PersonValidationError` (no data written)
 *   - unknown / cross-workspace id → `PersonNotFoundError`
 *   - concurrent conflicting write → `PersonConflictError`
 *   - bad cursor                  → `InvalidPersonCursorError`
 *   - storage failure             → `PersonStorageError`
 */
export interface PersonRepository {
  /** Create a Person from a display name plus optional details. Atomically
   * writes the entity, its detail row and `person.created`. */
  create(input: CreatePersonInput): Promise<Person>;

  /**
   * Read one Person by id within the bound workspace. Returns null when there is
   * no matching Person here — including when it exists in another workspace,
   * which is indistinguishable from "does not exist". Soft-deleted Persons are
   * excluded unless `options.includeDeleted`. Archived Persons ARE returned
   * (archive is not deletion).
   */
  get(id: string, options?: GetPersonOptions): Promise<Person | null>;

  /**
   * List People in the bound workspace, filtered by lifecycle `status` and an
   * optional text `query`, using bounded cursor pagination ordered
   * deterministically newest-first by `(createdAt, id)`.
   */
  list(input?: ListPeopleInput): Promise<PersonPage>;

  /**
   * Update a Person's detail slice (never its title or lifecycle). Only the
   * fields present in `changes` are touched; an update that changes nothing after
   * normalisation is an idempotent no-op (no `updatedAt` churn, no Activity). A
   * real change appends `person.updated`.
   */
  update(id: string, changes: UpdatePersonInput): Promise<PersonChangeResult>;

  /**
   * Archive a Person: set `archivedAt`, advance the detail `updatedAt` and append
   * `person.archived`, atomically. Archiving an already-archived Person is a
   * no-op. A soft-deleted Person cannot be archived (`PersonNotFoundError`).
   */
  archive(id: string): Promise<PersonLifecycleResult>;

  /**
   * Restore an archived Person to active: clear `archivedAt`, advance the detail
   * `updatedAt` and append `person.restored`, atomically. Restoring an already
   * active Person is a no-op.
   */
  restore(id: string): Promise<PersonLifecycleResult>;
}
