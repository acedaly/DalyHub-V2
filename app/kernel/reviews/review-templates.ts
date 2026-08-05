import {
  REVIEW_SECTION_IDS,
  type ReviewSectionId,
  type ReviewType,
} from "./review";

export interface ReviewTemplateSection {
  readonly id: ReviewSectionId;
  readonly label: string;
  readonly prompt?: string;
}

export interface ReviewTemplate {
  readonly id: string;
  readonly type: ReviewType;
  readonly version: 1;
  readonly sections: readonly ReviewTemplateSection[];
}

const SECTION_LABELS: Record<ReviewSectionId, string> = {
  "summary.overall": "Overall reflection",
  "summary.highlights": "Highlights",
  "summary.challenges": "Challenges",
  "summary.lessons": "Lessons",
  "summary.decisions": "Decisions",
  "summary.next_focus": "Next-period focus",
  "progress.commentary": "Progress commentary",
  "tasks.commentary": "Task commentary",
  "diary.commentary": "Diary reflection",
  "people_meetings.commentary": "People and meetings reflection",
};

const PROMPTS: Record<ReviewType, Partial<Record<ReviewSectionId, string>>> = {
  weekly: {
    "summary.overall": "What went well? What was difficult?",
    "summary.highlights": "What did I complete?",
    "summary.challenges": "What remains open?",
    "summary.lessons": "What did I learn?",
    "people_meetings.commentary": "Who needs follow-up?",
    "summary.next_focus": "What matters next week?",
  },
  monthly: {
    "summary.overall": "What were the month's major outcomes?",
    "progress.commentary": "Which Goals and Projects moved?",
    "summary.challenges": "What stalled?",
    "summary.lessons": "What patterns appeared?",
    "summary.next_focus": "What should change next month?",
  },
  quarterly: {
    "summary.overall": "What meaningful progress occurred?",
    "progress.commentary": "Are current Goals still correct?",
    "tasks.commentary": "Which Projects should continue, pause or stop?",
    "summary.decisions": "What commitments should change?",
    "summary.next_focus": "What are the next quarter's priorities?",
  },
  annual: {
    "summary.overall": "What defined the year?",
    "summary.highlights": "What am I proud of?",
    "summary.challenges": "What did not work?",
    "people_meetings.commentary": "Which relationships mattered?",
    "progress.commentary": "What changed across my Areas?",
    "summary.lessons": "What should I carry forward?",
    "summary.decisions": "What should I stop doing?",
    "summary.next_focus": "What matters next year?",
  },
  custom: {
    "summary.overall": "What happened in this period?",
    "summary.next_focus": "What should happen next?",
  },
};

export function reviewTemplateId(type: ReviewType): string {
  return `review.${type}.v1`;
}

export function resolveReviewTemplate(type: ReviewType): ReviewTemplate {
  return {
    id: reviewTemplateId(type),
    type,
    version: 1,
    sections: REVIEW_SECTION_IDS.map((id) => ({
      id,
      label: SECTION_LABELS[id],
      prompt: PROMPTS[type][id],
    })),
  };
}

export function reviewSectionLabel(id: ReviewSectionId): string {
  return SECTION_LABELS[id];
}

/**
 * Resolve the template a STORED Review was created against, by its persisted
 * `template_id`.
 *
 * REVIEW-02's guided flow presents the Review's own prompts, so it must resolve
 * them from what the Review stores, never from "whatever the current template
 * happens to be". Today `review.<type>.v1` is the only published version for each
 * type, so this returns the same object `resolveReviewTemplate` does — but it is
 * the SEAM through which a future `v2` arrives without rewriting a single
 * historical Review, and the guided flow already reads through it.
 *
 * An unrecognised id (a Review created by a future version, then opened by an
 * older deployment) falls back to the type's current template rather than
 * failing: the owner still sees their Review, and their stored responses are
 * never rewritten to match.
 */
export function resolveReviewTemplateForId(
  templateId: string,
  type: ReviewType,
): ReviewTemplate {
  const current = resolveReviewTemplate(type);
  return current.id === templateId ? current : current;
}

/** True when `templateId` is a version this build knows how to present. */
export function isKnownReviewTemplateId(
  templateId: string,
  type: ReviewType,
): boolean {
  return reviewTemplateId(type) === templateId;
}
