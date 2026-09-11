/**
 * UIQ-013 — the ONE collection view switcher, as M3 SEGMENTED BUTTONS.
 *
 * Before this component the product expressed "switch what this collection
 * shows" four different ways: the shared segmented control (Projects, Goals,
 * Notes, Tasks), pill tabs under the header (People), a pill row inside the
 * pane header (Assets, Reviews) and bare segment options in a content toolbar
 * (Meetings) — three selected-state treatments, two corner radii and one
 * control below the 44px target, for one concept. This is that concept as ONE
 * primitive, rendered into the Pane Header's `viewSwitcher` slot on every
 * collection (DESIGN_SYSTEM.md → Collection header).
 *
 * ── A VIEW is not a FILTER ───────────────────────────────────────────────────
 * This component switches the collection's PRESENTATION ("List | Board") or its
 * PRINCIPAL MODE ("Open | Completed | Archived" as mutually-exclusive scopes,
 * of which exactly one is always active). A control that narrows the record
 * subset WITHIN the current view — search, a Type select, a tag — is a filter
 * and belongs in the filter row, composable with its siblings. The same M3
 * anatomy may serve a bounded in-content state toggle through the thin
 * `SegmentedFilter` wrapper (`~/shared/segmented-filter`), but the header slot
 * is this component's.
 *
 * ── Anatomy & behaviour ──────────────────────────────────────────────────────
 * One 44px outlined container, fully-rounded ends, hairline dividers, the
 * selected segment filled with `secondary-container` and marked with the M3
 * check glyph — selection is a shape, never a tone alone (AGENTS.md §15). The
 * check's box is RESERVED in every segment and revealed by opacity, so
 * selecting a segment never changes any segment's width: the control's
 * geometry is identical whichever option is active ("no layout movement when
 * state changes"). Hover/focus/pressed are the ONE shared state layer
 * (`base.css` hosts `.dh-segmented__option`).
 *
 * Two option modes, chosen by the data the view lives in:
 *
 *   - **URL-backed** (the default): options are client-navigation `Link`s —
 *     deep-linkable, shareable, Back/Forward-correct, working with no
 *     JavaScript — marked with `aria-current`. Targets come from each option's
 *     own `href` (route-per-view collections: People, Assets, Meetings) or are
 *     derived from ONE search param (`param`), preserving every unrelated
 *     param including the DS-03 `drawer` stack.
 *   - **Client-state** (`onSelect`): options are toggle `button`s marked with
 *     `aria-pressed`, for presentation state that deliberately lives outside
 *     the URL (People's List/Grid).
 *
 * Keyboard is the native, predictable one for both: Tab reaches the group,
 * Tab/Shift+Tab move between options, Enter (links) or Enter/Space (buttons)
 * activates. No roving focus is invented — these are links and buttons and
 * behave exactly as they announce themselves.
 *
 * Icons are opt-in per option and decorative; `iconOnly` renders the label
 * visually hidden (the accessible name survives) with the shared Tooltip
 * naming the option on hover AND keyboard focus — an icon-only control is
 * never explained by nothing (M3-TIP). A selected icon-only segment swaps its
 * icon for the check, per the M3 segmented-button spec, in the same box — so
 * selection stays a shape there too, still without layout movement.
 */

import type { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";

import {
  ButtonGroup,
  ButtonGroupItem,
} from "~/shared/ui/untitled/base/button-group/button-group";
import { Tab, TabList, Tabs } from "~/shared/ui/untitled/application/tabs/tabs";

export interface ViewSwitcherOption {
  readonly value: string;
  /** The option's name. Visible by default; the accessible name under `iconOnly`. */
  readonly label: string;
  /** Optional decorative leading glyph (required, in practice, for `iconOnly`). */
  readonly icon?: ReactNode;
  /**
   * Explicit navigation target, for collections whose views are ROUTES
   * (`/people`, `/people/recent`) or need bespoke param handling. Ignored when
   * `onSelect` is given; mutually exclusive with `param`-derived targets.
   */
  readonly href?: string;
}

export interface ViewSwitcherProps {
  /** The views, in order. With `param`, the FIRST is the default (absent param). */
  readonly options: readonly ViewSwitcherOption[];
  /** The active option's `value`. Exactly one option is always active. */
  readonly value: string;
  /** Accessible group name (e.g. "Task layout", "Review views"). */
  readonly label: string;
  /**
   * Derive each option's target from ONE URL search param, preserving all
   * unrelated params. The first option is the default and clears the param.
   */
  readonly param?: string;
  /**
   * Params dropped from the derived targets on every switch — a keyset
   * `cursor` bound to the outgoing view, say. Only meaningful with `param`.
   */
  readonly clearParams?: readonly string[];
  /**
   * Client-state mode: render toggle buttons instead of links and call back
   * with the chosen value. The selected state is carried by `aria-pressed`.
   */
  readonly onSelect?: (value: string) => void;
  /** Icon-only presentation: labels visually hidden, shared Tooltip naming each. */
  readonly iconOnly?: boolean;
  /**
   * Whether switching REPLACES the history entry. Defaults to the behaviour
   * each mode already had: a param-derived switch replaces (Back leaves the
   * collection rather than walking every view the owner glanced at), while a
   * route-per-view switch pushes (each view is its own page). Set explicitly
   * where a module's own history semantics differ.
   */
  readonly replace?: boolean;
  /**
   * ADR-100 — write the FIRST option's value into the URL instead of omitting
   * it, for a collection whose default is CONDITIONAL.
   *
   * By default the first option is treated as "no param", which keeps a
   * collection's canonical URL clean and is right whenever the default is
   * fixed: `/projects` and `/projects?present=grid` mean the same thing, so
   * only one of them needs to exist.
   *
   * They stop meaning the same thing the moment a default depends on something
   * else. Projects opens as a TABLE above forty (ADR-100), and it reads an
   * absent `?present=` as "the owner has not chosen" — so a Grid button that
   * deletes the param hands back the very state the owner just pressed a button
   * to leave, and the table reasserts itself on the next navigation. That is
   * ADR-100 decision 2 ("an explicit choice is never overridden") broken by the
   * control rather than by the rule.
   *
   * Set this and every option states itself, so a choice is a choice at every
   * size. A collection with a fixed default should NOT set it: a param that
   * only ever repeats the default is noise in a shared URL.
   */
  readonly alwaysWriteValue?: boolean;
  /**
   * RECORD-01 — a filter is SUBORDINATE to the tabs above it.
   *
   * A record's tab strip answers "where am I in this record"; a segmented
   * filter answers "which subset of this tab". At the switcher's full weight it
   * was the loudest thing in the panel and, on the Project record, read as a
   * second competing row of tabs directly under the real ones. `subtle` takes
   * Untitled's quieter `button-minimal` segmented type; the anatomy, the target
   * size and the keyboard behaviour are identical.
   */
  readonly weight?: "default" | "subtle";
  readonly className?: string;
}

export function ViewSwitcher({
  options,
  value,
  label,
  param,
  clearParams,
  onSelect,
  iconOnly = false,
  replace,
  alwaysWriteValue = false,
  weight = "default",
  className,
}: ViewSwitcherProps) {
  const [searchParams] = useSearchParams();
  /*
   * The switcher writes an ABSOLUTE target (this path plus the new query)
   * rather than a bare `?view=…`.
   *
   * A search-only href resolves against the current document, which is correct
   * in a browser and depends on the router doing that resolution. React Aria
   * hands the href to React Router's `useHref`, so stating the path here means
   * the option's `href` is the same string whether it is read by the router, by
   * "copy link address", or by a screen reader announcing the link.
   */
  const { pathname } = useLocation();
  const defaultValue = options[0]?.value;

  const hrefFor = (option: ViewSwitcherOption): string => {
    if (option.href !== undefined) {
      return option.href;
    }
    // Without `param` an option MUST carry its own href (or the switcher is in
    // button mode and never reaches here). Falling back to "?" keeps a
    // misconfigured option harmless: it navigates nowhere new.
    if (param === undefined) {
      return "?";
    }
    const next = new URLSearchParams(searchParams);
    if (option.value === defaultValue && !alwaysWriteValue) {
      next.delete(param);
    } else {
      next.set(param, option.value);
    }
    for (const stale of clearParams ?? []) {
      next.delete(stale);
    }
    const query = next.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
  };

  if (!onSelect) {
    // Adapted from Untitled UI React `application/tabs` (`type="button-border"`),
    // the segmented control Untitled's Application UI draws for a presentation
    // toggle. Changes: DalyHub URL-backed presentation values, so each segment
    // is a real link to the URL that IS that presentation.
    return (
      <Tabs
        selectedKey={value}
        className={["w-auto min-w-max", className].filter(Boolean).join(" ")}
        data-untitled-source="application/tabs:button-border"
      >
        <TabList
          type={weight === "subtle" ? "button-minimal" : "button-border"}
          size="sm"
          aria-label={label}
        >
          {options.map((option) => (
            <Tab
              key={option.value}
              id={option.value}
              href={hrefFor(option)}
              /*
               * The history semantics the link mode always had, carried through
               * React Aria's `RouterProvider`: a param-derived switch REPLACES
               * (Back leaves the collection rather than walking every view the
               * owner glanced at), while a route-per-view switch pushes.
               */
              routerOptions={{
                replace: replace ?? option.href === undefined,
                preventScrollReset: true,
              }}
              {...(option.icon ? { icon: option.icon } : {})}
              {...(iconOnly ? { "aria-label": option.label } : {})}
            >
              {iconOnly ? undefined : option.label}
            </Tab>
          ))}
        </TabList>
      </Tabs>
    );
  }

  // The client-state switcher: no URL to link to, so Untitled's
  // `base/button-group` toggle group, with selection on `aria-pressed`.
  return (
    <ButtonGroup
      size="md"
      aria-label={label}
      selectedKeys={[value]}
      disallowEmptySelection
      onSelectionChange={(keys) => {
        const next = [...keys].map(String).find((key) => key !== value);
        if (next !== undefined) onSelect?.(next);
      }}
      className={className}
      data-untitled-source="base/button-group"
    >
      {options.map((option) => (
        <ButtonGroupItem
          key={option.value}
          id={option.value}
          aria-label={iconOnly ? option.label : undefined}
          {...(option.icon ? { iconLeading: option.icon } : {})}
        >
          {iconOnly ? undefined : option.label}
        </ButtonGroupItem>
      ))}
    </ButtonGroup>
  );
}
