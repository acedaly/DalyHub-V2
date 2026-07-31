/**
 * ASSET-02 — the Asset "Obligations" tab.
 *
 * Everything this asset will need, grouped the way an owner reads it: overdue
 * first, then due soon, then later, with completed and set-aside work behind a
 * disclosure so history never crowds out what is live. It is a focused section,
 * NOT a fleet-maintenance dashboard (§11) — filters exist because they answer a
 * real question ("just the rego stuff"), not because a table should have them.
 *
 * Actions post to `/asset/:id/history` and revalidate. Each obligation offers only
 * the actions that make sense for its state, so a completed occurrence shows no
 * "Complete" button and an obligation with a live Task shows "Open task" rather
 * than "Create task".
 *
 * State is always carried by TEXT ("Overdue", "Reading needed") beside the tone,
 * and each action button names its obligation in its accessible name so a screen
 * reader user never meets a list of identical "Complete" buttons (§24).
 */

import { useCallback, useMemo, useState } from "react";

import {
  ASSET_OBLIGATION_CATEGORY_OPTIONS,
  type AssetObligationState,
} from "~/kernel/assets";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";

import {
  obligationStateTone,
  type SerializedAssetObligation,
} from "./asset-history-view";
import type { AssetHistoryResult } from "./routes/history";

interface AssetObligationsTabProps {
  readonly assetId: string;
  readonly obligations: readonly SerializedAssetObligation[];
  /** True when the asset record is archived — obligations become read-only. */
  readonly readOnly: boolean;
  readonly onAdd: () => void;
  readonly onEdit: (obligation: SerializedAssetObligation) => void;
  readonly onComplete: (obligation: SerializedAssetObligation) => void;
  readonly onChanged: () => void;
}

/** The live groups, in the order the owner reads them. */
const GROUPS: readonly {
  readonly id: string;
  readonly label: string;
  readonly states: readonly AssetObligationState[];
}[] = [
  { id: "overdue", label: "Overdue", states: ["overdue"] },
  { id: "due", label: "Due soon", states: ["due", "unknown"] },
  { id: "later", label: "Later", states: ["upcoming"] },
];

const CATEGORY_FILTERS = [
  { value: "", label: "All categories" },
  ...ASSET_OBLIGATION_CATEGORY_OPTIONS.map((c) => ({
    value: c.value,
    label: c.label,
  })),
];

export function AssetObligationsTab({
  assetId,
  obligations,
  readOnly,
  onAdd,
  onEdit,
  onComplete,
  onChanged,
}: AssetObligationsTabProps) {
  const feedback = useFeedback();
  const [category, setCategory] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const post = useCallback(
    async (intent: string, obligationId: string) => {
      setPendingId(obligationId);
      const body = new FormData();
      body.set("intent", intent);
      body.set("obligationId", obligationId);
      try {
        const response = await fetch(
          `/asset/${encodeURIComponent(assetId)}/history`,
          { method: "POST", body },
        );
        const result = (await response.json()) as AssetHistoryResult;
        if (result.ok) {
          onChanged();
          return true;
        }
        feedback.notifyError(
          result.formError ?? "That couldn’t be saved. Please try again.",
        );
      } catch {
        feedback.notifyError("That couldn’t be saved. Please try again.");
      } finally {
        setPendingId(null);
      }
      return false;
    },
    [assetId, feedback, onChanged],
  );

  const filtered = useMemo(
    () =>
      category
        ? obligations.filter((o) => o.category === category)
        : obligations,
    [obligations, category],
  );

  const live = filtered.filter((o) => o.status === "open");
  const settled = filtered.filter((o) => o.status !== "open");

  const groups = GROUPS.map((group) => ({
    ...group,
    items: live.filter((o) => group.states.includes(o.state)),
  })).filter((group) => group.items.length > 0);

  const renderRow = (obligation: SerializedAssetObligation) => {
    const busy = pendingId === obligation.id;
    return (
      <li key={obligation.id} className="dh-asset-obligation">
        <div className="dh-asset-obligation__main">
          <p className="dh-asset-obligation__title">
            <span
              className={`dh-asset-badge dh-asset-badge--${obligationStateTone(obligation.state)}`}
            >
              {obligation.stateLabel}
            </span>{" "}
            <span className="dh-asset-obligation__name">
              {obligation.title}
            </span>
          </p>
          <p className="dh-asset-obligation__meta">
            <span>{obligation.categoryLabel}</span>
            <span aria-hidden="true"> · </span>
            <span>{obligation.stateText}</span>
            {obligation.recurrenceKind !== "none" ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{obligation.recurrenceLabel}</span>
              </>
            ) : null}
          </p>
          {obligation.description ? (
            <p className="dh-asset-obligation__description">
              {obligation.description}
            </p>
          ) : null}
          {obligation.taskId ? (
            <p className="dh-asset-obligation__task">
              {obligation.taskOpen ? (
                <>
                  Tracked as a task.{" "}
                  <a
                    href={`/tasks?drawer=task%3A${encodeURIComponent(obligation.taskId)}`}
                  >
                    Open task
                  </a>
                </>
              ) : (
                <>
                  {/* The authority contract, said plainly to the owner (§7). */}
                  Its task is done. Record what actually happened to complete
                  this obligation.
                </>
              )}
            </p>
          ) : null}
        </div>

        {readOnly ? null : (
          <div className="dh-asset-obligation__actions">
            {obligation.status === "open" ? (
              <>
                <button
                  type="button"
                  className="dh-btn dh-btn--primary dh-btn--sm"
                  disabled={busy}
                  onClick={() => onComplete(obligation)}
                >
                  Complete
                  <span className="dh-visually-hidden">
                    {" "}
                    {obligation.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  disabled={busy}
                  onClick={() => onEdit(obligation)}
                >
                  Edit
                  <span className="dh-visually-hidden">
                    {" "}
                    {obligation.title}
                  </span>
                </button>
                {obligation.taskId === null ? (
                  <button
                    type="button"
                    className="dh-btn dh-btn--ghost dh-btn--sm"
                    disabled={busy}
                    onClick={() =>
                      post("create-obligation-task", obligation.id).then(
                        (okay) => {
                          if (okay) feedback.notifySuccess("Task created.");
                        },
                      )
                    }
                  >
                    Create task
                    <span className="dh-visually-hidden">
                      {" "}
                      for {obligation.title}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  disabled={busy}
                  onClick={() => post("hold-obligation", obligation.id)}
                >
                  Hold
                  <span className="dh-visually-hidden">
                    {" "}
                    {obligation.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost dh-btn--sm"
                  disabled={busy}
                  onClick={() => post("dismiss-obligation", obligation.id)}
                >
                  Dismiss
                  <span className="dh-visually-hidden">
                    {" "}
                    {obligation.title}
                  </span>
                </button>
              </>
            ) : obligation.status === "completed" ? null : (
              <button
                type="button"
                className="dh-btn dh-btn--ghost dh-btn--sm"
                disabled={busy}
                onClick={() => post("reopen-obligation", obligation.id)}
              >
                Reopen
                <span className="dh-visually-hidden"> {obligation.title}</span>
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

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
          icon={<EntityIcon type="asset" />}
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
          {groups.length === 0 && live.length === 0 ? (
            <p className="dh-asset-obligations__clear">
              Nothing outstanding in this view.
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.id} className="dh-asset-obligations__group">
              <h3 className="dh-asset-obligations__heading">
                {group.label}{" "}
                <span className="dh-asset-obligations__count">
                  ({group.items.length})
                </span>
              </h3>
              <ul
                className="dh-asset-obligations__list"
                aria-label={`${group.label} obligations`}
              >
                {group.items.map(renderRow)}
              </ul>
            </section>
          ))}

          {settled.length > 0 ? (
            <details className="dh-asset-disclosure">
              <summary>Completed and set aside ({settled.length})</summary>
              <div className="dh-asset-disclosure__body">
                <ul
                  className="dh-asset-obligations__list"
                  aria-label="Completed and set-aside obligations"
                >
                  {settled.map(renderRow)}
                </ul>
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
