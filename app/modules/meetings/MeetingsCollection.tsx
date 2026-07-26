import { Link } from "react-router";
import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import type { SerializedMeeting } from "./meeting-view";
export function MeetingsCollection({
  meetings,
  view,
  failed,
  total,
}: {
  meetings: readonly SerializedMeeting[];
  view: string;
  failed: boolean;
  total: number;
}) {
  return (
    <CollectionLayout
      title="Meetings"
      entityType="meeting"
      subtitle={`${meetings.length} of ${total} loaded`}
      primaryAction={
        <Link className="dh-btn dh-btn--primary" to="/new/meeting">
          New meeting
        </Link>
      }
    >
      <nav className="dh-meetings-views" aria-label="Meeting views">
        <Link to="/meetings/upcoming">Upcoming</Link>
        <Link to="/meetings/recent">Recent</Link>
        <Link to="/meetings/archived">Archived</Link>
      </nav>
      {failed ? (
        <EmptyState
          icon={<EntityIcon type="meeting" />}
          title="Meetings couldn't be loaded"
          description="Try again in a moment."
        />
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="meeting" />}
          title={`No ${view} meetings`}
          description="Create a meeting when there is something worth preparing and remembering."
        />
      ) : (
        <ol className="dh-meeting-list">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link className="dh-meeting-card" to={`/meeting/${m.id}`}>
                <EntityIcon type="meeting" />
                <span>
                  <strong>{m.title}</strong>
                  <small>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: m.timezone,
                    }).format(new Date(m.startsAt))}
                    {m.location ? ` · ${m.location}` : ""} · {m.status}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </CollectionLayout>
  );
}
