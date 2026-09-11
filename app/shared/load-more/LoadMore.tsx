/**
 * A shared "Load more" affordance for keyset-paginated collections.
 *
 * Collections (the Projects grid, a project's Tasks tab) accumulate pages behind an
 * accessible button rather than an infinite scroll or a page-number control. This
 * component owns ONLY the presentation of the four states a paginated fetch moves
 * through — idle (more available), loading, failed (retryable) and exhausted
 * (rendered by the caller simply omitting it). The caller owns the cursor and the
 * fetch; this stays a controlled, stateless button so it is trivially testable and
 * reusable across surfaces.
 *
 * It is the shared `Button` (DS-02) and announces failures politely
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
  /** Use the Untitled pagination-card footer without changing keyset behavior. */
  readonly structure?: "legacy" | "untitled-pagination";
}

export function LoadMore({
  loading,
  loadFailed,
  onLoadMore,
  label,
  structure = "legacy",
}: LoadMoreProps) {
  if (structure === "untitled-pagination") {
    // Adapted from Untitled UI React Pro `PaginationCardMinimal`
    // (https://www.untitledui.com/react/components/pagination), purchased Pro
    // license, retrieved 2026-09-11. DalyHub keeps its keyset cursor and exposes
    // only the valid forward action instead of inventing page numbers.
    return (
      <div
        className="flex w-full flex-col items-center gap-3 border-t border-secondary bg-primary px-4 py-3 md:flex-row md:justify-between md:px-6 md:pt-3 md:pb-4"
        data-untitled-source="application/pagination:card-minimal"
      >
        {loadFailed ? (
          <p className="text-sm text-error-primary" role="status">
            We couldn’t load more. Please try again.
          </p>
        ) : (
          <p className="text-sm text-tertiary">More tasks are available</p>
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

  return (
    <div className="dh-load-more">
      {loadFailed ? (
        <p className="dh-load-more__error" role="status">
          We couldn’t load more. Please try again.
        </p>
      ) : null}
      <Button
        variant="secondary"
        onClick={onLoadMore}
        disabled={loading}
        loading={loading}
      >
        {loading ? "Loading…" : loadFailed ? "Try again" : label}
      </Button>
    </div>
  );
}
