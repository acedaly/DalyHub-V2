import type { DecisionStatus } from "~/kernel/decisions";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import type {
  TaskFollowUpState,
  TaskPriority,
  TaskStatus,
} from "~/kernel/tasks";

export type ChiefOfStaffActor = {
  /** Stable Cloudflare Access subject, never an email address or token. */
  readonly subject: string;
  readonly requestId: string;
};

export type TaskReferenceInput = {
  readonly projectId?: string | null;
  readonly areaId?: string | null;
};

/**
 * A Task's optional relationship to a Person. Structurally a Task belongs to a
 * Project or an Area and to nothing else (FND-07), so a Person is related to it
 * through the SAME `link.related` EntityLink the shared Linked Items surface
 * shows — never a second parentage.
 */
export type PersonRelationInput = {
  readonly personId?: string | null;
};

export type CreateChiefTaskInput = TaskReferenceInput &
  PersonRelationInput & {
    readonly title: string;
    readonly notes?: string | null;
    readonly dueDate?: string | null;
    readonly scheduledDate?: string | null;
    readonly priority?: TaskPriority | null;
    readonly status?: TaskStatus;
  };

export type UpdateChiefTaskInput = PersonRelationInput & {
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
  /** People to relate to the Project, as `link.related` EntityLinks. */
  readonly personIds?: readonly string[];
  /** Create even when an existing Project has effectively the same name. */
  readonly allowDuplicate?: boolean;
};

export type UpdateChiefProjectInput = ProjectParentReferenceInput & {
  readonly projectId: string;
  readonly title?: string;
  readonly status?: ProjectWorkflowStatus;
  /** `true` completes the Project, `false` reopens it. Omitted leaves it alone. */
  readonly completed?: boolean;
  /** `true` archives the Project, `false` restores it. Both are reversible. */
  readonly archived?: boolean;
  /** People to relate to the Project. Adds relationships; never removes one. */
  readonly personIds?: readonly string[];
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
  /**
   * A Person the Note documents — "what we discussed with John". The SAME
   * `link.related` relationship, so the Note appears on the Person's record.
   */
  readonly personId?: string | null;
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
  /**
   * Who or what is owed, as free text. Optional when `personId` names a Person
   * record: their display name is then the delegate, so the two can never
   * disagree. Exactly one of the two must be supplied.
   */
  readonly personOrSource?: string;
  /**
   * An exact Person record the item waits on. When supplied, the Task's
   * canonical waiting subject is that ENTITY (`task.waiting_on`), not a string,
   * so the item shows on the Person's record and survives a rename.
   */
  readonly personId?: string | null;
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
    }
  | {
      readonly action: "reopen_task";
      readonly actor: ChiefOfStaffActor;
      readonly input: { readonly taskId: string };
    }
  | {
      readonly action: "get_people";
      readonly input?: ListChiefPeopleInput;
    }
  | {
      readonly action: "get_person";
      readonly input: { readonly personId: EntityReference };
    }
  | {
      readonly action: "create_person";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefPersonInput;
    }
  | {
      readonly action: "update_person";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefPersonInput;
    }
  | {
      readonly action: "get_areas";
      readonly input?: {
        readonly query?: string;
        readonly limit?: number;
      };
    }
  | {
      readonly action: "get_area";
      readonly input: { readonly areaId: EntityReference };
    }
  | {
      readonly action: "create_area";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefAreaInput;
    }
  | {
      readonly action: "update_area";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefAreaInput;
    }
  | {
      readonly action: "get_goals";
      readonly input?: {
        readonly areaId?: EntityReference;
        readonly state?: "open" | "completed" | "all";
        readonly limit?: number;
      };
    }
  | {
      readonly action: "get_goal";
      readonly input: { readonly goalId: EntityReference };
    }
  | {
      readonly action: "create_goal";
      readonly actor: ChiefOfStaffActor;
      readonly input: CreateChiefGoalInput;
    }
  | {
      readonly action: "update_goal";
      readonly actor: ChiefOfStaffActor;
      readonly input: UpdateChiefGoalInput;
    }
  | {
      readonly action: "get_notes";
      readonly input?: {
        readonly query?: string;
        readonly tag?: string;
        readonly projectId?: EntityReference;
        readonly areaId?: EntityReference;
        /**
         * One lifecycle bucket, because the Notes collection answers one at a
         * time. There is deliberately no "all": it would read as active.
         */
        readonly state?: "active" | "archived";
        readonly limit?: number;
      };
    }
  | {
      readonly action: "get_decisions";
      readonly input?: {
        readonly status?: DecisionStatus;
        readonly projectId?: EntityReference;
        readonly areaId?: EntityReference;
        readonly limit?: number;
      };
    }
  | {
      readonly action: "get_waiting_for";
      readonly input?: {
        readonly followUp?: TaskFollowUpState;
        readonly personId?: EntityReference;
        readonly projectId?: EntityReference;
        readonly areaId?: EntityReference;
        readonly limit?: number;
      };
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

/* -------------------------------------------------------------------------- */
/* Entity references                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The record kinds a Chief of Staff reference may name.
 *
 * Deliberately NOT every entity type: these are the kinds the MCP surface can
 * both read and relate work to, so a reference can always be resolved to an
 * exact record the owner would recognise.
 */
export const REFERENCE_KINDS = [
  "area",
  "goal",
  "project",
  "person",
  "note",
  "task",
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/**
 * A HUMAN-READABLE reference, or an exact DalyHub id.
 *
 * Every `*Id`/`*Ids` field on this surface accepts either. An exact id always
 * wins; a name is resolved against ACTIVE records of the named kind only, so a
 * Project name supplied as `areaId` is a resolution failure rather than a
 * silently mis-filed record. The resolution rules are in
 * `~/platform/chief-of-staff/reference-resolution`: exact id, then exact
 * normalised name, then a single unambiguous partial match — and nothing else.
 * A reference is NEVER created implicitly by a non-creation tool.
 */
export type EntityReference = string;

/** One candidate a reference could have meant, with why it matched. */
export type ReferenceMatch = {
  readonly type: ReferenceKind;
  readonly id: string;
  readonly title: string;
  /** Short disambiguating context — an Area's name, a Person's organisation. */
  readonly subtitle: string | null;
  readonly matchedOn: "id" | "name" | "partial_name" | "email";
};

/**
 * A reference matched several records, so nothing was written.
 *
 * Returned as an ordinary RESULT rather than thrown as an error: Claude's next
 * move is to ask the owner which record they meant, and it needs the candidates
 * to do that. Guessing one is the failure mode this shape exists to prevent.
 */
export type AmbiguousReferenceResult = {
  readonly status: "ambiguous_reference";
  /** The input field whose value was ambiguous, e.g. `"projectId"`. */
  readonly field: string;
  readonly expected: ReferenceKind;
  readonly reference: string;
  readonly matches: readonly ReferenceMatch[];
  readonly message: string;
};

/**
 * A creation tool found records that look like what it was about to create, so
 * nothing was written. Re-send with `allowDuplicate: true` to create anyway.
 */
export type PossibleDuplicateResult = {
  readonly status: "possible_duplicate";
  readonly entityType: ReferenceKind;
  readonly title: string;
  readonly matches: readonly ReferenceMatch[];
  readonly message: string;
};

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which records a Person is related to. Each becomes one `link.related`
 * EntityLink — the SAME relationship the shared Linked Items surface shows on
 * both records (FND-04), never a private People-only association.
 *
 * Supplying a list ADDS those relationships; it never removes one that is not
 * listed, because this interface has no unlink capability at all.
 */
export type PersonReferenceInput = {
  readonly areaIds?: readonly EntityReference[];
  readonly projectIds?: readonly EntityReference[];
  readonly goalIds?: readonly EntityReference[];
};

/**
 * The Person detail fields this interface exposes, all optional and all part of
 * the existing PEOPLE-01 detail slice. `undefined` leaves a field alone; an
 * explicit `null` clears it.
 */
export type ChiefPersonFieldsInput = {
  readonly preferredName?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly pronouns?: string | null;
  readonly organisation?: string | null;
  readonly role?: string | null;
  readonly department?: string | null;
  readonly email?: string | null;
  readonly secondaryEmail?: string | null;
  readonly mobile?: string | null;
  readonly workPhone?: string | null;
  readonly website?: string | null;
  readonly birthday?: string | null;
  readonly relationship?: string | null;
  readonly tags?: readonly string[];
  readonly notes?: string | null;
  readonly followUpFrequency?: string | null;
  readonly nextFollowUp?: string | null;
  readonly lastInteraction?: string | null;
};

export type CreateChiefPersonInput = ChiefPersonFieldsInput &
  PersonReferenceInput & {
    /** The Person's display name — the shared `entities.title`. */
    readonly name: string;
    /** Create even when an existing Person looks like the same human. */
    readonly allowDuplicate?: boolean;
  };

export type UpdateChiefPersonInput = ChiefPersonFieldsInput &
  PersonReferenceInput & {
    readonly personId: EntityReference;
    readonly name?: string;
    /** `true` archives the Person, `false` restores them. Both reversible. */
    readonly archived?: boolean;
  };

export type ListChiefPeopleInput = {
  readonly query?: string;
  readonly status?: "active" | "archived" | "all";
  /** Only People related to this exact Area. */
  readonly areaId?: EntityReference;
  /** Only People related to this exact Project. */
  readonly projectId?: EntityReference;
  readonly limit?: number;
};

/* -------------------------------------------------------------------------- */
/* Areas                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateChiefAreaInput = {
  readonly title: string;
  readonly allowDuplicate?: boolean;
};

export type UpdateChiefAreaInput = {
  readonly areaId: EntityReference;
  readonly title?: string;
  /** `true` archives the Area, `false` restores it. Both are reversible. */
  readonly archived?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The owner's Goal CONDITION in Chief-of-Staff words. `pursuing` is DalyHub's
 * stored `null` (STEER-02/ADR-111): the state every Goal has by default.
 */
export type ChiefGoalCondition = "pursuing" | "set_aside";

export type CreateChiefGoalInput = {
  readonly title: string;
  /** A Goal always belongs to exactly one Area. */
  readonly areaId: EntityReference;
  readonly targetDate?: string | null;
  readonly definitionOfDone?: string | null;
  /** Projects to attach to this Goal on creation, by moving them under it. */
  readonly projectIds?: readonly EntityReference[];
  readonly allowDuplicate?: boolean;
};

export type UpdateChiefGoalInput = {
  readonly goalId: EntityReference;
  readonly title?: string;
  /** Move the Goal to this Area. */
  readonly areaId?: EntityReference;
  readonly targetDate?: string | null;
  readonly definitionOfDone?: string | null;
  readonly condition?: ChiefGoalCondition;
  /** `true` completes the Goal, `false` reopens it. */
  readonly completed?: boolean;
};

/* -------------------------------------------------------------------------- */
/* Compact read shapes                                                        */
/* -------------------------------------------------------------------------- */

export type CompactPerson = {
  readonly id: string;
  readonly name: string;
  readonly preferredName: string | null;
  readonly role: string | null;
  readonly organisation: string | null;
  readonly relationship: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly nextFollowUp: string | null;
  readonly lastInteraction: string | null;
  readonly updatedAt: string;
};

export type CompactArea = {
  readonly id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly goals: { readonly total: number; readonly completed: number };
  readonly projects: {
    readonly total: number;
    readonly completed: number;
    readonly active: number;
  };
  readonly tasks: { readonly total: number; readonly completed: number };
};

export type CompactGoal = {
  readonly id: string;
  readonly title: string;
  readonly area: { readonly id: string; readonly title: string } | null;
  readonly targetDate: string | null;
  readonly definitionOfDone: string | null;
  readonly condition: ChiefGoalCondition;
  readonly completedAt: string | null;
};
