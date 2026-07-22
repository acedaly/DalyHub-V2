/**
 * PROJ-01 — the project's non-structural relationship constants.
 *
 * A project's IMPORTANT relationships are its structural Area/Goal (derived from the
 * spine hierarchy — never copied) plus any explicit generic EntityLinks. This module
 * names the non-reserved `project.relates_to` link type the Key links picker uses.
 * It is a NON-reserved kernel link type (the 5 structural spine link types stay the
 * SpineRepository's), so the generic FND-04 EntityLink repository accepts it — no new
 * relationship table, no copied link records (PROJ-01 §3, "Do not copy link records
 * into a project-specific table").
 */

/** The non-structural association the project Key links picker creates. */
export const PROJECT_RELATES_TO = "project.relates_to";

/** The entity types a project may be related to via `project.relates_to` (curated). */
export const PROJECT_RELATE_TARGET_TYPES = [
  "project",
  "goal",
  "area",
  "task",
  "note",
  "meeting",
  "person",
] as const;
