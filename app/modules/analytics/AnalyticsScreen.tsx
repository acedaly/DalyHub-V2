/**
 * UIX-05 — the Analytics surface.
 *
 * DalyHub's first surface whose subject is not a record. Today asks "what now?",
 * a Review asks "what happened in that period, and what should change?", and
 * Analytics asks the one question neither can: **where has my effort actually
 * gone, and is that where I meant it to go?**
 *
 * ── The composition, and why it is this one ─────────────────────────────────
 *
 *     [ 7 days · 4 weeks · 12 weeks ]        5 – 11 August 2026
 *     ─────────────────────────────────────────────────────────
 *     Tasks completed   Projects finished   Goals on track   Areas worked in
 *     24                3                   5                4
 *     6 more than…      1 fewer than…       of 9, right now  61 Tasks…
 *     ─────────────────────────────────────────────────────────
 *     Completion trend                  Where the work landed
 *     ╱╲__╱╲___                         Health & Fitness  ████████  38%
 *                                       Work & Career     █████     24%
 *
 * The metric row leads because four exact figures answer the question faster
 * than any drawing of them, and each states its own comparison beneath it rather
 * than in a legend. The two panels below it are the SHAPE of those figures: when
 * the work happened, and where it went. Two charts, not six — the reference for
 * this screen shows a trend and a breakdown, and everything a third would add is
 * already a sentence on the row above.
 *
 * ── Three things this surface deliberately does not do ──────────────────────
 *
 * 1. **No focus time, and no daily-progress percentage.** The supplied reference
 *    carries both. DalyHub records no time and computes no percentage of a life,
 *    so both would have to be invented — see `~/kernel/analytics/analytics.ts`.
 *    The row shows what the product genuinely knows instead, and each figure
 *    links to the records behind it so a doubted number can be checked.
 * 2. **No donut.** The reference's breakdown is a ring with a centre total. The
 *    design system's agreed chart language (Part 2, A5) is line, sparkline,
 *    ring, horizontal progress and milestone track; a proportion across six or
 *    eight named categories is what horizontal bars are FOR, and a ring makes
 *    two similar slices impossible to rank without reading the numbers off the
 *    legend anyway. The bars carry each Area's own identity accent, so the panel
 *    also reads as the Areas the owner already recognises.
 * 3. **No score.** Not a productivity index, not a grade, not a weighted
 *    composite. REVIEW-03 refuses one for the reason that holds here too: a
 *    single number mixing tasks, Goals and Areas would look precise and mean
 *    nothing.
 *
 * Presentation only — every figure, comparison, bucket and share is derived by
 * the pure evaluator server-side and handed here already worded.
 */

import { Link, useSearchParams } from "react-router";

import {
  ANALYTICS_RANGES,
  type AnalyticsModel,
  type AnalyticsRangeId,
} from "~/kernel/analytics";
import { DashboardCard } from "~/shared/card";
import { TrendLine, type TrendLinePoint } from "~/shared/charts";
import { CollectionLayout } from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { areaAccentForRank } from "~/shared/pill";
import { ViewSwitcher } from "~/shared/view-switcher";

import type { AnalyticsPageData } from "./analytics-context";

export function AnalyticsScreen({
  data,
}: {
  readonly data: AnalyticsPageData;
}) {
  const [searchParams] = useSearchParams();
  const { model } = data;

  const rangeHref = (id: AnalyticsRangeId) => {
    const next = new URLSearchParams(searchParams);
    if (id === "week") next.delete("range");
    else next.set("range", id);
    const qs = next.toString();
    return qs ? `/analytics?${qs}` : "/analytics";
  };

  /*
   * The range rail is a genuine VIEW switcher, not a filter: exactly one span is
   * always active, and changing it changes what the whole surface is about
   * rather than narrowing a set of records. That is the header's view slot by
   * the design system's own definition (DESIGN_SYSTEM.md → Collection header).
   */
  const viewSwitcher = (
    <ViewSwitcher
      options={ANALYTICS_RANGES.map((range) => ({
        value: range.id,
        label: range.label,
        href: rangeHref(range.id),
      }))}
      value={data.range}
      label="Analytics range"
    />
  );

  /*
   * The shared `CollectionLayout`, even though Analytics collects no records.
   *
   * PX-02's scaffold is not "a list of cards" — it is a pane-filling surface with
   * a sticky header, correct scroll ownership within the pane, the one collection
   * header anatomy, and error/empty slots the caller cannot forget to wire.
   * Analytics wants all four, and Views (which is also not a record collection)
   * already reaches for it for the same reason. Building a private header here
   * would have meant a second sticky implementation and a second scroll owner for
   * one screen.
   *
   * The DASHBOARD measure (POLISH-02), because this page is two wide panels and a
   * figure row rather than a column of records.
   */
  return (
    <CollectionLayout
      className="dh-analytics dh-collection--dashboard"
      title="Analytics"
      headingLevel={1}
      subtitle={data.rangeLabel}
      viewSwitcher={viewSwitcher}
      error={
        data.failed ? (
          <EmptyState
            title="We couldn’t read your history"
            description="The Activity history behind these figures could not be read just now. Nothing in your workspace has changed — try again in a moment."
          />
        ) : undefined
      }
      isEmpty={model.isEmpty}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="Nothing completed in this period"
          description="Analytics reads what you have actually finished. Complete a Task, or widen the range, and the shape of your effort appears here."
          primaryAction={
            <Link className="dh-btn dh-btn--primary" to="/tasks">
              Open Tasks
            </Link>
          }
        />
      }
    >
      <div className="dh-analytics__body">
        <MetricRow model={model} />
        <div className="dh-analytics__panels">
          <TrendPanel data={data} />
          <DistributionPanel model={model} />
        </div>
        {model.notes.length > 0 ? (
          <aside
            className="dh-analytics__notes"
            aria-label="About these figures"
          >
            {model.notes.map((note) => (
              <p key={note} className="dh-analytics__note">
                {note}
              </p>
            ))}
          </aside>
        ) : null}
      </div>
    </CollectionLayout>
  );
}

/**
 * The metric row.
 *
 * Each figure is a LINK to the records behind it, which is the whole difference
 * between an analytics screen and a dashboard: a number the owner cannot check
 * is a number they have to trust, and DalyHub does not ask to be trusted.
 *
 * The comparison sentence is a full sentence, not an arrow and a percentage. "6
 * more than the previous period (18)" is checkable; "+33%" is a figure whose
 * base is invisible, and from a base of zero it is not a figure at all — which
 * is why the evaluator returns "No Tasks in the previous period" for that case
 * rather than inventing one.
 */
function MetricRow({ model }: { readonly model: AnalyticsModel }) {
  return (
    <ul className="dh-analytics__metrics" aria-label="This period">
      {model.metrics.map((metric) => (
        <li key={metric.id} className="dh-analytics__metric">
          <p className="dh-analytics__metric-label">{metric.label}</p>
          <p
            className="dh-analytics__metric-value"
            data-testid={`analytics-metric-${metric.id}`}
          >
            {metric.value === null ? (
              <span className="dh-analytics__metric-absent">Not available</span>
            ) : metric.to ? (
              <Link className="dh-analytics__metric-link" to={metric.to}>
                {metric.value}
                <span className="dh-visually-hidden">
                  {` ${metric.label.toLocaleLowerCase()} — open`}
                </span>
              </Link>
            ) : (
              metric.value
            )}
          </p>
          <p className="dh-analytics__metric-supporting">{metric.supporting}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The completion trend.
 *
 * The shared `TrendLine`, with no target and no baseline — an Analytics series
 * has neither, and `scaleToTarget={false}` keeps the plot scaled to the readings
 * as it must be when there is nothing to reach. Two buckets is the minimum a
 * line means anything at, which every range in the table exceeds; the panel
 * still guards it rather than drawing a dot and calling it a trend.
 */
function TrendPanel({ data }: { readonly data: AnalyticsPageData }) {
  const { model } = data;
  const points: TrendLinePoint[] = model.series.map((point, index) => ({
    key: point.key,
    date: data.bucketDates[index] ?? data.bucketDates[0] ?? "",
    value: point.tasksCompleted,
  }));
  const values = points.map((point) => point.value);
  const high = values.length > 0 ? Math.max(...values) : 0;
  const low = values.length > 0 ? Math.min(...values) : 0;
  const total = values.reduce((sum, value) => sum + value, 0);

  const summary =
    points.length < 2
      ? "Not enough of this period has passed to show a trend."
      : `Tasks completed across ${points.length} periods, ${total} in total. ${model.series
          .map(
            (point, index) =>
              `${data.bucketLabels[index]}: ${point.tasksCompleted}`,
          )
          .join("; ")}.`;

  return (
    <DashboardCard title="Completion trend" density="standard">
      {points.length < 2 ? (
        <p className="dh-analytics__absent">{summary}</p>
      ) : (
        <TrendLine
          points={points}
          summary={summary}
          scaleToTarget={false}
          startLabel={data.bucketLabels[0] ?? ""}
          endLabel={data.bucketLabels[data.bucketLabels.length - 1] ?? ""}
          lowLabel={`${low} completed`}
          highLabel={`${high} completed`}
          describePoint={(point) => {
            const index = model.series.findIndex(
              (entry) => entry.key === point.key,
            );
            const label = index >= 0 ? data.bucketLabels[index] : "";
            return `${point.value} completed — ${label}`;
          }}
          data-testid="analytics-trend"
        />
      )}
    </DashboardCard>
  );
}

/**
 * Where the completed work landed.
 *
 * Horizontal proportion bars in each Area's OWN identity accent (D22) — the same
 * rank its row in `/areas` and its Projects' marks already use, so the panel is
 * recognisable as the Areas the owner knows rather than as an arbitrary palette.
 * Every bar carries its count and its share as text beside it, so the colour is
 * never the signal.
 *
 * The total beneath is the ATTRIBUTED count, not the range's task total, and it
 * says so: a Task completed outside any Area is real work and simply has no bar
 * to sit in, which is a different statement from "you did less than you think".
 */
function DistributionPanel({ model }: { readonly model: AnalyticsModel }) {
  if (model.distribution.length === 0) {
    return (
      <DashboardCard title="Where the work landed" density="standard">
        <p className="dh-analytics__absent">
          None of this period’s completed work rolled up to an Area. Put a Task
          in a Project, or a Project in an Area, and it appears here.
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Where the work landed"
      supporting={`${model.distributionTotal} attributed`}
      density="standard"
    >
      <ul className="dh-analytics__split" aria-label="Completed work by Area">
        {model.distribution.map((row) => (
          <li key={row.areaId} className="dh-analytics__split-row">
            <Link className="dh-analytics__split-name" to={row.to}>
              {row.title}
            </Link>
            <span
              className="dh-analytics__split-track"
              data-accent={
                row.colourRank === null
                  ? undefined
                  : String(areaAccentForRank(row.colourRank))
              }
              role="img"
              aria-label={`${row.title}: ${row.tasksCompleted} of ${model.distributionTotal} attributed Tasks, ${row.percent}%`}
            >
              <span
                className="dh-analytics__split-fill"
                style={{ inlineSize: `${Math.max(row.percent, 1)}%` }}
              />
            </span>
            <span className="dh-analytics__split-figure">
              {row.tasksCompleted}
              <span className="dh-analytics__split-percent">
                {row.percent}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
