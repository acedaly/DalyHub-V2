/**
 * DIARY-01B — entry-type glyphs for the timeline nodes.
 *
 * A timeline node is ICON-based, not colour-based: the icon plus the entry's type
 * badge and time carry the meaning, so type, selection and state are never signalled
 * by colour alone (WCAG 2.2, DalyHub non-colour-status rule). The map reuses the
 * shared icon set — no bespoke glyphs — and falls back to the Diary identity glyph
 * for a valid-but-unregistered custom type, mirroring the safe label fallback.
 */

import {
  AreaIcon,
  DiaryIcon,
  GoalIcon,
  type IconProps,
  ListIcon,
  MeetingIcon,
  NoteIcon,
  PersonIcon,
  ReviewIcon,
  SearchIcon,
} from "~/shared/icons";
import type { ComponentType } from "react";

const ENTRY_TYPE_ICONS: Readonly<Record<string, ComponentType<IconProps>>> = {
  note: NoteIcon,
  conversation: PersonIcon,
  meeting: MeetingIcon,
  decision: ReviewIcon,
  idea: GoalIcon,
  reflection: DiaryIcon,
  event: ListIcon,
  travel: AreaIcon,
  observation: SearchIcon,
};

/** The glyph for an entry type — a built-in icon, or the Diary glyph as fallback. */
export function entryTypeIcon(entryType: string): ComponentType<IconProps> {
  return ENTRY_TYPE_ICONS[entryType] ?? DiaryIcon;
}
