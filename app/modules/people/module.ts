/**
 * PEOPLE-01 — the People product module manifest.
 *
 * People are a first-class supporting entity (AGENTS.md §5) — real human
 * relationships, "care, not a CRM". The manifest declares the `person` entity
 * type (so the sidebar renders its identity glyph), the People-owned Activity
 * event types (for the relationship Timeline), the `person.linked_*` EntityLink
 * types (so future Meetings/Projects/Notes links are labelled), the command-palette
 * contributions and the global search provider. Everything is declarative data;
 * discovery wires it in with no central edit.
 */

import {
  PERSON_ARCHIVED,
  PERSON_CREATED,
  PERSON_LINKED_AREA,
  PERSON_LINKED_DIARY,
  PERSON_LINKED_GOAL,
  PERSON_LINKED_MEETING,
  PERSON_LINKED_NOTE,
  PERSON_LINKED_PROJECT,
  PERSON_LINKED_TASK,
  PERSON_RESTORED,
  PERSON_UPDATED,
} from "~/kernel/people";
import { defineModule } from "~/kernel/modules";

import { peopleCommands } from "./commands";
import routes from "./routes.manifest";
import { peopleSearchProvider } from "./search";

export default defineModule({
  id: "people",
  name: "People",
  description: "The people in your life — care, not a CRM.",
  order: 130,
  routes,
  entityTypes: [{ type: "person", singular: "Person", plural: "People" }],
  activityTypes: [
    {
      type: PERSON_CREATED,
      label: "Person added",
      description: "A person was added to People.",
    },
    {
      type: PERSON_UPDATED,
      label: "Person details updated",
      description: "A person's details changed.",
    },
    {
      type: PERSON_ARCHIVED,
      label: "Person archived",
      description: "A person was archived.",
    },
    {
      type: PERSON_RESTORED,
      label: "Person restored",
      description: "An archived person was restored.",
    },
  ],
  entityLinkTypes: [
    {
      type: PERSON_LINKED_NOTE,
      sourceLabel: "Linked note",
      sourceEntityType: "person",
      targetEntityType: "note",
    },
    {
      type: PERSON_LINKED_PROJECT,
      sourceLabel: "Linked project",
      sourceEntityType: "person",
      targetEntityType: "project",
    },
    {
      type: PERSON_LINKED_GOAL,
      sourceLabel: "Linked goal",
      sourceEntityType: "person",
      targetEntityType: "goal",
    },
    {
      type: PERSON_LINKED_AREA,
      sourceLabel: "Linked area",
      sourceEntityType: "person",
      targetEntityType: "area",
    },
    {
      type: PERSON_LINKED_TASK,
      sourceLabel: "Linked task",
      sourceEntityType: "person",
      targetEntityType: "task",
    },
    {
      type: PERSON_LINKED_DIARY,
      sourceLabel: "Linked diary entry",
      sourceEntityType: "person",
      targetEntityType: "diary",
    },
    {
      type: PERSON_LINKED_MEETING,
      sourceLabel: "Linked meeting",
      sourceEntityType: "person",
      targetEntityType: "meeting",
    },
  ],
  commands: peopleCommands,
  searchProviders: [peopleSearchProvider],
});
