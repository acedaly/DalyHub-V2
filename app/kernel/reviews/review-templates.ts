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
