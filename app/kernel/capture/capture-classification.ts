/**
 * CAPTURE-01 Capture kernel — deterministic, conservative classification.
 *
 * ── The rule this module exists to enforce ───────────────────────────────────
 * A failed classification must never become a failed capture (CAPTURE-01 §8). So this is
 * not a classifier that tries to be clever and occasionally files something
 * wrongly; it is a classifier that acts ONLY on signals a person deliberately
 * put in the text, and sends everything else to the Inbox.
 *
 * No AI, no model, no network, no embeddings, no scoring, no learning (CAPTURE-01 §45). A
 * capture must work when OpenAI is down, when AI is switched off and when the
 * owner has no credits, because a thought does not wait for a provider.
 *
 * ── The signals, and why each is trustworthy ────────────────────────────────
 * Each rule below either reflects a marker the owner typed or a SHAPE that only
 * one kind of record has. Nothing infers meaning from ordinary prose.
 *
 *   note   a headline plus a body; several paragraphs; a long passage; an
 *          explicit `idea:` / `note:` style marker; a shared web page.
 *   task   the TASKS-01 deterministic parser recognised real planning grammar
 *          (a date, a priority, a recurrence, a sector, waiting, delegate); or
 *          the line opens with an unmistakable action verb.
 *   inbox  everything else, including everything ambiguous. "Look into camper
 *          solar" is genuinely ambiguous, and Inbox is the honest answer.
 *
 * The parser is INJECTED rather than imported so this module stays free of the
 * shared UI layer while still reusing the ONE parser every capture surface uses
 * (CAPTURE-01 §7) — the platform passes `parseQuickCapture` straight in.
 */

import type {
  CaptureDestination,
  CaptureRecordKind,
  CaptureRequest,
} from "./capture";
import { codePointLength } from "./capture-validation";

/**
 * Text at or beyond this length is a Note. A Task's identity is its title, and a
 * title nobody can read on one line of a phone is not a title.
 */
export const CAPTURE_AUTO_NOTE_LENGTH = 280;

/**
 * The closed action-verb vocabulary. Small on purpose: every entry is a verb
 * that, at the START of a captured line, is an instruction to a future self and
 * essentially never opens a note. Expanding this list is a product decision, not
 * a tuning exercise — a verb that is sometimes note-like belongs in the Inbox.
 */
export const CAPTURE_ACTION_VERBS: ReadonlySet<string> = new Set([
  "book",
  "buy",
  "call",
  "cancel",
  "chase",
  "check",
  "collect",
  "confirm",
  "email",
  "file",
  "fix",
  "order",
  "pay",
  "phone",
  "post",
  "print",
  "renew",
  "reply",
  "return",
  "ring",
  "schedule",
  "send",
  "submit",
  "text",
]);

/**
 * Two-word action openers, checked before the single-verb list so "pick up" is
 * an action while a bare "pick" is not.
 */
export const CAPTURE_ACTION_PHRASES: readonly string[] = [
  "drop off",
  "follow up",
  "pick up",
  "sign up",
  "chase up",
];

/**
 * A leading marker that names the capture as reference material: an optional
 * short subject, then one of a closed set of nouns, then a colon. Matches
 * "OpO idea: …", "Note: …", "Thought: …". Bounded so it can never scan far.
 */
const NOTE_MARKER =
  /^[\p{L}\p{N} .,'&()/-]{0,48}\b(idea|ideas|note|notes|thought|thoughts|observation|reflection|reference)\s*:/iu;

/** Why the classifier decided what it decided. Surfaced in tests, not in the API. */
export type CaptureClassificationReason =
  | "explicit_intent"
  | "title_and_body"
  | "multiple_paragraphs"
  | "long_text"
  | "note_marker"
  | "shared_page"
  | "planning_grammar"
  | "action_verb"
  | "ambiguous";

/** The classifier's answer. */
export type CaptureClassification = {
  readonly kind: CaptureRecordKind;
  readonly destination: CaptureDestination;
  readonly reason: CaptureClassificationReason;
};

/**
 * The narrow slice of the TASKS-01 quick-capture parser this module needs. Only
 * "did it recognise real planning grammar?" — the classifier never reads the
 * parsed fields, which belong to Task creation.
 */
export type CapturePlanningProbe = (text: string) => boolean;

const TASK: CaptureClassification["kind"] = "task";

function task(reason: CaptureClassificationReason): CaptureClassification {
  return { kind: TASK, destination: "Inbox", reason };
}

function note(reason: CaptureClassificationReason): CaptureClassification {
  return { kind: "note", destination: "Notes", reason };
}

/** True when the line opens with one of the closed action openers. */
export function opensWithAction(text: string): boolean {
  const line = text.split("\n", 1)[0]?.trim().toLowerCase() ?? "";
  if (line.length === 0) return false;
  for (const phrase of CAPTURE_ACTION_PHRASES) {
    if (line === phrase || line.startsWith(`${phrase} `)) return true;
  }
  const first = line.split(/[\s,.!?;:]+/, 1)[0] ?? "";
  return CAPTURE_ACTION_VERBS.has(first);
}

/** True when the capture carries an explicit reference marker. */
export function hasNoteMarker(text: string): boolean {
  const line = text.split("\n", 1)[0] ?? "";
  return NOTE_MARKER.test(line);
}

/**
 * Classify a validated capture.
 *
 * An explicit `task`, `note` or `inbox` intent is honoured verbatim and never
 * second-guessed — the sender always outranks the classifier (CAPTURE-01 §5). Only `auto`
 * reaches the rules, and only the rules above can move a capture out of Inbox.
 */
export function classifyCapture(
  request: CaptureRequest,
  planningGrammarFound: CapturePlanningProbe,
): CaptureClassification {
  if (request.intent === "task" || request.intent === "inbox") {
    return task("explicit_intent");
  }
  if (request.intent === "note") {
    return note("explicit_intent");
  }

  const text = request.text;

  // Shape first: these are structural facts about what was sent, not readings of
  // what it means, so they are the signals least able to be wrong.
  if (request.title !== null && text.length > 0 && text !== request.title) {
    return note("title_and_body");
  }
  if (/\n\s*\n/.test(text) || text.split("\n").length > 2) {
    return note("multiple_paragraphs");
  }
  if (codePointLength(text) >= CAPTURE_AUTO_NOTE_LENGTH) {
    return note("long_text");
  }
  if (hasNoteMarker(text)) {
    return note("note_marker");
  }

  // Planning grammar is the strongest Task signal there is: the owner typed
  // "tomorrow", "p1", "every Monday" or "due Friday", which is not something a
  // note says. It is checked before the shared-page rule so "Read this article
  // tomorrow" with a URL is still a Task.
  if (planningGrammarFound(text)) {
    return task("planning_grammar");
  }
  if (opensWithAction(text)) {
    return task("action_verb");
  }

  // A shared web page with no action in it is reference material.
  if (request.sourceUrl !== null) {
    return note("shared_page");
  }

  // Genuinely ambiguous. Save it; do not guess.
  return task("ambiguous");
}
