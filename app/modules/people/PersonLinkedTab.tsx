/**
 * PEOPLE-01 — the Person "Linked records" tab.
 *
 * Shows the records linked to this person, grouped by kind. Links are a kernel
 * primitive (FND-04), so as future modules link meetings, projects, notes, tasks
 * and diary entries to a person, they appear here with no change. Kinds with no
 * links yet render a calm placeholder — never a dead end (AGENTS.md §6).
 */

import { EntityIcon } from "~/shared/entity";
import { entityDestination } from "~/shared/entity/destination";

import type { PersonLinkedRecord } from "./PersonRecord";

const GROUPS: readonly {
  readonly type: string;
  readonly label: string;
  readonly empty: string;
}[] = [
  { type: "project", label: "Projects", empty: "No linked projects yet." },
  { type: "goal", label: "Goals", empty: "No linked goals yet." },
  { type: "area", label: "Areas", empty: "No linked areas yet." },
  { type: "note", label: "Notes", empty: "No linked notes yet." },
  { type: "diary", label: "Diary", empty: "No linked diary entries yet." },
  { type: "meeting", label: "Meetings", empty: "No meetings yet." },
  { type: "task", label: "Tasks", empty: "No linked tasks yet." },
];

interface PersonLinkedTabProps {
  readonly linked: readonly PersonLinkedRecord[];
}

export function PersonLinkedTab({ linked }: PersonLinkedTabProps) {
  const byType = new Map<string, PersonLinkedRecord[]>();
  for (const record of linked) {
    const bucket = byType.get(record.type) ?? [];
    bucket.push(record);
    byType.set(record.type, bucket);
  }

  return (
    <div className="dh-person-linked">
      <h2 className="dh-visually-hidden">Linked records</h2>
      {GROUPS.map((group) => {
        const records = byType.get(group.type) ?? [];
        return (
          <section key={group.type} className="dh-person-linked__group">
            <h3 className="dh-person-linked__heading">
              <span className="dh-person-linked__icon" aria-hidden="true">
                <EntityIcon type={group.type as never} />
              </span>
              {group.label}
              {records.length > 0 ? (
                <span className="dh-person-linked__count">
                  {" "}
                  ({records.length})
                </span>
              ) : null}
            </h3>
            {records.length === 0 ? (
              <p className="dh-person-linked__empty">{group.empty}</p>
            ) : (
              <ul className="dh-person-linked__list">
                {records.map((record) => {
                  const destination = entityDestination(record.type, record.id);
                  return (
                    <li key={record.id} className="dh-person-linked__item">
                      {destination?.kind === "route" ? (
                        <a href={destination.to}>{record.title}</a>
                      ) : (
                        <span>{record.title}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
