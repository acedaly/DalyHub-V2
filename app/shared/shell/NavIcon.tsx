/**
 * THEME-01 — the navigation glyph resolver.
 *
 * Primary navigation is registry-driven, and so is its iconography. A module gets
 * its navigation glyph from ONE of two declarations it already makes:
 *
 *   1. its ENTITY TYPE (PX-02) — Areas, Goals, Projects, Tasks, Notes, Meetings,
 *      People, Assets, Diary, Reviews. The nav row shows the same glyph the entity
 *      shows on a Card, so a module is recognisable at a glance;
 *   2. its `meta.navIcon` — for the cross-cutting modules (Today, Help, About,
 *      Settings, AI) that own no entity type. Before this milestone those rendered
 *      a generic placeholder dot, which read as a missing glyph.
 *
 * The shell holds no module list: this maps a NAME the module declared to a glyph
 * from the one in-house outline set. A module that declares neither still gets a
 * real, intentional glyph rather than a dot — an unlabelled placeholder in
 * permanent chrome is exactly the unfinished presentation this milestone removes.
 */

import type { ComponentType } from "react";

import { NAV_ICON_NAMES, type NavIconName } from "~/kernel/modules";
import { EntityIcon, isEntityType } from "~/shared/entity";
import type { IconProps } from "~/shared/icons";
import {
  AnalyticsIcon,
  HelpIcon,
  IdeaIcon,
  InboxIcon,
  InfoIcon,
  ScheduleIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
  TodayIcon,
  UpcomingIcon,
  ViewsIcon,
} from "~/shared/icons";

/** Every declarable glyph name, mapped to its component. */
const NAV_ICONS: Record<NavIconName, ComponentType<IconProps>> = {
  today: TodayIcon,
  help: HelpIcon,
  about: InfoIcon,
  settings: SettingsIcon,
  insight: IdeaIcon,
  search: SearchIcon,
  inbox: InboxIcon,
  upcoming: UpcomingIcon,
  plan: ScheduleIcon,
  ai: SparkleIcon,
  analytics: AnalyticsIcon,
  views: ViewsIcon,
};

/**
 * The glyph names this registry can render. Exported so a test can prove the
 * registry covers the kernel's closed set — adding a name to the manifest contract
 * without adding a glyph here must fail, not render nothing.
 */
export const RENDERABLE_NAV_ICON_NAMES = Object.keys(
  NAV_ICONS,
) as NavIconName[];

/** True when every name the kernel allows has a glyph. Used by the tests. */
export function navIconRegistryIsComplete(): boolean {
  return NAV_ICON_NAMES.every((name) => name in NAV_ICONS);
}

export interface NavIconProps {
  /** The module's primary entity-type slug, when it declares one (PX-02). */
  readonly entityType?: string;
  /** The module's declared navigation glyph name, when it declares one. */
  readonly navIcon?: NavIconName;
}

export function NavIcon({ entityType, navIcon }: NavIconProps) {
  /*
   * POLISH-01 — an EXPLICIT glyph outranks the module's entity type.
   *
   * The order used to be the other way round, which meant a module could not
   * distinguish its own destinations: Inbox, Upcoming and Tasks all belong to
   * the Tasks module, so all three drew the Task tick and the daily group
   * rendered the same mark three rows running. Naming a glyph is a decision
   * about THIS destination; inheriting the entity's is the default for a module
   * whose destinations are all about that entity, and a default must not beat a
   * decision.
   */
  if (navIcon !== undefined && navIcon in NAV_ICONS) {
    const Glyph = NAV_ICONS[navIcon];
    return <Glyph />;
  }
  if (isEntityType(entityType)) {
    // `inherit`: a navigation glyph takes the row's colour, so selection
    // reads as one object and the accent stays meaningful where it is spent.
    return <EntityIcon type={entityType} tone="inherit" />;
  }
  // A module that declared neither. Not a dot: a real glyph, so navigation never
  // shows a placeholder. `InfoIcon` is the neutral choice — it says "a place",
  // not "a missing icon".
  return <InfoIcon />;
}
