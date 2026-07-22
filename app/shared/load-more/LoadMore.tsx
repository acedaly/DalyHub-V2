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
 * It is built from the shared button styles (`dh-btn`) and announces failures
 * politely (`role="status"`), so a keyboard or screen-reader user learns a load
 * failed and can retry with the same control.
 */

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
    <div className="dh-load-more">
      {loadFailed ? (
        <p className="dh-load-more__error" role="status">
          We couldn&rsquo;t load more. Please try again.
        </p>
      ) : null}
      <button
        type="button"
        className="dh-btn dh-btn--secondary"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? "Loading…" : loadFailed ? "Try again" : label}
      </button>
    </div>
  );
}
