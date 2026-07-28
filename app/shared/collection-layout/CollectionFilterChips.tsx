/**
 * TASKS-03 — the shared ACTIVE-FILTER chip row.
 *
 * A collection that hides records must say so where the records would be. This is
 * the shared answer: every applied filter renders as a labelled chip with its own
 * remove control, plus one explicit "Reset filters" action — so a user never has to
 * reopen a filter sheet to find out why a list looks short.
 *
 * It is driven by the SAME `CollectionControlGroup[]` the MOBILE-01 phone sheet
 * consumes, so desktop and phone are two presentations of one control model, not
 * two filter systems (DESIGN_SYSTEM.md → Filters: one filter system).
 *
 * Accessibility rules it keeps:
 *   - each chip states its DIMENSION and its VALUE in words ("Priority: P1 ·
 *     Urgent"), so filter state is never carried by colour or position alone;
 *   - each remove control has its own accessible name naming what it removes;
 *   - the row is a labelled list, so a screen-reader user can enumerate what is
 *     applied and how many;
 *   - the chips are ordinary links, so they are keyboard-operable, middle-clickable
 *     and Back/Forward-correct — the URL is the state.
 */

import { Link } from "react-router";

import {
  activeControls,
  withoutControl,
  withoutControls,
  type CollectionControlGroup,
} from "./collection-controls-model";

export type CollectionFilterChipsProps = {
  readonly groups: readonly CollectionControlGroup[];
  readonly params: URLSearchParams;
  /** Route path the chips link within (defaults to a param-only relative link). */
  readonly basePath?: string;
  /** Extra params cleared alongside pagination when a chip is removed. */
  readonly resetParams?: readonly string[];
  /** The row's accessible name. Defaults to "Active filters". */
  readonly label?: string;
};

export function CollectionFilterChips({
  groups,
  params,
  basePath = "",
  resetParams,
  label = "Active filters",
}: CollectionFilterChipsProps) {
  const applied = activeControls(groups, params);
  if (applied.length === 0) {
    return null;
  }

  const options = resetParams ? { resetParams: ["cursor", ...resetParams] } : {};
  const href = (next: URLSearchParams): string =>
    `${basePath}?${next.toString()}`;

  return (
    <div className="dh-filter-chips" data-testid="collection-filter-chips">
      <ul className="dh-filter-chips__list" aria-label={label}>
        {applied.map((control) => (
          <li key={control.groupId} className="dh-filter-chips__item">
            <span className="dh-filter-chips__chip">
              <span className="dh-filter-chips__label">{control.label}:</span>{" "}
              <span className="dh-filter-chips__value">
                {control.valueLabel}
              </span>
              <Link
                className="dh-filter-chips__remove"
                to={href(withoutControl(params, control.param, options))}
                replace
                preventScrollReset
                aria-label={`Remove filter ${control.label}: ${control.valueLabel}`}
              >
                <span aria-hidden="true">×</span>
              </Link>
            </span>
          </li>
        ))}
      </ul>
      <Link
        className="dh-filter-chips__reset"
        to={href(withoutControls(groups, params, ["filter"], options))}
        replace
        preventScrollReset
        data-testid="collection-reset-filters"
      >
        Reset filters
      </Link>
    </div>
  );
}
