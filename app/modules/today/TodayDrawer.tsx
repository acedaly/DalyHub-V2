/**
 * TODAY-01 — the Today drawer content resolver.
 *
 * Maps a DS-03 drawer key (`<kind>:<id>`) to a read-only DS-02 Record Layout for the
 * matching fixture, so a Card on Today opens its record over the pane without losing
 * the user's place — the canonical Card → drawer key → RecordLayout chain
 * (PRODUCT_EXPERIENCE Part IV §3). It is presentation only: no editing, CRUD,
 * persistence or task/note implementation (TODAY-02 owns the editable Task Drawer).
 * An unknown/stale key returns `null`, which the Drawer renders as its graceful
 * not-found panel.
 */

import { EntityIcon } from "~/shared/entity";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";
import { RecordContent, RecordLayout } from "~/shared/record-layout";

import { UPCOMING_KIND } from "./fixtures";
import type { TodayData } from "./fixtures";

function splitKey(key: string): { readonly kind: string; readonly id: string } {
  const separator = key.indexOf(":");
  if (separator === -1) {
    return { kind: key, id: "" };
  }
  return { kind: key.slice(0, separator), id: key.slice(separator + 1) };
}

/** Build the drawer resolver bound to a set of Today records (the fixtures). */
export function createTodayDrawerRenderer(data: TodayData) {
  return function renderTodayDrawer(
    entry: DrawerEntry,
  ): DrawerRenderResult | null {
    const { kind, id } = splitKey(entry.key);

    if (kind === "task") {
      const task = data.focus.find((item) => item.id === id);
      if (!task) return null;
      return {
        title: task.title,
        description: "Task record",
        children: (
          <RecordLayout
            title={task.title}
            headingLevel={3}
            typeLabel="Task"
            icon={<EntityIcon type="task" />}
            summary={{
              description: `A focus task for today, in ${task.context}.`,
              metadata: [
                { id: "context", label: "Context", value: task.context },
              ],
            }}
          >
            <RecordContent>
              <p>
                Full task detail — links, activity and inline editing — arrives
                with the Task Drawer (TODAY-02).
              </p>
            </RecordContent>
          </RecordLayout>
        ),
      };
    }

    if (kind === "upcoming") {
      const item = data.upcoming.find((row) => row.id === id);
      if (!item) return null;
      // Label all three kinds explicitly (a deadline reads "Deadline", not
      // "Reminder") — the same map the card uses, so they never disagree.
      const identity = UPCOMING_KIND[item.kind];
      return {
        title: item.title,
        description: "Upcoming item",
        children: (
          <RecordLayout
            title={item.title}
            headingLevel={3}
            typeLabel={identity.label}
            icon={<EntityIcon type={identity.entity} />}
            summary={{
              metadata: [
                { id: "when", label: "When", value: item.when },
                ...(item.context
                  ? [{ id: "context", label: "Context", value: item.context }]
                  : []),
              ],
            }}
          >
            <RecordContent>
              <p>
                Meetings, reminders and deadlines connect in their own modules.
              </p>
            </RecordContent>
          </RecordLayout>
        ),
      };
    }

    if (kind === "project") {
      const project = data.projects.find((row) => row.id === id);
      if (!project) return null;
      const percent = Math.round(project.progress * 100);
      return {
        title: project.title,
        description: "Project record",
        children: (
          <RecordLayout
            title={project.title}
            headingLevel={3}
            typeLabel="Project"
            icon={<EntityIcon type="project" />}
            summary={{
              description: `A recently active project in ${project.area}.`,
              metadata: [
                { id: "area", label: "Area", value: project.area },
                { id: "status", label: "Status", value: project.status },
                { id: "progress", label: "Progress", value: `${percent}%` },
              ],
            }}
          >
            <RecordContent>
              <p>The full Project overview arrives with PROJ-01.</p>
            </RecordContent>
          </RecordLayout>
        ),
      };
    }

    if (kind === "note") {
      const note = data.notes.find((row) => row.id === id);
      if (!note) return null;
      return {
        title: note.title,
        description: "Note record",
        size: "wide",
        children: (
          <RecordLayout
            title={note.title}
            headingLevel={3}
            typeLabel="Note"
            icon={<EntityIcon type="note" />}
            summary={{ description: note.snippet }}
          >
            <RecordContent>
              <p>{note.snippet}</p>
              <p>Reading and editing notes arrives with NOTES-01.</p>
            </RecordContent>
          </RecordLayout>
        ),
      };
    }

    return null;
  };
}
