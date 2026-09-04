/**
 * REVIEW-03 — the Review evidence surface.
 *
 * It renders the model `evaluateReviewInsights` produced and computes nothing:
 * no counting, no classifying, no threshold, no wording decision lives in this
 * file. Every label, reason and tone arrives already decided, which is what
 * keeps the rules testable without a browser.
 *
 * ── What it is trying to feel like ──────────────────────────────────────────
 * Evidence for a conversation the owner is having with themselves — not a
 * dashboard. So: five short sections, plain sentences, no nested cards, no
 * metric tiles, no gauges, no colour-coded verdicts about the person. Sections
 * with nothing to say are not rendered at all, because an empty section still
 * costs the reader a glance.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 * One heading level below the surface's own, never skipping. Tone is always
 * paired with words (`Moving`, `At risk → On track`, `overdue`), so nothing is
 * carried by colour. Every claim links to the records behind it using ordinary
 * links to existing destinations — the Review builds no parallel record
 * browser. The trend's numbers are text as well as bars.
 */

import { Link } from "react-router";

import type {
  GoalContributionInsight,
  Insight,
  InsightLink,
  PeriodPlanInsight,
  ProjectChangeInsight,
  ReviewInsights,
} from "~/kernel/review-insights";
import { TrendBars } from "~/shared/charts";

export interface ReviewInsightsPanelProps {
  readonly insights: ReviewInsights;
  /** The heading level the sections use. The caller owns the outline. */
  readonly headingLevel?: 2 | 3 | 4;
  /** Rendered above the sections. The caller decides whether the surface is
   * introduced at all — the record's tab needs no title, the guided step does. */
  readonly title?: string;
}

function Section({
  id,
  heading,
  headingLevel,
  children,
}: {
  readonly id: string;
  readonly heading: string;
  readonly headingLevel: 2 | 3 | 4;
  readonly children: React.ReactNode;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className="dh-insights__section" data-section={id}>
      <Heading className="dh-insights__section-heading">{heading}</Heading>
      {children}
    </section>
  );
}

function InsightLinks({ links }: { readonly links: readonly InsightLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="dh-insights__links">
      {links.map((link) => (
        <li key={`${link.to}:${link.label}`}>
          <Link to={link.to}>{link.label}</Link>
        </li>
      ))}
    </ul>
  );
}

function InsightRow({ insight }: { readonly insight: Insight }) {
  return (
    <li className="dh-insights__item" data-tone={insight.tone}>
      <p className="dh-insights__claim">{insight.label}</p>
      <p className="dh-insights__reason">{insight.reason}</p>
      <InsightLinks links={insight.links} />
    </li>
  );
}

function GoalRow({ goal }: { readonly goal: GoalContributionInsight }) {
  return (
    <li className="dh-insights__item" data-tone={goal.tone}>
      <p className="dh-insights__claim">
        <Link to={`/goals/${goal.goalId}`}>{goal.title}</Link>{" "}
        <span className="dh-insights__pill" data-tone={goal.tone}>
          <span className="dh-insights__dot" aria-hidden="true" />
          {goal.label}
        </span>
      </p>
      <p className="dh-insights__reason">{goal.reason}</p>
    </li>
  );
}

function ProjectChangeRow({
  change,
}: {
  readonly change: ProjectChangeInsight;
}) {
  return (
    <li className="dh-insights__item" data-tone={change.tone}>
      <p className="dh-insights__claim">
        <Link to={`/projects/${change.projectId}`}>{change.title}</Link>{" "}
        <span className="dh-insights__pill" data-tone={change.tone}>
          <span className="dh-insights__dot" aria-hidden="true" />
          {change.label}
        </span>
      </p>
      <p className="dh-insights__reason">{change.reason}</p>
    </li>
  );
}

/**
 * FOLLOW-01 — the period's plan account.
 *
 * A sentence, the lines behind it, and the Tasks behind those. Not a table of
 * nine rows, not a tile grid and not a percentage: the counts carry their own
 * denominator in the sentence above them, which is the only form [ADR-110]
 * permits. It computes nothing — every string arrives already decided by the
 * shared derivation `/plan` reads.
 */
function PlanAccountSection({
  account,
}: {
  readonly account: PeriodPlanInsight;
}) {
  return (
    <div className="dh-insights__account" data-testid="review-plan-account">
      <p className="dh-insights__claim" data-testid="review-plan-headline">
        {account.headline}
      </p>
      {account.movement === null ? null : (
        <p className="dh-insights__reason" data-testid="review-plan-movement">
          {account.movement}
        </p>
      )}
      {account.facts.length === 0 ? null : (
        <dl className="dh-insights__figures">
          {account.facts.map((fact) => (
            <div className="dh-insights__figure" key={fact.key}>
              <dt className="dh-insights__figure-label">{fact.label}</dt>
              <dd
                className="dh-insights__figure-value"
                data-account-fact={fact.key}
              >
                {fact.count}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {account.entries.length === 0 ? null : (
        <ul className="dh-insights__list">
          {account.entries.map((entry) => (
            <li
              className="dh-insights__item"
              key={entry.taskId}
              data-outcome={entry.outcome}
            >
              <p className="dh-insights__claim">
                <Link to={entry.link.to}>{entry.title}</Link>
              </p>
              <p className="dh-insights__reason">{entry.reason}</p>
            </li>
          ))}
        </ul>
      )}
      {account.note === null ? null : (
        <p className="dh-insights__note">{account.note}</p>
      )}
    </div>
  );
}

export function ReviewInsightsPanel({
  insights,
  headingLevel = 3,
  title,
}: ReviewInsightsPanelProps) {
  const Heading =
    `h${(headingLevel - 1 > 1 ? headingLevel - 1 : 2) as 2 | 3}` as const;

  /*
   * Absence renders less. When the whole surface has nothing, it says one
   * sentence — not five headings over five empty lists, and never a row of
   * zeros pretending to be a measurement.
   */
  if (insights.isEmpty) {
    return (
      <div className="dh-insights" data-empty="true">
        {title ? (
          <Heading className="dh-insights__title">{title}</Heading>
        ) : null}
        <p className="dh-insights__note">
          {insights.comparison.kind === "first_review"
            ? "This is your first Review, so there is nothing to compare against yet. Once you complete it, the next Review will be able to show what changed."
            : "Nothing was recorded for this period, so there is no evidence to show. Your own reflection below is the Review."}
        </p>
      </div>
    );
  }

  return (
    <div className="dh-insights">
      {title ? <Heading className="dh-insights__title">{title}</Heading> : null}

      {insights.planAccount === null ? null : (
        <Section
          id="plan"
          heading="The week you planned"
          headingLevel={headingLevel}
        >
          <PlanAccountSection account={insights.planAccount} />
        </Section>
      )}

      {insights.movement.length > 0 ? (
        <Section
          id="movement"
          heading="What changed"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.movement.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.goalContribution.length > 0 ? (
        <Section
          id="goals"
          heading="Where the work contributed"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.goalContribution.map((goal) => (
              <GoalRow key={goal.goalId} goal={goal} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.projectChanges.length > 0 ? (
        <Section
          id="health"
          heading="How Project health moved"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.projectChanges.map((change) => (
              <ProjectChangeRow key={change.projectId} change={change} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.attention.length > 0 ? (
        <Section
          id="attention"
          heading="What needs attention"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.attention.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.distribution.length > 0 ? (
        <Section
          id="distribution"
          heading="Where effort landed"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.distribution.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.habits === null ? null : (
        <Section id="habits" heading="Routines" headingLevel={headingLevel}>
          <ul className="dh-insights__list">
            <InsightRow insight={insights.habits} />
          </ul>
        </Section>
      )}

      {insights.acrossReviews.length > 0 ? (
        <Section
          id="across"
          heading="Across recent Reviews"
          headingLevel={headingLevel}
        >
          <ul className="dh-insights__list">
            {insights.acrossReviews.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </Section>
      ) : null}

      {insights.trends.length > 0 ? (
        <Section
          id="trend"
          heading="Over recent Reviews"
          headingLevel={headingLevel}
        >
          <div className="dh-insights__trends">
            {insights.trends.map((trend) => (
              <figure className="dh-insights__trend" key={trend.id}>
                <figcaption className="dh-insights__trend-label">
                  {trend.label}
                </figcaption>
                <TrendBars
                  points={trend.points.map((point) => ({
                    key: point.key,
                    // The axis gets the short form; the summary beneath it —
                    // which is the authoritative reading — keeps the full one.
                    label: point.shortLabel,
                    value: point.value,
                    current: point.current,
                  }))}
                  summary={trend.summary}
                  // CONVERGE-01 §I — the enumeration stays the announced
                  // description; the printed caption is the shape of the trend.
                  caption={trend.headline}
                />
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {insights.notes.length > 0 ? (
        <div className="dh-insights__notes">
          {insights.notes.map((note) => (
            <p className="dh-insights__note" key={note}>
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
