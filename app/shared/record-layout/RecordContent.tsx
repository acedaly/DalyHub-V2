/**
 * DS-02 — the state-aware content region.
 *
 * A predictable content container with loading, error and empty slots so every
 * record body handles async state consistently (DESIGN_SYSTEM.md → Loading /
 * Empty States / Error Feedback). Precedence is error → loading → empty →
 * children. Each state has a restrained default that a caller may override.
 *
 * The region is a labelled landmark; the error slot is announced via `role`
 * `alert` and the loading slot marks the region `aria-busy` so assistive tech is
 * kept informed. The default skeleton is opacity/shape only and honours
 * reduced-motion through the DS-01 base styles.
 */

import type { RecordContentProps } from "./types";

function DefaultSkeleton() {
  return (
    <div className="record-skeleton" aria-hidden="true">
      <span className="record-skeleton__line record-skeleton__line--title" />
      <span className="record-skeleton__line" />
      <span className="record-skeleton__line" />
      <span className="record-skeleton__line record-skeleton__line--short" />
    </div>
  );
}

export function RecordContent({
  isLoading = false,
  isEmpty = false,
  error,
  loadingSlot,
  emptySlot,
  errorSlot,
  label = "Content",
  children,
}: RecordContentProps) {
  const hasError = error !== undefined && error !== null && error !== false;

  let body: React.ReactNode;
  let state: "error" | "loading" | "empty" | "ready";

  if (hasError) {
    state = "error";
    body = (
      <div className="record-content__error" role="alert">
        {errorSlot ?? <p className="record-content__error-message">{error}</p>}
      </div>
    );
  } else if (isLoading) {
    state = "loading";
    body = (
      <div className="record-content__loading">
        {loadingSlot ?? <DefaultSkeleton />}
        <span className="record-visually-hidden">Loading…</span>
      </div>
    );
  } else if (isEmpty) {
    state = "empty";
    body = (
      <div className="record-content__empty">
        {emptySlot ?? <p className="muted">Nothing here yet.</p>}
      </div>
    );
  } else {
    state = "ready";
    body = children;
  }

  return (
    <section
      className="record-content"
      aria-label={label}
      aria-busy={state === "loading" ? true : undefined}
      data-state={state}
    >
      {body}
    </section>
  );
}
