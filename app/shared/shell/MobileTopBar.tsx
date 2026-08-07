/**
 * MOBILE-01 — the compact phone top bar.
 *
 * PX-02's phone bar was a hamburger plus the workspace name. With MOBILE-01 the
 * hamburger's job moves to the bottom bar's "More" (a thumb reaches the bottom of
 * a phone; it does not reach the top-left corner one-handed), so the top bar keeps
 * only what genuinely belongs at the top of a phone screen:
 *
 *   - the CURRENT ROUTE's title, which is more useful than repeating the workspace
 *     name on every screen (PRODUCT_EXPERIENCE: content before chrome);
 *   - a contextual Back control where the route has a parent;
 *   - Search, the one destination that must stay within two taps everywhere;
 *   - a slot for the route's contextual overflow actions.
 *
 * It is deliberately SHORT: one 44px row plus the safe-area inset, so the record
 * or list below it owns the viewport. Routes publish their title and actions
 * through {@link MobileTopBarContext}; a route that publishes nothing falls back to
 * the workspace name, so the bar is never empty or mislabelled.
 */

import { useRef } from "react";
import { useNavigate } from "react-router";

import { PRODUCT_NAME } from "~/shared/brand";
import { BrandMark, ChevronRightIcon, SearchIcon } from "~/shared/icons";
import { Tooltip, composeRefs } from "~/shared/tooltip";

import { useMobileTopBar } from "./mobile-top-bar-context";

export type MobileTopBarProps = {
  /** The fallback title when the route publishes none. */
  readonly workspaceName: string;
  /** Open global Search (DS-08). */
  readonly onOpenSearch: (opener: HTMLElement) => void;
};

export function MobileTopBar({
  workspaceName,
  onOpenSearch,
}: MobileTopBarProps) {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLButtonElement>(null);
  const { title, backTo, actions } = useMobileTopBar();
  // BRAND-01 — the product name is the floor, never an empty bar. The BRAND
  // itself is carried by the mark below rather than by this label, so a
  // differently-named workspace can still label the fallback state without the
  // phone losing sight of what application it is.
  const fallbackLabel = workspaceName.trim() || PRODUCT_NAME;

  return (
    <header className="dh-mobilebar">
      {/* M3-TIP — both bar controls are icon-only. A phone has no hover, so the
       * tooltip earns its place here on `:focus-visible` instead: an external
       * keyboard on a tablet-width window is exactly the case the audit's
       * finding 2 was about. */}
      {backTo !== null ? (
        <Tooltip label="Back" placement="bottom">
          {(tip) => (
            <button
              type="button"
              ref={tip.ref}
              className="dh-mobilebar__back"
              aria-describedby={tip.describedBy}
              onClick={() => navigate(backTo)}
            >
              <span className="dh-mobilebar__back-icon" aria-hidden="true">
                <ChevronRightIcon />
              </span>
              <span className="dh-visually-hidden">Back</span>
            </button>
          )}
        </Tooltip>
      ) : null}

      {/*
       * NOT a heading. The route below already owns the document's `h1`, and
       * publishing the same text as an `h2` here gave every phone record TWO
       * headings with the same name — a worse outline for a screen reader, and the
       * duplicated title PRODUCT_EXPERIENCE tells us to avoid. This is a chrome
       * label that survives scrolling, so it is plain text.
       */}
      {/* BRAND-01 — the mark appears ONLY in the fallback state, where the bar
       * would otherwise be a bare workspace name. A route that publishes its own
       * title keeps the bar entirely for that title: content before chrome, and
       * a logo repeated on every screen of a 393 px phone is chrome. The mobile
       * navigation sheet carries the full product identity (`SidebarBrand`). */}
      {title === null ? (
        <span className="dh-mobilebar__mark" aria-hidden="true">
          <BrandMark />
        </span>
      ) : null}
      <p className="dh-mobilebar__title">{title ?? fallbackLabel}</p>

      <div className="dh-mobilebar__actions">
        {actions}
        <Tooltip label="Search" shortcut="/" placement="bottom">
          {(tip) => (
            <button
              type="button"
              ref={composeRefs(searchRef, tip.ref)}
              className="dh-mobilebar__action"
              aria-describedby={tip.describedBy}
              onClick={() => {
                if (searchRef.current) {
                  onOpenSearch(searchRef.current);
                }
              }}
            >
              <span aria-hidden="true">
                <SearchIcon />
              </span>
              <span className="dh-visually-hidden">Search</span>
            </button>
          )}
        </Tooltip>
      </div>
    </header>
  );
}
