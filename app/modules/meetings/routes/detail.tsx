import { env } from "cloudflare:workers";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isRouteErrorResponse,
  Link,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { readAiAvailability } from "~/platform/ai";
import { loadRecordAttachments } from "~/platform/attachments";
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
import { EntityIcon } from "~/shared/entity";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import { useFeedback } from "~/shared/feedback";
import { CheckIcon } from "~/shared/icons";
import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
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
import { attachmentsTab } from "~/shared/attachments";
import { PersonAvatar } from "~/shared/person-identity";
import { RecordLayout } from "~/shared/record-layout";
import {
  TASK_DRAWER_TITLE,
  TaskRecordDrawer,
} from "~/shared/task-record/TaskRecordDrawer";
import { serializeTaskView } from "~/shared/task-record/task-view";
import { utcToOwnerLocal } from "~/shared/datetime";
import { MeetingCaptureBar } from "../MeetingCaptureBar";
import { attendeeCountLabel, MeetingContextRow } from "../MeetingContextRow";
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
import { Button } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";

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
    /*
     * V2.11 FILE-01 — the agenda PDF, the document, the photo of the whiteboard.
     *
     * They are EVIDENCE, and they are deliberately not folded into the Notebook:
     * the two Markdown bodies are what the owner wrote, and a file is a separate
     * artefact that happens to be about the same meeting. Nothing here parses a
     * file into the notes, and nothing ever will in V2.
     */
    attachments: await loadRecordAttachments(scope, meeting.id),
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
const tabs = [
  "meeting",
  "follow-up",
  "details",
  "ai",
  "evidence",
  "activity",
  "settings",
];
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
  const { meeting: m, followUps, aiAvailability, attachments } = loaderData,
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
                    <NotebookSection title="Agenda">
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
                    </NotebookSection>

                    <NotebookSection title="Notes">
                      <MeetingMarkdown
                        meetingId={m.id}
                        field="notesMarkdown"
                        label="Notes"
                        initial={m.notesMarkdown}
                        version={m.detailsUpdatedAt}
                        onSaved={() => r.revalidate()}
                        readOnly={readOnly}
                      />
                    </NotebookSection>

                    {/*
                      §15 — a DECISION is an outcome, not another paragraph, so
                      the band says what it is for. The restraint the brief asks
                      for is in what is NOT here: no callout, no coloured slab,
                      no card per decision. A decision is a line in a list you
                      can find later, and the heading is what makes it findable.
                    */}
                    <NotebookSection
                      title="Decisions"
                      description="What was settled, so it can be found later."
                    >
                      {itemSection("decision", "Decisions")}
                    </NotebookSection>

                    <NotebookSection title="Outcomes">
                      {itemSection("outcome", "Outcomes")}
                    </NotebookSection>

                    <NotebookSection
                      title="Actions"
                      description="Each becomes a DalyHub Task."
                    >
                      {itemSection("action", "Actions")}
                    </NotebookSection>
                  </div>
                ),
            },
            {
              id: "details",
              label: "Details",
              content: (
                <section className="dh-record-section flex min-w-0 flex-col gap-8">
                  <h2 className="dh-visually-hidden">Meeting details</h2>

                  {/*
                    UNTITLED-13 — the quiet labelled fact strip, not a browser
                    `<dl>` in a two-column table.

                    `record-summary__meta` drew a grid whose phone arrangement
                    `meetings.css` then had to unset with `display: block` and a
                    margin reset on every `dd`. This is the same strip the Person
                    workspace uses and the same one Untitled's own profile pages
                    put reference facts in, so it needs no per-module phone rule:
                    it is one column below `sm` and wraps upward from there.

                    RECORD-01 — Status is NOT repeated here: the record header's
                    status pill, a few pixels above, already states it.
                  */}
                  <MeetingFactStrip meeting={m} />

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
            attachmentsTab({
              ownerEntityId: m.id,
              attachments,
              readOnly,
              description:
                "The agenda, a document that was tabled, a photo of the board.",
              onChanged: () => r.revalidate(),
            }),
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
                        <Button
                          variant="secondary"
                          onClick={() =>
                            void post({
                              intent: m.archivedAt ? "restore" : "archive",
                            })
                          }
                        >
                          {m.archivedAt
                            ? lifecycleActionLabel("restore", "meeting")
                            : lifecycleActionLabel("archive", "meeting")}
                        </Button>
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

/**
 * UNTITLED-13 — a Meeting's reference facts, as the product's quiet strip.
 *
 * The Details tab drew `record-summary__meta`: a labelled `<dl>` grid whose
 * phone arrangement `meetings.css` then had to undo with `display: block` and a
 * margin reset on every `dd`, because a fixed two-column table does not fit a
 * 320px screen. The strip below is the same one the Person workspace and
 * `StayInTouchPanel` use — a small quaternary label over a primary value, one
 * column below `sm`, wrapping upward — so the module needs no phone rule of its
 * own and a Meeting's facts and a Person's are the same object.
 *
 * A fact with no value is omitted, not printed as a dash. The exception is
 * "Held", which states BOTH answers in words: MEET-03 needs the held state
 * legible on the record without opening a menu, and "not recorded as held yet"
 * is a real answer rather than an absence.
 */
function MeetingFactStrip({
  meeting,
}: {
  readonly meeting: Route.ComponentProps["loaderData"]["meeting"];
}) {
  const facts: { id: string; label: string; value: ReactNode }[] = [];

  const duration = formatMeetingDuration(meeting.startsAt, meeting.endsAt);
  if (duration !== "Not set") {
    facts.push({ id: "duration", label: "Duration", value: duration });
  }
  facts.push({ id: "timezone", label: "Timezone", value: meeting.timezone });
  facts.push({
    id: "held",
    label: "Held",
    value: meeting.heldAt
      ? `Recorded on ${formatMeetingDate(meeting.heldAt, meeting.timezone)}`
      : "Not recorded as held yet",
  });
  if (meeting.meetingUrl) {
    facts.push({
      id: "url",
      label: "Meeting link",
      value: (
        <a
          className="text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
          href={meeting.meetingUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open meeting link
        </a>
      ),
    });
  }

  return (
    <dl className="record-summary__meta m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div
          key={fact.id}
          className="record-summary__meta-item flex min-w-0 flex-col gap-0.5"
        >
          <dt className="text-xs font-medium text-quaternary">{fact.label}</dt>
          <dd className="m-0 text-sm font-medium break-words text-primary">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * UNTITLED-13 — one band of the notebook.
 *
 * The heading was `.dh-meeting-notebook__heading` in `meetings.css`: a bespoke
 * uppercase, letter-spaced, quiet rule with its own hairline underneath, on a
 * record whose every other section heading is Untitled's `section-headers`
 * recipe. It reads as a printed notebook's part marker, which was the argument
 * for it — and it was also the only place in the product that spelled a heading
 * that way, so a Meeting's Agenda and a Person's "What you share" were two
 * different kinds of object for no reason a reader could name.
 *
 * `SectionHeading` is that recipe at the heading LEVEL a record demands (an `h2`
 * directly under the record's `h1`, never upstream's hard-coded `h3`, which axe
 * reports as a skipped level). The `description` slot is what the old heading
 * had no room for: a band can now say what it is for in one quiet line, which
 * is where "each becomes a DalyHub Task" belongs.
 */
function NotebookSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="dh-meeting-notebook__section flex min-w-0 flex-col gap-3">
      <SectionHeading level={2} title={title} description={description} />
      {children}
    </section>
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

/**
 * UNTITLED-13 — the attendee list, as People rather than as link-plus-Remove
 * pairs.
 *
 * §17 asks participants to use the shared Person identity system, and §34 makes
 * it a rule: no Meeting-specific representation. This list had none at all — it
 * was a bare `<ul>` of `EntityLink` beside a "Remove" button, with the whole
 * arrangement drawn by `.dh-meeting-attendees` and `.dh-meeting-attendee` in
 * `meetings.css`. A person with a photograph on `/people` was a line of blue
 * text here.
 *
 * It is Untitled's divided list now, each row carrying the shared Person mark,
 * the person's name as a real link to their record, and Remove in the shared
 * context menu rather than as a permanent destructive button per line (the same
 * §14 rule the agenda rows follow).
 *
 * The marks are generated from the display title and take the NEUTRAL disc,
 * because an EntityLink counterpart carries an id and a title and nothing else —
 * see `MeetingContextRow` for the full reasoning and the named follow-up.
 */
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
    <section className="dh-record-section flex min-w-0 flex-col gap-3">
      <SectionHeading
        level={3}
        title="Attendees"
        description={
          attendees.length === 0
            ? undefined
            : attendeeCountLabel(attendees.length)
        }
      />
      {attendees.length ? (
        <ul className="dh-meeting-attendees m-0 list-none overflow-hidden rounded-xl bg-primary p-0 shadow-xs ring-1 ring-secondary">
          {attendees.map((attendee) => (
            <li
              key={attendee.id}
              className="dh-meeting-attendee flex items-center gap-3 border-b border-secondary px-4 py-2.5 last:border-b-0 hover:bg-secondary"
            >
              {/*
                The mark is decorative — the name beside it is the link and the
                accessible name, so nothing depends on two letters being legible.
              */}
              <span aria-hidden="true" className="shrink-0">
                <PersonAvatar name={attendee.title} size="sm" />
              </span>
              {/*
                The link fills the row's HEIGHT, not just its text box.

                MEASURED: as an inline anchor it came out at 196×20 on a 393px
                phone, inside a row that is over 50px tall — so the words were
                the target and the space around them was not. `self-stretch
                flex items-center` makes the anchor the row, which is the same
                thing `.dh-prow__open`'s stretched `::after` does for a Person
                row and what the product means by a row being clickable.
              */}
              <Link
                to={`/person/${encodeURIComponent(attendee.id)}`}
                className="flex min-w-0 flex-1 items-center self-stretch truncate text-sm font-medium text-primary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                {attendee.title}
              </Link>
              {!readOnly ? (
                <OverflowMenu
                  label={`Actions for ${attendee.title}`}
                  items={[
                    {
                      id: "remove",
                      label: "Remove from meeting",
                      tone: "danger",
                      onSelect: () =>
                        void onPost({
                          intent: "remove_attendee",
                          linkId: attendee.linkId,
                        }),
                    },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
          No attendees yet.
        </p>
      )}
      {!readOnly ? (
        <form
          className="flex flex-wrap items-end gap-2"
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
            className="min-w-0 flex-1 basis-64"
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
          <Button
            type="submit"
            variant="secondary"
            disabled={selected.length === 0}
          >
            Add selected
          </Button>
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
