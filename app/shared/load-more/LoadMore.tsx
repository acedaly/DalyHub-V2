/**
 * A shared "Load more" affordance for keyset-paginated collections.
 *
 * Collections (the Projects grid, a project's Tasks tab) accumulate pages behind
 * an accessible button rather than an infinite scroll or a page-number control.
 * This component owns ONLY the presentation of the four states a paginated fetch
 * moves through — idle (more available), loading, failed (retryable) and
 * exhausted (rendered by the caller simply omitting it). The caller owns the
 * cursor and the fetch; this stays a controlled, stateless button so it is
 * trivially testable and reusable across surfaces.
 *
 * ── UNTITLED-04 ─────────────────────────────────────────────────────────────
 * Adapted from Untitled UI React's `application/pagination` card footer, which
 * is the arrangement its Application UI puts under a paginated collection: a
 * quiet line of status at the leading edge and the forward control at the
 * trailing one. DalyHub keeps its keyset cursor and exposes only the valid
 * FORWARD action rather than inventing page numbers it cannot honour — a keyset
 * cursor has no "page 4".
 *
 * It is the shared Untitled-backed `Button` and announces failures politely
 * (`role="status"`), so a keyboard or screen-reader user learns a load failed
 * and can retry with the same control.
 */

import { Button } from "~/shared/ui";

export interface LoadMoreProps {
  /** True while a page fetch is in flight — disables the button and shows progress. */
  readonly loading: boolean;
  /** True when the last fetch failed — shows a calm message and a retry button. */
  readonly loadFailed: boolean;
  /** Request the next page. */
  readonly onLoadMore: () => void;
  /** Accessible button label (e.g. "Load more projects"). */
  readonly label: string;
}

export function LoadMore({
  loading,
  loadFailed,
  onLoadMore,
  label,
}: LoadMoreProps) {
  return (
    <div
      className="dh-load-more flex w-full flex-col items-center gap-3 pt-4 md:flex-row md:justify-between"
      data-untitled-source="application/pagination:card-minimal"
    >
      {loadFailed ? (
        <p
          className="dh-load-more__error text-sm text-error-primary"
          role="status"
        >
          We couldn’t load more. Please try again.
        </p>
      ) : (
        // The status line is deliberately generic: this component serves eleven
        // collections and must not name any one of their records.
        <p className="text-sm text-tertiary">There is more to load.</p>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={onLoadMore}
        disabled={loading}
        loading={loading}
      >
        {loading ? "Loading…" : loadFailed ? "Try again" : label}
      </Button>
    </div>
  );
}
