import { env } from "cloudflare:workers";
import { useCallback } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { EntityIcon, EntityLink } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { LinkedItemsTab } from "~/shared/linked-items";
import { RecordLayout } from "~/shared/record-layout";
import { MeetingMarkdown } from "../MeetingMarkdown";
import { serializeMeeting } from "../meeting-view";
import type { Route } from "./+types/detail";
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
  };
}
const tabs = [
  "summary",
  "agenda",
  "notes",
  "decisions",
  "outcomes",
  "linked",
  "activity",
  "settings",
];
export default function Detail({ loaderData }: Route.ComponentProps) {
  const { meeting: m } = loaderData,
    r = useRevalidator(),
    [sp, setSp] = useSearchParams(),
    active = tabs.includes(sp.get("tab") ?? "") ? sp.get("tab")! : "summary";
  const change = useCallback(
    (id: string) =>
      setSp(id === "summary" ? {} : { tab: id }, { replace: true }),
    [setSp],
  );
  async function post(data: Record<string, string>) {
    const f = new FormData();
    Object.entries(data).forEach(([k, v]) => f.set(k, v));
    await fetch(`/meeting/${m.id}/mutate`, { method: "POST", body: f });
    r.revalidate();
  }
  const itemTab = (kind: "decision" | "outcome") => (
    <section>
      <h2>{kind === "decision" ? "Decisions" : "Outcomes"}</h2>
      <ul>
        {m.items
          .filter((i) => i.kind === kind)
          .map((i) => (
            <li key={i.id}>
              <span>{i.bodyMarkdown}</span>{" "}
              {!m.archivedAt && (
                <button
                  aria-label={`Remove ${kind}`}
                  onClick={() => post({ intent: "remove_item", itemId: i.id })}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
      </ul>
      {!m.archivedAt && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            void post({
              intent: "add_item",
              kind,
              body: String(new FormData(f).get("body")),
            }).then(() => f.reset());
          }}
        >
          <label>
            Add {kind}
            <input name="body" required />
          </label>
          <button>Add</button>
        </form>
      )}
    </section>
  );
  return (
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
      activeTabId={active}
      onTabChange={change}
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <div>
              <h2>Meeting details</h2>
              <dl>
                <dt>Attendees</dt>
                <dd>
                  {loaderData.attendees.length
                    ? loaderData.attendees.map((a) => (
                        <EntityLink
                          key={a.id}
                          type="person"
                          id={a.id}
                          title={a.title}
                        />
                      ))
                    : "No attendees yet"}
                </dd>
                <dt>Status</dt>
                <dd>{m.status}</dd>
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
            </div>
          ),
        },
        {
          id: "agenda",
          label: "Agenda",
          content: (
            <MeetingMarkdown
              meetingId={m.id}
              field="agendaMarkdown"
              label="Agenda"
              initial={m.agendaMarkdown}
              onSaved={() => r.revalidate()}
            />
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
        { id: "decisions", label: "Decisions", content: itemTab("decision") },
        { id: "outcomes", label: "Outcomes", content: itemTab("outcome") },
        {
          id: "linked",
          label: "Linked",
          content: (
            <LinkedItemsTab
              anchorId={m.id}
              anchorType="meeting"
              readOnly={Boolean(m.archivedAt)}
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
            <p>Meeting changes are recorded in the shared Activity stream.</p>
          ),
        },
        {
          id: "settings",
          label: "Settings",
          content: (
            <section>
              <h2>Meeting settings</h2>
              <p>
                Archiving removes this record from active meeting views without
                deleting its history.
              </p>
              <button
                className="dh-btn"
                onClick={() =>
                  post({ intent: m.archivedAt ? "restore" : "archive" })
                }
              >
                {m.archivedAt ? "Restore meeting" : "Archive meeting"}
              </button>
            </section>
          ),
        },
      ]}
    />
  );
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404)
    return (
      <EmptyState
        icon={<EntityIcon type="meeting" />}
        title="We couldn't find that meeting"
        description="It may have been deleted or belongs to another workspace."
      />
    );
  throw error;
}
