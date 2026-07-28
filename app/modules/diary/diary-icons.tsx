/**
 * DIARY-01B / PX-05 — Diary entry-type glyphs, registered with the SHARED
 * subtype-icon registry.
 *
 * A timeline node is ICON-based, not colour-based: the icon plus the entry's type
 * badge and time carry the meaning, so type, selection and state are never signalled
 * by colour alone (WCAG 2.2, DalyHub non-colour-status rule).
 *
 * PX-05 changed two things about this map:
 *
 *   1. It is **registered**, not private. `registerSubtypeIcons` puts it in the one
 *      shared registry alongside `ENTITY_IDENTITY`, so Diary is a *consumer* of a
 *      shared pattern rather than a fork every future module would copy.
 *   2. Subtypes no longer wear ENTITY glyphs. The old map repurposed
 *      `PersonIcon`/`GoalIcon`/`AreaIcon`/`MeetingIcon` for conversation/idea/
 *      travel/meeting — and that last one collided head-on with the Meeting entity
 *      glyph, so a Diary "meeting" entry and a Meeting record were indistinguishable.
 *      Each subtype now has its own glyph from the shared set (PX-05 added them),
 *      keeping the two identity layers strictly separate.
 *
 * An unregistered custom type falls back to the Diary identity glyph, mirroring the
 * safe label fallback.
 */

import {
  CalendarIcon,
  ChatIcon,
  DecisionIcon,
  DiaryIcon,
  type IconProps,
  IdeaIcon,
  ListIcon,
  NoteIcon,
  ObservationIcon,
  ReflectionIcon,
  TravelIcon,
} from "~/shared/icons";
import { getSubtypeIcon, registerSubtypeIcons } from "~/shared/entity";
import type { ComponentType } from "react";

const ENTRY_TYPE_ICONS: Readonly<Record<string, ComponentType<IconProps>>> = {
  note: NoteIcon,
  conversation: ChatIcon,
  meeting: CalendarIcon,
  decision: DecisionIcon,
  idea: IdeaIcon,
  reflection: ReflectionIcon,
  event: ListIcon,
  travel: TravelIcon,
  observation: ObservationIcon,
};

registerSubtypeIcons("diary", ENTRY_TYPE_ICONS);

/** The glyph for an entry type — a registered subtype icon, or the Diary glyph. */
export function entryTypeIcon(entryType: string): ComponentType<IconProps> {
  return getSubtypeIcon("diary", entryType) ?? DiaryIcon;
}
