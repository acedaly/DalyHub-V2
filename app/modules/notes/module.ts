/**
 * PX-03 / NOTES-01A — the Notes product module manifest (navigation shell +
 * persistence-owned Activity metadata).
 *
 * A real, side-effect-free production manifest that pre-registers the `note`
 * entity type identifier so the sidebar renders Notes with its real entity-identity
 * glyph (`app/shared/entity`) rather than the generic fallback, exactly as FND-09
 * pre-registered Areas/Goals/Projects/Tasks before their product experiences
 * existed. Registering the type here is metadata-only (ADR-013 §4.6) — it adds no
 * table, no migration and no EntityLinks contribution.
 *
 * NOTES-01A additionally registers the `note.content_updated` Activity event
 * emitted by `NoteDetailsRepository` (`app/kernel/notes`) — the Note-owned
 * Markdown-content persistence slice — mirroring the Goals module's
 * `goal.details_updated` registration exactly. NOTES-01B extends this
 * manifest's `routes` (collection, creation, canonical record, mutation,
 * activity) — see `docs/development/NOTES_MODULE.md`. It registers no new
 * entity type or Activity type: `note` and `note.content_updated` were
 * already pre-registered by NOTES-01A.
 */

import { defineModule } from "~/kernel/modules";
import {
  NOTE_ARCHIVED,
  NOTE_CONTENT_UPDATED,
  NOTE_TAGS_UPDATED,
  NOTE_UNARCHIVED,
} from "~/kernel/notes";

import { notesCommands } from "./commands";
import routes from "./routes.manifest";
import { notesSearchProvider } from "./search";

export default defineModule({
  id: "notes",
  name: "Notes",
  description: "Markdown records that document any entity in DalyHub.",
  order: 100,
  routes,
  entityTypes: [{ type: "note", singular: "Note", plural: "Notes" }],
  activityTypes: [
    {
      type: NOTE_CONTENT_UPDATED,
      label: "Note content updated",
      description: "A note’s Markdown content changed.",
    },
    {
      type: NOTE_TAGS_UPDATED,
      label: "Note tags updated",
      description: "A note’s tags changed.",
    },
    {
      type: NOTE_ARCHIVED,
      label: "Note archived",
      description: "A note was put away.",
    },
    {
      type: NOTE_UNARCHIVED,
      label: "Note restored from archive",
      description: "An archived note was brought back.",
    },
  ],
  // NOTES-03 closes the DEBT-36 gap for Notes: a REAL, repository-backed
  // provider over title, full Markdown body, headings and tags.
  searchProviders: [notesSearchProvider],
  commands: notesCommands,
});
