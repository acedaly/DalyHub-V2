import {
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activityId,
  type ActivityActorContext,
} from "~/kernel/activity";
import {
  secureIdGenerator,
  systemClock,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import {
  MAX_MEETING_HELD_ATTENDEE_SUBJECTS,
  MEETING_ARCHIVED,
  MEETING_ATTENDEE_LINK,
  MEETING_ATTENDEE_SUBJECT_ROLE,
  MEETING_CREATED,
  MEETING_ENTITY_TYPE,
  MEETING_FOLLOW_UP_CREATED,
  MEETING_HELD,
  MEETING_ITEM_CONVERTED_TO_TASK,
  MEETING_RESTORED,
  MEETING_UPDATED,
  MeetingArchivedError,
  MeetingFollowUpConflictError,
  MeetingNotFoundError,
  validateCreateMeeting,
  validateUpdateMeeting,
  type CreateMeetingInput,
  type LinkFollowUpTaskInput,
  type MarkMeetingHeldResult,
  type Meeting,
  type MeetingFollowUpLink,
  type MeetingItem,
  type MeetingItemKind,
  type MeetingPage,
  type MeetingRepository,
  type MeetingView,
  type UpdateMeetingInput,
} from "~/kernel/meetings";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";

interface Row {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  location: string | null;
  mode: string | null;
  meeting_url: string | null;
  status: string;
  agenda_markdown: string;
  notes_markdown: string;
  archived_at: string | null;
  held_at: string | null;
  detail_updated_at: string;
}
interface ItemRow {
  id: string;
  kind: string;
  body_markdown: string;
  position: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS = `e.id,e.workspace_id,e.title,e.created_at,e.updated_at,e.deleted_at,d.starts_at,d.ends_at,d.timezone,d.location,d.mode,d.meeting_url,d.status,d.agenda_markdown,d.notes_markdown,d.archived_at,d.held_at,d.updated_at detail_updated_at`;

export class D1MeetingRepository implements MeetingRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #id: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #activityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  /**
   * TEST-ONLY deterministic Activity-append failure injection, used to prove the
   * `meeting.held` domain mutation is rolled back when its append fails. Never set
   * in production (mirrors `D1EntityRepositoryOptions.activityFault`).
   */
  readonly #activityFault?: AtomicMutationFault;
  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: {
      clock?: Clock;
      idGenerator?: IdGenerator;
      actorContext?: ActivityActorContext;
      activityIdGenerator?: IdGenerator;
      activityFault?: AtomicMutationFault;
    } = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#id = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#activityId = options.activityIdGenerator ?? activityId;
    this.#recorder = new D1ActivityRecorder(db);
    this.#activityFault = options.activityFault;
  }
  #event(type: string, id: string, now: Date) {
    const model = buildActivityWriteModel(
      { type, subjects: [{ entityId: id, role: "subject" }], payload: {} },
      this.#actor.actor,
      this.#activityId(),
      now,
    );
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }
  #eventWith(
    type: string,
    subjects: readonly { entityId: string; role: string }[],
    payload: Record<string, string>,
    now: Date,
  ) {
    const model = buildActivityWriteModel(
      { type, subjects, payload },
      this.#actor.actor,
      this.#activityId(),
      now,
    );
    return this.#recorder.buildAppendStatements(this.#workspaceId, model);
  }
  async create(input: CreateMeetingInput): Promise<Meeting> {
    const v = validateCreateMeeting(input),
      now = this.#clock(),
      ts = toStorageTimestamp(now),
      id = this.#id();
    const entity = this.#db
      .prepare(
        "INSERT INTO entities (id,workspace_id,type,title,created_at,updated_at,deleted_at) VALUES (?,?,?, ?,?,?,NULL)",
      )
      .bind(id, this.#workspaceId, MEETING_ENTITY_TYPE, v.title, ts, ts);
    const details = this.#db
      .prepare(
        "INSERT INTO meeting_details (workspace_id,entity_id,starts_at,ends_at,timezone,location,mode,meeting_url,status,agenda_markdown,notes_markdown,archived_at,updated_at) VALUES (?,?,?,?,?,?,?,?,? ,?,'',NULL,?)",
      )
      .bind(
        this.#workspaceId,
        id,
        v.startsAt,
        v.endsAt,
        v.timezone,
        v.location,
        v.mode,
        v.meetingUrl,
        "planned",
        v.agendaMarkdown,
        ts,
      );
    await this.#db.batch([
      entity,
      details,
      ...this.#event(MEETING_CREATED, id, now),
    ]);
    const result = await this.get(id);
    if (!result) throw new Error("Meeting creation failed");
    return result;
  }
  async get(id: string): Promise<Meeting | null> {
    const row = await this.#db
      .prepare(
        `SELECT ${COLUMNS} FROM entities e JOIN meeting_details d ON d.workspace_id=e.workspace_id AND d.entity_id=e.id WHERE e.workspace_id=? AND e.id=? AND e.type=? AND e.deleted_at IS NULL LIMIT 1`,
      )
      .bind(this.#workspaceId, id, MEETING_ENTITY_TYPE)
      .first<Row>();
    if (!row) return null;
    return this.#map(row, await this.#items(id));
  }
  async #items(id: string): Promise<MeetingItem[]> {
    const result = await this.#db
      .prepare(
        "SELECT id,kind,body_markdown,position,created_at,updated_at FROM meeting_items WHERE workspace_id=? AND meeting_id=? ORDER BY kind,position,id",
      )
      .bind(this.#workspaceId, id)
      .all<ItemRow>();
    return result.results.map((r) => ({
      id: r.id,
      kind: r.kind as MeetingItemKind,
      bodyMarkdown: r.body_markdown,
      position: r.position,
      createdAt: fromStorageTimestamp(r.created_at),
      updatedAt: fromStorageTimestamp(r.updated_at),
    }));
  }
  async list(
    input: {
      view?: MeetingView;
      query?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<MeetingPage> {
    const view = input.view ?? "upcoming",
      limit = Math.max(1, Math.min(input.limit ?? 30, 50)),
      now = toStorageTimestamp(this.#clock());
    const where = ["e.workspace_id=?", "e.type=?", "e.deleted_at IS NULL"];
    const values: unknown[] = [this.#workspaceId, MEETING_ENTITY_TYPE];
    if (view === "archived") where.push("d.archived_at IS NOT NULL");
    else {
      where.push("d.archived_at IS NULL");
      where.push(view === "upcoming" ? "d.starts_at >= ?" : "d.starts_at < ?");
      values.push(now);
    }
    if (input.query?.trim()) {
      where.push(
        "(lower(e.title) LIKE ? ESCAPE '\\' OR lower(coalesce(d.location,'')) LIKE ? ESCAPE '\\')",
      );
      const q = `%${input.query
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&")}%`;
      values.push(q, q);
    }
    if (input.cursor) {
      let c: { at: string; id: string };
      try {
        c = JSON.parse(atob(input.cursor)) as { at: string; id: string };
      } catch {
        throw new Error("Invalid meeting cursor");
      }
      where.push(
        view === "upcoming"
          ? "(d.starts_at > ? OR (d.starts_at=? AND e.id>?))"
          : "(d.starts_at < ? OR (d.starts_at=? AND e.id<?))",
      );
      values.push(c.at, c.at, c.id);
    }
    const count = await this.#db
      .prepare(
        `SELECT count(*) total FROM entities e JOIN meeting_details d ON d.workspace_id=e.workspace_id AND d.entity_id=e.id WHERE ${where.slice(0, input.cursor ? -1 : undefined).join(" AND ")}`,
      )
      .bind(...values.slice(0, input.cursor ? -3 : undefined))
      .first<{ total: number }>();
    const order = view === "upcoming" ? "ASC" : "DESC";
    const rows = (
      await this.#db
        .prepare(
          `SELECT ${COLUMNS} FROM entities e JOIN meeting_details d ON d.workspace_id=e.workspace_id AND d.entity_id=e.id WHERE ${where.join(" AND ")} ORDER BY d.starts_at ${order},e.id ${order} LIMIT ?`,
        )
        .bind(...values, limit + 1)
        .all<Row>()
    ).results;
    const hasMore = rows.length > limit,
      page = rows.slice(0, limit);
    const items = await Promise.all(
      page.map(async (r) => this.#map(r, await this.#items(r.id))),
    );
    const last = page.at(-1);
    return {
      items,
      hasMore,
      total: count?.total ?? 0,
      nextCursor:
        hasMore && last
          ? btoa(JSON.stringify({ at: last.starts_at, id: last.id }))
          : null,
    };
  }
  async update(id: string, input: UpdateMeetingInput) {
    const current = await this.get(id);
    if (!current || current.archivedAt) throw new Error("Meeting not found");
    const v = validateUpdateMeeting(input);
    const merged = {
      startsAt: v.startsAt ?? current.startsAt.toISOString(),
      endsAt:
        v.endsAt === undefined
          ? (current.endsAt?.toISOString() ?? null)
          : v.endsAt,
      timezone: v.timezone ?? current.timezone,
      location:
        v.location === undefined
          ? current.location
          : v.location?.trim() || null,
      mode: v.mode === undefined ? current.mode : v.mode,
      meetingUrl:
        v.meetingUrl === undefined ? current.meetingUrl : v.meetingUrl,
      status: v.status ?? current.status,
      agendaMarkdown: v.agendaMarkdown ?? current.agendaMarkdown,
      notesMarkdown: v.notesMarkdown ?? current.notesMarkdown,
    };
    if (merged.endsAt && merged.endsAt <= merged.startsAt)
      throw new Error("End time must be after start time");
    const same =
      JSON.stringify(merged) ===
      JSON.stringify({
        startsAt: current.startsAt.toISOString(),
        endsAt: current.endsAt?.toISOString() ?? null,
        timezone: current.timezone,
        location: current.location,
        mode: current.mode,
        meetingUrl: current.meetingUrl,
        status: current.status,
        agendaMarkdown: current.agendaMarkdown,
        notesMarkdown: current.notesMarkdown,
      });
    if (same) return { meeting: current, changed: false };
    const now = this.#clock(),
      ts = toStorageTimestamp(now);
    await this.#db.batch([
      this.#db
        .prepare(
          "UPDATE meeting_details SET starts_at=?,ends_at=?,timezone=?,location=?,mode=?,meeting_url=?,status=?,agenda_markdown=?,notes_markdown=?,updated_at=? WHERE workspace_id=? AND entity_id=? AND archived_at IS NULL",
        )
        .bind(
          merged.startsAt,
          merged.endsAt,
          merged.timezone,
          merged.location,
          merged.mode,
          merged.meetingUrl,
          merged.status,
          merged.agendaMarkdown,
          merged.notesMarkdown,
          ts,
          this.#workspaceId,
          id,
        ),
      ...this.#event(MEETING_UPDATED, id, now),
    ]);
    return { meeting: (await this.get(id))!, changed: true };
  }
  async addItem(id: string, kind: MeetingItemKind, bodyMarkdown: string) {
    const meeting = await this.get(id);
    if (!meeting || meeting.archivedAt) throw new Error("Meeting not found");
    const body = bodyMarkdown.trim();
    if (!body) throw new Error("Item cannot be empty");
    const id2 = this.#id(),
      now = this.#clock(),
      ts = toStorageTimestamp(now),
      position = meeting.items.filter((i) => i.kind === kind).length;
    await this.#db.batch([
      this.#db
        .prepare(
          "INSERT INTO meeting_items (workspace_id,id,meeting_id,kind,body_markdown,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .bind(this.#workspaceId, id2, id, kind, body, position, ts, ts),
      ...this.#event(MEETING_UPDATED, id, now),
    ]);
    return {
      id: id2,
      kind,
      bodyMarkdown: body,
      position,
      createdAt: now,
      updatedAt: now,
    };
  }
  async removeItem(id: string, itemId: string) {
    const meeting = await this.get(id);
    if (!meeting || meeting.archivedAt) throw new Error("Meeting not found");
    const result = await this.#db
      .prepare(
        "DELETE FROM meeting_items WHERE workspace_id=? AND meeting_id=? AND id=?",
      )
      .bind(this.#workspaceId, id, itemId)
      .run();
    return result.meta.changes > 0;
  }
  async archive(id: string) {
    return this.#lifecycle(id, true);
  }
  async restore(id: string) {
    return this.#lifecycle(id, false);
  }
  async #lifecycle(id: string, archive: boolean) {
    const meeting = await this.get(id);
    if (!meeting) throw new Error("Meeting not found");
    if (Boolean(meeting.archivedAt) === archive) return false;
    const now = this.#clock(),
      ts = toStorageTimestamp(now);
    await this.#db.batch([
      this.#db
        .prepare(
          "UPDATE meeting_details SET archived_at=?,updated_at=? WHERE workspace_id=? AND entity_id=?",
        )
        .bind(archive ? ts : null, ts, this.#workspaceId, id),
      ...this.#event(archive ? MEETING_ARCHIVED : MEETING_RESTORED, id, now),
    ]);
    return true;
  }
  /**
   * MEET-03 — the server-authoritative attendee set for a `meeting.held` event.
   *
   * Derived here, in ONE parameterised query, from the ACTIVE `meeting.attendee`
   * EntityLinks of this meeting whose target is a live `person` entity in the
   * bound workspace. Nothing about it can be supplied, named or influenced by a
   * caller: `markHeld` has no attendee parameter at all.
   *
   * The filters are each load-bearing:
   *   - `l.workspace_id = ?` and the join on the SAME workspace — a link or a
   *     Person from another workspace can never enter the subject set;
   *   - `l.deleted_at IS NULL` — an attendee unlinked before the meeting was
   *     marked held did not attend, so they are not recorded;
   *   - `p.type = 'person'` — the kernel enforces link ENDPOINT EXISTENCE but not
   *     entity type, so a link pointing at a Task or Note is refused here too
   *     (the same defence the add-attendee route applies on the write side);
   *   - `p.deleted_at IS NULL` — a soft-deleted Person is not a live subject.
   *
   * Ordered by `(created_at, id)` so the recorded subjects are deterministic and
   * the bound below keeps the EARLIEST-linked attendees rather than an arbitrary
   * slice. The scan is bounded one past the cap so an over-cap meeting can be
   * reported honestly without counting an unbounded set.
   */
  async #activeAttendeeIds(
    meetingId: string,
  ): Promise<{ ids: string[]; total: number }> {
    const rows = (
      await this.#db
        .prepare(
          `SELECT l.target_entity_id person_id
             FROM entity_links l
             JOIN entities p
               ON p.workspace_id = l.workspace_id AND p.id = l.target_entity_id
            WHERE l.workspace_id = ?
              AND l.source_entity_id = ?
              AND l.type = ?
              AND l.deleted_at IS NULL
              AND p.type = 'person'
              AND p.deleted_at IS NULL
            ORDER BY l.created_at, l.id
            LIMIT ?`,
        )
        .bind(
          this.#workspaceId,
          meetingId,
          MEETING_ATTENDEE_LINK,
          MAX_MEETING_HELD_ATTENDEE_SUBJECTS + 1,
        )
        .all<{ person_id: string }>()
    ).results;
    return {
      ids: rows
        .slice(0, MAX_MEETING_HELD_ATTENDEE_SUBJECTS)
        .map((r) => r.person_id),
      total: rows.length,
    };
  }

  async markHeld(id: string): Promise<MarkMeetingHeldResult> {
    // Read the meeting through the SAME workspace-scoped, type-checked,
    // soft-delete-aware path every other operation uses, so a missing, deleted,
    // wrong-type or cross-workspace id fails closed and identically.
    const meeting = await this.get(id);
    if (!meeting) throw new MeetingNotFoundError();
    if (meeting.archivedAt) throw new MeetingArchivedError();
    if (meeting.heldAt) {
      // Already held: report the ORIGINAL facts and write nothing. The attendee
      // counts are re-derived for the caller's message only — the recorded event
      // and its subjects are untouched, so later attendee changes never rewrite
      // history.
      const { ids, total } = await this.#activeAttendeeIds(id);
      return {
        outcome: "already_held",
        heldAt: meeting.heldAt,
        attendeeCount: total,
        attendeesRecorded: ids.length,
      };
    }

    const attendees = await this.#activeAttendeeIds(id);
    const now = this.#clock(),
      ts = toStorageTimestamp(now);

    // Structural metadata ONLY (AGENTS.md §17): the source action, the meeting's
    // scheduled start instant and its display timezone, and attendee COUNTS.
    // Never agenda, notes, decision, outcome or task text, and never a Person's
    // name, contact detail or note.
    const payload: Record<string, string | number | boolean> = {
      source: "mark_held",
      startsAt: toStorageTimestamp(meeting.startsAt),
      timezone: meeting.timezone,
      attendeeCount: attendees.total,
      attendeesRecorded: attendees.ids.length,
    };
    if (attendees.total > attendees.ids.length) {
      // Never a silent cap — the event itself says the subject list is partial.
      payload.attendeesTruncated = true;
    }

    const model = buildActivityWriteModel(
      {
        type: MEETING_HELD,
        subjects: [
          { entityId: id, role: "subject" },
          ...attendees.ids.map((personId) => ({
            entityId: personId,
            role: MEETING_ATTENDEE_SUBJECT_ROLE,
          })),
        ],
        payload,
      },
      this.#actor.actor,
      this.#activityId(),
      now,
    );

    // The commit point. The conditional UPDATE is what makes this idempotent AND
    // concurrency-safe without a lock: only the first caller to see `held_at IS
    // NULL` changes a row, and the append statements are guarded on that
    // statement's `changes()`, so a retry or a losing racer appends NOTHING.
    // `archived_at IS NULL` is re-asserted in SQL so a meeting archived between
    // the read above and this write cannot acquire a held state.
    const result = await recordAtomicMutation<{ held_at: string }>({
      db: this.#db,
      workspaceId: this.#workspaceId,
      domainStatement: this.#db
        .prepare(
          `UPDATE meeting_details
              SET held_at = ?, updated_at = ?
            WHERE workspace_id = ? AND entity_id = ?
              AND archived_at IS NULL
              AND held_at IS NULL
        RETURNING held_at`,
        )
        .bind(ts, ts, this.#workspaceId, id),
      recorder: this.#recorder,
      model,
      ...(this.#activityFault ? { fault: this.#activityFault } : {}),
    });

    if (!result.changed) {
      // Someone else won, or the meeting was archived in between. Re-read and
      // report the truth rather than claiming a success that never happened.
      const current = await this.get(id);
      if (!current) throw new MeetingNotFoundError();
      if (current.heldAt) {
        return {
          outcome: "already_held",
          heldAt: current.heldAt,
          attendeeCount: attendees.total,
          attendeesRecorded: attendees.ids.length,
        };
      }
      throw new MeetingArchivedError();
    }

    return {
      outcome: "recorded",
      heldAt: now,
      attendeeCount: attendees.total,
      attendeesRecorded: attendees.ids.length,
    };
  }

  async linkFollowUpTask(
    input: LinkFollowUpTaskInput,
  ): Promise<MeetingFollowUpLink> {
    const now = this.#clock(),
      ts = toStorageTimestamp(now);
    const type =
      input.itemId === null
        ? MEETING_FOLLOW_UP_CREATED
        : MEETING_ITEM_CONVERTED_TO_TASK;
    // Structural metadata ONLY — never item body/agenda/notes content (§17).
    const payload: Record<string, string> = {};
    if (input.itemKind) payload.itemKind = input.itemKind;
    try {
      await this.#db.batch([
        this.#db
          .prepare(
            "INSERT INTO meeting_item_tasks (workspace_id,meeting_id,item_id,task_id,created_at) VALUES (?,?,?,?,?)",
          )
          .bind(
            this.#workspaceId,
            input.meetingId,
            input.itemId,
            input.taskId,
            ts,
          ),
        ...this.#eventWith(
          type,
          [
            { entityId: input.meetingId, role: "subject" },
            { entityId: input.taskId, role: "target" },
          ],
          payload,
          now,
        ),
      ]);
    } catch (cause) {
      // A UNIQUE-index violation means a concurrent conversion already claimed this
      // source item; surface it as the typed conflict the orchestration recovers from.
      if (input.itemId !== null && /unique|constraint/i.test(String(cause))) {
        throw new MeetingFollowUpConflictError(input.itemId);
      }
      throw cause;
    }
    return {
      meetingId: input.meetingId,
      itemId: input.itemId,
      taskId: input.taskId,
      createdAt: now,
    };
  }
  async listFollowUps(
    meetingId: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly MeetingFollowUpLink[]> {
    // Newest-first, so a bounded caller keeps the MOST RECENT follow-ups (a
    // freshly-created or just-converted Task can never fall outside the window),
    // and cap the scan so the read is never unbounded (AGENTS.md §16). The default
    // is generous; the caller may lower it.
    const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
    const rows = (
      await this.#db
        .prepare(
          "SELECT meeting_id,item_id,task_id,created_at FROM meeting_item_tasks WHERE workspace_id=? AND meeting_id=? ORDER BY created_at DESC,task_id DESC LIMIT ?",
        )
        .bind(this.#workspaceId, meetingId, limit)
        .all<{
          meeting_id: string;
          item_id: string | null;
          task_id: string;
          created_at: string;
        }>()
    ).results;
    return rows.map((r) => ({
      meetingId: r.meeting_id,
      itemId: r.item_id,
      taskId: r.task_id,
      createdAt: fromStorageTimestamp(r.created_at),
    }));
  }
  async getFollowUpForItem(
    itemId: string,
  ): Promise<MeetingFollowUpLink | null> {
    const row = await this.#db
      .prepare(
        "SELECT meeting_id,item_id,task_id,created_at FROM meeting_item_tasks WHERE workspace_id=? AND item_id=? LIMIT 1",
      )
      .bind(this.#workspaceId, itemId)
      .first<{
        meeting_id: string;
        item_id: string | null;
        task_id: string;
        created_at: string;
      }>();
    if (!row) return null;
    return {
      meetingId: row.meeting_id,
      itemId: row.item_id,
      taskId: row.task_id,
      createdAt: fromStorageTimestamp(row.created_at),
    };
  }
  async removeFollowUpTask(taskId: string): Promise<boolean> {
    const result = await this.#db
      .prepare(
        "DELETE FROM meeting_item_tasks WHERE workspace_id=? AND task_id=?",
      )
      .bind(this.#workspaceId, taskId)
      .run();
    return result.meta.changes > 0;
  }
  #map(r: Row, items: MeetingItem[]): Meeting {
    return {
      id: r.id,
      workspaceId: parseWorkspaceId(r.workspace_id),
      type: "meeting",
      title: r.title,
      createdAt: fromStorageTimestamp(r.created_at),
      updatedAt: fromStorageTimestamp(
        r.detail_updated_at > r.updated_at ? r.detail_updated_at : r.updated_at,
      ),
      deletedAt: null,
      startsAt: fromStorageTimestamp(r.starts_at),
      endsAt: r.ends_at ? fromStorageTimestamp(r.ends_at) : null,
      timezone: r.timezone,
      location: r.location,
      mode: r.mode as Meeting["mode"],
      meetingUrl: r.meeting_url,
      status: r.status as Meeting["status"],
      agendaMarkdown: r.agenda_markdown,
      notesMarkdown: r.notes_markdown,
      archivedAt: r.archived_at ? fromStorageTimestamp(r.archived_at) : null,
      heldAt: r.held_at ? fromStorageTimestamp(r.held_at) : null,
      items,
    };
  }
}
