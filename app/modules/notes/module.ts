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
import { NOTE_CONTENT_UPDATED } from "~/kernel/notes";

import routes from "./routes.manifest";

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
      description: "A note's Markdown content changed.",
    },
  ],
});
