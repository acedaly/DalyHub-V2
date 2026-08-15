/**
 * PX-02/PX-03 shell — registry-driven primary navigation, as icon + label rows.
 *
 * Renders the navigation model the shell loader derived from the registry, one row
 * per module. Each row is `icon + label` — never text-only (DESIGN_SYSTEM.md →
 * Foundations; PRODUCT_EXPERIENCE §cause 3). The icon is the module's ENTITY
 * IDENTITY glyph (derived from the module's own entity-type manifest), so a module
 * is recognisable at a glance in the sidebar exactly as it is on a Card. It imports
 * no module route component — it consumes plain data (label, href, entityType).
 *
 * THEME-01 — the cross-cutting modules (Today, Help, About, Settings, AI) own no
 * entity type and used to render a generic dot here, which read as a missing glyph
 * in permanent chrome. They now declare `meta.navIcon` and the shared `NavIcon`
 * resolver returns a real icon for every row. The resolution rule lives in one
 * place; this component just renders it.
 *
 * The current row carries `aria-current="page"`, so the active state is conveyed
 * SEMANTICALLY (reinforced by weight + a tint, never colour
 * alone — AGENTS.md §15). The row leaves room for a future quiet count and a future
 * collapsed icon-rail without a redesign.
 *
 * UX-01 — which row is current is decided by the ONE shared navigation-active rule
 * (`navigation-active.ts`), not by `NavLink`'s exact-match `end` prop. `end` meant a
 * record route (`/projects/pr-1`, `/notes/n-2`) left the whole rail with NO current
 * row, so the owner lost their "you are here" anchor on the screens they use most —
 * while the phone bottom bar, reading the same registry model, correctly kept the
 * module current. The rail and the bar now answer that question the same way.
 * The rail therefore renders plain `Link`s and applies `aria-current`/the active
 * class from that one rule, rather than from `NavLink`'s own exact-match matching.
 *
 * PX-03 — group dividers. `NavigationItem.group` (already derived from
 * `meta.navGroup`, FND-09) was carried through the model but never rendered. A
 * plain, decorative `<hr>` divider is inserted whenever consecutive items' `group`
 * differs — a single flat list stays a single flat list when no module declares a
 * group (today's behaviour, unchanged), so this is additive, not a redesign. The
 * divider carries no text: the recommended module grouping (Today/Areas/Goals/
 * Projects/Tasks · Notes/Diary/Meetings/People/Assets · Reviews/AI · Settings/Help)
 * is conveyed by rhythm alone, matching the roadmap's sidebar sketch.
 */

import { Fragment } from "react";
import { Link, useLocation } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { Tooltip } from "~/shared/tooltip";

import { NavIcon } from "./NavIcon";
import { useCollapsedRail } from "./collapsed-rail";
import { activeNavigationHref } from "./navigation-active";

type NavigationGroup = {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly NavigationItem[];
};

const PRIMARY_ORDER = ["Today", "Inbox", "Upcoming", "Tasks"] as const;
const ORGANISE_ORDER = [
  "Projects",
  "Goals",
  "Areas",
  "Notes",
  "Diary",
  "Meetings",
  "People",
  "Analytics",
] as const;

const SYSTEM_ORDER = [
  "Views",
  "Assets",
  "Reviews",
  "AI",
  "Settings",
  "Help",
  "About",
] as const;

function syntheticTaskView(
  id: string,
  label: string,
  href: string,
  order: number,
  taskItem: NavigationItem,
): NavigationItem {
  return {
    id,
    moduleId: taskItem.moduleId,
    label,
    href,
    order,
    entityType: "task",
  };
}

function sortByLabelOrder(
  items: readonly NavigationItem[],
  order: readonly string[],
): readonly NavigationItem[] {
  const byLabel = new Map(items.map((item) => [item.label, item]));
  return order
    .map((label) => byLabel.get(label))
    .filter((item): item is NavigationItem => item !== undefined);
}

function buildShellNavigationGroups(
  items: readonly NavigationItem[],
): readonly NavigationGroup[] {
  const taskItem = items.find((item) => item.label === "Tasks");
  const augmented = [
    ...items,
    ...(taskItem
      ? [
          syntheticTaskView(
            "tasks.inbox.nav",
            "Inbox",
            "/tasks?view=list&system=inbox",
            15,
            taskItem,
          ),
          syntheticTaskView(
            "tasks.upcoming.nav",
            "Upcoming",
            "/tasks?view=list&system=upcoming",
            25,
            taskItem,
          ),
        ]
      : []),
  ];

  const primary = sortByLabelOrder(augmented, PRIMARY_ORDER);
  const organise = sortByLabelOrder(augmented, ORGANISE_ORDER);
  const system = sortByLabelOrder(augmented, SYSTEM_ORDER);

  return [
    { id: "primary", items: primary },
    { id: "organise", label: "Organise", items: organise },
    { id: "system", items: system },
  ].filter((group) => group.items.length > 0);
}

function taskSystemViewFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("system");
}

export type PrimaryNavigationProps = {
  /** The id the mobile navigation toggle references via `aria-controls`. */
  readonly id: string;
  /** The derived navigation items, in deterministic order. */
  readonly items: readonly NavigationItem[];
  /** Called when a navigation target is chosen (used to close the mobile sheet). */
  readonly onNavigate?: () => void;
  /**
   * Whether this instance is the RAIL, which collapses to glyphs on a tablet.
   * The mobile sheet never collapses — it is a full-width sheet at every width
   * it exists at — so it opts out and never pays for the media listener.
   */
  readonly collapsible?: boolean;
};

export function PrimaryNavigation({
  id,
  items,
  onNavigate,
  collapsible = false,
}: PrimaryNavigationProps) {
  const { pathname, search } = useLocation();
  const groups = buildShellNavigationGroups(items);
  const visibleItems = groups.flatMap((group) => group.items);
  const activeTaskSystem =
    pathname === "/tasks" ? taskSystemViewFromSearch(search) : null;
  // Exactly one row is current for any route — the longest matching destination.
  const currentHref = activeNavigationHref(
    visibleItems.map((item) => item.href.split("?")[0] ?? item.href),
    pathname,
  );

  /*
   * DS-03 — the collapsed rail's rows are glyph-only, so each one needs its
   * name back.
   *
   * The accessible NAME never went anywhere: the label element stays in the DOM
   * and is hidden with the visually-hidden treatment rather than `display:none`,
   * so a screen reader reads "Projects" at every width. What a collapsed row
   * loses is the name for a POINTER and for a sighted keyboard user, and that is
   * exactly what the shared tooltip is for (M3-TIP finding 2). It is the
   * description, never the name — the two are different, and a tooltip that is
   * also the name disappears for anyone whose assistive technology does not
   * announce descriptions.
   *
   * SSR renders `false`, so the first byte is the labelled rail and the tooltip
   * is only ever added after mount. Nothing about the layout depends on it, so
   * there is no hydration shift — the width is decided by the media query in
   * `shell.css`, which the server and the browser resolve identically.
   */
  const collapsed = useCollapsedRail(collapsible);

  return (
    <div id={id} className="dh-nav">
      {groups.map((group, groupIndex) => (
        <Fragment key={group.id}>
          {groupIndex > 0 ? (
            <div className="dh-nav__group-heading">
              {group.label ? <span>{group.label}</span> : null}
            </div>
          ) : null}
          <ul className="dh-nav__list">
            {group.items.map((item) => {
              const hrefPath = item.href.split("?")[0] ?? item.href;
              const current =
                item.label === "Inbox"
                  ? activeTaskSystem === "inbox"
                  : item.label === "Upcoming"
                    ? activeTaskSystem === "upcoming"
                    : item.label === "Tasks"
                      ? pathname === "/tasks" &&
                        activeTaskSystem !== "inbox" &&
                        activeTaskSystem !== "upcoming"
                      : hrefPath === currentHref;
              return (
                <li key={item.id} className="dh-nav__item">
                  <Tooltip
                    label={item.label}
                    placement="bottom"
                    disabled={!collapsed}
                  >
                    {(tip) => (
                      <Link
                        to={item.href}
                        ref={tip.ref}
                        className={
                          current
                            ? "dh-nav__link dh-nav__link--active"
                            : "dh-nav__link"
                        }
                        aria-current={current ? "page" : undefined}
                        aria-describedby={tip.describedBy}
                        onClick={onNavigate}
                      >
                        <span className="dh-nav__icon">
                          <NavIcon
                            entityType={item.entityType}
                            navIcon={item.navIcon}
                          />
                        </span>
                        <span className="dh-nav__label">{item.label}</span>
                      </Link>
                    )}
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </div>
  );
}
