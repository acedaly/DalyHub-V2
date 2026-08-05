/**
 * AI-01 shared — the reusable AI surface chrome.
 *
 * One set of components renders every AI state in every module, so Meetings,
 * Notes, the Weekly Review and Ask DalyHub behave identically: the same
 * disclosure before a run, the same progress announcement, the same citation
 * card, the same calm refusal copy, the same secondary cost detail.
 *
 * Accessibility contract, stated once and used everywhere:
 *   - progress is `role="status"` (polite) — a running request is not an alert;
 *   - only a BLOCKING failure uses `role="alert"`;
 *   - every control is a real button or input with an accessible name;
 *   - citations are ordinary links, so they open with the keyboard and open in
 *     place without discarding a pending proposal.
 *
 * No provider text is ever rendered. Prose from a model is rendered as PLAIN
 * TEXT — React escapes it — and no second Markdown renderer is introduced.
 */

import { formatUsd, privacyCategoryLabel } from "~/kernel/ai";

import type {
  AiCitation,
  AiDetail,
  AiDisclosure,
  AiSurfaceState,
} from "./ai-view";

/** The polite progress line shown while a request is in flight. */
export function AiProgress({
  label,
  onCancel,
}: {
  readonly label: string;
  readonly onCancel?: () => void;
}) {
  return (
    <div className="dh-ai__progress">
      {/*
        Plain text, not a streamed structure: DalyHub does not stream unvalidated
        JSON into the interface. The owner sees honest progress; the result
        appears once it has been validated.
      */}
      <p className="dh-ai__progress-text" role="status">
        {label}
      </p>
      {onCancel ? (
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

/** A blocking failure. The only place `role="alert"` is used. */
export function AiFailure({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="dh-ai__failure" role="alert">
      <p className="dh-ai__failure-text">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** The calm explanation for each non-error unavailable state. */
export function AiUnavailable({ state }: { readonly state: AiSurfaceState }) {
  const copy = unavailableCopy(state);
  if (copy === null) return null;
  return (
    <div className="dh-ai__unavailable">
      <p className="dh-ai__unavailable-text">{copy.text}</p>
      {copy.href ? (
        <a className="dh-btn dh-btn--ghost" href={copy.href}>
          {copy.action}
        </a>
      ) : null}
    </div>
  );
}

function unavailableCopy(
  state: AiSurfaceState,
): { text: string; action: string; href: string | null } | null {
  switch (state.kind) {
    case "disabled":
      return {
        text: "AI assistance is turned off. Everything else in DalyHub works exactly as it does now.",
        action: "Open AI settings",
        href: "/settings?section=ai",
      };
    case "unconfigured":
      return {
        text: "No AI provider is configured. AI assistance needs your own Anthropic or OpenAI developer account, set up as a server secret.",
        action: "Open AI settings",
        href: "/settings?section=ai",
      };
    case "feature_blocked":
      return {
        text: "This AI feature is turned off for your workspace.",
        action: "Open AI settings",
        href: "/settings?section=ai",
      };
    case "budget_exhausted":
      return {
        text: "The AI budget for this period is used up. Nothing else is affected — you can raise the budget deliberately in Settings.",
        action: "Open AI settings",
        href: "/settings?section=ai",
      };
    default:
      return null;
  }
}

/** The pre-run disclosure: exactly what will be sent, and what was left out. */
export function AiEvidenceDisclosure({
  summary,
  disclosure,
}: {
  readonly summary: string;
  readonly disclosure?: AiDisclosure;
}) {
  return (
    <div className="dh-ai__disclosure">
      <p className="dh-ai__disclosure-text">{summary}</p>
      {disclosure?.truncated ? (
        <p className="dh-ai__disclosure-note">
          Not every matching record was included. Narrow the range for a more
          complete answer.
        </p>
      ) : null}
      {disclosure && disclosure.excludedCategories.length > 0 ? (
        <p className="dh-ai__disclosure-note">
          Left out because you haven’t allowed{" "}
          {disclosure.excludedCategories.map(privacyCategoryLabel).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The citation card. It shows what a citation must show: module/type, title,
 * date, a short excerpt and a link that opens the canonical record.
 */
export function AiCitationList({
  citations,
  ids,
}: {
  readonly citations: readonly AiCitation[];
  readonly ids: readonly string[];
}) {
  const matched = ids
    .map((id) => citations.find((citation) => citation.id === id))
    .filter((citation): citation is AiCitation => citation !== undefined);
  if (matched.length === 0) return null;
  return (
    <ul className="dh-ai__citations">
      {matched.map((citation) => (
        <li key={citation.id} className="dh-ai__citation">
          <span className="dh-ai__citation-kind">{citation.kind}</span>
          {citation.href ? (
            <a className="dh-ai__citation-link" href={citation.href}>
              {citation.title}
            </a>
          ) : (
            <span className="dh-ai__citation-link">{citation.title}</span>
          )}
          {citation.date ? (
            <time className="dh-ai__citation-date" dateTime={citation.date}>
              {citation.date}
            </time>
          ) : null}
          <span className="dh-ai__citation-excerpt">{citation.excerpt}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The secondary cost/provenance disclosure.
 *
 * It labels the three cost facts SEPARATELY and never claims to know the
 * provider's charge: an estimate is an estimate, a token count is what the
 * provider reported, and a reconciled figure is DalyHub's arithmetic over that
 * count at the recorded price version.
 */
export function AiRunDetails({ detail }: { readonly detail: AiDetail }) {
  return (
    <details className="dh-ai__details">
      <summary className="dh-ai__details-summary">
        {detail.reused
          ? "Reused an earlier answer — details"
          : "Provider, model and cost"}
      </summary>
      <dl className="dh-ai__details-list">
        <div>
          <dt>Provider</dt>
          <dd>{detail.provider}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>
            {detail.modelLabel} ({detail.tier})
          </dd>
        </div>
        <div>
          <dt>Prompt version</dt>
          <dd>{detail.promptVersion}</dd>
        </div>
        <div>
          <dt>Estimated before running</dt>
          <dd>{formatUsd(detail.estimatedUsd)}</dd>
        </div>
        <div>
          <dt>Provider-reported tokens</dt>
          <dd>
            {detail.inputTokens ?? "—"} in / {detail.outputTokens ?? "—"} out
          </dd>
        </div>
        <div>
          <dt>Reconciled estimated cost</dt>
          <dd>
            {formatUsd(detail.reconciledUsd)} (prices dated{" "}
            {detail.pricingVersion})
          </dd>
        </div>
        <div>
          <dt>Records sent</dt>
          <dd>
            {detail.evidenceCount}
            {detail.evidenceTruncated ? " (some were left out)" : ""}
          </dd>
        </div>
        {detail.usedFallback ? (
          <div>
            <dt>Fallback</dt>
            <dd>
              The first provider didn’t answer, so the other configured provider
              was used.
            </dd>
          </div>
        ) : null}
        {detail.reused && detail.generatedAt ? (
          <div>
            <dt>Originally generated</dt>
            <dd>{detail.generatedAt}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

/** The standing caution shown wherever content leaves DalyHub. */
export function AiSendNotice({ children }: { readonly children?: string }) {
  return (
    <p className="dh-ai__notice">
      {children ??
        "This sends the selected DalyHub content to your configured AI provider. Only send information you are permitted to share with them."}
    </p>
  );
}
