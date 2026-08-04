/**
 * X-04 — generate an Obsidian-compatible Markdown vault from ONE snapshot.
 *
 * Everything here is a pure function of `WorkspaceSnapshotV1`. There is no
 * database access, no clock and no randomness, so the same snapshot always
 * produces byte-identical files — which is what makes "two exports of unchanged
 * data do not churn" a testable property rather than an aspiration.
 *
 * ## The rules the vault keeps
 *
 *   - **Standard Markdown, not Obsidian-only syntax.** YAML frontmatter and
 *     relative `[label](path.md)` links. Obsidian follows both natively, and so
 *     does every other Markdown tool. `[[Wiki Links]]` are *rewritten away*, not
 *     preserved: they are a DalyHub-ism whose meaning depends on a resolver the
 *     vault does not have.
 *   - **The owner's words are never rewritten.** Where a record's canonical
 *     content is Markdown (a Note body, a Task description, a Diary entry,
 *     meeting notes, a review response) it is emitted byte-for-byte, with only
 *     internal-link ranges rewritten. Generated headings and metadata go
 *     *around* it.
 *   - **Nothing is invented.** No summaries, no derived insight, no computed
 *     "health". Where DalyHub stores a fact the vault prints it; where it does
 *     not, the vault is silent. The one derived number is a completion count,
 *     which is arithmetic over exported rows and is labelled as such.
 *   - **Every record gets a file**, including archived and soft-deleted ones,
 *     each carrying its lifecycle state in frontmatter and a plain sentence in
 *     the body. An export that quietly omits deleted records is an export the
 *     owner cannot trust.
 */

import type {
  SnapshotActivity,
  SnapshotAssetEvent,
  SnapshotAssetObligation,
  SnapshotEntity,
  SnapshotEntityLink,
  SnapshotTaskRecurrenceRule,
  WorkspaceSnapshotV1,
} from "~/kernel/export";
import { resolveActorIdentity } from "~/kernel/identity";
import { minorUnitsToDecimalString } from "~/kernel/money";
import {
  buildVaultIndex,
  VAULT_FOLDER_ORDER,
  vaultFolderForType,
  type VaultIndex,
} from "./vault-index";
import {
  markdownLink,
  relativeVaultPath,
  VAULT_META_FOLDER,
} from "./vault-filenames";
import { rewriteBodyForVault, type UnresolvedLink } from "./vault-links";
import { fields, frontmatter, type YamlValue } from "./vault-yaml";

/** One generated file, at a path relative to the vault root. */
export interface VaultFile {
  readonly path: string;
  readonly contents: string;
}

/** The complete vault plus its honest report of what could not be linked. */
export interface VaultBuildResult {
  readonly files: readonly VaultFile[];
  readonly unresolved: readonly UnresolvedLink[];
}

/**
 * Turns a stored Activity actor into the name the vault should write.
 *
 * The vault is prose the owner reads in Obsidian, so it must never carry the raw
 * actor id — that is a Cloudflare Access subject (AGENTS.md §17). The route
 * supplies a resolver built from the IDENT-01 actor directory; without one the
 * default falls back to the SAME canonical rule with no membership facts, so an
 * unresolvable actor writes `Unknown user`, never an authentication identifier.
 */
export type VaultActorNameResolver = (
  actorType: string,
  actorId: string | null,
) => string;

export interface VaultBuildOptions {
  readonly resolveActorName?: VaultActorNameResolver;
}

const defaultActorName: VaultActorNameResolver = (actorType, actorId) =>
  resolveActorIdentity({ type: actorType, id: actorId }, null).displayName;

/* -------------------------------------------------------------------------- */
/* Small formatting helpers                                                   */
/* -------------------------------------------------------------------------- */

/** A definition line, omitted entirely when the value is absent. */
function line(
  label: string,
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : `- **${label}:** ${text}`;
}

/** Join non-null lines into a block, or return `null` when there are none. */
function block(lines: readonly (string | null)[]): string | null {
  const kept = lines.filter((entry): entry is string => entry !== null);
  return kept.length === 0 ? null : kept.join("\n");
}

/** A section with a heading, omitted when it has no content. */
function section(heading: string, body: string | null): string | null {
  return body === null || body.trim() === ""
    ? null
    : `## ${heading}\n\n${body}`;
}

/**
 * Assemble a document from its optional parts, separated by exactly ONE blank
 * line.
 *
 * Each part's own trailing newlines are trimmed before joining — the frontmatter
 * block ends in a newline and a rewritten Markdown body usually does too, so
 * joining them raw produced two or three blank lines between every section. The
 * file still ends with exactly one newline.
 */
function document(parts: readonly (string | null)[]): string {
  const kept = parts
    .filter((part): part is string => part !== null && part.trim() !== "")
    .map((part) => part.replace(/\n+$/, ""));
  return `${kept.join("\n\n")}\n`;
}

/** An exact, locale-free money rendering: `1234.56 AUD`. */
function money(minor: number | null, currency: string | null): string | null {
  if (minor === null) return null;
  const code = currency ?? "";
  if (code === "") return String(minor);
  return `${minorUnitsToDecimalString(minor, code)} ${code}`;
}

/** A meter reading: `184320 km`. */
function meter(value: number | null, unit: string | null): string | null {
  if (value === null) return null;
  return unit === null ? String(value) : `${value} ${unit}`;
}

/** Turn a stored enum token into a readable phrase without inventing meaning. */
function humanise(token: string): string {
  const spaced = token.replace(/[._]+/g, " ").trim();
  return spaced.charAt(0).toLocaleUpperCase() + spaced.slice(1);
}

/**
 * Describe a recurrence rule in words, from the stored fields only.
 *
 * Deliberately mechanical: it reads the rule back, it does not compute future
 * occurrences. A projected date would be a derived claim the export has no
 * business making.
 */
export function describeRecurrence(rule: SnapshotTaskRecurrenceRule): string {
  const every = rule.interval === 1 ? "Every" : `Every ${rule.interval}`;
  const unit =
    rule.frequency === "weekday"
      ? rule.interval === 1
        ? "weekday"
        : "weekdays"
      : rule.interval === 1
        ? rule.frequency
        : `${rule.frequency}s`;
  const parts = [`${every} ${unit}`];
  if (rule.weekdays !== null && rule.weekdays !== "") {
    parts.push(`on ${rule.weekdays}`);
  }
  if (rule.anchorMonth !== null && rule.anchorDay !== null) {
    parts.push(`on ${rule.anchorDay}/${rule.anchorMonth}`);
  } else if (rule.anchorDay !== null) {
    parts.push(`on day ${rule.anchorDay}`);
  }
  parts.push(`(${rule.dateKind} date)`);
  return parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Link helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A Markdown link to another exported record.
 *
 * Returns `null` when the target is not in this export at all — the caller
 * decides whether that is worth a line. A target that IS exported but is
 * archived or soft-deleted still gets a link: its own file states its state,
 * which is more useful than a dead end.
 */
function recordLink(
  index: VaultIndex,
  fromPath: string,
  targetId: string,
): string | null {
  const target = index.entityById.get(targetId);
  const location = index.location.get(targetId);
  if (!target || !location) return null;
  return markdownLink(target.title, relativeVaultPath(fromPath, location.path));
}

/** A bullet list of record links, with a fallback line when empty. */
function linkList(
  index: VaultIndex,
  fromPath: string,
  ids: readonly string[],
  emptyText: string,
): string {
  const rows = ids
    .map((id) => {
      const link = recordLink(index, fromPath, id);
      if (link === null) return null;
      const entity = index.entityById.get(id);
      const state = entity ? lifecycleOf(index, entity) : "active";
      return state === "active" ? `- ${link}` : `- ${link} — ${state}`;
    })
    .filter((row): row is string => row !== null);
  return rows.length === 0 ? `_${emptyText}_` : rows.join("\n");
}

/** The related-records section, both directions, with the link type named. */
function relationshipSection(
  index: VaultIndex,
  fromPath: string,
  entityId: string,
): string | null {
  const describe = (
    link: SnapshotEntityLink,
    counterpartId: string,
    direction: "→" | "←",
  ): string | null => {
    const target = recordLink(index, fromPath, counterpartId);
    if (target === null) return null;
    return `- ${direction} ${target} — \`${link.type}\``;
  };
  const rows = [
    ...(index.outgoingLinks.get(entityId) ?? []).map((link) =>
      describe(link, link.targetEntityId, "→"),
    ),
    ...(index.incomingLinks.get(entityId) ?? []).map((link) =>
      describe(link, link.sourceEntityId, "←"),
    ),
  ].filter((row): row is string => row !== null);
  return rows.length === 0 ? null : rows.join("\n");
}

/** The ids of every active, non-structural relationship, for frontmatter. */
function linkedIds(index: VaultIndex, entityId: string): readonly string[] {
  const ids = new Set<string>();
  for (const link of index.outgoingLinks.get(entityId) ?? []) {
    ids.add(link.targetEntityId);
  }
  for (const link of index.incomingLinks.get(entityId) ?? []) {
    ids.add(link.sourceEntityId);
  }
  return [...ids].sort();
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

type Lifecycle = "active" | "completed" | "archived" | "deleted";

/** The spine types that can have a structural parent. An Area is a root. */
const SPINE_CHILD_TYPES: ReadonlySet<string> = new Set([
  "goal",
  "project",
  "task",
]);

/** Every place a record's archived state can live, by type. */
function archivedAtOf(
  index: VaultIndex,
  entity: SnapshotEntity,
): string | null {
  switch (entity.type) {
    case "area":
      return index.areaDetail.get(entity.id)?.archivedAt ?? null;
    case "project":
      return index.projectDetail.get(entity.id)?.archivedAt ?? null;
    case "note":
      return index.noteDetail.get(entity.id)?.archivedAt ?? null;
    case "person":
      return index.personDetail.get(entity.id)?.archivedAt ?? null;
    case "meeting":
      return index.meetingDetail.get(entity.id)?.archivedAt ?? null;
    case "asset":
      return index.assetDetail.get(entity.id)?.archivedAt ?? null;
    case "review":
      return index.reviewDetail.get(entity.id)?.archivedAt ?? null;
    default:
      return null;
  }
}

/** Completion, from whichever authority owns it for this record type. */
function completedAtOf(
  index: VaultIndex,
  entity: SnapshotEntity,
): string | null {
  if (entity.type === "review") {
    return index.reviewDetail.get(entity.id)?.completedAt ?? null;
  }
  return index.spine.get(entity.id)?.completedAt ?? null;
}

function lifecycleOf(index: VaultIndex, entity: SnapshotEntity): Lifecycle {
  if (entity.deletedAt !== null) return "deleted";
  if (archivedAtOf(index, entity) !== null) return "archived";
  if (completedAtOf(index, entity) !== null) return "completed";
  return "active";
}

/**
 * The banner a non-active record opens with.
 *
 * Frontmatter alone is not enough: a person reading the vault in a plain editor
 * sees the body first, and "this record was deleted in DalyHub" is exactly the
 * thing they must not miss.
 */
function lifecycleBanner(state: Lifecycle): string | null {
  switch (state) {
    case "deleted":
      return "> **Deleted in DalyHub.** This record was soft-deleted and is included so the export is complete.";
    case "archived":
      return "> **Archived in DalyHub.** Put away, not deleted.";
    case "completed":
      return "> **Completed in DalyHub.**";
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Record writers                                                             */
/* -------------------------------------------------------------------------- */

interface WriterContext {
  readonly index: VaultIndex;
  readonly path: string;
  readonly entity: SnapshotEntity;
  readonly unresolved: UnresolvedLink[];
  readonly actorName: VaultActorNameResolver;
}

/** Rewrite a Markdown body for the vault, collecting unresolved links. */
function body(context: WriterContext, source: string | null): string | null {
  if (source === null || source === "") return null;
  const result = rewriteBodyForVault(source, {
    fromPath: context.path,
    sourceTitle: context.entity.title,
    resolver: {
      byTitle: (title) => {
        const id = context.index.resolveTitle(title);
        return id === null
          ? null
          : (context.index.location.get(id)?.path ?? null);
      },
      byId: (id) => context.index.location.get(id)?.path ?? null,
    },
  });
  context.unresolved.push(...result.unresolved);
  return result.markdown;
}

/** The frontmatter fields every record carries, before type-specific ones. */
function commonFields(
  context: WriterContext,
  extra: readonly (readonly [string, YamlValue | undefined])[],
): string {
  const { index, entity } = context;
  const state = lifecycleOf(index, entity);
  const linked = linkedIds(index, entity.id);
  // Only the three spine types that CAN have a structural parent carry the
  // parent fields. Emitting `parent_project: null` on an Area is noise, not
  // information — "where applicable" is the rule, and an Area has no parent to
  // be absent.
  const canHaveParent = SPINE_CHILD_TYPES.has(entity.type);
  const parents = canHaveParent ? index.parents.get(entity.id) : undefined;
  const titleOf = (id: string | null | undefined): string | undefined => {
    if (!id) return undefined;
    return index.entityById.get(id)?.title ?? undefined;
  };
  const parentFields: readonly (readonly [string, YamlValue | undefined])[] =
    canHaveParent
      ? [
          ["parent_area", titleOf(parents?.areaId) ?? null],
          ["parent_area_id", parents?.areaId ?? null],
          ["parent_goal", titleOf(parents?.goalId) ?? null],
          ["parent_goal_id", parents?.goalId ?? null],
          ["parent_project", titleOf(parents?.projectId) ?? null],
          ["parent_project_id", parents?.projectId ?? null],
        ]
      : [];
  return frontmatter(
    fields([
      ["dalyhub_id", entity.id],
      ["dalyhub_type", entity.type],
      ["title", entity.title],
      ["lifecycle", state],
      ["created", entity.createdAt],
      ["updated", entity.updatedAt],
      ["completed", completedAtOf(index, entity)],
      ["archived", archivedAtOf(index, entity)],
      ["deleted", entity.deletedAt],
      ...parentFields,
      ...extra,
      ["linked_ids", linked],
      ["dalyhub_export_schema", context.index.snapshot.meta.schema],
      [
        "dalyhub_export_schema_version",
        context.index.snapshot.meta.schemaVersion,
      ],
      [
        "dalyhub_export_version",
        context.index.snapshot.meta.application.version,
      ],
      ["dalyhub_exported_at", context.index.snapshot.meta.exportedAt],
    ]),
  );
}

function writeArea(context: WriterContext): string {
  const { index, entity, path } = context;
  const children = index.areaChildren.get(entity.id);
  return document([
    commonFields(context, []),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Goals",
      linkList(index, path, children?.goals ?? [], "No goals in this area."),
    ),
    section(
      "Projects",
      linkList(
        index,
        path,
        children?.projects ?? [],
        "No projects in this area.",
      ),
    ),
    section(
      "Tasks held directly in this area",
      linkList(index, path, children?.tasks ?? [], "No tasks held directly."),
    ),
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Recent activity", activityExcerpt(context)),
  ]);
}

function writeGoal(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.goalDetail.get(entity.id);
  const projects = index.goalProjects.get(entity.id) ?? [];
  const completedProjects = projects.filter(
    (id) => index.spine.get(id)?.completedAt != null,
  ).length;
  return document([
    commonFields(context, [["target_date", detail?.targetDate ?? null]]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Goal",
      block([
        line("Target date", detail?.targetDate ?? null),
        line(
          "Aligned projects completed",
          projects.length === 0
            ? null
            : `${completedProjects} of ${projects.length} (counted from the records in this export)`,
        ),
      ]),
    ),
    section(
      "Definition of done",
      detail?.definitionOfDone ? detail.definitionOfDone : null,
    ),
    section(
      "Aligned projects",
      linkList(index, path, projects, "No projects advance this goal."),
    ),
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Recent activity", activityExcerpt(context)),
  ]);
}

function writeProject(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.projectDetail.get(entity.id);
  const tasks = index.projectTasks.get(entity.id) ?? [];
  const completedTasks = tasks.filter(
    (id) => index.spine.get(id)?.completedAt != null,
  ).length;
  return document([
    commonFields(context, [["status", detail?.status ?? null]]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Project",
      block([
        line("Status", detail ? humanise(detail.status) : null),
        line(
          "Tasks completed",
          tasks.length === 0
            ? null
            : `${completedTasks} of ${tasks.length} (counted from the records in this export)`,
        ),
      ]),
    ),
    section("Tasks", linkList(index, path, tasks, "No tasks in this project.")),
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Recent activity", activityExcerpt(context)),
  ]);
}

function writeTask(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.taskDetail.get(entity.id);
  const rule = index.recurrence.get(entity.id);
  return document([
    commonFields(context, [
      ["status", detail?.status ?? null],
      ["priority", detail?.priority ?? null],
      ["due", detail?.dueDate ?? null],
      ["scheduled", detail?.scheduledDate ?? null],
      ["time_sector", detail?.timeSector ?? null],
      ["commitment_state", detail?.commitmentState ?? null],
      ["waiting_since", detail?.waitingSince ?? null],
      ["recurrence", rule ? describeRecurrence(rule) : null],
      ["recurrence_series_id", rule?.seriesId ?? null],
      ["recurrence_sequence", rule?.sequence ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Task",
      block([
        line("Status", detail ? humanise(detail.status) : null),
        line(
          "Priority",
          detail?.priority ? detail.priority.toUpperCase() : null,
        ),
        line("Due", detail?.dueDate ?? null),
        line("Scheduled", detail?.scheduledDate ?? null),
        line(
          "Time sector",
          detail?.timeSector ? humanise(detail.timeSector) : null,
        ),
        line(
          "Commitment",
          detail?.commitmentState ? humanise(detail.commitmentState) : null,
        ),
        line("Completed", completedAtOf(index, entity)),
        line("Waiting since", detail?.waitingSince ?? null),
        line("Waiting on", detail?.waitingNote ?? null),
        line("Delegated to", detail?.delegateTo ?? null),
        line("Delegated on", detail?.delegatedOn ?? null),
        line("Follow up on", detail?.followUpOn ?? null),
        line("Delegation note", detail?.delegateNote ?? null),
        line("Recurrence", rule ? describeRecurrence(rule) : null),
        line(
          "Recurrence series",
          rule ? `${rule.seriesId} #${rule.sequence}` : null,
        ),
      ]),
    ),
    section("Description", body(context, detail?.description ?? null)),
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Recent activity", activityExcerpt(context)),
  ]);
}

/**
 * The generated `# Title` heading — omitted when the record's own body already
 * opens with the SAME H1.
 *
 * Notes very often begin with their own title, and emitting ours as well
 * produced the same heading twice at the top of the file. The check is
 * deliberately conservative: only an exact (trimmed, case-insensitive) match is
 * suppressed, so a body whose first heading says something DIFFERENT keeps both
 * — the record's title is information, and the frontmatter carries it either
 * way.
 */
function titleHeading(title: string, body: string | null): string | null {
  if (body !== null) {
    const first = body.split("\n").find((row) => row.trim() !== "") ?? "";
    const heading = /^#\s+(.*)$/.exec(first.trim());
    if (
      heading &&
      heading[1]!.trim().toLocaleLowerCase() ===
        title.trim().toLocaleLowerCase()
    ) {
      return null;
    }
  }
  return `# ${title}`;
}

function writeNote(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.noteDetail.get(entity.id);
  const outgoing = (index.outgoingLinks.get(entity.id) ?? []).map(
    (link) => link.targetEntityId,
  );
  const incoming = (index.incomingLinks.get(entity.id) ?? []).map(
    (link) => link.sourceEntityId,
  );
  const noteBody = body(context, detail?.content ?? null);
  return document([
    commonFields(context, [["tags", detail ? [...detail.tags] : []]]),
    titleHeading(entity.title, noteBody),
    lifecycleBanner(lifecycleOf(index, entity)),
    // The note body is the record. It is emitted with NO surrounding heading so
    // the file reads as the note itself, with the metadata above and the graph
    // below — the shape a Markdown reader expects.
    noteBody,
    section(
      "Outgoing links",
      linkList(index, path, outgoing, "No outgoing links."),
    ),
    section("Backlinks", linkList(index, path, incoming, "No backlinks.")),
  ]);
}

function writeDiary(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.diaryDetail.get(entity.id);
  return document([
    commonFields(context, [
      ["entry_type", detail?.entryType ?? null],
      ["occurred_at", detail?.occurredAt ?? null],
      ["timezone", detail?.timezone ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Entry",
      block([
        line("Occurred at", detail?.occurredAt ?? null),
        line("Timezone", detail?.timezone ?? null),
        line("Type", detail ? humanise(detail.entryType) : null),
        line("Captured via", detail ? humanise(detail.sourceChannel) : null),
      ]),
    ),
    body(context, detail?.body ?? null),
    section("Related records", relationshipSection(index, path, entity.id)),
  ]);
}

function writeMeeting(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.meetingDetail.get(entity.id);
  const items = index.meetingItems.get(entity.id) ?? [];
  const byKind = (kind: string): string | null => {
    const rows = items
      .filter((item) => item.kind === kind)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => {
        const rewritten = body(context, item.bodyMarkdown) ?? item.bodyMarkdown;
        // Indent continuation lines so a multi-line item stays inside its bullet.
        return `- ${rewritten.split("\n").join("\n  ")}`;
      });
    return rows.length === 0 ? null : rows.join("\n");
  };
  const attendees = (index.outgoingLinks.get(entity.id) ?? [])
    .filter((link) => link.type === "meeting.attendee")
    .map((link) => link.targetEntityId);
  const followUps = (index.meetingFollowUps.get(entity.id) ?? []).map(
    (row) => row.taskId,
  );

  return document([
    commonFields(context, [
      ["starts_at", detail?.startsAt ?? null],
      ["ends_at", detail?.endsAt ?? null],
      ["timezone", detail?.timezone ?? null],
      ["status", detail?.status ?? null],
      ["held_at", detail?.heldAt ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Meeting",
      block([
        line("Starts", detail?.startsAt ?? null),
        line("Ends", detail?.endsAt ?? null),
        line("Timezone", detail?.timezone ?? null),
        line("Status", detail ? humanise(detail.status) : null),
        line("Mode", detail?.mode ? humanise(detail.mode) : null),
        line("Location", detail?.location ?? null),
        line("Link", detail?.meetingUrl ?? null),
        line("Held", detail?.heldAt ?? null),
      ]),
    ),
    section(
      "Attendees",
      linkList(index, path, attendees, "No attendees recorded."),
    ),
    section("Agenda", byKind("agenda")),
    section("Agenda notes", body(context, detail?.agendaMarkdown ?? null)),
    section("Notes", body(context, detail?.notesMarkdown ?? null)),
    section("Decisions", byKind("decision")),
    section("Outcomes", byKind("outcome")),
    section("Actions", byKind("action")),
    section(
      "Follow-up tasks",
      followUps.length === 0
        ? null
        : linkList(index, path, followUps, "No follow-up tasks."),
    ),
    section("Related records", relationshipSection(index, path, entity.id)),
  ]);
}

function writePerson(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.personDetail.get(entity.id);
  return document([
    commonFields(context, [
      ["tags", detail ? [...detail.tags] : []],
      ["relationship", detail?.relationship ?? null],
      ["next_follow_up", detail?.nextFollowUp ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Contact",
      block([
        line("Preferred name", detail?.preferredName ?? null),
        line(
          "Full name",
          [detail?.firstName, detail?.middleName, detail?.lastName]
            .filter((part): part is string => !!part)
            .join(" ") || null,
        ),
        line("Pronouns", detail?.pronouns ?? null),
        line("Organisation", detail?.organisation ?? null),
        line("Role", detail?.role ?? null),
        line("Department", detail?.department ?? null),
        line("Email", detail?.email ?? null),
        line("Secondary email", detail?.secondaryEmail ?? null),
        line("Mobile", detail?.mobile ?? null),
        line("Work phone", detail?.workPhone ?? null),
        line("Address", detail?.address ?? null),
        line("Website", detail?.website ?? null),
        line("Birthday", detail?.birthday ?? null),
      ]),
    ),
    section(
      "Relationship",
      block([
        line("Relationship", detail?.relationship ?? null),
        line("Preferred contact", detail?.favouriteContactMethod ?? null),
        line("Stay in touch every", detail?.followUpFrequency ?? null),
        line("Next follow-up", detail?.nextFollowUp ?? null),
        line("Last interaction", detail?.lastInteraction ?? null),
      ]),
    ),
    section("Notes", detail?.notes ?? null),
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Interactions", activityExcerpt(context)),
  ]);
}

function assetEventLine(event: SnapshotAssetEvent): string {
  const details = [
    humanise(event.category),
    money(event.costMinor, event.currencyCode)
      ? `cost ${money(event.costMinor, event.currencyCode)}`
      : null,
    money(event.valueMinor, event.currencyCode)
      ? `value ${money(event.valueMinor, event.currencyCode)}`
      : null,
    meter(event.meterValue, event.meterUnit)
      ? `meter ${meter(event.meterValue, event.meterUnit)}`
      : null,
    event.provider ? `provider ${event.provider}` : null,
    event.nextDueDate ? `next due ${event.nextDueDate}` : null,
    event.deletedAt !== null ? "deleted" : null,
    event.archivedAt !== null ? "archived" : null,
  ].filter((part): part is string => part !== null);
  const suffix = details.length === 0 ? "" : ` — ${details.join(", ")}`;
  const description = event.description ? `\n  ${event.description}` : "";
  return `- **${event.eventDate}** ${event.title}${suffix}${description}`;
}

function assetObligationLine(obligation: SnapshotAssetObligation): string {
  const details = [
    humanise(obligation.category),
    `status ${obligation.status}`,
    obligation.dueDate ? `due ${obligation.dueDate}` : null,
    meter(obligation.meterThreshold, obligation.meterUnit)
      ? `at meter ${meter(obligation.meterThreshold, obligation.meterUnit)}`
      : null,
    // "repeats every 6 months", not "repeats months every 6".
    obligation.recurrenceKind === "none"
      ? null
      : obligation.recurrenceKind === "meter"
        ? `repeats by meter${
            obligation.meterInterval === null
              ? ""
              : ` every ${obligation.meterInterval}${
                  obligation.meterUnit === null
                    ? ""
                    : ` ${obligation.meterUnit}`
                }`
          }`
        : `repeats every ${
            obligation.recurrenceInterval === null
              ? ""
              : `${obligation.recurrenceInterval} `
          }${obligation.recurrenceKind}`,
    obligation.deletedAt !== null ? "deleted" : null,
  ].filter((part): part is string => part !== null);
  const description = obligation.description
    ? `\n  ${obligation.description}`
    : "";
  return `- **${obligation.title}** — ${details.join(", ")}${description}`;
}

function writeAsset(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.assetDetail.get(entity.id);
  const events = (index.assetEvents.get(entity.id) ?? [])
    .slice()
    .sort((a, b) =>
      a.eventDate === b.eventDate
        ? a.id < b.id
          ? -1
          : 1
        : a.eventDate < b.eventDate
          ? 1
          : -1,
    );
  const obligations = (index.assetObligations.get(entity.id) ?? [])
    .slice()
    .sort((a, b) => {
      const left = a.dueDate ?? "9999-12-31";
      const right = b.dueDate ?? "9999-12-31";
      return left === right ? (a.id < b.id ? -1 : 1) : left < right ? -1 : 1;
    });
  const recordedCost = events
    .filter((event) => event.deletedAt === null && event.costMinor !== null)
    .reduce((total, event) => total + (event.costMinor ?? 0), 0);
  const costCurrency =
    events.find((event) => event.costMinor !== null)?.currencyCode ?? null;

  return document([
    commonFields(context, [
      ["asset_type", detail?.assetType ?? null],
      ["status", detail?.status ?? null],
      ["tags", detail ? [...detail.tags] : []],
      ["renewal_date", detail?.renewalDate ?? null],
      ["warranty_expiry", detail?.warrantyExpiry ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Asset",
      block([
        line("Type", detail ? humanise(detail.assetType) : null),
        line("Status", detail ? humanise(detail.status) : null),
        line("Manufacturer", detail?.manufacturer ?? null),
        line("Model", detail?.model ?? null),
        line("Serial number", detail?.serialNumber ?? null),
        line("Reference", detail?.referenceCode ?? null),
        line("Location", detail?.location ?? null),
        line("Supplier", detail?.supplier ?? null),
        line("Issuer", detail?.issuer ?? null),
        line("Reference number", detail?.referenceNumber ?? null),
        line("URL", detail?.url ?? null),
      ]),
    ),
    section("Description", detail?.description ?? null),
    section(
      "Value and dates",
      block([
        line("Acquired", detail?.acquisitionDate ?? null),
        line(
          "Purchase price",
          money(
            detail?.purchasePriceMinor ?? null,
            detail?.currencyCode ?? null,
          ),
        ),
        line(
          "Replacement value",
          money(
            detail?.replacementValueMinor ?? null,
            detail?.currencyCode ?? null,
          ),
        ),
        line("Warranty expires", detail?.warrantyExpiry ?? null),
        line("Issued", detail?.issueDate ?? null),
        line("Renews", detail?.renewalDate ?? null),
        line("Disposed", detail?.disposalDate ?? null),
        line("Disposal notes", detail?.disposalNotes ?? null),
        line(
          "Recorded costs",
          recordedCost === 0 ? null : money(recordedCost, costCurrency),
        ),
      ]),
    ),
    section(
      "Service and meter",
      block([
        line("Service interval", detail?.serviceInterval ?? null),
        line("Last service", detail?.lastServiceDate ?? null),
        line("Next service", detail?.nextServiceDate ?? null),
        line("Service provider", detail?.serviceProvider ?? null),
        line("Maintenance notes", detail?.maintenanceNotes ?? null),
        line(
          "Current meter",
          meter(
            detail?.currentMeterValue ?? null,
            detail?.currentMeterUnit ?? null,
          ),
        ),
        line("Meter read on", detail?.currentMeterDate ?? null),
      ]),
    ),
    section("Documents", detail?.documentNotes ?? null),
    section(
      "Obligations",
      obligations.length === 0
        ? null
        : obligations.map(assetObligationLine).join("\n"),
    ),
    section(
      "History",
      events.length === 0 ? null : events.map(assetEventLine).join("\n"),
    ),
    section("Related records", relationshipSection(index, path, entity.id)),
  ]);
}

function writeReview(context: WriterContext): string {
  const { index, entity, path } = context;
  const detail = index.reviewDetail.get(entity.id);
  const sections = (index.reviewSections.get(entity.id) ?? [])
    .slice()
    .sort((a, b) => (a.sectionId < b.sectionId ? -1 : 1));
  const responses = sections
    .map((row) => {
      const answered = row.bodyMarkdown.trim() !== "";
      const rendered = answered
        ? (body(context, row.bodyMarkdown) ?? row.bodyMarkdown)
        : "_No response recorded._";
      return `### ${humanise(row.sectionId)}\n\n${rendered}`;
    })
    .join("\n\n");
  return document([
    commonFields(context, [
      ["review_type", detail?.reviewType ?? null],
      ["period_start", detail?.periodStart ?? null],
      ["period_end", detail?.periodEnd ?? null],
      ["status", detail?.status ?? null],
      ["template", detail?.templateId ?? null],
    ]),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    section(
      "Review",
      block([
        line("Type", detail ? humanise(detail.reviewType) : null),
        line(
          "Period",
          detail ? `${detail.periodStart} → ${detail.periodEnd}` : null,
        ),
        line("Status", detail ? humanise(detail.status) : null),
        line("Template", detail?.templateId ?? null),
        line("Completed", detail?.completedAt ?? null),
      ]),
    ),
    section("Responses", responses === "" ? null : responses),
    section("Source records", relationshipSection(index, path, entity.id)),
  ]);
}

function writeGeneric(context: WriterContext): string {
  const { index, entity, path } = context;
  return document([
    commonFields(context, []),
    `# ${entity.title}`,
    lifecycleBanner(lifecycleOf(index, entity)),
    `_DalyHub exported this record as a \`${entity.type}\`. This export build has no module-specific presentation for that type, so its identity, lifecycle and relationships are shown; the complete record is in \`dalyhub-snapshot.json\` in the full export._`,
    section("Related records", relationshipSection(index, path, entity.id)),
    section("Recent activity", activityExcerpt(context)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

/** The most recent events shown on a record. The full stream lives in `Activity/`. */
const RECORD_ACTIVITY_LIMIT = 20;

/** One activity line: when, what and who. Never a fabricated narrative. */
function activityLine(
  activity: SnapshotActivity,
  actorName: VaultActorNameResolver,
): string {
  const actor = actorName(activity.actorType, activity.actorId);
  return `- **${activity.occurredAt}** — ${humanise(activity.type)} (${actor})`;
}

function activityExcerpt(context: WriterContext): string | null {
  const events = context.index.activityByEntity.get(context.entity.id) ?? [];
  if (events.length === 0) return null;
  const recent = events.slice(-RECORD_ACTIVITY_LIMIT).reverse();
  const more =
    events.length > RECORD_ACTIVITY_LIMIT
      ? `\n\n_${events.length - RECORD_ACTIVITY_LIMIT} earlier event(s) are in the \`Activity\` folder._`
      : "";
  return `${recent
    .map((activity) => activityLine(activity, context.actorName))
    .join("\n")}${more}`;
}

/** The `YYYY-MM` bucket an event belongs to. */
function activityMonth(occurredAt: string): string {
  return occurredAt.slice(0, 7);
}

function writeActivityFiles(
  index: VaultIndex,
  actorName: VaultActorNameResolver,
): readonly VaultFile[] {
  const activities = index.snapshot.records.activities;
  if (activities.length === 0) return [];

  const subjectsByActivity = new Map<string, string[]>();
  for (const subject of index.snapshot.records.activitySubjects) {
    const bucket = subjectsByActivity.get(subject.activityId);
    if (bucket) bucket.push(subject.entityId);
    else subjectsByActivity.set(subject.activityId, [subject.entityId]);
  }

  const months = new Map<string, SnapshotActivity[]>();
  for (const activity of activities) {
    const month = activityMonth(activity.occurredAt);
    const bucket = months.get(month);
    if (bucket) bucket.push(activity);
    else months.set(month, [activity]);
  }

  const files: VaultFile[] = [];
  for (const [month, events] of [...months.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const path = `Activity/${month}.md`;
    const rows = events.map((activity) => {
      const actor = actorName(activity.actorType, activity.actorId);
      const subjects = (subjectsByActivity.get(activity.id) ?? [])
        .map((entityId) => recordLink(index, path, entityId))
        .filter((link): link is string => link !== null);
      const about = subjects.length === 0 ? "" : ` — ${subjects.join(", ")}`;
      return `- **${activity.occurredAt}** ${humanise(activity.type)} (${actor})${about}`;
    });
    files.push({
      path,
      contents: document([
        frontmatter(
          fields([
            ["dalyhub_type", "activity_month"],
            ["title", month],
            ["event_count", events.length],
            ["dalyhub_export_schema", index.snapshot.meta.schema],
          ]),
        ),
        `# Activity — ${month}`,
        `${events.length} event(s), oldest first.`,
        rows.join("\n"),
      ]),
    });
  }
  return files;
}

/* -------------------------------------------------------------------------- */
/* Vault-level files                                                          */
/* -------------------------------------------------------------------------- */

function writeHome(index: VaultIndex): VaultFile {
  const path = "Home.md";
  const counts = new Map<string, number>();
  for (const entity of index.entities) {
    const folder = vaultFolderForType(entity.type);
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const overview = VAULT_FOLDER_ORDER.filter((folder) => counts.has(folder))
    .map((folder) => `| ${folder} | ${counts.get(folder)} |`)
    .join("\n");

  const areas = index.entities
    .filter((entity) => entity.type === "area" && entity.deletedAt === null)
    .map((entity) => {
      const link = recordLink(index, path, entity.id);
      return link === null ? null : `- ${link}`;
    })
    .filter((row): row is string => row !== null);

  return {
    path,
    contents: document([
      frontmatter(
        fields([
          ["dalyhub_type", "vault_home"],
          ["title", "DalyHub Export"],
          ["dalyhub_exported_at", index.snapshot.meta.exportedAt],
          ["dalyhub_export_schema", index.snapshot.meta.schema],
          ["dalyhub_export_schema_version", index.snapshot.meta.schemaVersion],
        ]),
      ),
      "# DalyHub Export",
      `Exported ${index.snapshot.meta.exportedAt} from DalyHub ${index.snapshot.meta.application.version} (${index.snapshot.meta.application.releaseName}).`,
      "This vault is plain Markdown with YAML frontmatter and relative links. It opens in Obsidian with no plugin, and reads correctly in any Markdown editor.",
      section(
        "What is here",
        `| Folder | Records |\n| --- | --- |\n${overview}`,
      ),
      section("Areas", areas.length === 0 ? "_No areas._" : areas.join("\n")),
      section(
        "About this export",
        [
          `- ${markdownLink("Export information", relativeVaultPath(path, `${VAULT_META_FOLDER}/Export Information.md`))}`,
          `- ${markdownLink("Settings", relativeVaultPath(path, `${VAULT_META_FOLDER}/Settings.md`))}`,
          `- ${markdownLink("Unresolved links", relativeVaultPath(path, `${VAULT_META_FOLDER}/Unresolved Links.md`))}`,
        ].join("\n"),
      ),
    ]),
  };
}

function writeSettings(index: VaultIndex): VaultFile {
  const { preferences, taskSavedViews } = index.snapshot.owner;
  const views =
    taskSavedViews.length === 0
      ? "_No saved Tasks views._"
      : taskSavedViews.map((view) => `- ${view.name}`).join("\n");
  return {
    path: `${VAULT_META_FOLDER}/Settings.md`,
    contents: document([
      frontmatter(
        fields([
          ["dalyhub_type", "owner_settings"],
          ["title", "Settings"],
          ["timezone", preferences.timezone],
          ["theme", preferences.theme],
        ]),
      ),
      "# Settings",
      "The owner preferences DalyHub had stored when this export was taken. No credential, token or session value is included.",
      section(
        "Preferences",
        block([
          line("Timezone", preferences.timezone),
          line("Date format", preferences.dateFormat),
          line("First day of week", preferences.firstDayOfWeek),
          line("Default landing page", preferences.defaultLandingDestination),
          line("Default Tasks view", preferences.defaultTasksView),
          line("Default Task destination", preferences.defaultTaskDestination),
          line("Default Diary mode", preferences.defaultDiaryMode),
          line("Theme", preferences.theme),
          line(
            "Preferences record version",
            preferences.version === 0
              ? "defaults (nothing saved)"
              : String(preferences.version),
          ),
        ]),
      ),
      section("Saved Tasks views", views),
    ]),
  };
}

function writeUnresolved(
  index: VaultIndex,
  unresolved: readonly UnresolvedLink[],
): VaultFile {
  const reasons: Record<string, string> = {
    no_matching_title: "No record in the export has that title",
    target_not_exported: "The linked record is not in this export",
    rewrite_limit_reached: "Too many internal links in one document",
  };
  const rows = unresolved
    .slice()
    .sort((a, b) =>
      a.sourcePath === b.sourcePath
        ? a.reference < b.reference
          ? -1
          : 1
        : a.sourcePath < b.sourcePath
          ? -1
          : 1,
    )
    .map(
      (link) =>
        `| ${link.sourceTitle} | \`${link.sourcePath}\` | ${link.label} | \`${link.reference}\` | ${reasons[link.reason] ?? link.reason} |`,
    );

  return {
    path: `${VAULT_META_FOLDER}/Unresolved Links.md`,
    contents: document([
      frontmatter(
        fields([
          ["dalyhub_type", "unresolved_links"],
          ["title", "Unresolved links"],
          ["unresolved_count", unresolved.length],
        ]),
      ),
      "# Unresolved links",
      unresolved.length === 0
        ? "Every internal DalyHub link in this export resolved to a file in this vault."
        : "These internal DalyHub links could not be turned into vault links. The label is preserved in the document and marked *(unresolved DalyHub link)* in place. A link is normally unresolved because the target was deleted, or because a `[[Wiki Link]]` names a title no record has.",
      unresolved.length === 0
        ? null
        : `| Record | File | Label | Reference | Reason |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}`,
      section(
        "Note",
        `A \`[[Wiki Link]]\` resolves by TITLE against ACTIVE records only — the same rule DalyHub itself applies — so a wiki link to a deleted record appears here even though the deleted record does have a file in this vault. A \`dalyhub://type/id\` link resolves by stable id and does reach a deleted record's file.`,
      ),
    ]),
  };
}

function writeExportInformation(
  index: VaultIndex,
  unresolvedCount: number,
): VaultFile {
  const meta = index.snapshot.meta;
  const counts = index.snapshot.records;
  const limitations =
    index.snapshot.limitations.length === 0
      ? "_None recorded._"
      : index.snapshot.limitations
          .map(
            (limitation) => `- **${limitation.code}** — ${limitation.detail}`,
          )
          .join("\n");
  return {
    path: `${VAULT_META_FOLDER}/Export Information.md`,
    contents: document([
      frontmatter(
        fields([
          ["dalyhub_type", "export_information"],
          ["title", "Export information"],
          ["dalyhub_export_schema", meta.schema],
          ["dalyhub_export_schema_version", meta.schemaVersion],
          ["dalyhub_exported_at", meta.exportedAt],
        ]),
      ),
      "# Export information",
      section(
        "This export",
        block([
          line("Exported at", meta.exportedAt),
          line("Schema", `${meta.schema} v${meta.schemaVersion}`),
          line(
            "Application",
            `${meta.application.name} ${meta.application.version} (${meta.application.releaseName})`,
          ),
          line("Environment", meta.application.environment),
          line("Build", meta.application.buildCommit),
          line("Workspace", index.snapshot.workspace.id),
          line("Unresolved links", String(unresolvedCount)),
        ]),
      ),
      section(
        "Consistency",
        "This vault was read through a sequence of bounded database statements. Each statement saw a consistent database, but the sequence is **not** an atomic point-in-time snapshot: a change made while the export was running may appear in some records and not others. DalyHub states this rather than claiming a guarantee it does not have.",
      ),
      section(
        "Record counts",
        `| Collection | Records |\n| --- | --- |\n${Object.entries(counts)
          .map(
            ([name, rows]) =>
              `| ${name} | ${(rows as readonly unknown[]).length} |`,
          )
          .join("\n")}`,
      ),
      section("Limitations", limitations),
      section(
        "What is not here",
        [
          "- Credentials, tokens, cookies and session data — never exported.",
          "- Cloudflare bindings, secrets and deployment configuration.",
          "- The authenticated owner's subject identifier.",
          "- File attachments: DalyHub does not store any yet.",
          "- Rendered HTML. Markdown is exported as the source you wrote.",
        ].join("\n"),
      ),
    ]),
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/** Build the complete vault from a snapshot. Pure and deterministic. */
export function buildObsidianVault(
  snapshot: WorkspaceSnapshotV1,
  options: VaultBuildOptions = {},
): VaultBuildResult {
  const actorName = options.resolveActorName ?? defaultActorName;
  const index = buildVaultIndex(snapshot);
  const unresolved: UnresolvedLink[] = [];
  const files: VaultFile[] = [];

  for (const entity of index.entities) {
    const location = index.location.get(entity.id);
    if (!location) continue;
    const context: WriterContext = {
      index,
      path: location.path,
      entity,
      unresolved,
      actorName,
    };
    let contents: string;
    switch (entity.type) {
      case "area":
        contents = writeArea(context);
        break;
      case "goal":
        contents = writeGoal(context);
        break;
      case "project":
        contents = writeProject(context);
        break;
      case "task":
        contents = writeTask(context);
        break;
      case "note":
        contents = writeNote(context);
        break;
      case "diary":
        contents = writeDiary(context);
        break;
      case "meeting":
        contents = writeMeeting(context);
        break;
      case "person":
        contents = writePerson(context);
        break;
      case "asset":
        contents = writeAsset(context);
        break;
      case "review":
        contents = writeReview(context);
        break;
      default:
        contents = writeGeneric(context);
        break;
    }
    files.push({ path: location.path, contents });
  }

  files.push(...writeActivityFiles(index, actorName));
  files.push(writeHome(index));
  files.push(writeExportInformation(index, unresolved.length));
  files.push(writeSettings(index));
  files.push(writeUnresolved(index, unresolved));

  // One stable order for the archive, independent of the order writers ran in.
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, unresolved };
}
