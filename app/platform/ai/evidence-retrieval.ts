/**
 * AI-01 / AI-04 platform — the ONE bounded evidence-retrieval service.
 *
 * A model has no database access, no query language, no tool and no way to ask
 * for more. DalyHub retrieves first — through its OWN repositories and the shared
 * search infrastructure — bounds what it found, applies the privacy filter, and
 * only then assembles a prompt. Nothing here is recursive, nothing expands on the
 * model's say-so, and nothing sends "the workspace".
 *
 * Deterministic repository and search operations come first, always: a question
 * that SQL can answer is answered by SQL (`deterministic-answers.ts`), and the
 * model is only asked to synthesise across records that DalyHub already selected.
 *
 * No second search index is built. This composes the existing Notes, Tasks and
 * Meetings search projections (V2.0.1) plus EntityLinks and the spine — the
 * infrastructure global Search already uses. Embeddings are deliberately not
 * introduced: keyword and relationship retrieval satisfy V1, and a vector store
 * is a separate, separately-justified decision.
 */

import {
  defaultCategoryForKind,
  selectEvidence,
  type EvidenceCandidate,
  type EvidenceLimits,
  type EvidenceSet,
  type PrivacyCategory,
} from "~/kernel/ai";
import type { WorkspaceScope } from "~/platform/workspaces";

/** The candidate ids a feature is allowed to reference in its proposals. */
export interface CandidateSets {
  readonly projects: readonly { readonly id: string; readonly title: string }[];
  readonly people: readonly { readonly id: string; readonly title: string }[];
  readonly links: readonly {
    readonly id: string;
    readonly title: string;
    readonly type: string;
  }[];
}

/** An empty candidate set — the model may reference nothing. */
export const EMPTY_CANDIDATES: CandidateSets = {
  projects: [],
  people: [],
  links: [],
};

/** What a retrieval produced. */
export interface RetrievalResult {
  readonly evidence: EvidenceSet;
  readonly candidates: CandidateSets;
  /** Facts DalyHub calculated itself, rendered for the prompt. */
  readonly derivedFacts: string;
}

/** Bounded page sizes. Every repository read below is capped by one of these. */
const PAGE = {
  links: 25,
  candidates: 20,
  searchPerProvider: 12,
} as const;

/** Turn a `Date` into an ISO calendar date, or `null`. */
function isoDate(value: Date | null | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString().slice(0, 10)
    : null;
}

/** Turn a `Date` into an ISO instant, or `null`. */
function isoInstant(value: Date | null | undefined): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString()
    : null;
}

/**
 * Retrieve evidence for extracting actions from ONE Meeting.
 *
 * The record itself, its structured items and its explicitly linked context —
 * nothing else. It does not sweep in unrelated Person notes, every Activity
 * event, all Diary content or historical meetings.
 */
export async function retrieveMeetingEvidence(
  scope: WorkspaceScope,
  meetingId: string,
  limits: EvidenceLimits,
  allowed: ReadonlySet<PrivacyCategory>,
): Promise<RetrievalResult> {
  const meeting = await scope.meetings.get(meetingId);
  if (!meeting) {
    return {
      evidence: selectEvidence([], limits, allowed),
      candidates: EMPTY_CANDIDATES,
      derivedFacts: "",
    };
  }

  const candidates: EvidenceCandidate[] = [];
  const date = isoDate(meeting.startsAt);
  const updatedAt = isoInstant(meeting.updatedAt);

  // Rank 0 — the record the owner is looking at. Always first.
  if (meeting.agendaMarkdown.trim().length > 0) {
    candidates.push({
      kind: "meeting",
      entityId: meeting.id,
      title: `${meeting.title} — agenda`,
      date,
      href: `/meetings/${meeting.id}`,
      text: meeting.agendaMarkdown,
      category: "general",
      updatedAt,
      rank: 0,
    });
  }
  if (meeting.notesMarkdown.trim().length > 0) {
    candidates.push({
      kind: "meeting",
      entityId: meeting.id,
      title: `${meeting.title} — notes`,
      date,
      href: `/meetings/${meeting.id}`,
      text: meeting.notesMarkdown,
      category: "general",
      updatedAt,
      rank: 0,
    });
  }
  for (const item of meeting.items) {
    candidates.push({
      kind: "meeting_item",
      entityId: meeting.id,
      title: `${meeting.title} — ${item.kind}`,
      date,
      href: `/meetings/${meeting.id}`,
      text: item.bodyMarkdown,
      category: "general",
      updatedAt: isoInstant(item.updatedAt),
      rank: 1,
    });
  }

  const context = await collectLinkedContext(scope, meeting.id);
  candidates.push(...context.candidates);

  return {
    evidence: selectEvidence(candidates, limits, allowed),
    candidates: context.candidates2,
    derivedFacts: [
      `record: Meeting`,
      `title: ${meeting.title}`,
      date ? `date: ${date}` : null,
      `agenda items: ${meeting.items.filter((i) => i.kind === "agenda").length}`,
      `decisions recorded: ${meeting.items.filter((i) => i.kind === "decision").length}`,
      `actions recorded: ${meeting.items.filter((i) => i.kind === "action").length}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  };
}

/** Retrieve evidence for extracting actions from ONE Note. */
export async function retrieveNoteEvidence(
  scope: WorkspaceScope,
  noteId: string,
  limits: EvidenceLimits,
  allowed: ReadonlySet<PrivacyCategory>,
): Promise<RetrievalResult> {
  const entity = await scope.entities.getById(noteId);
  if (!entity || entity.type !== "note") {
    return {
      evidence: selectEvidence([], limits, allowed),
      candidates: EMPTY_CANDIDATES,
      derivedFacts: "",
    };
  }
  const details = await scope.noteDetails.get(noteId);
  const content = details?.content ?? "";

  const candidates: EvidenceCandidate[] = [];
  if (content.trim().length > 0) {
    candidates.push({
      kind: "note",
      entityId: entity.id,
      title: entity.title,
      date: isoDate(entity.updatedAt),
      href: `/notes/${entity.id}`,
      text: content,
      category: "general",
      updatedAt: isoInstant(entity.updatedAt),
      rank: 0,
    });
  }

  const context = await collectLinkedContext(scope, entity.id);
  candidates.push(...context.candidates);

  return {
    evidence: selectEvidence(candidates, limits, allowed),
    candidates: context.candidates2,
    derivedFacts: `record: Note\ntitle: ${entity.title}`,
  };
}

/**
 * The explicitly LINKED context around a record, plus the candidate allowlists.
 *
 * One bounded EntityLink page, joined counterparts included by the repository —
 * never an N+1 walk, and never a second hop. A Person reached this way is
 * classified `relationships` and is therefore excluded unless the owner has
 * allowed that category, which is AI-04's boundary doing its job on the ordinary
 * path rather than as a special case.
 */
async function collectLinkedContext(
  scope: WorkspaceScope,
  entityId: string,
): Promise<{
  readonly candidates: readonly EvidenceCandidate[];
  readonly candidates2: CandidateSets;
}> {
  let page;
  try {
    page = await scope.entityLinks.listForEntity(entityId, {
      limit: PAGE.links,
    });
  } catch {
    // A relationship failure must not cost the owner their extraction.
    return { candidates: [], candidates2: EMPTY_CANDIDATES };
  }

  const evidence: EvidenceCandidate[] = [];
  const projects: { id: string; title: string }[] = [];
  const people: { id: string; title: string }[] = [];
  const links: { id: string; title: string; type: string }[] = [];

  for (const view of page.items) {
    const counterpart = view.counterpart;
    const kind = counterpart.type;
    links.push({
      id: counterpart.id,
      title: counterpart.title,
      type: kind,
    });
    if (kind === "project" && projects.length < PAGE.candidates) {
      projects.push({ id: counterpart.id, title: counterpart.title });
    }
    if (kind === "person" && people.length < PAGE.candidates) {
      people.push({ id: counterpart.id, title: counterpart.title });
    }
    // Titles only for linked context: a linked Project's whole body is not
    // relevant to extracting actions from this record, and sending it would be
    // spending the owner's budget on noise.
    evidence.push({
      kind: mapEntityKind(kind),
      entityId: counterpart.id,
      title: counterpart.title,
      date: null,
      href: hrefForEntity(kind, counterpart.id),
      text: `${kind}: ${counterpart.title}`,
      category: defaultCategoryForKind(mapEntityKind(kind)),
      updatedAt: isoInstant(counterpart.updatedAt),
      rank: 5,
    });
  }

  return {
    candidates: evidence,
    candidates2: {
      projects,
      people,
      links: links.slice(0, PAGE.candidates),
    },
  };
}

/** Map an entity type to an evidence kind, defaulting safely. */
function mapEntityKind(type: string): EvidenceCandidate["kind"] {
  switch (type) {
    case "meeting":
    case "note":
    case "task":
    case "project":
    case "goal":
    case "area":
    case "person":
    case "review":
      return type;
    case "diary_entry":
      return "diary";
    default:
      return "fact";
  }
}

/** The canonical deep link for a record kind. `null` when there is none. */
export function hrefForEntity(type: string, id: string): string | null {
  switch (type) {
    case "meeting":
      return `/meetings/${id}`;
    case "note":
      return `/notes/${id}`;
    case "task":
      return `/tasks?task=${id}`;
    case "project":
      return `/projects/${id}`;
    case "goal":
      return `/goals/${id}`;
    case "area":
      return `/areas/${id}`;
    case "person":
      return `/people/${id}`;
    case "review":
      return `/reviews/${id}`;
    default:
      return null;
  }
}

/**
 * Retrieve evidence for an Ask DalyHub question.
 *
 * Deterministic first: the question's own words drive three bounded, existing
 * search projections (Notes, Tasks, Meetings). Nothing recursive, no query the
 * model wrote, no expansion beyond one pass.
 */
export async function retrieveAnswerEvidence(
  scope: WorkspaceScope,
  question: string,
  limits: EvidenceLimits,
  allowed: ReadonlySet<PrivacyCategory>,
): Promise<RetrievalResult> {
  const terms = searchTerms(question);
  if (terms.length === 0) {
    return {
      evidence: selectEvidence([], limits, allowed),
      candidates: EMPTY_CANDIDATES,
      derivedFacts: "",
    };
  }
  const query = terms.join(" ");
  const candidates: EvidenceCandidate[] = [];

  const [notes, tasks, meetings] = await Promise.all([
    safely(() =>
      scope.notes.search({ text: query, limit: PAGE.searchPerProvider }),
    ),
    safely(() =>
      scope.tasks.searchTasks({ text: query, limit: PAGE.searchPerProvider }),
    ),
    safely(() =>
      scope.meetings.searchMeetings({
        text: query,
        limit: PAGE.searchPerProvider,
      }),
    ),
  ]);

  for (const [index, note] of (notes ?? []).entries()) {
    candidates.push({
      kind: "note",
      entityId: note.id,
      title: note.title,
      date: isoDate(note.updatedAt),
      href: `/notes/${note.id}`,
      text: note.excerpt.length > 0 ? note.excerpt : note.title,
      category: "general",
      updatedAt: isoInstant(note.updatedAt),
      rank: 10 + index,
    });
  }
  for (const [index, task] of (tasks ?? []).entries()) {
    const parent = task.parent ? ` (${task.parent.title})` : "";
    candidates.push({
      kind: "task",
      entityId: task.id,
      title: task.title,
      date: task.dueDate ?? task.scheduledDate ?? isoDate(task.updatedAt),
      href: `/tasks?task=${task.id}`,
      text: `Task: ${task.title}${parent}. Status ${task.status}${
        task.dueDate ? `, due ${task.dueDate}` : ""
      }.`,
      category: "general",
      updatedAt: isoInstant(task.updatedAt),
      rank: 20 + index,
    });
  }
  for (const [index, meeting] of (meetings ?? []).entries()) {
    candidates.push({
      kind: "meeting",
      entityId: meeting.id,
      title: meeting.title,
      date: isoDate(meeting.startsAt),
      href: `/meetings/${meeting.id}`,
      text: `Meeting: ${meeting.title}${
        meeting.location ? ` at ${meeting.location}` : ""
      } on ${isoDate(meeting.startsAt) ?? "an unrecorded date"}.`,
      category: "general",
      updatedAt: isoInstant(meeting.startsAt),
      rank: 15 + index,
    });
  }

  return {
    evidence: selectEvidence(candidates, limits, allowed),
    candidates: EMPTY_CANDIDATES,
    derivedFacts: "",
  };
}

/** Run a repository read, degrading to `null` rather than failing the request. */
async function safely<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

/**
 * Reduce a question to bounded search terms: stopwords removed, punctuation
 * dropped, length- and count-capped. Deterministic, and never sent to a model —
 * this runs BEFORE any provider is contacted.
 */
export function searchTerms(question: string): readonly string[] {
  const stop = new Set([
    "what",
    "which",
    "when",
    "where",
    "who",
    "whom",
    "why",
    "how",
    "did",
    "do",
    "does",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "with",
    "about",
    "from",
    "is",
    "are",
    "was",
    "were",
    "been",
    "have",
    "has",
    "had",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "still",
    "any",
    "all",
    "last",
    "get",
    "got",
    "been",
    "dalyhub",
  ]);
  return question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stop.has(word))
    .slice(0, 8);
}

/** Render the candidate allowlists for the prompt. Ids and titles only. */
export function renderCandidates(candidates: CandidateSets): string {
  const lines: string[] = [];
  if (candidates.projects.length > 0) {
    lines.push("projects (use these ids for suggestedProjectId, or null):");
    for (const project of candidates.projects) {
      lines.push(`  ${project.id} — ${project.title}`);
    }
  }
  if (candidates.people.length > 0) {
    lines.push("people (use these ids for suggestedOwnerPersonId, or null):");
    for (const person of candidates.people) {
      lines.push(`  ${person.id} — ${person.title}`);
    }
  }
  if (candidates.links.length > 0) {
    lines.push(
      "link targets (use these ids for suggestedLinks.targetEntityId):",
    );
    for (const link of candidates.links) {
      lines.push(`  ${link.id} — ${link.type}: ${link.title}`);
    }
  }
  return lines.join("\n");
}
