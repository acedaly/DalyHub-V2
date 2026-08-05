/**
 * AI-01 / AI-04 kernel — evidence, privacy classification and the bounds that
 * keep both honest.
 *
 * Evidence is the ONLY thing a model ever sees of a workspace. It is assembled
 * by DalyHub from its own repositories, bounded here, and labelled with a stable
 * internal id (`evidence_01`). The model cites those ids; DalyHub maps them back
 * to real records. A model can therefore never invent a record: an id it did not
 * receive resolves to nothing and the answer is rejected or downgraded
 * (`ai-schemas.ts`).
 *
 * Evidence content is UNTRUSTED INPUT — a Note may contain "ignore previous
 * instructions". It is data, never instruction; the prompt registry says so and
 * the schema validator enforces the shape of what comes back.
 */

/**
 * The privacy categories AI evidence is classified into. Deliberately small and
 * explicit — DalyHub does not attempt to infer a category with AI. Classification
 * comes from the module a record belongs to, its Area, and explicit owner choice.
 */
export const PRIVACY_CATEGORIES = [
  /** Ordinary productivity content: Tasks, Projects, Goals, Areas, Meetings, Notes. */
  "general",
  /** Work / NSW RFS material. */
  "work",
  /** Health-related content. */
  "health",
  /** Family and children. */
  "family",
  /** Relationships and People records. */
  "relationships",
  /** Financial content, including Assets and money. */
  "financial",
  /** Authored personal reflection: Diary entries and Review reflections. */
  "reflection",
] as const;

export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];

/** True when `value` names a privacy category. */
export function isPrivacyCategory(value: unknown): value is PrivacyCategory {
  return (
    typeof value === "string" &&
    (PRIVACY_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Categories treated as SENSITIVE. Sensitive evidence is excluded by default and
 * requires an explicit, per-category owner decision before it can be sent. This
 * is AI-04's consent boundary, and it is conservative by design.
 */
export const SENSITIVE_CATEGORIES: readonly PrivacyCategory[] = [
  "health",
  "family",
  "relationships",
  "financial",
  "reflection",
];

/** True when a category needs an explicit owner allowance before it is sent. */
export function isSensitiveCategory(category: PrivacyCategory): boolean {
  return (SENSITIVE_CATEGORIES as readonly string[]).includes(category);
}

/** Owner-facing label for a category. */
export function privacyCategoryLabel(category: PrivacyCategory): string {
  switch (category) {
    case "general":
      return "General productivity";
    case "work":
      return "Work";
    case "health":
      return "Health";
    case "family":
      return "Family and children";
    case "relationships":
      return "Relationships and people";
    case "financial":
      return "Financial";
    case "reflection":
      return "Personal reflection";
  }
}

/** The DalyHub record kinds evidence may be drawn from. */
export const EVIDENCE_KINDS = [
  "meeting",
  "meeting_item",
  "note",
  "task",
  "project",
  "goal",
  "area",
  "person",
  "diary",
  "review",
  "fact",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * Map a record kind to its DEFAULT privacy category, before any Area-level or
 * owner override. The classification is structural, never inferred from text.
 *
 * `person`, `diary` and `review` are the three that default to a sensitive
 * category — matching the standing rule that People and Diary never leave
 * DalyHub without an explicit per-action decision (AGENTS.md §8, §17).
 */
export function defaultCategoryForKind(kind: EvidenceKind): PrivacyCategory {
  switch (kind) {
    case "person":
      return "relationships";
    case "diary":
      return "reflection";
    case "review":
      return "reflection";
    default:
      return "general";
  }
}

/**
 * One bounded piece of evidence. `id` is what the model cites; `entityId` is the
 * real DalyHub record and is resolved back on the way out — it is included in the
 * payload sent to the provider only as an opaque candidate id where a feature
 * needs one (`allowlist` in `ai-schemas.ts`), never as an invitation to invent
 * more.
 */
export interface EvidenceItem {
  /** Stable per-request citation id: `evidence_01`, `evidence_02`, … */
  readonly id: string;
  readonly kind: EvidenceKind;
  /** The DalyHub entity id, or `null` for a derived fact with no single record. */
  readonly entityId: string | null;
  readonly title: string;
  /** ISO calendar date most relevant to this evidence, when it has one. */
  readonly date: string | null;
  /** Canonical in-app deep link for the citation card. */
  readonly href: string | null;
  /** The excerpt actually sent. Already truncated to the feature's ceiling. */
  readonly excerpt: string;
  readonly category: PrivacyCategory;
  /**
   * The record's `updatedAt` as an ISO instant, used by the source fingerprint so
   * a stale reuse is detectable. `null` for derived facts.
   */
  readonly updatedAt: string | null;
}

/** The result of assembling evidence: the bounded set plus what was left out. */
export interface EvidenceSet {
  readonly items: readonly EvidenceItem[];
  /** True when relevant records existed that the limits excluded. */
  readonly truncated: boolean;
  /** How many matching records were found before the limits were applied. */
  readonly consideredCount: number;
  /** Categories present in `items` that are sensitive. */
  readonly sensitiveCategories: readonly PrivacyCategory[];
  /**
   * Categories that were EXCLUDED because the owner has not allowed them. Drives
   * the "some content was left out" disclosure and the consent prompt.
   */
  readonly excludedCategories: readonly PrivacyCategory[];
  /** Total characters across every excerpt actually included. */
  readonly totalCharacters: number;
}

/** An empty evidence set. */
export const EMPTY_EVIDENCE_SET: EvidenceSet = {
  items: [],
  truncated: false,
  consideredCount: 0,
  sensitiveCategories: [],
  excludedCategories: [],
  totalCharacters: 0,
};

/** The per-request ceilings applied when assembling evidence. */
export interface EvidenceLimits {
  readonly maxRecords: number;
  readonly maxExcerptCharacters: number;
  readonly maxTotalCharacters: number;
  readonly maxExcerptsPerRecord: number;
}

/** A candidate before bounding: everything the retriever found, with a rank. */
export interface EvidenceCandidate {
  readonly kind: EvidenceKind;
  readonly entityId: string | null;
  readonly title: string;
  readonly date: string | null;
  readonly href: string | null;
  /** Full text; truncated by {@link selectEvidence} to the excerpt ceiling. */
  readonly text: string;
  readonly category: PrivacyCategory;
  readonly updatedAt: string | null;
  /**
   * Deterministic relevance rank — LOWER sorts first. Produced by the retriever
   * from repository facts (recency, link distance, explicit selection), never by
   * a model.
   */
  readonly rank: number;
}

/** Format the citation id for a zero-based position. */
export function evidenceIdForIndex(index: number): string {
  return `evidence_${String(index + 1).padStart(2, "0")}`;
}

/**
 * Truncate an excerpt to `max` characters on a whitespace boundary where one is
 * near the cut, so a citation never ends mid-word. Deterministic and pure.
 */
export function truncateExcerpt(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (collapsed.length <= max) return collapsed;
  const hard = collapsed.slice(0, max);
  const lastSpace = hard.lastIndexOf(" ");
  const body = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${body.trimEnd()}…`;
}

/**
 * Turn ranked candidates into a bounded, id-stamped {@link EvidenceSet}.
 *
 * The order of operations is the contract:
 *   1. drop candidates in categories the owner has not allowed (recording which);
 *   2. sort deterministically by `(rank, date desc, title, entityId)` so the same
 *      inputs always produce the same evidence — a prerequisite for the source
 *      fingerprint and for reproducible tests;
 *   3. take at most `maxRecords`, truncating each excerpt to the per-excerpt
 *      ceiling and stopping early at the total-character ceiling;
 *   4. report `truncated` honestly whenever anything relevant was left out.
 *
 * PURE — no clock, no randomness, no I/O.
 */
export function selectEvidence(
  candidates: readonly EvidenceCandidate[],
  limits: EvidenceLimits,
  allowedCategories: ReadonlySet<PrivacyCategory>,
): EvidenceSet {
  const excluded = new Set<PrivacyCategory>();
  const permitted: EvidenceCandidate[] = [];
  for (const candidate of candidates) {
    if (allowedCategories.has(candidate.category)) {
      permitted.push(candidate);
    } else {
      excluded.add(candidate.category);
    }
  }

  const ordered = [...permitted].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aDate = a.date ?? "";
    const bDate = b.date ?? "";
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return (a.entityId ?? "") < (b.entityId ?? "") ? -1 : 1;
  });

  const items: EvidenceItem[] = [];
  const sensitive = new Set<PrivacyCategory>();
  let totalCharacters = 0;
  let stoppedEarly = false;

  for (const candidate of ordered) {
    if (items.length >= limits.maxRecords) {
      stoppedEarly = true;
      break;
    }
    const excerpt = truncateExcerpt(
      candidate.text,
      limits.maxExcerptCharacters,
    );
    if (excerpt.length === 0) continue;
    if (totalCharacters + excerpt.length > limits.maxTotalCharacters) {
      stoppedEarly = true;
      break;
    }
    totalCharacters += excerpt.length;
    if (isSensitiveCategory(candidate.category)) {
      sensitive.add(candidate.category);
    }
    items.push({
      id: evidenceIdForIndex(items.length),
      kind: candidate.kind,
      entityId: candidate.entityId,
      title: candidate.title,
      date: candidate.date,
      href: candidate.href,
      excerpt,
      category: candidate.category,
      updatedAt: candidate.updatedAt,
    });
  }

  return {
    items,
    truncated: stoppedEarly || permitted.length > items.length,
    consideredCount: candidates.length,
    sensitiveCategories: orderedCategories(sensitive),
    excludedCategories: orderedCategories(excluded),
    totalCharacters,
  };
}

/** Categories in canonical declaration order — never insertion order. */
function orderedCategories(
  set: ReadonlySet<PrivacyCategory>,
): readonly PrivacyCategory[] {
  return PRIVACY_CATEGORIES.filter((category) => set.has(category));
}

/**
 * The compact owner-facing disclosure shown before a multi-record request runs:
 * "12 DalyHub records will be sent to the configured AI provider: 4 Meetings,
 * 3 Notes, 3 Tasks and 2 Projects."
 *
 * PURE, and deliberately built from counts rather than titles so it can be shown
 * even where the titles are not yet loaded. The titles are available separately
 * so the owner can inspect and remove individual items.
 */
export function evidenceDisclosure(set: EvidenceSet): string {
  if (set.items.length === 0) {
    return "No DalyHub records will be sent.";
  }
  const counts = new Map<EvidenceKind, number>();
  for (const item of set.items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  }
  const parts = EVIDENCE_KINDS.filter((kind) => counts.has(kind)).map(
    (kind) => {
      const count = counts.get(kind) ?? 0;
      return `${count} ${evidenceKindLabel(kind, count)}`;
    },
  );
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const noun = set.items.length === 1 ? "record" : "records";
  return `${set.items.length} DalyHub ${noun} will be sent to the configured AI provider: ${list}.`;
}

/** Owner-facing noun for a record kind, singular or plural. */
export function evidenceKindLabel(kind: EvidenceKind, count: number): string {
  const plural = count !== 1;
  switch (kind) {
    case "meeting":
      return plural ? "Meetings" : "Meeting";
    case "meeting_item":
      return plural ? "Meeting items" : "Meeting item";
    case "note":
      return plural ? "Notes" : "Note";
    case "task":
      return plural ? "Tasks" : "Task";
    case "project":
      return plural ? "Projects" : "Project";
    case "goal":
      return plural ? "Goals" : "Goal";
    case "area":
      return plural ? "Areas" : "Area";
    case "person":
      return plural ? "People" : "Person";
    case "diary":
      return plural ? "Diary entries" : "Diary entry";
    case "review":
      return plural ? "Reviews" : "Review";
    case "fact":
      return plural ? "calculated facts" : "calculated fact";
  }
}

/**
 * Render the evidence block that goes to the provider. Each item is delimited and
 * labelled with its citation id; the prompt (see `ai-prompts.ts`) states that
 * everything inside this block is DATA and that instructions found within it must
 * not be followed.
 *
 * PURE and deterministic — the same set always renders the same bytes, which is
 * what makes the source fingerprint meaningful.
 */
export function renderEvidenceBlock(set: EvidenceSet): string {
  if (set.items.length === 0) return "(no evidence)";
  return set.items
    .map((item) => {
      const header = [
        `id: ${item.id}`,
        `type: ${item.kind}`,
        item.date ? `date: ${item.date}` : null,
        `title: ${sanitiseForPrompt(item.title)}`,
      ]
        .filter((line): line is string => line !== null)
        .join("\n");
      return `<record>\n${header}\ncontent: ${sanitiseForPrompt(item.excerpt)}\n</record>`;
    })
    .join("\n");
}

/**
 * Neutralise the delimiters the prompt itself uses, so record content cannot
 * close DalyHub's own framing and impersonate a system instruction. This is a
 * containment measure, not a claim that injection is solved: the schema
 * validator and the proposal step are the real guarantees.
 */
export function sanitiseForPrompt(text: string): string {
  return text
    .replace(/<\/?record>/gi, "[record]")
    .replace(/<\/?evidence>/gi, "[evidence]")
    .replace(/<\/?owner_request>/gi, "[owner_request]")
    .replace(/<\/?system_policy>/gi, "[system_policy]");
}
