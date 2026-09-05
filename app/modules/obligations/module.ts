/**
 * V2.10 LIFE-02 — the Life Admin product module manifest.
 *
 * Registers the `obligation` entity type, the subject link an obligation owns,
 * and the seven obligation-owned Activity events.
 *
 * ── An obligation is not a Task, and this manifest is where that starts ─────
 * There is no Task type here and no Task recurrence contribution. An obligation
 * may POINT at a Task the owner made to carry it, and that pointer is a field on
 * the obligation, not a link type and not ownership: the Task's own repository
 * stays the authority for everything about the Task, and completing the
 * obligation is what records that the work happened (ADR-116 decision 1).
 *
 * ── Why the subject link is declared but never offered ──────────────────────
 * `obligation.subject` is the projection of `obligation_details.subject_entity_id`
 * (ADR-118 decision 1), kept in step with the foreign key inside one
 * transaction. It is declared here so the reverse read has a name and the
 * registry knows the shape, and it is excluded from the generic link picker and
 * from Linked Items, because a second writer for one relationship is exactly how
 * two representations of it come to disagree.
 */

import { defineModule } from "~/kernel/modules";
import {
  OBLIGATION_COMPLETED,
  OBLIGATION_CREATED,
  OBLIGATION_DELETED,
  OBLIGATION_DISMISSED,
  OBLIGATION_ENTITY_TYPE,
  OBLIGATION_LINKED_TASK,
  OBLIGATION_REOPENED,
  OBLIGATION_RESCHEDULED,
  OBLIGATION_SUBJECT_LINK,
  OBLIGATION_TASK_LINKED,
} from "~/kernel/obligations";

import routes from "./routes.manifest";
import { obligationsCommands } from "./commands";
import { obligationsSearchProvider } from "./search";

export default defineModule({
  id: "obligations",
  name: "Life Admin",
  description: "Everything with a date on it that is not a task.",
  order: 145,
  routes,
  entityTypes: [
    {
      type: OBLIGATION_ENTITY_TYPE,
      singular: "Obligation",
      plural: "Obligations",
    },
  ],
  searchProviders: [obligationsSearchProvider],
  commands: obligationsCommands,
  entityLinkTypes: [
    {
      type: OBLIGATION_SUBJECT_LINK,
      sourceLabel: "is about",
      targetLabel: "has obligation",
      sourceEntityType: OBLIGATION_ENTITY_TYPE,
    },
    {
      type: OBLIGATION_LINKED_TASK,
      sourceLabel: "is tracked by task",
      targetLabel: "tracks obligation",
      sourceEntityType: OBLIGATION_ENTITY_TYPE,
      targetEntityType: "task",
    },
  ],
  activityTypes: [
    {
      type: OBLIGATION_CREATED,
      label: "Obligation added",
      description: "A commitment with a date or a meter target was recorded.",
    },
    {
      type: OBLIGATION_RESCHEDULED,
      label: "Obligation changed",
      description:
        "An obligation’s date, rule or details changed. A linked task moves with it.",
    },
    {
      type: OBLIGATION_COMPLETED,
      label: "Obligation completed",
      description:
        "The work was done and recorded. Where it recurs, the next occurrence was created.",
    },
    {
      type: OBLIGATION_DISMISSED,
      label: "Obligation dismissed",
      description: "An obligation was set aside as no longer relevant.",
    },
    {
      type: OBLIGATION_REOPENED,
      label: "Obligation reopened",
      description: "A dismissed or held obligation was made live again.",
    },
    {
      type: OBLIGATION_TASK_LINKED,
      label: "Obligation linked to task",
      description: "A task was created or linked to carry an obligation.",
    },
    {
      type: OBLIGATION_DELETED,
      label: "Obligation deleted",
      description: "An obligation was deleted.",
    },
  ],
});
