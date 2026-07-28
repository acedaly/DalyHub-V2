/**
 * PX-03 / DIARY-01A — the Diary product module manifest (navigation shell +
 * persistence-owned Activity metadata).
 *
 * Pre-registers the `diary` entity type identifier so the sidebar renders Diary
 * with its real entity-identity glyph rather than the generic fallback (see the
 * Notes manifest for the full rationale — this follows the same FND-09 precedent).
 *
 * DIARY-01A additionally registers the two Activity event types the
 * `DiaryRepository` (`app/kernel/diary`) emits — `diary_entry.created` and
 * `diary_entry.updated` — mirroring the Notes module's `note.content_updated`
 * registration exactly. Labels live here in the registry, never in the
 * `activities` table (ADR-013 §11). Registering types is metadata-only: it adds
 * no route, no table and no migration. The real capture/Timeline UI is later
 * roadmap work (DIARY-01+); this manifest only exposes the typed seams.
 */

import { DIARY_ENTRY_CREATED, DIARY_ENTRY_UPDATED } from "~/kernel/diary";
import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";

export default defineModule({
  id: "diary",
  name: "Diary",
  description: "The chronological history of your life inside DalyHub.",
  order: 110,
  routes,
  entityTypes: [{ type: "diary", singular: "Diary", plural: "Diary" }],
  activityTypes: [
    {
      type: DIARY_ENTRY_CREATED,
      label: "Diary entry captured",
      description: "A diary entry was captured.",
    },
    {
      type: DIARY_ENTRY_UPDATED,
      label: "Diary entry updated",
      description: "A diary entry’s details changed.",
    },
  ],
});
