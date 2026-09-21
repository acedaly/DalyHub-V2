/**
 * Chief of Staff — turning what the owner SAID into the record they meant.
 *
 * The first Chief-of-Staff surface accepted exact DalyHub ids and nothing else,
 * which is safe and unusable in the same breath: "add a task to the OpO project"
 * became a search, a copied id and a second tool call, and the failure mode when
 * Claude skipped that dance was a task filed under a guess.
 *
 * This module is the ONE place a human-readable reference becomes a canonical
 * record, and it is deliberately conservative. The rules, in order:
 *
 *   1. an EXACT id of the named kind always wins — no name lookup is attempted;
 *   2. an EXACT normalised name match resolves, when exactly one record has it;
 *   3. a SINGLE partial match resolves, because there is nothing to confuse it
 *      with;
 *   4. anything else is AMBIGUOUS and resolves to nothing at all, carrying the
 *      candidates back so Claude can ask which one the owner meant;
 *   5. an absent record is never created implicitly — only a `create_*` tool
 *      creates, and it says so in its name.
 *
 * Every lookup is a bounded, workspace-scoped query through the SAME repository
 * the application uses. There is no second index, no cache and no fuzzy scoring
 * model: "one match or ask" is the whole heuristic, because a Chief of Staff
 * that quietly picks a John is worse than one that asks which John.
 */

import type {
  AmbiguousReferenceResult,
  PossibleDuplicateResult,
  ReferenceKind,
  ReferenceMatch,
} from "~/kernel/chief-of-staff";
import type { WorkspaceScope } from "~/platform/workspaces/composition";

/** The most candidates a resolution or duplicate check ever considers. */
const CANDIDATE_LIMIT = 10;

/**
 * Fold a title down to what a human would call "the same name".
 *
 * Case, accents, punctuation AND spacing all disappear, so `"Career
 * Development"`, `"career  development"` and `"Career-Development"` are one
 * name, and so are `"Reach 70 kg"` and `"reach 70kg"` — which is the whole
 * point, because that is the pair a person retypes and does not expect to get
 * twice. `"Career"` stays distinct from `"Career Development"`: dropping the
 * gaps forgives how a name was typed, never what it says.
 *
 * Deliberately NOT a similarity score. This either matches or it does not.
 */
export function normaliseReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * The first word of a name, for a SECOND, looser candidate query.
 *
 * A contains-match on the whole string cannot find "Sarah Beale" when the
 * owner typed "sarah  beale", so a duplicate check that only searched the full
 * text would happily create the second Sarah. Searching the first word as well
 * finds her, and the exact normalised comparison above still decides.
 */
function firstWord(value: string): string | null {
  const word = value.trim().match(/[\p{L}\p{N}]{2,}/u)?.[0];
  return word === undefined ? null : word;
}

/** One candidate record a reference or a duplicate check is weighed against. */
export type ReferenceCandidate = {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | null;
  /** Extra strings that also identify the record — a Person's email, say. */
  readonly aliases?: readonly string[];
};

/** What a resolution attempt concluded. Nothing is written on a non-`resolved`. */
export type ReferenceResolution =
  | { readonly status: "resolved"; readonly match: ReferenceMatch }
  | { readonly status: "not_found" }
  | {
      readonly status: "ambiguous";
      readonly matches: readonly ReferenceMatch[];
    };

function toMatch(
  kind: ReferenceKind,
  candidate: ReferenceCandidate,
  matchedOn: ReferenceMatch["matchedOn"],
): ReferenceMatch {
  return {
    type: kind,
    id: candidate.id,
    title: candidate.title,
    subtitle: candidate.subtitle ?? null,
    matchedOn,
  };
}

/**
 * Apply rules 2–4 to a bounded candidate set. Pure, so the decision itself is
 * testable without a database.
 */
export function chooseCandidate(
  kind: ReferenceKind,
  reference: string,
  candidates: readonly ReferenceCandidate[],
): ReferenceResolution {
  const wanted = normaliseReference(reference);
  if (wanted.length === 0) return { status: "not_found" };

  const exact = candidates.filter(
    (candidate) => normaliseReference(candidate.title) === wanted,
  );
  if (exact.length === 1)
    return { status: "resolved", match: toMatch(kind, exact[0]!, "name") };
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      matches: exact.map((candidate) => toMatch(kind, candidate, "name")),
    };
  }

  const aliased = candidates.filter((candidate) =>
    (candidate.aliases ?? []).some(
      (alias) => normaliseReference(alias) === wanted,
    ),
  );
  if (aliased.length === 1)
    return { status: "resolved", match: toMatch(kind, aliased[0]!, "email") };
  if (aliased.length > 1) {
    return {
      status: "ambiguous",
      matches: aliased.map((candidate) => toMatch(kind, candidate, "email")),
    };
  }

  if (candidates.length === 0) return { status: "not_found" };
  if (candidates.length === 1) {
    return {
      status: "resolved",
      match: toMatch(kind, candidates[0]!, "partial_name"),
    };
  }
  return {
    status: "ambiguous",
    matches: candidates.map((candidate) =>
      toMatch(kind, candidate, "partial_name"),
    ),
  };
}

/**
 * Candidate records of one kind whose title contains `text`, bounded.
 *
 * Every branch is an existing workspace-scoped search: no new query, no new
 * index and no cross-kind lookup — asking for an Area can only ever return
 * Areas, which is what makes a Project id supplied as `areaId` a failure.
 */
async function findCandidates(
  scope: WorkspaceScope,
  kind: ReferenceKind,
  text: string,
): Promise<readonly ReferenceCandidate[]> {
  switch (kind) {
    case "area": {
      const hits = await scope.areas.searchAreas({
        text,
        limit: CANDIDATE_LIMIT,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: `${hit.activeProjectCount} active project(s)`,
      }));
    }
    case "goal": {
      const hits = await scope.goals.searchGoals({
        text,
        limit: CANDIDATE_LIMIT,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.area.title,
      }));
    }
    case "project": {
      const hits = await scope.projects.searchProjects({
        text,
        limit: CANDIDATE_LIMIT,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.goal?.title ?? hit.area?.title ?? null,
      }));
    }
    case "person": {
      // ARCHIVED People are candidates here, unlike archived Areas and
      // Projects, because archive is the only "put away" this interface has
      // and a name has to keep working afterwards: "restore Kate" and "what do
      // I have on Kate?" are the two things an owner asks about an archived
      // contact, and both need her name to resolve. The compact Person shape
      // carries `archived`, so a resolved one is never silently presented as
      // active.
      const page = await scope.people.list({
        query: text,
        status: "all",
        limit: CANDIDATE_LIMIT,
      });
      return page.items.map((person) => ({
        id: person.id,
        title: person.title,
        subtitle: person.organisation ?? person.role ?? null,
        aliases: [person.preferredName, person.email].filter(
          (value): value is string => typeof value === "string",
        ),
      }));
    }
    case "task": {
      const hits = await scope.tasks.searchTasks({
        text,
        limit: CANDIDATE_LIMIT,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: hit.parent?.title ?? null,
      }));
    }
    case "note": {
      const hits = await scope.notes.search({
        text,
        limit: CANDIDATE_LIMIT,
      });
      return hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        subtitle: null,
      }));
    }
  }
}

/**
 * Resolve one reference to an exact record of `kind`, or explain why not.
 *
 * Rule 1 first: the value is tried as an id through the workspace-scoped entity
 * repository, and a record of the WRONG type is not a match — it falls through
 * to the name lookup rather than being accepted as a near-enough record.
 */
export async function resolveReference(
  scope: WorkspaceScope,
  kind: ReferenceKind,
  reference: string,
): Promise<ReferenceResolution> {
  const text = reference.trim();
  if (text.length === 0) return { status: "not_found" };

  const entity = await scope.entities.getById(text);
  if (entity !== null && entity.type === kind) {
    return {
      status: "resolved",
      match: {
        type: kind,
        id: entity.id,
        title: entity.title,
        subtitle: null,
        matchedOn: "id",
      },
    };
  }

  return chooseCandidate(kind, text, await findCandidates(scope, kind, text));
}

/**
 * Thrown when a reference names nothing. It is an ERROR rather than a result
 * because there is nothing for Claude to choose between — the honest next step
 * is to search, or to use the creation tool by name.
 */
export class ReferenceNotFoundError extends Error {
  constructor(field: string, kind: ReferenceKind, reference: string) {
    super(
      `No ${kind} in DalyHub matches ${field}: "${reference}". Search first, or use create_${kind} if it should exist.`,
    );
    this.name = "ReferenceNotFoundError";
  }
}

/**
 * Carries an ambiguity back to the tool boundary as a RESULT, not a failure.
 *
 * A thrown error would reach Claude as "DalyHub could not complete that
 * request", which is exactly the wrong thing to tell someone who could answer
 * the question in four words. The service catches this and returns the payload.
 */
export class AmbiguousReferenceError extends Error {
  readonly payload: AmbiguousReferenceResult;
  constructor(payload: AmbiguousReferenceResult) {
    super(payload.message);
    this.name = "AmbiguousReferenceError";
    this.payload = payload;
  }
}

/** The same mechanism for a creation that looks like a duplicate. */
export class PossibleDuplicateError extends Error {
  readonly payload: PossibleDuplicateResult;
  constructor(payload: PossibleDuplicateResult) {
    super(payload.message);
    this.name = "PossibleDuplicateError";
    this.payload = payload;
  }
}

/**
 * Resolve a reference or stop: the form every write uses, because a write that
 * proceeds on an unresolved reference is the bug this whole module prevents.
 */
export async function requireReference(
  scope: WorkspaceScope,
  kind: ReferenceKind,
  field: string,
  reference: string,
): Promise<ReferenceMatch> {
  const resolution = await resolveReference(scope, kind, reference);
  if (resolution.status === "resolved") return resolution.match;
  if (resolution.status === "not_found")
    throw new ReferenceNotFoundError(field, kind, reference);
  throw new AmbiguousReferenceError({
    status: "ambiguous_reference",
    field,
    expected: kind,
    reference,
    matches: resolution.matches,
    message: `"${reference}" matches ${resolution.matches.length} ${kind}s in DalyHub. Ask which one is meant, then call again with the exact id. Nothing was changed.`,
  });
}

/** Resolve a whole list of references, preserving order and de-duplicating. */
export async function requireReferences(
  scope: WorkspaceScope,
  kind: ReferenceKind,
  field: string,
  references: readonly string[] | undefined,
): Promise<readonly ReferenceMatch[]> {
  if (references === undefined || references.length === 0) return [];
  const seen = new Set<string>();
  const matches: ReferenceMatch[] = [];
  for (const reference of references) {
    const match = await requireReference(scope, kind, field, reference);
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    matches.push(match);
  }
  return matches;
}

/**
 * Refuse a creation that looks like something the owner already has.
 *
 * "Looks like" is deliberately narrow — an EXACT normalised name, or a shared
 * identifying alias such as an email address. A merely similar name creates
 * normally, because blocking "Career Development 2026" because "Career
 * Development" exists would make the tool useless. `allowDuplicate` is the
 * owner's override, and the refusal says so.
 */
export function guardDuplicate(
  kind: ReferenceKind,
  title: string,
  candidates: readonly ReferenceCandidate[],
  options: {
    readonly allowDuplicate?: boolean;
    readonly aliases?: readonly string[];
  } = {},
): void {
  if (options.allowDuplicate === true) return;
  const wanted = normaliseReference(title);
  if (wanted.length === 0) return;
  const wantedAliases = new Set(
    (options.aliases ?? [])
      .map(normaliseReference)
      .filter((alias) => alias.length > 0),
  );
  const matches = candidates.filter((candidate) => {
    if (normaliseReference(candidate.title) === wanted) return true;
    if (wantedAliases.size === 0) return false;
    return (candidate.aliases ?? []).some((alias) =>
      wantedAliases.has(normaliseReference(alias)),
    );
  });
  if (matches.length === 0) return;
  throw new PossibleDuplicateError({
    status: "possible_duplicate",
    entityType: kind,
    title,
    matches: matches.map((candidate) => toMatch(kind, candidate, "name")),
    message: `DalyHub already has ${matches.length} ${kind}(s) that look like "${title}". Nothing was created. Use the existing record, or call again with allowDuplicate: true if a second one is genuinely wanted.`,
  });
}

/**
 * The bounded candidate set a creation's duplicate check is weighed against.
 *
 * Two bounded queries rather than one: the whole name, and its first word. The
 * second is what makes the check survive the way people actually retype a name
 * — extra spaces, a missing one, different punctuation. Widening the CANDIDATES
 * cannot widen what is blocked, because {@link guardDuplicate} still demands an
 * exact normalised match.
 */
export async function duplicateCandidates(
  scope: WorkspaceScope,
  kind: ReferenceKind,
  title: string,
): Promise<readonly ReferenceCandidate[]> {
  const whole = await findCandidates(scope, kind, title);
  const word = firstWord(title);
  if (
    word === null ||
    word.toLocaleLowerCase() === title.trim().toLocaleLowerCase()
  )
    return whole;
  const byWord = await findCandidates(scope, kind, word);
  const seen = new Set(whole.map((candidate) => candidate.id));
  return [...whole, ...byWord.filter((candidate) => !seen.has(candidate.id))];
}
