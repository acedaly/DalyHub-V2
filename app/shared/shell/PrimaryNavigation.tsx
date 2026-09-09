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
 * ── V2.16 CONSOL-00: the grouping stops being decorative ────────────────────
 *
 * PX-03 carried `NavigationItem.group` through and rendered it as a plain `<hr>`
 * plus, for two of the four groups, an `aria-hidden` caption. That was defensible
 * while the groups were SHAPES: "daily" and "more" tell a screen-reader user
 * nothing they cannot get from the row names.
 *
 * V2.16 re-cut them into the five QUESTIONS the product answers — Do, Organise,
 * Deal with, Money, Understand — and a heading that says "Money" is now the
 * shortest answer to "where do I go for this?". Hiding it from assistive
 * technology would mean the release's entire user-visible outcome reached
 * sighted users only.
 *
 * So each group's destinations are their OWN list, labelled by its own heading:
 * a screen reader announces "Money, list, 1 item" once on entry rather than
 * repeating the group on every row, the `system` block (which has no visible
 * heading, by design) carries an `aria-label` instead, and keyboard order still
 * matches visual order because the DOM order IS the visual order. No accordion,
 * no button that is really a label, and no landmark per group — the rail is
 * already the "Primary" navigation region, and six nested regions inside it
 * would be six more things to walk past.
 *
 * The heading is a `<span>` rather than an `<h2>` deliberately: it names its
 * list through `aria-labelledby`, which is what a grouped list needs, and adding
 * six headings to the document outline would put the frame's furniture in the
 * same structure as the page's own content.
 *
 * Group ORDER, group KEYS and group NAMES all live in `navigation-groups.ts` —
 * one information architecture, read by the rail, by the phone sheet and by the
 * test that asserts no module invents a seventh group.
 */

import { Link, useLocation, useNavigation } from "react-router";

import type { NavigationItem } from "~/platform/modules/navigation-adapter";
import { Tooltip } from "~/shared/tooltip";

import { NavIcon } from "./NavIcon";
import { useCollapsedRail } from "./collapsed-rail";
import { activeNavigationHref } from "./navigation-active";
import { buildNavigationGroups } from "./navigation-groups";
import { pendingNavigationHref } from "./navigation-pending";
import { PRIMARY_NAV_PREFETCH } from "./navigation-prefetch";

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

  const groups = buildNavigationGroups(items);

  return (
    <div id={id} className="dh-nav">
      {groups.map((group, groupIndex) => {
        const headingId = `${id}-group-${group.definition.key}`;
        const heading = group.definition.heading;
        return (
          <div className="dh-nav__group" key={group.definition.key}>
            {/*
             * The rule between blocks is decoration: the heading below it, or
             * the block's own position, is what carries the meaning. It is
             * `aria-hidden` and is skipped entirely before the first group,
             * which has nothing above it to be separated from.
             */}
            {groupIndex > 0 ? (
              <hr className="dh-nav__rule" aria-hidden="true" />
            ) : null}
            {heading === null ? null : (
              <span className="dh-nav__heading" id={headingId}>
                {heading}
              </span>
            )}
            <ul
              className="dh-nav__list"
              {...(heading === null
                ? { "aria-label": group.definition.accessibleName }
                : { "aria-labelledby": headingId })}
            >
              {group.items.map((item) => {
                const current = item.href === currentHref;
                const pending = item.href === pendingHref;
                return (
                  <li className="dh-nav__item" key={item.id}>
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
                           * reasoning; this is the rail applying it. It is applied
                           * HERE, once, to every row of every group — a regroup
                           * that dropped it from one block would be a silent
                           * performance regression, which is why
                           * `navigation-prefetch.test.tsx` asserts it on all of
                           * them rather than on a sample.
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
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
