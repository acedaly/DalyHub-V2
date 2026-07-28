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
import { RecordLayout } from "~/shared/record-layout";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";
import { serializeTaskView } from "~/shared/task-record/task-view";
import { utcToOwnerLocal } from "~/shared/datetime";
import { MeetingMarkdown } from "../MeetingMarkdown";
import {
  DIRECT_FOLLOW_UP_DRAWER_KEY,
  MeetingFollowUpFormHost,
  MeetingFollowUpTab,
  MeetingItemsSection,
} from "../MeetingFollowUp";
import { MeetingTimelineTab } from "../MeetingTimelineTab";
import { serializeMeeting } from "../meeting-view";
import { useAttendeeSearch } from "../use-attendee-search";
import type { FollowUpTaskEntry } from "../follow-up-view";
import type { Route } from "./+types/detail";

/** A bound on how many follow-up Tasks a single meeting record resolves at once. */
const FOLLOW_UP_CAP = 100;

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
    followUps,
  };
}

const tabs = ["overview", "meeting", "follow-up", "activity", "settings"];
const legacyMeetingTabs = new Set(["agenda", "notes", "decisions", "outcomes"]);

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
    [sp, setSp] = useSearchParams(),
    rawTab = sp.get("tab"),
    active = legacyMeetingTabs.has(rawTab ?? "")
      ? "meeting"
      : tabs.includes(rawTab ?? "")
        ? rawTab!
        : "overview";
  const readOnly = Boolean(m.archivedAt);

  const change = useCallback(
    (id: string) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === "overview") next.delete("tab");
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
    leadingItems: readOnly
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
            id: "overview",
            label: "Overview",
            content: (
              <section className="dh-record-section">
                <h2>Meeting details</h2>
                <dl>
                  <dt>Status</dt>
                  <dd>{m.status}</dd>
                  <dt>Duration</dt>
                  <dd>{formatMeetingDuration(m.startsAt, m.endsAt)}</dd>
                  <dt>Timezone</dt>
                  <dd>{m.timezone}</dd>
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
            id: "meeting",
            label: "Meeting",
            content: (
              <section className="dh-record-section">
                <div className="dh-meeting-workspace">
                  <MeetingMarkdown
                    meetingId={m.id}
                    field="agendaMarkdown"
                    label="Agenda"
                    initial={m.agendaMarkdown}
                    onSaved={() => r.revalidate()}
                  />
                  <MeetingMarkdown
                    meetingId={m.id}
                    field="notesMarkdown"
                    label="Notes"
                    initial={m.notesMarkdown}
                    onSaved={() => r.revalidate()}
                  />
                </div>
                {itemSection("agenda", "Agenda items")}
                {itemSection("decision", "Decisions")}
                {itemSection("outcome", "Outcomes")}
                {itemSection("action", "Actions")}
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

type MeetingDetailsValues = {
  readonly title: string;
  readonly startsAtLocal: string;
  readonly endsAtLocal: string;
  readonly timezone: string;
  readonly location: string;
  readonly mode: string;
  readonly meetingUrl: string;
};

const MEETING_DETAILS_LABELS: Record<string, string> = {
  title: "Title",
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
      title: meeting.title,
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
      title: { validate: required("Enter a meeting title.") },
      startsAtLocal: {
        validate: required("Enter the start date and time."),
      },
      timezone: { validate: required("Choose a timezone.") },
    },
    fieldOrder: [
      "title",
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
        title: values.title,
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
        <TextField
          label="Title"
          required
          maxLength={240}
          {...form.field("title")}
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
