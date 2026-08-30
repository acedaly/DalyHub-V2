import { env } from "cloudflare:workers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { readAiAvailability } from "~/platform/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  useRegisterContextualActions,
  type AppAction,
} from "~/shared/commands";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { MEETING_TITLE_MAX_LENGTH } from "~/kernel/meetings";
import { EntityIcon, EntityLink } from "~/shared/entity";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import { useFeedback } from "~/shared/feedback";
import { CheckIcon } from "~/shared/icons";
import type { OverflowMenuItem } from "~/shared/overflow-menu";
import {
  lifecycleActionLabel,
  useRecordLifecycle,
} from "~/shared/record-lifecycle";
import { SettingsGroup, SettingsLayout, SettingsRow } from "~/shared/settings";
import { EmptyState } from "~/shared/empty-state";
import { LinkedItemsTab } from "~/shared/linked-items";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  LocalDateTimeField,
  SelectField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { AiExtractionSurface } from "~/shared/ai";
import { RecordLayout } from "~/shared/record-layout";
import {
  TASK_DRAWER_TITLE,
  TaskRecordDrawer,
} from "~/shared/task-record/TaskRecordDrawer";
import { serializeTaskView } from "~/shared/task-record/task-view";
import { utcToOwnerLocal } from "~/shared/datetime";
import { MeetingCaptureBar } from "../MeetingCaptureBar";
import { MeetingContextRow } from "../MeetingContextRow";
import { MeetingMarkdown } from "../MeetingMarkdown";
import type { MeetingConflictResponse } from "./mutate";
import {
  DIRECT_FOLLOW_UP_DRAWER_KEY,
  MeetingFollowUpFormHost,
  MeetingFollowUpTab,
  MeetingItemsSection,
} from "../MeetingFollowUp";
import {
  MEETING_HELD_ERROR_MESSAGE,
  meetingHeldActionItem,
  meetingHeldSuccessMessage,
} from "../meeting-held-action";
import { MeetingTimelineTab } from "../MeetingTimelineTab";
import {
  formatMeetingDate,
  formatMeetingInstant,
  meetingModeLabel,
  meetingStatusLabel,
  serializeMeeting,
} from "../meeting-view";
import { useAttendeeSearch } from "../use-attendee-search";
import type { FollowUpTaskEntry } from "../follow-up-view";
import type { Route } from "./+types/detail";

/** A bound on how many follow-up Tasks a single meeting record resolves at once. */
const FOLLOW_UP_CAP = 100;

/** MEET-03 — the shape `POST /meeting/:id/mutate` returns for `mark_held`. */
interface MarkHeldPayload {
  readonly ok?: boolean;
  readonly outcome?: "recorded" | "already_held";
  readonly heldAt?: string;
  readonly attendeeCount?: number;
  readonly attendeesRecorded?: number;
  readonly error?: string;
}

export function meta() {
  return [{ title: "Meeting · DalyHub" }];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const s = requireAuthenticatedSession(context),
    scope = await resolveAuthenticatedWorkspaceScope(env, s),
    meeting = await scope.meetings.get(params.meetingId);
  if (!meeting) throw new Response("Not Found", { status: 404 });
  const links = await scope.entityLinks.listForEntity(meeting.id, {
    direction: "both",
    limit: 50,
  });

  // Follow-up Tasks: resolve the mapped Tasks through the CANONICAL Task model
  // in ONE bounded batch (`getTasksByIds`, chunked at the D1-safe size —
  // RECALL-00-C closed the per-link `getTask` loop this used to run), so
  // grouping/state still derive from the Task, never a cached Meeting field. A
  // deleted Task is simply absent from the map and drops out (safe degradation —
  // no broken links or leaked ids); the caller's newest-first link order is
  // reimposed by this walk. The mapping read is bounded and NEWEST-first, so the
  // most recent follow-ups are the ones shown; a single meeting exceeding the
  // bound is not a realistic case (deeper load-more paging is a documented
  // follow-up).
  const followUpLinks = await scope.meetings.listFollowUps(meeting.id, {
    limit: FOLLOW_UP_CAP,
  });
  const followUpTasks = await scope.tasks.getTasksByIds(
    followUpLinks.map((link) => link.taskId),
  );
  const followUps: FollowUpTaskEntry[] = [];
  for (const link of followUpLinks) {
    const task = followUpTasks.get(link.taskId);
    if (task) {
      followUps.push({ task: serializeTaskView(task), itemId: link.itemId });
    }
  }

  return {
    // AI-01 — availability only: whether the action can run, never a credential.
    aiAvailability: await readAiAvailability(
      scope,
      s.user.subject,
      "meeting-action-extraction",
      env,
    ),
    meeting: serializeMeeting(meeting),
    attendees: links.items
      .filter((x) => x.link.type === "meeting.attendee")
      .map((x) => ({
        linkId: x.link.id,
        id: x.counterpart.id,
        title: x.counterpart.title,
      })),
    followUps,
  };
}

/*
 * UIX-04 §24/§26 — the NOTEBOOK is the meeting, and it opens first.
 *
 * "Overview" was the default tab, and it held a duration, a timezone, a held
 * date, an "Edit details" disclosure, an attendee editor with a full-width
 * People search, and two relationship lists. So the screen that is supposed to
 * answer "what are we discussing / what was decided / what came out of it"
 * opened on a metadata form, and the agenda, the notes, the decisions and the
 * actions were all one tab away — behind a tab labelled, unhelpfully, "Meeting".
 *
 * The order is now the order of the questions §24 lists. The notebook is first
 * and is the default (its id keeps the `meeting` slug so every existing link and
 * the four legacy slugs still resolve); the follow-up work is second, because
 * that is what a meeting produces; and the metadata that used to be the front
 * page is now "Details", which is what it always was.
 */
const tabs = ["meeting", "follow-up", "details", "ai", "activity", "settings"];
/*
 * Older links, redirected rather than broken. The four MEET-01 section slugs
 * folded into `meeting` when the notebook was unified; `overview` is UIX-04's
 * own rename of that tab to `details`.
 */
const legacyMeetingTabs = new Map<string, string>([
  ["agenda", "meeting"],
  ["notes", "meeting"],
  ["decisions", "meeting"],
  ["outcomes", "meeting"],
  ["overview", "details"],
]);

export default function Detail({ loaderData }: Route.ComponentProps) {
  const { meeting } = loaderData;
  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      const sep = entry.key.indexOf(":");
      const kind = sep === -1 ? entry.key : entry.key.slice(0, sep);
      const id = sep === -1 ? "" : entry.key.slice(sep + 1);
      if (kind === "task" && id) {
        return {
          title: TASK_DRAWER_TITLE,
          children: <TaskRecordDrawer taskId={id} />,
        };
      }
      if (kind === "follow-up" && id) {
        const item = meeting.items.find((i) => i.id === id);
        return {
          title: "New follow-up task",
          description: "Convert this meeting item into a task.",
          children: (
            <MeetingFollowUpFormHost
              meetingId={meeting.id}
              itemId={id}
              initialTitle={item?.bodyMarkdown ?? ""}
            />
          ),
        };
      }
      if (entry.key === DIRECT_FOLLOW_UP_DRAWER_KEY) {
        return {
          title: "New follow-up task",
          description: "Capture a follow-up from this meeting.",
          children: (
            <MeetingFollowUpFormHost
              meetingId={meeting.id}
              itemId={null}
              initialTitle={`Follow up: ${meeting.title}`}
            />
          ),
        };
      }
      return null;
    },
    [meeting],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <MeetingRecord loaderData={loaderData} />
    </DrawerProvider>
  );
}

function MeetingRecord({
  loaderData,
}: {
  loaderData: Route.ComponentProps["loaderData"];
}) {
  const { meeting: m, followUps, aiAvailability } = loaderData,
    r = useRevalidator(),
    { openDrawer } = useDrawer(),
    capture = useCapture(),
    feedback = useFeedback(),
    [sp, setSp] = useSearchParams(),
    rawTab = sp.get("tab"),
    active =
      legacyMeetingTabs.get(rawTab ?? "") ??
      (tabs.includes(rawTab ?? "") ? rawTab! : "meeting");
  const readOnly = Boolean(m.archivedAt);
  const captureContext: CaptureContextContract = {
    sourceEntityId: m.id,
    sourceEntityType: "meeting",
    sourceEntityTitle: m.title,
    sourceModule: "meetings",
    originatingRoute: `/meeting/${m.id}`,
    mode: "removable",
    relationshipMeaning: "related",
    returnTo: `/meeting/${m.id}`,
  };
  const [markingHeld, setMarkingHeld] = useState(false);

  const change = useCallback(
    (id: string) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          // The notebook is the default, so it is the tab expressed by the
          // ABSENCE of the param — the same contract every other record uses.
          if (id === "meeting") next.delete("tab");
          else next.set("tab", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  const post = useCallback(
    async (data: Record<string, string>): Promise<boolean> => {
      const f = new FormData();
      Object.entries(data).forEach(([k, v]) => f.set(k, v));
      try {
        const response = await fetch(`/meeting/${m.id}/mutate`, {
          method: "POST",
          body: f,
        });
        // Only revalidate on success; a failed mutation leaves the UI (and any
        // in-progress input text) untouched so the user can retry.
        if (response.ok) {
          r.revalidate();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [m.id, r],
  );

  /**
   * DS-16 — the Meeting title, edited on the heading (EDIT-02).
   *
   * The `update` intent is already a PARTIAL patch server-side — it copies only
   * the keys present in the submission — so posting `title` alone changes the
   * title and nothing else. That is what makes it safe to edit here while the
   * scheduling fields (start, end, timezone, location, mode, link) stay in their
   * disclosure form: those genuinely interact and belong together (§1, category
   * E), a one-line name does not.
   */
  const renameMeeting = useCallback(
    async (title: string): Promise<InlineSaveOutcome> => {
      const ok = await post({ intent: "update", title });
      return ok
        ? { ok: true }
        : {
            ok: false,
            message: "That couldn’t be saved. Your text is safe — try again.",
          };
    },
    [post],
  );

  /**
   * MEET-03 — "Mark as held": the explicit, truthful domain action that records
   * that this meeting took place and contributes it to every attendee's existing
   * Person Activity timeline.
   *
   * The client sends ONLY the intent. Attendees, workspace and actor are all
   * derived server-side, so this handler cannot influence who the event names. The
   * server is idempotent, so a double click, a retry after a dropped connection or
   * a second tab can never produce a second event — and the message below tells the
   * truth about which of those happened rather than always claiming success.
   */
  const onMarkHeld = useCallback(async () => {
    if (markingHeld) return;
    setMarkingHeld(true);
    try {
      const body = new FormData();
      body.set("intent", "mark_held");
      const response = await fetch(`/meeting/${m.id}/mutate`, {
        method: "POST",
        body,
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as MarkHeldPayload;
      if (!response.ok || !payload.ok) {
        feedback.notifyError(payload.error ?? MEETING_HELD_ERROR_MESSAGE);
        return;
      }
      const { title, message } = meetingHeldSuccessMessage({
        outcome: payload.outcome ?? "recorded",
        attendeeCount: payload.attendeeCount ?? 0,
        attendeesRecorded:
          payload.attendeesRecorded ?? payload.attendeeCount ?? 0,
      });
      feedback.notifySuccess(title, message ? { message } : undefined);
      r.revalidate();
    } catch {
      feedback.notifyError(MEETING_HELD_ERROR_MESSAGE);
    } finally {
      setMarkingHeld(false);
    }
  }, [feedback, m.id, markingHeld, r]);

  /**
   * The action's home is the shared DS-12 Record Header overflow, above the
   * lifecycle group — never a bespoke button. It is offered only where it is
   * contextually valid (an active meeting), and once the meeting is held it stays
   * VISIBLE but disabled, stating in words when it was recorded: repeated
   * completion is therefore visibly idempotent, and the state is never conveyed by
   * colour alone (DESIGN_SYSTEM.md → Shared overflow menu).
   */
  const heldMenuItems = useMemo<OverflowMenuItem[]>(() => {
    const item = meetingHeldActionItem(
      { heldAt: m.heldAt, archived: readOnly, pending: markingHeld },
      (instant) => formatMeetingDate(instant, m.timezone),
    );
    if (!item) return [];
    return [
      {
        ...item,
        icon: <CheckIcon />,
        ...(item.disabled ? {} : { onSelect: () => void onMarkHeld() }),
      },
    ];
  }, [m.heldAt, m.timezone, markingHeld, onMarkHeld, readOnly]);

  const onOpenTask = useCallback(
    (taskId: string) => openDrawer(`task:${taskId}`),
    [openDrawer],
  );
  const onConvert = useCallback(
    (itemId: string) => openDrawer(`follow-up:${itemId}`),
    [openDrawer],
  );
  const onAddFollowUp = useCallback(
    () => openDrawer(DIRECT_FOLLOW_UP_DRAWER_KEY),
    [openDrawer],
  );

  const liveTasks = useMemo(() => {
    const map = new Map<string, (typeof followUps)[number]["task"]>();
    for (const entry of followUps) {
      if (entry.itemId) map.set(entry.itemId, entry.task);
    }
    return map;
  }, [followUps]);

  // A meeting-aware ⌘K action: "New Meeting follow-up" navigates to this meeting's
  // Follow-up tab with the direct follow-up drawer open (a `navigate` action, never
  // a focus-moving `run`, per COMMAND_PALETTE.md). Hidden on an archived meeting.
  const followUpActions = useMemo<AppAction[]>(
    () =>
      readOnly
        ? []
        : [
            {
              id: `meetings.follow_up.${m.id}`,
              title: "New Meeting follow-up",
              subtitle: "Capture a follow-up task from this meeting",
              keywords: ["follow up", "task", "convert", "action item"],
              kind: "navigate",
              target: {
                kind: "route",
                to: `/meeting/${m.id}?tab=follow-up&drawer=${DIRECT_FOLLOW_UP_DRAWER_KEY}`,
              },
            },
          ],
    [m.id, readOnly],
  );
  useRegisterContextualActions(followUpActions);

  /**
   * The notes value this component last wrote, held until the loader catches up.
   *
   * `notesMarkdown` is a whole-field update, so appending means read-modify-write —
   * and the "read" is a loader snapshot that only refreshes after revalidation.
   * Capturing two notes in quick succession (exactly what the capture bar is FOR)
   * would otherwise build the second append from the pre-first-note snapshot and
   * overwrite the first note. Remembering what we wrote makes the second append
   * build on it.
   */
  const pendingNotesRef = useRef<string | null>(null);

  // Drop the remembered value once the loader has caught up with it, so the
  // component goes back to trusting the server as its base.
  useEffect(() => {
    if (pendingNotesRef.current === m.notesMarkdown) {
      pendingNotesRef.current = null;
    }
  }, [m.notesMarkdown]);

  /**
   * MOBILE-01 — append a captured note to the meeting's canonical notes Markdown.
   *
   * The SAME `intent=update` / `notesMarkdown` authority the Notes editor
   * autosaves through, so a note captured from the bar and a note typed in the
   * editor are one field, one Markdown source and one Activity trail. The line is
   * appended (never overwritten) so a capture during a meeting can never destroy
   * notes already written.
   */
  const appendNote = useCallback(
    async (line: string): Promise<boolean> => {
      const pending = pendingNotesRef.current;
      // Trust the remembered value only while it is still an EXTENSION of what the
      // server has. If the loader value is not a prefix of it, something else —
      // the Notes editor autosaving, another tab — has written the field, and the
      // remembered value would clobber that write. Then the server wins.
      const base =
        pending !== null && pending.startsWith(m.notesMarkdown)
          ? pending
          : m.notesMarkdown;

      /*
       * HARDEN-06B (F-01) — the append quotes the version it read, and RETRIES
       * on refusal instead of failing.
       *
       * An append is the one whole-document write that HAS a deterministic safe
       * merge: adding a line to whatever the notes currently are produces text
       * that keeps both writers' words, which is exactly why the editor refuses
       * and this does not. The refusal answers with the newer stored notes, so
       * the retry appends onto those. Bounded to one retry — a second refusal
       * means a third writer is active, and reporting the failure honestly is
       * better than looping while the owner waits.
       *
       * The remembered value is now committed only AFTER a successful write,
       * where it used to be written optimistically. Two captures in quick
       * succession — what the bar is FOR — therefore cost the second one a
       * refusal and a retry rather than being merged locally, and both notes
       * survive because the SERVER arbitrates instead of this component
       * guessing. A failed append still never becomes the base for the next.
       */
      const attempt = async (
        onto: string,
        expectedUpdatedAt: string,
      ): Promise<
        | { readonly ok: true; readonly written: string }
        | { readonly ok: false; readonly conflict?: MeetingConflictResponse }
      > => {
        const existing = onto.trimEnd();
        const next = existing.length > 0 ? `${existing}\n\n${line}` : line;
        const f = new FormData();
        f.set("intent", "update");
        f.set("notesMarkdown", next);
        f.set("expectedUpdatedAt", expectedUpdatedAt);
        try {
          const response = await fetch(`/meeting/${m.id}/mutate`, {
            method: "POST",
            body: f,
          });
          if (response.ok) return { ok: true, written: next };
          if (response.status === 409) {
            const data = (await response.json()) as Partial<
              Record<keyof MeetingConflictResponse, unknown>
            >;
            if (data.conflict === true) {
              return { ok: false, conflict: data as MeetingConflictResponse };
            }
          }
          return { ok: false };
        } catch {
          return { ok: false };
        }
      };

      let result = await attempt(base, m.detailsUpdatedAt);
      if (!result.ok && result.conflict) {
        result = await attempt(
          result.conflict.serverNotesMarkdown,
          result.conflict.detailsUpdatedAt ?? m.detailsUpdatedAt,
        );
      }
      if (!result.ok) {
        // A failed append must not become the base for the next one.
        pendingNotesRef.current = pending;
        return false;
      }
      pendingNotesRef.current = result.written;
      r.revalidate();
      return true;
    },
    [m.detailsUpdatedAt, m.id, m.notesMarkdown, r],
  );

  const itemSection = (
    kind: "agenda" | "decision" | "outcome" | "action",
    heading: string,
  ) => (
    <MeetingItemsSection
      kind={kind}
      heading={heading}
      items={m.items}
      liveTasks={liveTasks}
      readOnly={readOnly}
      onConvert={onConvert}
      onOpenTask={onOpenTask}
      onAddItem={(k, body) => post({ intent: "add_item", kind: k, body })}
      onRemoveItem={(itemId) => void post({ intent: "remove_item", itemId })}
    />
  );

  // PX-04 — the shared lifecycle, in the shared overflow slot. Archiving a
  // meeting was previously reachable only through the Settings tab.
  const lifecycle = useRecordLifecycle({
    entityType: "meeting",
    title: m.title,
    archived: Boolean(m.archivedAt),
    // MEET-03's action sits in the module slot the shared hook already provides,
    // above the lifecycle group and separated from it by the shared hairline. The
    // UX-01 operational status actions live in the same overflow slot, so status,
    // held-state and archive state remain separate without adding local buttons.
    leadingItems: [
      ...(readOnly
        ? []
        : [
            {
              id: "capture-follow-up-task",
              label: "New follow-up task",
              description: "Create a Task linked back to this Meeting.",
              onSelect: () =>
                capture?.openCapture("task", null, {
                  ...captureContext,
                  relationshipMeaning: "follow_up",
                }),
            },
            {
              id: "capture-linked-note",
              label: "New linked note",
              description: "Create a Note linked to this Meeting.",
              onSelect: () =>
                capture?.openCapture("note", null, {
                  ...captureContext,
                  relationshipMeaning: "related",
                }),
            },
            {
              id: "capture-diary-entry",
              label: "New diary entry",
              description: "Create a Diary entry linked to this Meeting.",
              onSelect: () =>
                capture?.openCapture("diary", null, captureContext),
            },
          ]),
      ...heldMenuItems,
      ...(readOnly
        ? []
        : [
            ...(m.status !== "completed"
              ? [
                  {
                    id: "meeting-complete",
                    label: "Mark completed",
                    onSelect: () => void post({ intent: "complete" }),
                  },
                ]
              : [
                  {
                    id: "meeting-reopen",
                    label: "Reopen meeting",
                    onSelect: () => void post({ intent: "reopen" }),
                  },
                ]),
            ...(m.status !== "cancelled"
              ? [
                  {
                    id: "meeting-cancel",
                    label: "Cancel meeting",
                    tone: "danger" as const,
                    onSelect: () => void post({ intent: "cancel" }),
                  },
                ]
              : [
                  {
                    id: "meeting-reactivate",
                    label: "Return to planned",
                    onSelect: () => void post({ intent: "reopen" }),
                  },
                ]),
          ]),
    ],
    onArchive: async () => {
      const ok = await post({ intent: "archive" });
      if (!ok) throw new Error("Couldn’t archive this meeting.");
    },
    onRestore: async () => {
      const ok = await post({ intent: "restore" });
      if (!ok) throw new Error("Couldn’t restore this meeting.");
    },
  });

  return (
    <>
      {/*
       * UIX-04 §8/§11/§13 — a Meeting record is a DOCUMENT, so it wears the
       * shared writing-record treatment: a document-sized title, an identity row
       * that does not wrap a lone overflow trigger onto a band of its own, and no
       * breadcrumb on a phone where the top bar already carries "Meetings" and
       * Back. Notes is the other consumer; see `writing.css`.
       */}
      <div className="dh-writing-record">
        <RecordLayout
          title={m.title}
          titleSlot={
            <InlineTextField
              label="Meeting title"
              value={m.title}
              onSave={renameMeeting}
              // An archived meeting is read-only until it is restored, so its
              // title renders as plain text rather than as a control (DS-16).
              readOnly={m.archivedAt !== null}
              variant="heading"
              maxLength={MEETING_TITLE_MAX_LENGTH}
              data-testid="meeting-title-edit"
            />
          }
          // UIX-04 §8/§11 — no glyph, and no `typeLabel`. RECORD-01 dropped the
          // type line because the breadcrumb says "Meetings"; the icon repeated it
          // a second time, and on a title long enough to wrap it took a whole line
          // of its own directly above the title, on the desktop and on the phone.
          breadcrumb={[
            { id: "meetings", label: "Meetings", href: "/meetings" },
          ]}
          status={{
            label: m.archivedAt ? "Archived" : meetingStatusLabel(m.status),
            tone: m.archivedAt ? "warning" : "neutral",
          }}
          /*
           * UIX-04 §27 — one context line: when, where, and WITH WHOM.
           *
           * The shared header's `metadata` renders labelled field/value pairs
           * ("When: …", "Where: …"), which is right for a record whose context is
           * a set of fields and wrong for a meeting, where it reads as the first
           * two rows of the form §27 rules out — and where it left out the one
           * fact a person opens a meeting to check. `label: ""` is the shared
           * header's documented "this context reads as a phrase, not a field"
           * escape, and the value is the whole line.
           */
          metadata={[
            {
              id: "context",
              label: "",
              value: (
                <MeetingContextRow
                  when={formatMeetingInstant(m.startsAt, m.timezone)}
                  where={m.location ?? meetingModeLabel(m.mode)}
                  attendees={loaderData.attendees}
                  allAttendeesHref={`/meeting/${m.id}?tab=details`}
                />
              ),
            },
          ]}
          overflowActions={lifecycle.overflowActions}
          activeTabId={active}
          onTabChange={change}
          tabs={[
            {
              id: "meeting",
              label: "Notebook",
              /* The notebook brings its own writing surfaces, so the panel does
               * not draw a card around a page of writing (§8, §26). */
              surface: "plain",
              content:
                (
                  /*
                   * UIX-04 §26 — the sections run in the order a meeting HAPPENS:
                   * what we said we would cover, what was actually said, what was
                   * decided, what that means, and what someone now has to do.
                   *
                   * Every section here is a real column of the schema — the two
                   * Markdown bodies on `meeting_details`, and the four
                   * `meeting_items.kind` values migration 0021 defines (agenda,
                   * decision, outcome, action). Nothing is invented, which is what
                   * §26 and §30 both insist on.
                   *
                   * Agenda items and the Agenda body are NOT merged: the body is
                   * prose the owner writes, the items are the structured rows a
                   * follow-up Task can be created from. Both existed before; what
                   * changes is that they now sit next to each other under one
                   * heading instead of in two different halves of the tab.
                   */
                  <div className="dh-meeting-notebook">
                    <section className="dh-meeting-notebook__section">
                      <h2 className="dh-meeting-notebook__heading">Agenda</h2>
                      <MeetingMarkdown
                        meetingId={m.id}
                        field="agendaMarkdown"
                        label="Agenda"
                        initial={m.agendaMarkdown}
                        version={m.detailsUpdatedAt}
                        onSaved={() => r.revalidate()}
                        readOnly={readOnly}
                      />
                      {itemSection("agenda", "Agenda items")}
                    </section>

                    <section className="dh-meeting-notebook__section">
                      <h2 className="dh-meeting-notebook__heading">Notes</h2>
                      <MeetingMarkdown
                        meetingId={m.id}
                        field="notesMarkdown"
                        label="Notes"
                        initial={m.notesMarkdown}
                        version={m.detailsUpdatedAt}
                        onSaved={() => r.revalidate()}
                        readOnly={readOnly}
                      />
                    </section>

                    <section className="dh-meeting-notebook__section">
                      <h2 className="dh-meeting-notebook__heading">
                        Decisions
                      </h2>
                      {itemSection("decision", "Decisions")}
                    </section>

                    <section className="dh-meeting-notebook__section">
                      <h2 className="dh-meeting-notebook__heading">Outcomes</h2>
                      {itemSection("outcome", "Outcomes")}
                    </section>

                    <section className="dh-meeting-notebook__section">
                      <h2 className="dh-meeting-notebook__heading">Actions</h2>
                      {itemSection("action", "Actions")}
                    </section>
                  </div>
                ),
            },
            {
              id: "details",
              label: "Details",
              content: (
                <section className="dh-record-section">
                  <h2>Meeting details</h2>
                  {/* UIQ-007 — the SHARED summary facts grid, not a bare
                   * browser-default `<dl>`: the label-over-value presentation
                   * every other record's metadata already uses. */}
                  <dl className="record-summary__meta">
                    {/* RECORD-01 — Status is NOT repeated here: the record header's
                     * status pill, a few pixels above, already states it, and this
                     * row was the same word again under a "Status" label. */}
                    <div className="record-summary__meta-item">
                      <dt>Duration</dt>
                      <dd>{formatMeetingDuration(m.startsAt, m.endsAt)}</dd>
                    </div>
                    <div className="record-summary__meta-item">
                      <dt>Timezone</dt>
                      <dd>{m.timezone}</dd>
                    </div>
                    {/*
                    MEET-03 — the held state, stated in words on the record itself
                    so it is legible without opening a menu, and so the outcome of
                    "Mark as held" is visible rather than implied.
                  */}
                    <div className="record-summary__meta-item">
                      <dt>Held</dt>
                      <dd>
                        {m.heldAt
                          ? `Recorded as held on ${formatMeetingDate(m.heldAt, m.timezone)}`
                          : "Not recorded as held yet"}
                      </dd>
                    </div>
                    {m.meetingUrl && (
                      <div className="record-summary__meta-item">
                        <dt>Meeting link</dt>
                        <dd>
                          <a
                            href={m.meetingUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open meeting link
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {!readOnly ? (
                    <MeetingDetailsEditor meeting={m} onSave={post} />
                  ) : null}
                  <MeetingAttendees
                    meetingId={m.id}
                    attendees={loaderData.attendees}
                    readOnly={readOnly}
                    onPost={post}
                  />
                  <LinkedItemsTab
                    anchorId={m.id}
                    anchorType="meeting"
                    readOnly={readOnly}
                    linkCommandTarget={{
                      kind: "route",
                      to: `/meeting/${m.id}`,
                    }}
                  />
                </section>
              ),
            },
            {
              id: "follow-up",
              label: "Follow-up",
              content: (
                <MeetingFollowUpTab
                  items={m.items}
                  followUps={followUps}
                  readOnly={readOnly}
                  onConvert={onConvert}
                  onOpenTask={onOpenTask}
                  onAddFollowUp={onAddFollowUp}
                />
              ),
            },
            {
              id: "ai",
              label: "AI",
              content: (
                <AiExtractionSurface
                  feature="meeting-action-extraction"
                  recordId={m.id}
                  recordLabel="Meeting"
                  availability={aiAvailability}
                  readOnly={readOnly}
                />
              ),
            },
            {
              id: "activity",
              label: "Activity",
              content: (
                <MeetingTimelineTab meetingId={m.id} reloadKey={m.updatedAt} />
              ),
            },
            {
              id: "settings",
              label: "Settings",
              // PX-04: the shared DS-10b Settings surface, not a bespoke section with
              // a raw button — the same structure Areas/Projects/People/Assets use,
              // and the same lifecycle wording as the header overflow above.
              content: (
                <SettingsLayout title="Meeting settings">
                  <SettingsGroup
                    title={m.archivedAt ? "Archived" : "Archive"}
                    description="Archiving removes this record from active meeting views without deleting its history. Follow-up tasks stay accessible and are never archived or deleted with the meeting."
                    tone={m.archivedAt ? undefined : "danger"}
                  >
                    <SettingsRow
                      label={
                        m.archivedAt
                          ? lifecycleActionLabel("restore", "meeting")
                          : lifecycleActionLabel("archive", "meeting")
                      }
                      description={
                        m.archivedAt
                          ? "Bring it back into your active meetings. Nothing inside it changed."
                          : "It leaves your active meetings, but stays readable and fully intact."
                      }
                      control={
                        <button
                          type="button"
                          className="dh-btn dh-btn--secondary"
                          onClick={() =>
                            void post({
                              intent: m.archivedAt ? "restore" : "archive",
                            })
                          }
                        >
                          {m.archivedAt
                            ? lifecycleActionLabel("restore", "meeting")
                            : lifecycleActionLabel("archive", "meeting")}
                        </button>
                      }
                    />
                  </SettingsGroup>
                </SettingsLayout>
              ),
            },
          ]}
        />

        {/*
         * MOBILE-01 — the sticky capture bar, shown only while the Notebook tab
         * is open (that IS the live-meeting workspace; a bar over the Settings
         * tab would be chrome). It saves through the canonical authorities and
         * leaves the user exactly where they were, so capturing several items
         * during a meeting never means switching tabs or opening a drawer.
         *
         * It is a SIBLING of the record, inside the same wrapper, and must stay
         * one: `meetings.css` reserves the bar's height on the record with
         * `.record-layout:has(~ .dh-meeting-capturebar)`, so anything that comes
         * between them silently stops the reservation and the record's last
         * control ends up underneath the bar. (UIX-04's `.dh-writing-record`
         * wrapper did exactly that until the bar moved inside it —
         * `record-anatomy.spec.ts` caught it.) The bar is `position: fixed` and
         * the wrapper establishes no containing block, so nesting changes
         * nothing about where it is painted.
         */}
        {active === "meeting" ? (
          <MeetingCaptureBar
            readOnly={readOnly}
            onAddItem={(kind, body) => post({ intent: "add_item", kind, body })}
            onAppendNote={appendNote}
          />
        ) : null}
      </div>

      {lifecycle.dialogs}
    </>
  );
}

function formatMeetingDuration(
  startsAt: string,
  endsAt: string | null,
): string {
  if (!endsAt) return "Not set";
  const minutes = Math.max(
    0,
    Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * EDIT-02 — the SCHEDULING slice, and only that.
 *
 * `title` used to live here too, which meant pressing "Save details" resubmitted
 * whatever title the form had captured when it mounted — silently reverting a
 * rename made anywhere else since. It is now edited on the heading and is not
 * part of this patch at all.
 */
type MeetingDetailsValues = {
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly timezone: string;
  readonly location: string;
  readonly mode: string;
  readonly meetingUrl: string;
};

const MEETING_DETAILS_LABELS: Record<string, string> = {
  startsAtLocal: "Start date and time",
  endsAtLocal: "End time",
  timezone: "Timezone",
  location: "Location",
  mode: "Mode",
  meetingUrl: "Meeting link",
};

function MeetingDetailsEditor({
  meeting,
  onSave,
}: {
  readonly meeting: Route.ComponentProps["loaderData"]["meeting"];
  readonly onSave: (data: Record<string, string>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<MeetingDetailsValues>({
    initialValues: {
      startsAtLocal:
        utcToOwnerLocal(new Date(meeting.startsAt), meeting.timezone) ?? "",
      endsAtLocal: meeting.endsAt
        ? (utcToOwnerLocal(new Date(meeting.endsAt), meeting.timezone) ?? "")
        : "",
      timezone: meeting.timezone,
      location: meeting.location ?? "",
      mode: meeting.mode ?? "",
      meetingUrl: meeting.meetingUrl ?? "",
    },
    fields: {
      startsAtLocal: {
        validate: required("Enter the start date and time."),
      },
      timezone: { validate: required("Choose a timezone.") },
    },
    fieldOrder: [
      "startsAtLocal",
      "endsAtLocal",
      "timezone",
      "location",
      "mode",
      "meetingUrl",
    ],
    onSubmit: async (values): Promise<SubmitOutcome<MeetingDetailsValues>> => {
      const ok = await onSave({
        intent: "update_details",
        startsAtLocal: values.startsAtLocal,
        endsAtLocal: values.endsAtLocal,
        timezone: values.timezone,
        location: values.location,
        mode: values.mode,
        meetingUrl: values.meetingUrl,
      });
      if (ok) {
        setOpen(false);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: "Those meeting details couldn’t be saved.",
      };
    },
  });
  const timezoneOptions = [meeting.timezone, "Australia/Sydney", "UTC"].filter(
    (value, index, values) => values.indexOf(value) === index,
  );

  return (
    <details
      className="dh-progressive-section"
      open={open}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary>Edit details</summary>
      <Form
        aria-label="Edit meeting details"
        busy={form.isSubmitting}
        onSubmit={form.handleSubmit}
      >
        <FormErrorSummary
          formError={form.formError}
          fieldErrors={form.fieldErrors}
          order={form.fieldOrder as string[]}
          labels={MEETING_DETAILS_LABELS}
          onFocusField={form.focusField}
        />
        <LocalDateTimeField
          label="Start date and time"
          required
          {...form.field("startsAtLocal")}
        />
        <LocalDateTimeField label="End time" {...form.field("endsAtLocal")} />
        <SelectField
          label="Timezone"
          required
          options={timezoneOptions.map((value) => ({ value, label: value }))}
          {...form.field("timezone")}
        />
        <TextField label="Location" {...form.field("location")} />
        <SelectField
          label="Mode"
          options={[
            { value: "", label: "Not set" },
            { value: "in_person", label: "In person" },
            { value: "phone", label: "Phone" },
            { value: "online", label: "Online" },
          ]}
          {...form.field("mode")}
        />
        <TextField
          label="Meeting link"
          type="url"
          {...form.field("meetingUrl")}
        />
        <FormActions>
          <FormButton
            type="button"
            variant="secondary"
            disabled={form.isSubmitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </FormButton>
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
          >
            Save details
          </FormButton>
        </FormActions>
      </Form>
    </details>
  );
}

function MeetingAttendees({
  meetingId,
  attendees,
  readOnly,
  onPost,
}: {
  readonly meetingId: string;
  readonly attendees: readonly {
    readonly id: string;
    readonly title: string;
    readonly linkId: string;
  }[];
  readonly readOnly: boolean;
  readonly onPost: (data: Record<string, string>) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const attendeeSearch = useAttendeeSearch({
    meetingId,
    excludeIds: attendees.map((attendee) => attendee.id),
  });
  const options = attendeeSearch.optionsWithSelected(selected);

  return (
    <section className="dh-record-section">
      <h3>Attendees</h3>
      {attendees.length ? (
        <ul className="dh-meeting-attendees">
          {attendees.map((attendee) => (
            <li key={attendee.id} className="dh-meeting-attendee">
              <EntityLink
                type="person"
                id={attendee.id}
                title={attendee.title}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost"
                  aria-label={`Remove attendee ${attendee.title}`}
                  onClick={() =>
                    void onPost({
                      intent: "remove_attendee",
                      linkId: attendee.linkId,
                    })
                  }
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dh-follow-up-empty">No attendees yet.</p>
      )}
      {!readOnly ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              for (const personId of selected) {
                await onPost({ intent: "add_attendee", personId });
              }
              setSelected([]);
            })();
          }}
        >
          <SelectField
            label="Add attendees"
            multiple
            placeholder="Search People"
            options={options}
            onSearch={attendeeSearch.search}
            loading={attendeeSearch.loading}
            emptyMessage="No matching People"
            value={selected}
            onChange={(ids) => {
              setSelected(ids);
              attendeeSearch.rememberSelected(ids);
            }}
          />
          <button
            type="submit"
            className="dh-btn dh-btn--secondary"
            disabled={selected.length === 0}
          >
            Add selected
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404)
    return (
      <EmptyState
        icon={<EntityIcon type="meeting" />}
        title="We couldn’t find that meeting"
        description="It may have been deleted or belongs to another workspace."
      />
    );
  throw error;
}
