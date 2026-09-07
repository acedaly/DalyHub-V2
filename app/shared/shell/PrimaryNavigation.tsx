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
import { Link, useLocation, useNavigation } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { Tooltip } from "~/shared/tooltip";

import { NavIcon } from "./NavIcon";
import { useCollapsedRail } from "./collapsed-rail";
import { activeNavigationHref } from "./navigation-active";
import { pendingNavigationHref } from "./navigation-pending";
import { PRIMARY_NAV_PREFETCH } from "./navigation-prefetch";

/**
 * The display name for a navigation group, when it has one.
 *
 * A group that is absent from this map still gets its rhythm — the divider below
 * is unconditional — but no heading. That is deliberate and matches the visual
 * references: the DAILY block at the top of the rail is unlabelled (Today, Inbox,
 * Upcoming and Tasks need no heading to explain them), ORGANISE names the long
 * middle block that does, and the system block at the bottom is separated by
 * position alone.
 *
 * The map lives in the shell rather than in module manifests because a group
 * HEADING is a property of the frame's information architecture, not of any one
 * module — Projects does not get to name the group it happens to sit in.
 */
const GROUP_HEADINGS: Readonly<Record<string, string>> = {
  organise: "Organise",
  more: "More",
};

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
  const { pathname } = useLocation();
  // Exactly one row is current for any route — the longest matching destination,
  // consulting each item's module route prefixes as well as path nesting
  // (RECALL-00-E), so a singular record route keeps its module current.
  const currentHref = activeNavigationHref(items, pathname);
  /*
   * PERF-01 — the destination a click is on its way to, acknowledged instantly.
   *
   * `navigation-pending.ts` holds the rule and the reasoning; the row wears the
   * selected row's own indicator shape while its loaders run, so a navigation
   * says something the moment it starts rather than only when it finishes.
   */
  const routerNavigation = useNavigation();
  const pendingHref = pendingNavigationHref(items, routerNavigation, pathname);

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
      <ul className="dh-nav__list">
        {items.map((item, index) => {
          const previous = items[index - 1];
          const startsNewGroup = index > 0 && previous?.group !== item.group;
          const heading =
            item.group === undefined ? undefined : GROUP_HEADINGS[item.group];
          const current = item.href === currentHref;
          const pending = item.href === pendingHref;
          return (
            <Fragment key={item.id}>
              {startsNewGroup ? (
                <li className="dh-nav__divider" aria-hidden="true">
                  <hr />
                </li>
              ) : null}
              {/*
               * The heading is decorative, not a landmark or a list item with
               * meaning: the rail is already the "Primary" navigation region and
               * every destination inside it is a link with its own name. An
               * `aria-hidden` caption keeps the visual grouping the references
               * ask for without inventing a second structure for a screen reader
               * to walk past — and the collapsed rail hides it in CSS, where the
               * label text is hidden too.
               */}
              {startsNewGroup && heading !== undefined ? (
                <li className="dh-nav__heading" aria-hidden="true">
                  {heading}
                </li>
              ) : null}
              <li className="dh-nav__item">
                <Tooltip
                  label={item.label}
                  placement="bottom"
                  disabled={!collapsed}
                >
                  {(tip) => (
                    <Link
                      to={item.href}
                      /*
                       * PERF-01 — the destination is warmed on INTENT, not on
                       * click. `navigation-prefetch.ts` holds the policy and the
                       * reasoning; this is the rail applying it.
                       */
                      prefetch={PRIMARY_NAV_PREFETCH}
                      ref={tip.ref}
                      className={
                        current
                          ? "dh-nav__link dh-nav__link--active"
                          : "dh-nav__link"
                      }
                      aria-current={current ? "page" : undefined}
                      aria-busy={pending ? true : undefined}
                      data-pending={pending ? "true" : undefined}
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
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
