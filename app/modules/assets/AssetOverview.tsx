/**
 * ASSET-02 — the Asset "Overview" tab (ASSET-01's Summary, grown up).
 *
 * The one screen that answers "what is this thing, and does it need me?". It leads
 * with the identity and the single most urgent obligation, then the facts that
 * apply to THIS asset, and only then the deeper detail behind progressive
 * disclosure.
 *
 * The discipline that keeps it calm: **a row that does not apply is not rendered.**
 * A software licence has no odometer and a hand tool has no registration, so
 * neither shows an empty enterprise-style field for one (§9). Everything below the
 * fold — the full date list, the recorded costs, the value history — sits inside a
 * `<details>` disclosure the owner opens when they want it.
 *
 * Every state is carried by TEXT as well as tone (§24): "Overdue", "Due soon",
 * "Reading needed" are words, so the meaning survives a colour-blind reader, a
 * greyscale print and all five themes.
 */

import type { ReactNode } from "react";

import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import {
  obligationStateTone,
  type SerializedObligation,
} from "~/shared/obligations";
import { TagChipList } from "~/shared/ui";

import { AssetDatesTab } from "./AssetDatesTab";
import { AssetValueHistory } from "./AssetValueHistory";
import { nextMeaningfulDate } from "./asset-dates";
import {
  type SerializedAssetEvent,
  type SerializedCostSummary,
  type SerializedValueHistory,
} from "./asset-history-view";
import type { SerializedAsset } from "./asset-view";

/** The resolved canonical names the loader supplies for the id-reference fields. */
export interface AssetSummaryContext {
  readonly ownerName: string | null;
  readonly responsibleName: string | null;
  readonly areaName: string | null;
}

/** Everything the overview renders, all derived server-side. */
export interface AssetOverviewData {
  readonly obligations: readonly SerializedObligation[];
  readonly recentEvents: readonly SerializedAssetEvent[];
  readonly costs: SerializedCostSummary;
  readonly values: SerializedValueHistory;
  readonly meterDisplay: string | null;
  readonly meterDateLabel: string | null;
  readonly openTaskCount: number;
}

interface AssetOverviewProps {
  readonly asset: SerializedAsset;
  readonly names: AssetSummaryContext;
  readonly data: AssetOverviewData;
  /** Owner-calendar today (`YYYY-MM-DD`) for due-date phrasing. */
  readonly today: string;
  readonly onEditDetails: () => void;
  readonly onOpenObligations: () => void;
  readonly onOpenHistory: () => void;
  /**
   * DHDS-10 — the Areas this workspace has, for the Area choice.
   *
   * The loader's existing BOUNDED set — the same list the details form's Area
   * field is handed — so opening the choice costs no request. Areas are few and
   * permanent by definition (AGENTS.md §4), which is why this is a `Menu` over a
   * closed set rather than a searchable picker: a searchable surface over six
   * values is slower than the six values.
   */
  readonly areas?: readonly { readonly id: string; readonly title: string }[];
  /** DHDS-10 — set ONE detail field. Omit and every fact renders as text. */
  readonly onSetField?: (
    field: string,
    value: string,
  ) => Promise<InlineSaveOutcome>;
}

export function AssetOverview({
  asset,
  names,
  data,
  today,
  onEditDetails,
  onOpenObligations,
  onOpenHistory,
  areas = [],
  onSetField,
}: AssetOverviewProps) {
  const open = data.obligations.filter((o) => o.status === "open");
  const overdue = open.filter((o) => o.state === "overdue");
  // The obligations arrive due-date ascending, so the first open one is next.
  const next = open[0] ?? null;
  // Only fall back to the canonical single dates when there is no obligation to
  // show — otherwise the same commitment would be stated twice (§10).
  const fallbackDate = next === null ? nextMeaningfulDate(asset, today) : null;

  const lastService =
    data.recentEvents.find(
      (event) => event.category === "service" || event.category === "repair",
    ) ?? null;

  /*
   * DHDS-10 — a fact's value is a NODE, not a string.
   *
   * It was `string`, which is what kept this sheet read-only: a value that can
   * only be text can only be printed. Two of these rows are now controls; the
   * rest are still the strings they were.
   */
  const facts: { id: string; label: string; value: ReactNode }[] = [];
  if (names.ownerName) {
    facts.push({ id: "owner", label: "Owner", value: names.ownerName });
  }
  if (names.responsibleName) {
    facts.push({
      id: "responsible",
      label: "Responsible",
      value: names.responsibleName,
    });
  }
  /*
   * DHDS-10 §22 — the two facts an Asset's owner actually moves.
   *
   * WHERE it is kept and WHICH part of life it belongs to are the two rows of
   * this sheet that change while the thing itself does not, and both were
   * read-only text with "Edit details" — an eighteen-field form — underneath
   * them. They are now the shared inline text field and the shared contextual
   * choice, posting the same one-field `intent=update` the form posts.
   *
   * Both are drawn even when EMPTY, because an absent location is exactly when
   * setting one is useful and the sheet is a small set of labelled facts rather
   * than a fifty-row list — the case §25 keeps the invitation visible for. The
   * rest of the sheet keeps the "a row that does not apply is not rendered"
   * rule: a licence still shows no odometer.
   *
   * Everything else here stays read-only and stays behind the details form:
   * a purchase price, a warranty expiry and a meter reading are fields whose
   * validation and units belong together, and DHDS-10 §34 keeps that kind of
   * editing in its proper editor.
   */
  if (onSetField) {
    facts.push({
      id: "location",
      label: "Location",
      value: (
        <InlineTextField
          label="Location"
          value={asset.location ?? ""}
          onSave={(next) => onSetField("location", next)}
          emptyLabel="Add a location"
          presentation="meta"
          data-testid="asset-location-edit"
        />
      ),
    });
    facts.push({
      id: "area",
      label: "Area",
      value: (
        <InlineSelectField
          label="Area"
          value={asset.areaId ?? ""}
          options={areas.map((area) => ({
            value: area.id,
            label: area.title,
          }))}
          onSave={(next) => onSetField("areaId", next)}
          emptyLabel="No Area"
          clearable
          clearLabel="Remove from Area"
          presentation="meta"
          data-testid="asset-area-edit"
        />
      ),
    });
  } else {
    if (asset.location) {
      facts.push({ id: "location", label: "Location", value: asset.location });
    }
    if (names.areaName) {
      facts.push({ id: "area", label: "Area", value: names.areaName });
    }
  }
  if (data.meterDisplay) {
    facts.push({
      id: "meter",
      label: "Current meter",
      value: data.meterDateLabel
        ? `${data.meterDisplay} · read ${data.meterDateLabel}`
        : data.meterDisplay,
    });
  }
  if (asset.acquisitionDate || asset.purchasePriceDisplay) {
    facts.push({
      id: "purchase",
      label: "Purchased",
      value: [asset.acquisitionDate, asset.purchasePriceDisplay]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (asset.warrantyExpiry) {
    facts.push({
      id: "warranty",
      label: "Warranty",
      value: `Expires ${asset.warrantyExpiry}`,
    });
  }
  if (asset.renewalDate) {
    facts.push({
      id: "renewal",
      label: "Renewal",
      value: `Due ${asset.renewalDate}`,
    });
  }
  if (lastService) {
    facts.push({
      id: "lastService",
      label: `Last ${lastService.category === "repair" ? "repair" : "service"}`,
      value: [lastService.dateLabel, lastService.provider]
        .filter(Boolean)
        .join(" · "),
    });
  }

  return (
    <div className="dh-asset-summary">
      <h2 className="dh-visually-hidden">Overview</h2>

      {/*
        RECORD-01 — the Overview no longer re-introduces the asset.

        It opened with a 40px glyph beside "Vehicle", "Toyota Hilux SR5 (2021)"
        and an "Active" badge — every one of which the record header states
        directly above it: the type as the header's subtype label, the make and
        model in its context line, and the status as its pill. Three facts, each
        twice, in the first 120px of the record.

        So the Overview now opens with what the header CANNOT say and what the
        contract asks it to lead with: the maintenance and renewal situation,
        starting with the next thing that might need the owner today.
      */}
      {/* The one thing that might need the owner today. */}
      {next ? (
        <div className="dh-asset-next" data-testid="asset-next-obligation">
          <p
            className={`dh-asset-next__line dh-asset-next__line--${next.state}`}
          >
            <span
              className={`dh-obligation-badge dh-obligation-badge--${obligationStateTone(next.state)}`}
            >
              {next.stateLabel}
            </span>{" "}
            <span className="dh-asset-next__title">{next.title}</span>{" "}
            <span className="dh-asset-next__text">{next.stateText}</span>
          </p>
          <p className="dh-asset-next__meta">
            {overdue.length > 0
              ? `${overdue.length} of ${open.length} ${open.length === 1 ? "obligation is" : "obligations are"} overdue.`
              : `${open.length} open ${open.length === 1 ? "obligation" : "obligations"}.`}{" "}
            <button
              type="button"
              className="dh-btn dh-btn--ghost dh-btn--sm"
              onClick={onOpenObligations}
            >
              View obligations
            </button>
          </p>
        </div>
      ) : fallbackDate ? (
        <p
          className={`dh-asset-summary__next dh-asset-summary__next--${fallbackDate.status}`}
        >
          {fallbackDate.text}
        </p>
      ) : (
        <p className="dh-asset-summary__next dh-asset-summary__next--none">
          No maintenance or renewals tracked yet.{" "}
          <button
            type="button"
            className="dh-btn dh-btn--ghost dh-btn--sm"
            onClick={onOpenObligations}
          >
            Add one
          </button>
        </p>
      )}

      {data.openTaskCount > 0 ? (
        <p className="dh-asset-summary__tasks">
          {data.openTaskCount === 1
            ? "1 open task is linked to this asset."
            : `${data.openTaskCount} open tasks are linked to this asset.`}
        </p>
      ) : null}

      {facts.length > 0 ? (
        /*
         * DHDS-10 — the fact sheet is a REVEAL CONTEXT, for the same reason a
         * record's context line and a collection row are: two of these rows are
         * now controls, and a caret drawn permanently beside "Home & Property"
         * would make the sheet read as a form (§6).
         */
        <dl className="dh-asset-summary__facts" data-dh-action-context="true">
          {facts.map((fact) => (
            <div key={fact.id} className="dh-asset-summary__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* CONVERGE-01 §6 — the ONE shared tag chip (see `TagChip`). */}
      <TagChipList
        tags={asset.tags}
        label="Tags"
        className="dh-asset-summary__tags"
      />

      {/* -- Progressive disclosure: the depth, only when asked for --------- */}

      {!data.costs.isEmpty ? (
        <details className="dh-asset-disclosure">
          <summary>Recorded costs</summary>
          <div className="dh-asset-disclosure__body">
            {/* "Recorded", never "total cost of ownership": DalyHub cannot know
                whether every receipt was entered, and must not imply it (§15). */}
            <p className="dh-asset-costs__caveat">
              These are the costs recorded in DalyHub
              {data.costs.costedEventCount === 0
                ? ""
                : ` across ${data.costs.costedEventCount} ${data.costs.costedEventCount === 1 ? "entry" : "entries"}`}
              . They are not a complete cost of ownership.
            </p>
            {data.costs.lines.length > 0 ? (
              <dl className="dh-asset-costs">
                {data.costs.lines.map((line) => (
                  <div key={line.group} className="dh-asset-costs__row">
                    <dt>{line.label}</dt>
                    <dd>{line.amount}</dd>
                  </div>
                ))}
                {data.costs.ongoingTotal ? (
                  <div className="dh-asset-costs__row dh-asset-costs__row--total">
                    <dt>Recorded ongoing cost</dt>
                    <dd>{data.costs.ongoingTotal}</dd>
                  </div>
                ) : null}
                {data.costs.purchasePrice ? (
                  <div className="dh-asset-costs__row">
                    <dt>Purchase price</dt>
                    <dd>{data.costs.purchasePrice}</dd>
                  </div>
                ) : null}
                {data.costs.lifetimeTotal ? (
                  <div className="dh-asset-costs__row dh-asset-costs__row--total">
                    <dt>Recorded lifetime total</dt>
                    <dd>{data.costs.lifetimeTotal}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {data.costs.mixedCurrency ? (
              <p className="dh-asset-costs__mixed" role="note">
                Some entries are recorded in{" "}
                {data.costs.excludedCurrencies.join(", ")}. They are shown in
                the timeline but are not added to these totals, because DalyHub
                never converts between currencies.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      {data.values.points.length > 0 ? (
        <details className="dh-asset-disclosure">
          <summary>Value history</summary>
          <div className="dh-asset-disclosure__body">
            <AssetValueHistory history={data.values} />
          </div>
        </details>
      ) : null}

      <details className="dh-asset-disclosure">
        <summary>All dates</summary>
        <div className="dh-asset-disclosure__body">
          <AssetDatesTab asset={asset} today={today} />
        </div>
      </details>

      <p className="dh-asset-summary__edit">
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onEditDetails}
        >
          Edit details
        </button>{" "}
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onOpenHistory}
        >
          View history
        </button>
      </p>
    </div>
  );
}
