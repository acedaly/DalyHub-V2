import { env } from "cloudflare:workers";
import { useCallback, useMemo, useState } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";
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
import { EntityIcon, EntityLink } from "~/shared/entity";
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
import { RecordLayout } from "~/shared/record-layout";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import { serializeTaskView } from "~/shared/task-record/task-view";
import { MeetingMarkdown } from "../MeetingMarkdown";
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
import { serializeMeeting } from "../meeting-view";
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
  readonly error?: string;
}

/** Render an instant in the meeting's own display timezone (MEET-01 semantics). */
function formatInMeetingZone(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(instant));
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
  const people = await scope.people.list({ status: "active", limit: 50 });

  // Follow-up Tasks: resolve each mapped Task through the CANONICAL Task model, so
  // grouping/state derive from the Task, never a cached Meeting field. A deleted
  // Task simply drops out (safe degradation — no broken links or leaked ids). The
  // mapping read is bounded and NEWEST-first, so the most recent follow-ups are the
  // ones shown; a single meeting exceeding the bound is not a realistic case (deeper
  // load-more paging is a documented follow-up).
  const followUpLinks = await scope.meetings.listFollowUps(meeting.id, {
    limit: FOLLOW_UP_CAP,
  });
  const followUps: FollowUpTaskEntry[] = [];
  for (const link of followUpLinks) {
    const task = await scope.tasks.getTask(link.taskId);
    if (task) {
      followUps.push({ task: serializeTaskView(task), itemId: link.itemId });
    }
  }

  return {
    meeting: serializeMeeting(meeting),
    attendees: links.items
      .filter((x) => x.link.type === "meeting.attendee")
      .map((x) => ({
        linkId: x.link.id,
        id: x.counterpart.id,
        title: x.counterpart.title,
      })),
    people: people.items.map((p) => ({ id: p.id, title: p.title })),
    followUps,
  };
}

const tabs = [
  "summary",
  "follow-up",
  "agenda",
  "notes",
  "decisions",
  "outcomes",
  "linked",
  "activity",
  "settings",
];

export default function Detail({ loaderData }: Route.ComponentProps) {
  const { meeting } = loaderData;
  const renderDrawer = useCallback(
    (entry: DrawerEntry): DrawerRenderResult | null => {
      const sep = entry.key.indexOf(":");
      const kind = sep === -1 ? entry.key : entry.key.slice(0, sep);
      const id = sep === -1 ? "" : entry.key.slice(sep + 1);
      if (kind === "task" && id) {
        return {
          title: "Task",
          description: "Task record",
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
  const { meeting: m, followUps } = loaderData,
    r = useRevalidator(),
    { openDrawer } = useDrawer(),
    feedback = useFeedback(),
    [sp, setSp] = useSearchParams(),
    active = tabs.includes(sp.get("tab") ?? "") ? sp.get("tab")! : "summary";
  const readOnly = Boolean(m.archivedAt);
  const [markingHeld, setMarkingHeld] = useState(false);

  const change = useCallback(
    (id: string) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === "summary") next.delete("tab");
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
      (instant) => formatInMeetingZone(instant, m.timezone),
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

  const itemSection = (
    kind: "agenda" | "decision" | "outcome",
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
    // above the lifecycle group and separated from it by the shared hairline.
    leadingItems: heldMenuItems,
    onArchive: async () => {
      const ok = await post({ intent: "archive" });
      if (!ok) throw new Error("Couldn’t archive this meeting.");
    },
    onRestore: async () => {
      const ok = await post({ intent: "restore" });
      if (!ok) throw new Error("Couldn’t restore this meeting.");
    },
  });

  const attendeeIds = new Set(loaderData.attendees.map((a) => a.id));
  const addablePeople = loaderData.people.filter((p) => !attendeeIds.has(p.id));

  return (
    <>
      <RecordLayout
        title={m.title}
        typeLabel="Meeting"
        icon={<EntityIcon type="meeting" />}
        breadcrumb={[{ id: "meetings", label: "Meetings", href: "/meetings" }]}
        status={{
          label: m.archivedAt ? "Archived" : m.status,
          tone: m.archivedAt ? "warning" : "neutral",
        }}
        metadata={[
          {
            id: "when",
            label: "When",
            value: new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: m.timezone,
            }).format(new Date(m.startsAt)),
          },
          {
            id: "where",
            label: "Where",
            value: m.location ?? m.mode ?? "Not set",
          },
        ]}
        overflowActions={lifecycle.overflowActions}
        activeTabId={active}
        onTabChange={change}
        tabs={[
          {
            id: "summary",
            label: "Summary",
            content: (
              <section className="dh-record-section">
                <h2>Meeting details</h2>
                <dl>
                  <dt>Status</dt>
                  <dd>{m.status}</dd>
                  {/*
                    MEET-03 — the held state, stated in words on the record itself
                    so it is legible without opening a menu, and so the outcome of
                    "Mark as held" is visible rather than implied.
                  */}
                  <dt>Held</dt>
                  <dd>
                    {m.heldAt
                      ? `Recorded as held on ${formatInMeetingZone(m.heldAt, m.timezone)}`
                      : "Not recorded as held yet"}
                  </dd>
                  {m.meetingUrl && (
                    <>
                      <dt>Meeting link</dt>
                      <dd>
                        <a href={m.meetingUrl} target="_blank" rel="noreferrer">
                          Open meeting link
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                <h3>Attendees</h3>
                {loaderData.attendees.length ? (
                  <ul className="dh-meeting-attendees">
                    {loaderData.attendees.map((a) => (
                      <li key={a.id} className="dh-meeting-attendee">
                        <EntityLink type="person" id={a.id} title={a.title} />
                        {!readOnly && (
                          <button
                            type="button"
                            className="dh-btn dh-btn--ghost"
                            aria-label={`Remove attendee ${a.title}`}
                            onClick={() =>
                              void post({
                                intent: "remove_attendee",
                                linkId: a.linkId,
                              })
                            }
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dh-follow-up-empty">No attendees yet.</p>
                )}
                {!readOnly && addablePeople.length > 0 && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const personId = String(
                        new FormData(event.currentTarget).get("personId") ?? "",
                      );
                      if (personId)
                        void post({ intent: "add_attendee", personId });
                    }}
                  >
                    <label className="dh-field">
                      <span className="dh-field__label">Add attendee</span>
                      <select
                        name="personId"
                        className="dh-input"
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Choose a person…
                        </option>
                        {addablePeople.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="dh-btn dh-btn--secondary">
                      Add attendee
                    </button>
                  </form>
                )}
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
            id: "agenda",
            label: "Agenda",
            content: (
              <div className="dh-record-section">
                <MeetingMarkdown
                  meetingId={m.id}
                  field="agendaMarkdown"
                  label="Agenda"
                  initial={m.agendaMarkdown}
                  onSaved={() => r.revalidate()}
                />
                {itemSection("agenda", "Agenda items")}
              </div>
            ),
          },
          {
            id: "notes",
            label: "Notes",
            content: (
              <MeetingMarkdown
                meetingId={m.id}
                field="notesMarkdown"
                label="Notes"
                initial={m.notesMarkdown}
                onSaved={() => r.revalidate()}
              />
            ),
          },
          {
            id: "decisions",
            label: "Decisions",
            content: itemSection("decision", "Decisions"),
          },
          {
            id: "outcomes",
            label: "Outcomes",
            content: itemSection("outcome", "Outcomes"),
          },
          {
            id: "linked",
            label: "Linked",
            content: (
              <LinkedItemsTab
                anchorId={m.id}
                anchorType="meeting"
                readOnly={readOnly}
                linkCommandTarget={{
                  kind: "route",
                  to: `/meeting/${m.id}?tab=linked`,
                }}
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
      {lifecycle.dialogs}
    </>
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
