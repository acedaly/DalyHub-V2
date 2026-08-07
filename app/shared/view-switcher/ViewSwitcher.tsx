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
import { Link, useSearchParams } from "react-router";

import { Tooltip } from "~/shared/tooltip";

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
  className,
}: ViewSwitcherProps) {
  const [searchParams] = useSearchParams();
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
    if (option.value === defaultValue) {
      next.delete(param);
    } else {
      next.set(param, option.value);
    }
    for (const stale of clearParams ?? []) {
      next.delete(stale);
    }
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  const classes = [
    "dh-segmented",
    iconOnly ? "dh-segmented--icon-only" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="group" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        const content = (
          <>
            {option.icon ? (
              <span className="dh-segmented__icon" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            <span
              className={
                iconOnly ? "dh-visually-hidden" : "dh-segmented__label"
              }
            >
              {option.label}
            </span>
          </>
        );

        if (onSelect) {
          const button = (tipRef?: (node: HTMLElement | null) => void) => (
            <button
              key={option.value}
              type="button"
              ref={tipRef}
              className="dh-segmented__option"
              aria-pressed={active}
              onClick={() => {
                // Re-selecting the active view is a no-op, not a toggle-off:
                // a collection always has exactly one active view.
                if (!active) {
                  onSelect(option.value);
                }
              }}
            >
              {content}
            </button>
          );
          // An icon-only control composes the shared tooltip so the glyph is
          // explained on hover and on keyboard focus; the visually-hidden label
          // remains the accessible NAME (a tooltip never names — M3-TIP).
          return iconOnly ? (
            <Tooltip key={option.value} label={option.label} placement="top">
              {(tip) => button(tip.ref)}
            </Tooltip>
          ) : (
            button()
          );
        }

        const link = (tipRef?: (node: HTMLElement | null) => void) => (
          <Link
            key={option.value}
            to={hrefFor(option)}
            replace={replace ?? option.href === undefined}
            preventScrollReset
            ref={tipRef}
            className="dh-segmented__option"
            aria-current={active ? "true" : undefined}
          >
            {content}
          </Link>
        );
        return iconOnly ? (
          <Tooltip key={option.value} label={option.label} placement="top">
            {(tip) => link(tip.ref)}
          </Tooltip>
        ) : (
          link()
        );
      })}
    </div>
  );
}
