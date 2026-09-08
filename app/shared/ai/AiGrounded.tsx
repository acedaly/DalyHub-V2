/**
 * V2.14 GROUND-03 shared — the grounded explanation surface.
 *
 * ## The report stays primary; this is an interpretation layer
 *
 * Everything here renders BESIDE the deterministic figures the owner is already
 * looking at, never instead of them. The structure is the same on every
 * grounded surface, so learning it once is learning it everywhere:
 *
 *     Answer        the explanation, in prose
 *     Facts used    the figures DalyHub calculated, expandable
 *     Check it      links back to the records and Reports behind them
 *
 * ## What is rendered, and by whom
 *
 * **DalyHub renders every figure.** The model's contract has no numeric field;
 * a `Fact`'s `display` is DalyHub's own formatting of its own value, and that is
 * what appears in a chip. The model's prose is rendered as PLAIN TEXT — React
 * escapes it — with no Markdown renderer, no raw-HTML escape hatch of any kind,
 * and no anchor built from anything a model wrote. A citation becomes a link
 * only because the FACT carried a reference DalyHub built from an id it already
 * held.
 *
 * ## Accessibility
 *
 * The answer is a labelled region; the facts are a `<details>` the owner opens,
 * so a screen reader is not walked through two dozen figures to reach the
 * sentence about them; every citation chip carries the fact's label and its
 * value in its accessible name, so "F3" is never the whole of what is announced.
 */

import type { Fact, FactBlock } from "~/kernel/ai";

import { citedFacts } from "./ai-view";

/* -------------------------------------------------------------------------- */
/* Facts                                                                       */
/* -------------------------------------------------------------------------- */

/** One fact, as a chip: what it is, what it says, and where to check it. */
function FactChip({ fact }: { readonly fact: Fact }) {
  const label = `${fact.label}: ${fact.display}`;
  const body = (
    <>
      <span className="dh-ai-fact__label">{fact.label}</span>
      <span className="dh-ai-fact__value">{fact.display}</span>
    </>
  );
  return fact.reference === null ? (
    <span className="dh-ai-fact" title={label}>
      {body}
    </span>
  ) : (
    <a className="dh-ai-fact dh-ai-fact--link" href={fact.reference.href}>
      {body}
    </a>
  );
}

/** The facts one observation cites, inline beneath it. */
export function AiFactCitations({
  block,
  ids,
}: {
  readonly block: FactBlock | null;
  readonly ids: readonly string[];
}) {
  const facts = citedFacts(block, ids);
  if (facts.length === 0) return null;
  return (
    <ul className="dh-ai-facts__inline" aria-label="Figures behind this">
      {facts.map((fact) => (
        <li key={fact.id}>
          <FactChip fact={fact} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The whole fact block, expandable.
 *
 * It renders whether or not there is an explanation beside it. That is the
 * point: with the provider off, refused, slow or over budget, the owner still
 * has every figure DalyHub would have explained.
 */
export function AiFactList({
  block,
  summary = "Facts used",
  open = false,
}: {
  readonly block: FactBlock | null;
  readonly summary?: string;
  readonly open?: boolean;
}) {
  if (block === null || block.facts.length === 0) return null;
  return (
    <details className="dh-ai-facts" open={open}>
      <summary className="dh-ai-facts__summary">
        {summary} ({block.facts.length})
      </summary>
      <ul className="dh-ai-facts__list">
        {block.facts.map((fact) => (
          <li key={fact.id} className="dh-ai-facts__item">
            <FactChip fact={fact} />
            {fact.period === null ? null : (
              <span className="dh-ai-facts__period">{fact.period.label}</span>
            )}
            {fact.note === null ? null : (
              <span className="dh-ai-facts__note">{fact.note}</span>
            )}
          </li>
        ))}
      </ul>
      {block.bounds.length === 0 ? null : (
        <ul className="dh-ai-facts__bounds">
          {block.bounds.map((bound, index) => (
            <li key={`${bound.code}-${index}`}>{bound.text}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

/**
 * What DalyHub decided on the owner's behalf, where it had to decide.
 *
 * Shown as ordinary prose above the answer rather than hidden behind a
 * disclosure: an answer computed over a period the owner did not name is not a
 * detail, it is the thing they most need to know before reading it.
 */
export function AiAssumptions({
  assumptions,
}: {
  readonly assumptions: readonly string[];
}) {
  if (assumptions.length === 0) return null;
  return (
    <ul className="dh-ai-grounded__assumptions">
      {assumptions.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* The explanation                                                             */
/* -------------------------------------------------------------------------- */

export interface AiGroundedAnswerProps {
  readonly status: "ok" | "insufficient";
  readonly summary: string;
  readonly observations: readonly {
    readonly text: string;
    readonly factIds: readonly string[];
  }[];
  readonly block: FactBlock | null;
  readonly assumptions?: readonly string[];
  /** The region's accessible name — "Explanation", "Answer". */
  readonly label?: string;
}

/** The validated explanation, with its figures beside it. */
export function AiGroundedAnswer({
  status,
  summary,
  observations,
  block,
  assumptions = [],
  label = "Explanation",
}: AiGroundedAnswerProps) {
  return (
    <section className="dh-ai-grounded" aria-label={label}>
      <p className="dh-ask__badge">
        {status === "ok"
          ? "Explained from DalyHub's own figures"
          : "Not enough recorded history to explain this"}
      </p>
      <AiAssumptions assumptions={assumptions} />
      <p className="dh-ask__summary">{summary}</p>
      {observations.length === 0 ? null : (
        <ul className="dh-ai-grounded__observations">
          {observations.map((observation, index) => (
            <li key={index} className="dh-ai-grounded__observation">
              <p className="dh-ask__statement-text">{observation.text}</p>
              <AiFactCitations block={block} ids={observation.factIds} />
            </li>
          ))}
        </ul>
      )}
      <AiFactList block={block} />
    </section>
  );
}

/**
 * The honest state when there is no explanation, and there are still facts.
 *
 * Used for every non-answer: the provider is off, unconfigured, over budget,
 * slow, refused, or answered with something DalyHub would not verify. The
 * sentence differs; the shape does not, and the figures never move.
 */
export function AiFactsWithoutExplanation({
  block,
  message,
  label = "Facts",
}: {
  readonly block: FactBlock | null;
  readonly message: string;
  readonly label?: string;
}) {
  if (block === null || block.facts.length === 0) return null;
  return (
    <section className="dh-ai-grounded" aria-label={label}>
      <p className="dh-ai__unavailable-text">{message}</p>
      <AiFactList block={block} open />
    </section>
  );
}
