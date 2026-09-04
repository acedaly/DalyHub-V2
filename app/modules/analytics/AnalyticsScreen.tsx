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

import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import {
  DEFAULT_INSIGHT_WINDOW,
  GRAIN_LABELS,
  GRAIN_NOUNS,
  INSIGHT_WINDOWS,
  type AnalyticsModel,
  type InsightWindowId,
} from "~/kernel/analytics";
import { DashboardCard } from "~/shared/card";
import { Sparkline, TrendLine, type TrendLinePoint } from "~/shared/charts";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { areaAccentForRank } from "~/shared/pill";
import { SegmentedFilter } from "~/shared/segmented-filter";
import { Skeleton } from "~/shared/skeleton";
import { ViewSwitcher } from "~/shared/view-switcher";

import { WhatChangedPanel } from "./WhatChangedPanel";
import type { AnalyticsPageData } from "./analytics-context";

export function AnalyticsScreen({
  data,
}: {
  readonly data: AnalyticsPageData;
}) {
  const [searchParams] = useSearchParams();
  const { model } = data;
  /*
   * PX-06 — the ONE shared collection loading signal.
   *
   * V2.9 INS-03 made the window and the grain real controls, and both are
   * ordinary links, so choosing one is a same-route navigation. Without this the
   * previous window's figures would sit on screen unchanged while the new ones
   * were read, and a 24-month read is the slowest the page has: the owner would
   * be looking at last week's numbers under this week's label.
   */
  const isReloading = useCollectionLoading();

  /*
   * V2.9 INS-03 — the URL IS the configuration (ADR-059's rule), so a view can
   * be shared and comes back identical. Both controls are ordinary links: Back
   * works, and the page works with JavaScript off.
   *
   * Changing the WINDOW drops the grain, because a grain the new window cannot
   * hold would otherwise be silently substituted — the loader would fall back
   * and the URL would keep claiming the grain it is not showing. Dropping it
   * lets the new window's own default answer, and the control says which.
   */
  const windowHref = (id: InsightWindowId) => {
    const next = new URLSearchParams(searchParams);
    next.delete("grain");
    if (id === DEFAULT_INSIGHT_WINDOW) next.delete("window");
    else next.set("window", id);
    const qs = next.toString();
    return qs ? `/analytics?${qs}` : "/analytics";
  };

  /*
   * The window rail is a genuine VIEW switcher, not a filter: exactly one span
   * is always active, and changing it changes what the whole surface is about
   * rather than narrowing a set of records. That is the header's view slot by
   * the design system's own definition (DESIGN_SYSTEM.md → Collection header).
   */
  const viewSwitcher = (
    <ViewSwitcher
      options={INSIGHT_WINDOWS.map((window) => ({
        value: window.id,
        label: window.label,
        href: windowHref(window.id),
      }))}
      value={data.window}
      label="Insight window"
    />
  );

  /*
   * The GRAIN sits beside the chart rather than in the header, at subordinate
   * weight: it changes how the same window is CUT, not what the page is about.
   *
   * It offers only the grains this window can actually hold — computed from the
   * grain maximums, not listed — so a grain the series would have to bound is
   * never offered at all. That is the refusal INS-03 asks for: two years is
   * months only, because 730 days exceeds 366 and 105 weeks exceeds 52.
   */
  const grainControl =
    data.grains.length > 1 ? (
      <SegmentedFilter
        param="grain"
        options={data.grains.map((grain) => ({
          value: grain,
          label: GRAIN_LABELS[grain],
        }))}
        value={data.grain}
        label="Insight grain"
        /*
         * Every grain states itself in the URL, because an ABSENT `?grain=`
         * does not mean the first option — it means "the window's own
         * default", which is weekly for 12 weeks and daily for 4. A "Daily"
         * link that merely dropped the param would do nothing at all on the
         * windows whose default is already daily, and would hand back weekly
         * on the ones where it is not.
         */
        alwaysWriteValue
      />
    ) : null;

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
      isLoading={isReloading}
      loadingSlot={<AnalyticsSkeleton />}
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
          <TrendPanel data={data} grainControl={grainControl} />
          <DistributionPanel model={model} />
          <OverduePanel data={data} />
          <GoalSeriesPanel model={model} />
          {/*
           * V2.9 INS-04 — the events themselves, LAST.
           *
           * The figures above answer "how much"; this answers "what", and it
           * is the conclusion drawn under them rather than the lead. DOM
           * order, so the reading order and the tab order agree with it.
           */}
          <WhatChangedPanel window={data.window} rangeLabel={data.rangeLabel} />
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
function TrendPanel({
  data,
  grainControl,
}: {
  readonly data: AnalyticsPageData;
  readonly grainControl: ReactNode;
}) {
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

  /*
   * The chart's own text form, and the only place the FULL bucket labels are
   * spelled out. The axis takes the short form (see `bucketShortLabels`), so the
   * plot carries one line of caption rather than three.
   *
   * CONVERGE-01 §I — it is now split in two, and the split is the fix.
   *
   * `summary` is the ACCESSIBLE description: every bucket, every reading, which
   * is exactly what a screen reader needs and what makes the chart usable
   * without seeing it. It was also being PRINTED under the plot, so a 12-week
   * range drew a paragraph enumerating twelve readings the axis beneath it
   * already showed — Analytics communicating its own accessibility rather than
   * its data, which is the audit's phrasing and is fair.
   *
   * `caption` is the visible line: the headline the enumeration opens with. The
   * long form stays in the document, visually hidden, so nothing is taken from
   * anyone.
   */
  const noun = GRAIN_NOUNS[model.grain];
  // V2.9 INS-03 — every figure names its window AND its grain, so a
  // Saturday-to-Friday week is stated rather than implied.
  const headline =
    points.length < 2
      ? "Not enough of this period has passed to show a trend."
      : `Tasks completed across ${points.length} ${noun}s, ${total} in total.`;
  /*
   * V2.9 INS-03 — the Projects and Goals lines, under the Tasks trend.
   *
   * Three series on one plot would need a legend, three colours and a key, and
   * the two smaller ones are almost always near-flat beside a Task count an
   * order of magnitude larger — a shared axis would flatten them into the
   * baseline and say nothing. So each gets the design system's compact
   * primitive with its FIGURES in words beside it, which is the same rule the
   * Goals panel follows and the one `Sparkline` itself records.
   *
   * A series with no completions at all is not drawn: absence renders less
   * (ADR-079 d8), and a flat line at zero is a shape asserting nothing
   * happened in a way a missing row says better.
   */
  const secondary = (
    [
      ["Projects completed", "projectsCompleted"],
      ["Goals completed", "goalsCompleted"],
    ] as const
  ).flatMap(([label, key]) => {
    const values = model.series.map((point) => point[key]);
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total === 0) return [];
    return [
      {
        label,
        total,
        points: model.series.map((point, index) => ({
          key: point.key,
          date: data.bucketDates[index] ?? data.bucketDates[0] ?? "",
          value: point[key],
        })),
      },
    ];
  });
  const summary =
    points.length < 2
      ? headline
      : `${headline} ${model.series
          .map(
            (point, index) =>
              `${data.bucketLabels[index]}: ${point.tasksCompleted}`,
          )
          .join("; ")}.`;

  return (
    <DashboardCard
      title="Completion trend"
      density="standard"
      headerAction={grainControl}
    >
      {points.length < 2 ? (
        <p className="dh-analytics__absent">{headline}</p>
      ) : (
        <TrendLine
          points={points}
          summary={summary}
          caption={headline}
          scaleToTarget={false}
          startLabel={data.bucketShortLabels[0] ?? ""}
          endLabel={
            data.bucketShortLabels[data.bucketShortLabels.length - 1] ?? ""
          }
          lowLabel={`${low} Tasks`}
          highLabel={`${high} Tasks`}
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
      {secondary.length > 0 ? (
        <ul className="dh-analytics__secondary" aria-label="Also completed">
          {secondary.map((entry) => (
            <li key={entry.label} className="dh-analytics__secondary-row">
              <span className="dh-analytics__secondary-label">
                {entry.label}
              </span>
              <Sparkline points={entry.points} />
              <span className="dh-analytics__secondary-figure">
                {entry.total}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardCard>
  );
}

/**
 * CONVERGE-01 §8 — the backlog, and which way it is going.
 *
 * The audit's finding is blunt and correct: the workspace's defining fact is its
 * overdue backlog, and this screen reported nothing about it. Four figures said
 * what had been finished; none said what had not.
 *
 * ── Why a second line chart, and not a second number ────────────────────────
 * "43 overdue" is a fact an owner can already get from `/tasks`. What they
 * cannot get anywhere is whether that 43 is the top of a climb or the bottom of
 * one — and that is the difference between a workspace that needs a triage
 * afternoon and one that is already recovering. The metric card carries the
 * level; this carries the direction, and they are the same series by
 * construction (the card's figure IS the line's last reading).
 *
 * ── Why the chart may shout and the text may not ────────────────────────────
 * The line takes the status ramp's `warning`, because a backlog genuinely IS a
 * status statement and DalyHub has one vocabulary for those. The supporting
 * sentence beside the figure stays the row's ordinary grey — "4 fewer than the
 * previous period (12)" — because a delta is arithmetic, not a judgement, and
 * "calm over urgent" (AGENTS.md §2) means the product does not manufacture red
 * for a number that went the wrong way by four.
 *
 * The full split CONVERGE-01 §I asks for is kept: the visible caption is one
 * headline line, and the enumeration of every reading is in the document
 * visually hidden, where a screen reader gets it and a sighted reader is not
 * made to read a paragraph the axis already draws.
 */
function OverduePanel({ data }: { readonly data: AnalyticsPageData }) {
  const { model } = data;

  /*
   * A failed read and an empty backlog are the same empty array, and — exactly
   * as with the distribution — they must never be the same sentence. "Nothing is
   * overdue" is the most reassuring thing this screen can say, which is precisely
   * why it must never be said because a query fell over.
   */
  if (!model.overdueAvailable) {
    return (
      <DashboardCard
        className="dh-analytics__overdue"
        title="Overdue"
        density="standard"
      >
        <p className="dh-analytics__absent">
          This panel could not be read just now. Nothing in your workspace has
          changed — the figures above are unaffected.
        </p>
      </DashboardCard>
    );
  }

  const points: TrendLinePoint[] = model.overdueSeries.map((point, index) => ({
    key: point.key,
    date: data.bucketDates[index] ?? data.bucketDates[0] ?? "",
    value: point.overdue,
  }));
  const values = points.map((point) => point.value);
  const high = values.length > 0 ? Math.max(...values) : 0;
  const low = values.length > 0 ? Math.min(...values) : 0;
  const latest = values.length > 0 ? values[values.length - 1] : 0;

  /*
   * A LEVEL has no total, so this headline states the latest reading and the
   * span it was read across — never a sum. Adding six readings of a backlog
   * together would produce a number with no meaning, and the completion trend's
   * "84 in total" is only meaningful because those are flows.
   */
  const headline =
    points.length < 2
      ? "Not enough of this period has passed to show a trend."
      : `${latest} overdue now, read at the close of each of ${points.length} periods.`;
  const summary =
    points.length < 2
      ? headline
      : `${headline} ${model.overdueSeries
          .map(
            (point, index) => `${data.bucketLabels[index]}: ${point.overdue}`,
          )
          .join("; ")}.`;

  return (
    <DashboardCard
      className="dh-analytics__overdue"
      title="Overdue"
      density="standard"
    >
      {points.length < 2 ? (
        <p className="dh-analytics__absent">{headline}</p>
      ) : (
        <TrendLine
          points={points}
          summary={summary}
          caption={headline}
          scaleToTarget={false}
          status="warning"
          startLabel={data.bucketShortLabels[0] ?? ""}
          endLabel={
            data.bucketShortLabels[data.bucketShortLabels.length - 1] ?? ""
          }
          lowLabel={`${low} overdue`}
          highLabel={`${high} overdue`}
          describePoint={(point) => {
            const index = model.overdueSeries.findIndex(
              (entry) => entry.key === point.key,
            );
            const label = index >= 0 ? data.bucketLabels[index] : "";
            return `${point.value} overdue at the close of ${label}`;
          }}
          data-testid="analytics-overdue-trend"
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
  /*
   * A failed read and an empty period are the same empty array, and they must
   * never be the same sentence.
   *
   * "None of this period's completed work rolled up to an Area" is a CLAIM about
   * the workspace. Saying it because a query fell over is the module's own
   * "failure is said, not zeroed" rule broken in the easiest place to break it —
   * the owner would go looking for a structural problem that does not exist.
   */
  if (!model.distributionAvailable) {
    return (
      <DashboardCard title="Where the work landed" density="standard">
        <p className="dh-analytics__absent">
          This panel could not be read just now. Nothing in your workspace has
          changed — the figures above are unaffected.
        </p>
      </DashboardCard>
    );
  }
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

/**
 * V2.9 INS-03 — a compact series for every measured Goal (DEBT-212's caller).
 *
 * A sparkline beside the Goal's name, linking to its record where the full
 * chart lives. It is `aria-hidden` by design — the one chart in DalyHub that
 * is — because it always sits beside the same figures in text, which is the
 * rule `Sparkline` itself records.
 *
 * A Goal with fewer than two readings never reaches here: the loader drops it,
 * because drawing one point as a line asserts a shape it does not have.
 */
function GoalSeriesPanel({ model }: { readonly model: AnalyticsModel }) {
  if (!model.measuredGoalsAvailable) {
    return (
      <DashboardCard
        className="dh-analytics__goals-panel"
        title="Measured Goals"
        density="standard"
      >
        <p className="dh-analytics__absent">
          This panel could not be read just now. Nothing in your workspace has
          changed — the figures above are unaffected.
        </p>
      </DashboardCard>
    );
  }
  if (
    model.measuredGoals.length === 0 &&
    model.goalContributions.length === 0
  ) {
    return (
      <DashboardCard
        className="dh-analytics__goals-panel"
        title="Goals"
        density="standard"
      >
        <p className="dh-analytics__absent">
          No Goal has two readings yet, and your Reviews have not yet recorded
          enough to say how work reached them. Log a measurement on a Goal, or
          complete another Review, and its shape appears here.
        </p>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      className="dh-analytics__goals-panel"
      title="Goals"
      supporting={
        model.measuredGoals.length > 0
          ? `${model.measuredGoals.length} measured`
          : undefined
      }
      density="standard"
    >
      <ul className="dh-analytics__goals" aria-label="Goals">
        {model.measuredGoals.map((goal) => {
          const first = goal.points[0];
          const last = goal.points[goal.points.length - 1];
          return (
            <li key={goal.goalId} className="dh-analytics__goal">
              <Link className="dh-analytics__goal-name" to={goal.to}>
                {goal.title}
              </Link>
              <Sparkline points={goal.points} />
              {/*
               * The reading, in words, beside the shape — so the sparkline is
               * decoration over a fact rather than the fact itself. The bound
               * is said where it applies: a compact series is a recent shape.
               */}
              <span className="dh-analytics__goal-reading">
                {`${first.value} → ${last.value}`}
                <span className="dh-analytics__goal-window">
                  {goal.bounded
                    ? `${goal.points.length} most recent readings`
                    : `${goal.points.length} readings`}
                </span>
              </span>
            </li>
          );
        })}
        {/*
         * A Goal with no measurement, after every measured one — the shapes
         * read as a group, and a sentence between two sparklines breaks the
         * comparison they exist for. Its reading is the Reviews' own words and
         * names its own window, so the two kinds of row are never mistaken for
         * each other.
         */}
        {model.goalContributions.map((goal) => (
          <li key={goal.goalId} className="dh-analytics__goal">
            <Link className="dh-analytics__goal-name" to={goal.to}>
              {goal.title}
            </Link>
            <span className="dh-analytics__goal-reading dh-analytics__goal-reading--wide">
              {goal.reading}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

/**
 * The Insight page's own loading shape (PX-02 → Loading).
 *
 * The shared `CollectionSkeleton` draws a column of record cards, which is the
 * wrong shape here: this surface is a figure row above two wide panels, and a
 * ghost that promises a list and resolves into panels is a worse answer than
 * no ghost at all. Same skeleton PRIMITIVE, laid out as what actually arrives.
 */
function AnalyticsSkeleton() {
  return (
    <div className="dh-analytics__body" aria-hidden="true">
      <ul className="dh-analytics__metrics">
        {[0, 1, 2, 3].map((index) => (
          <li key={index} className="dh-analytics__metric">
            <Skeleton width="5rem" height="0.75rem" />
            <Skeleton width="3rem" height="1.75rem" />
            <Skeleton width="80%" height="0.75rem" />
          </li>
        ))}
      </ul>
      <div className="dh-analytics__panels">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="dh-analytics__panel-skeleton">
            <Skeleton width="8rem" height="0.875rem" />
            <Skeleton width="100%" height="9rem" />
          </div>
        ))}
      </div>
    </div>
  );
}
