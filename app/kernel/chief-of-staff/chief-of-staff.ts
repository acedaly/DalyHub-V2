import type { DecisionStatus } from "~/kernel/decisions";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type { TaskPriority, TaskStatus } from "~/kernel/tasks";

export type ChiefOfStaffActor = {
  /** Stable Cloudflare Access subject, never an email address or token. */
  readonly subject: string;
  readonly requestId: string;
};

export type TaskReferenceInput = {
  readonly projectId?: string | null;
  readonly areaId?: string | null;
};

export type CreateChiefTaskInput = TaskReferenceInput & {
  readonly title: string;
  readonly notes?: string | null;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  readonly priority?: TaskPriority | null;
  readonly status?: TaskStatus;
};

export type UpdateChiefTaskInput = {
  readonly taskId: string;
  readonly title?: string;
  readonly notes?: string | null;
  readonly dueDate?: string | null;
  readonly scheduledDate?: string | null;
  readonly priority?: TaskPriority | null;
  readonly status?: TaskStatus;
  readonly projectId?: string | null;
  readonly areaId?: string | null;
};

export type CaptureItemInput = TaskReferenceInput & {
  readonly type: "task" | "idea" | "note" | "decision" | "waiting" | "reminder";
  readonly title: string;
  readonly text?: string | null;
  readonly dueDate?: string | null;
  readonly person?: string | null;
  readonly followUpDate?: string | null;
  readonly source?: string | null;
  readonly context?: string | null;
};

export type ProjectParentReferenceInput = {
  readonly areaId?: string | null;
  readonly goalId?: string | null;
};

export type CreateChiefProjectInput = ProjectParentReferenceInput & {
  readonly title: string;
  readonly status?: ProjectWorkflowStatus;
};

export type UpdateChiefProjectInput = ProjectParentReferenceInput & {
  readonly projectId: string;
  readonly title?: string;
  readonly status?: ProjectWorkflowStatus;
  /** `true` completes the Project, `false` reopens it. Omitted leaves it alone. */
  readonly completed?: boolean;
  /** `true` archives the Project, `false` restores it. Both are reversible. */
  readonly archived?: boolean;
};

/**
 * Where a Note is filed. A Note is many-to-many with the records it documents
 * (PROJ-03), so every supplied reference becomes its own `link.related` link —
 * the SAME relationship the shared Linked Items surface shows on both records.
 */
export type NoteReferenceInput = {
  readonly projectId?: string | null;
  readonly areaId?: string | null;
  readonly goalId?: string | null;
};

export type CreateChiefNoteInput = NoteReferenceInput & {
  readonly title: string;
  readonly content?: string | null;
  readonly tags?: readonly string[];
};

export type UpdateChiefNoteInput = NoteReferenceInput & {
  readonly noteId: string;
  readonly title?: string;
  readonly content?: string | null;
  readonly tags?: readonly string[];
  /** `true` puts the Note away, `false` brings it back. Never a deletion. */
  readonly archived?: boolean;
};

export type RecordDecisionInput = {
  readonly decision: string;
  readonly rationale?: string | null;
  readonly projectId?: string | null;
  readonly areaId?: string | null;
  readonly decisionDate: string;
  readonly reviewDate?: string | null;
};

export type CreateWaitingForInput = {
  readonly what: string;
  readonly personOrSource: string;
  readonly projectId?: string | null;
  readonly areaId?: string | null;
  readonly createdDate?: string | null;
  readonly followUpDate?: string | null;
  readonly notes?: string | null;
};

export type ChiefOfStaffRequest =
  | { readonly action: "get_chief_of_staff_context" }
  | { readonly action: "get_weekly_review_context" }
  | { readonly action: "get_today" }
  | {
      readonly action: "get_projects";
      readonly input?: {
        readonly status?: "active" | "planned" | "on_hold";
        readonly limit?: number;
      };
    }
  | {
      readonly action: "get_project";
      readonly input: { readonly projectId: string };
    }
  | {
      readonly action: "search_dalyhub";
      readonly input: { readonly query: string; readonly limit?: number };
    }
  | {
      readonly action: "capture_item";
      readonly actor: ChiefOfStaffActor;
      readonly input: CaptureItemInput;
    }
  | {
      readonly action: "create_task";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefTaskInput;
    }
  | {
      readonly action: "update_task";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefTaskInput;
    }
  | {
      readonly action: "complete_task";
      readonly actor: ChiefOfStaffActor;
      readonly input: { readonly taskId: string };
    }
  | {
      readonly action: "get_note";
      readonly input: { readonly noteId: string };
    }
  | {
      readonly action: "create_project";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefProjectInput;
    }
  | {
      readonly action: "update_project";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefProjectInput;
    }
  | {
      readonly action: "create_note";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefNoteInput;
    }
  | {
      readonly action: "update_note";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefNoteInput;
    }
  | {
      readonly action: "record_decision";
      readonly actor: ChiefOfStaffActor;
      readonly input: RecordDecisionInput;
    }
  | {
      readonly action: "create_waiting_for";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateWaitingForInput;
    }
  | {
      readonly action: "resolve_waiting_for";
      readonly actor: ChiefOfStaffActor;
      readonly input: { readonly taskId: string };
    };

export type CompactTask = {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly due: string | null;
  readonly scheduled: string | null;
  readonly completedAt: string | null;
  readonly project: { readonly id: string; readonly title: string } | null;
  readonly area: { readonly id: string; readonly title: string } | null;
  readonly waitingOn?: string | null;
  readonly waitingSince?: string | null;
  readonly followUpOn?: string | null;
};

export type CompactDecision = {
  readonly id: string;
  readonly decision: string;
  readonly status: DecisionStatus;
  readonly rationale: string | null;
  readonly decisionDate: string | null;
  readonly reviewDate: string | null;
  readonly related: {
    readonly kind: "project" | "area";
    readonly id: string;
    readonly title: string;
  } | null;
};

export type CompactProject = {
  readonly id: string;
  readonly title: string;
  readonly status: ProjectWorkflowStatus;
  readonly area: { readonly id: string; readonly title: string } | null;
  readonly goal: { readonly id: string; readonly title: string } | null;
  readonly completedAt: string | null;
  readonly archivedAt: string | null;
};

export type CompactNote = {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly excerpt: string;
  readonly updatedAt: string;
};

/** RPC-safe result. Every member is structured-clone/JSON serialisable. */
export type ChiefOfStaffResult = { readonly [key: string]: unknown };
