/**
 * PX-03 — the Meetings product module manifest (navigation shell only).
 *
 * Pre-registers the `meeting` entity type identifier so the sidebar renders
 * Meetings with its real entity-identity glyph rather than the generic fallback
 * (see the Notes manifest for the full rationale). MEET-01 owns the real
 * implementation and simply extends this manifest.
 */

import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";
import { meetingCommands } from "./commands";
import { meetingSearchProvider } from "./search";
import {
  MEETING_ARCHIVED,
  MEETING_ATTENDEE_LINK,
  MEETING_CREATED,
  MEETING_RESTORED,
  MEETING_UPDATED,
} from "~/kernel/meetings";

export default defineModule({
  id: "meetings",
  name: "Meetings",
  description: "Attendees, agenda, notes and outcomes for a meeting.",
  order: 120,
  routes,
  entityTypes: [{ type: "meeting", singular: "Meeting", plural: "Meetings" }],
  activityTypes: [
    {
      type: MEETING_CREATED,
      label: "Meeting created",
      description: "The meeting was created.",
    },
    {
      type: MEETING_UPDATED,
      label: "Meeting updated",
      description: "Meeting details changed.",
    },
    {
      type: MEETING_ARCHIVED,
      label: "Meeting archived",
      description: "The meeting was archived.",
    },
    {
      type: MEETING_RESTORED,
      label: "Meeting restored",
      description: "The meeting was restored.",
    },
  ],
  entityLinkTypes: [
    {
      type: MEETING_ATTENDEE_LINK,
      sourceLabel: "Attendee",
      sourceEntityType: "meeting",
      targetEntityType: "person",
    },
  ],
  commands: meetingCommands,
  searchProviders: [meetingSearchProvider],
});
