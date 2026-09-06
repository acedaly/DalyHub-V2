/**
 * ASSET-02 / V2.10 LIFE-02 — the Asset "Obligations" tab.
 *
 * Everything this asset will need, grouped the way an owner reads it: the same
 * bands Life Admin prints, drawn with the same row. It is a focused section, NOT
 * a fleet-maintenance dashboard (§11) — the category filter exists because it
 * answers a real question ("just the rego stuff"), not because a table should
 * have one.
 *
 * ── What changed, and why it matters ────────────────────────────────────────
 * This tab used to draw its OWN obligation row — its own badge, its own meta
 * line, its own action set — and post to `/asset/:id/history`. When Life Admin
 * arrived that would have been two rows and two mutation paths for one record,
 * which is exactly the fork the shared-row convention exists to prevent
 * (ADR-115). It now renders `ObligationRow` and posts to the obligation's own
 * endpoint, so an obligation held from here and one held from Life Admin are the
 * same operation with the same failure behaviour.
 *
 * The counts on the band headings are the counts for THIS ASSET's obligations
 * over the whole set, supplied by the loader — never the length of what happens
 * to be rendered.
 */

import { useMemo, useState } from "react";

import { OBLIGATION_CATEGORY_OPTIONS } from "~/kernel/obligations";
import type { ObligationBandCounts } from "~/kernel/obligations";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import {
  ObligationBands,
  ObligationList,
  ObligationRow,
  type ObligationBandGroup,
  type SerializedObligation,
  useObligationActions,
} from "~/shared/obligations";
import { OBLIGATION_BANDS, obligationBandLabel } from "~/kernel/obligations";

interface AssetObligationsTabProps {
  readonly obligations: readonly SerializedObligation[];
  /** The band counts for this Asset's obligations across the whole set. */
  readonly counts: ObligationBandCounts;
  /** True when the asset record is archived — obligations become read-only. */
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  readonly onEdit: (obligation: SerializedObligation) => void;
  readonly onComplete: (obligation: SerializedObligation) => void;
  readonly onChanged: () => void;
}

const CATEGORY_FILTERS = [
  { value: "", label: "All categories" },
  ...OBLIGATION_CATEGORY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  })),
];

export function AssetObligationsTab({
  obligations,
  counts,
  readOnly,
  onAdd,
  onEdit,
  onComplete,
  onChanged,
}: AssetObligationsTabProps) {
  const feedback = useFeedback();
  const [category, setCategory] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const actions = useObligationActions({
    onChanged,
    onBusy: setPendingId,
    feedback,
  });

  const filtered = useMemo(
    () =>
      category
        ? obligations.filter((obligation) => obligation.category === category)
        : obligations,
    [obligations, category],
  );

  /*
   * OPEN work is banded; settled work goes behind a disclosure, unchanged from
   * ASSET-02. That differs from Life Admin, and deliberately: Life Admin's
   * status is a FILTER the owner chooses, so a dismissed row only appears when
   * they asked for it. This tab shows everything about one Asset at once, and
   * banding a dismissed rego from March under "Overdue" would put settled work
   * at the top of the section that exists for live work.
   */
  const live = filtered.filter((obligation) => obligation.status === "open");
  const settled = filtered.filter((obligation) => obligation.status !== "open");

  /*
   * The counts are the LOADER's, except while a category filter is on: a
   * heading that said "Overdue 4" above one filtered row would be counting a
   * different list from the one underneath it. Filtered, the visible rows ARE
   * the set, because the page holds every one of this Asset's obligations.
   */
  const groups: readonly ObligationBandGroup[] = OBLIGATION_BANDS.filter(
    (band) => band !== "done",
  ).map((band) => {
    const items = live.filter((obligation) => obligation.band === band);
    return {
      band,
      label: obligationBandLabel(band),
      items,
      total: category ? items.length : counts[band],
    };
  });

  const renderRow = (obligation: SerializedObligation) => (
    <ObligationRow
      key={obligation.id}
      obligation={obligation}
      density="comfortable"
      /* Inside the Asset's own record, saying "about the ute" on every row is a
         fact the page has already established. */
      showSubject={false}
      busy={pendingId === obligation.id}
      {...(readOnly
        ? {}
        : {
            onComplete,
            onEdit,
            onCreateTask: actions.createTask,
            onHold: actions.hold,
            onDismiss: actions.dismiss,
            onReopen: actions.reopen,
          })}
    />
  );

  return (
    <div className="dh-asset-obligations">
      <h2 className="dh-visually-hidden">Obligations</h2>

      <div className="dh-asset-obligations__bar">
        <label className="dh-asset-obligations__filter">
          <span>Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORY_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {/* When the empty state is already teaching "Add obligation", the bar
            must not offer a second identical control right above it. */}
        {readOnly || obligations.length === 0 ? null : (
          <button
            type="button"
            className="dh-btn dh-btn--primary dh-btn--sm"
            onClick={onAdd}
          >
            Add obligation
          </button>
        )}
      </div>

      {obligations.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="obligation" />}
          title="Nothing scheduled yet"
          description="Add a service interval, a registration renewal or a warranty expiry so this asset tells you when it needs something."
          primaryAction={
            readOnly ? undefined : (
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={onAdd}
              >
                Add obligation
              </button>
            )
          }
        />
      ) : (
        <>
          {filtered.length === 0 || live.length === 0 ? (
            <p className="dh-obligations__clear">
              Nothing outstanding in this view.
            </p>
          ) : null}

          <ObligationBands groups={groups} renderRow={renderRow} />

          {settled.length > 0 ? (
            <details className="dh-asset-disclosure">
              <summary>Completed and set aside ({settled.length})</summary>
              <div className="dh-asset-disclosure__body">
                <ObligationList ariaLabel="Completed and set-aside obligations">
                  {settled.map(renderRow)}
                </ObligationList>
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
