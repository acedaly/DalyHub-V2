/**
 * DS-08 Shared Search — the global Search surface (default export, lazy-loaded).
 *
 * A polished, accessible search modal that composes the pure model + controller
 * with the DS-03 modal machinery. It does NOT build a second focus trap, scroll
 * lock or inertness system — it reuses the Drawer's hooks exactly as PX-02's
 * MobileNav does (ADR-020 §20.9). Results open in the existing DS-03 Drawer over
 * their home surface; opening a result preserves unrelated URL state.
 *
 * Accessibility: a WAI-ARIA combobox (textbox) controlling a `listbox` popup, with
 * `aria-activedescendant` tracking the active option, grouped `option`s, a polite
 * status region, and full keyboard operation (↑/↓ wrap, Home/End, Enter, Escape).
 * Highlighting is plain text + `<mark>` — never raw HTML.
 */

import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { TextField as AriaTextField } from "react-aria-components";
import { useLocation, useNavigate } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, getEntityIdentity } from "~/shared/entity";
import { HistoryIcon, InboxIcon, SearchIcon } from "~/shared/icons";
import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";
import { CommandInput } from "~/shared/ui/untitled/application/command-menus/base-components/command-input";
import {
  Button,
  styles as untitledButtonStyles,
} from "~/shared/ui/untitled/base/buttons/button";
import { cx } from "~/shared/ui/untitled/utils/cx";

import { Highlight } from "./HighlightText";
import { SearchSignals } from "./SearchSignals";
import type { SearchFn } from "./client";
import { buildResultDestination, destinationHref } from "./navigation";
import { recordAnchorFromPath } from "./record-anchor";
import { RECENT_GROUP_LABEL } from "./recent-outcome";
import { useSearchController } from "./useSearchController";
import type { RankedSearchResult, SearchResultGroup } from "./types";

export type SearchSurfaceProps = {
  /** Close the surface (restores focus to the opener). */
  readonly onClose: () => void;
  /** The element that opened Search; focus returns here on close. */
  readonly opener: HTMLElement | null;
  /** The search function — defaults to the server transport; injected in tests. */
  readonly search?: SearchFn;
  /** Debounce override (ms) — for demos and tests; defaults to the controller's. */
  readonly debounceMs?: number;
};

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

/** The human label + icon for a group (upgrades entity groups via identity). */
function groupPresentation(group: SearchResultGroup): {
  readonly label: string;
  readonly icon: React.ReactNode;
} {
  // FIND-01's single group heads itself: it is not an entity type and not a
  // module, and `getEntityIdentity` has nothing to say about it.
  if (group.kind === "recent") {
    return { label: RECENT_GROUP_LABEL, icon: <HistoryIcon /> };
  }
  if (group.kind === "entity" && group.entityType !== undefined) {
    const identity = getEntityIdentity(group.entityType);
    if (identity !== null) {
      return {
        label: identity.pluralLabel,
        icon: <EntityIcon type={identity.type} />,
      };
    }
  }
  return { label: group.label, icon: <InboxIcon /> };
}

export default function SearchSurface({
  onClose,
  opener,
  search,
  debounceMs,
}: SearchSurfaceProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // When Search is opened from a record page, boost that record's directly-linked
  // entities. Derived from the current path (the inverse of the canonical record
  // routes); null on a non-record surface, so Search runs unboosted as before.
  const boostLinkedTo = recordAnchorFromPath(location.pathname);
  const controller = useSearchController({
    ...(search ? { search } : {}),
    ...(debounceMs !== undefined ? { debounceMs } : {}),
    ...(boostLinkedTo ? { boostLinkedTo } : {}),
  });

  // The modal ROOT is the inertness exclusion boundary — `useInertBackground`
  // makes every sibling of this node inert. It must be the root (which contains
  // both the scrim and the panel), NOT the inner panel — otherwise the panel's
  // sibling scrim would become inert and stop closing Search on click.
  const modalRootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const titleId = `${baseId}-title`;
  const statusId = `${baseId}-status`;
  const optionId = useCallback(
    (index: number) => `${baseId}-option-${index}`,
    [baseId],
  );

  // Reuse the DS-03 modal primitives — no second implementation (ADR-020 §20.9).
  useBodyScrollLock(true);
  useInertBackground(modalRootRef, true);
  useDrawerFocus({
    containerRef: panelRef,
    active: true,
    initialFocusRef: inputRef,
    closeButtonRef,
    opener,
  });

  const { flatResults, activeIndex } = controller;

  // Map each result's global id to its flat index for aria-activedescendant.
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    flatResults.forEach((result, index) => map.set(result.id, index));
    return map;
  }, [flatResults]);

  const activate = useCallback(
    (result: RankedSearchResult) => {
      const destination = buildResultDestination(result.target, {
        pathname: location.pathname,
        search: location.search,
      });
      navigate(destinationHref(destination), { preventScrollReset: true });
      onClose();
    },
    [location.pathname, location.search, navigate, onClose],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      // FIND-01 — there is no second keyboard model for the recency list. It
      // arrives as ordinary results, so ↑/↓, Home/End and Enter are the SAME
      // code path here as for a query's matches, and it cannot drift from them.
      //
      // Only the CURRENT result set is navigable/activatable. While a new query
      // loads, prior results may be visible but are stale and inert.
      if (!controller.resultsAreCurrent) {
        return;
      }
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          controller.moveDown();
          break;
        case "ArrowUp":
          event.preventDefault();
          controller.moveUp();
          break;
        case "Home":
          if (controller.hasResults) {
            event.preventDefault();
            controller.moveHome();
          }
          break;
        case "End":
          if (controller.hasResults) {
            event.preventDefault();
            controller.moveEnd();
          }
          break;
        case "Enter":
          if (controller.activeResult !== null) {
            event.preventDefault();
            activate(controller.activeResult);
          }
          break;
        default:
          break;
      }
    },
    [activate, controller],
  );

  // Escape closes Search (the top-most surface). A document-level capture
  // listener mirrors the DS-03/MobileNav convention rather than a keydown on a
  // non-interactive element.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, result: RankedSearchResult) => {
      if (isModifiedClick(event)) {
        return; // let the browser follow the real href (new tab, etc.)
      }
      event.preventDefault();
      activate(result);
    },
    [activate],
  );

  const activeDescendant = activeIndex >= 0 ? optionId(activeIndex) : undefined;

  const statusMessage = buildStatusMessage(controller);
  const handleQueryChange = useCallback(
    (value: string) => {
      controller.setQuery(value);
    },
    [controller],
  );

  return (
    <div
      className="dh-search fixed inset-0 z-[var(--dh-layer-modal)] flex flex-col items-center overflow-y-auto bg-overlay/70 p-4 text-center backdrop-blur md:pt-16 xl:pt-[clamp(64px,10vh,243px)]"
      role="presentation"
      ref={modalRootRef}
      data-untitled-source="command-menu"
    >
      <div
        className="dh-search__scrim dh-motion-scrim fixed inset-0 cursor-default border-0 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="dh-search__panel dh-motion-lift relative flex max-h-[min(32rem,calc(100vh-2rem))] w-full max-w-160 flex-col overflow-hidden rounded-xl bg-primary text-left align-middle shadow-xl ring-1 ring-secondary_alt sm:max-h-[min(32rem,calc(100vh-4rem))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dh-search__header flex items-center justify-between gap-3 px-4 pt-3">
          <h2
            className="dh-search__title m-0 text-xs font-semibold tracking-wide text-tertiary uppercase"
            id={titleId}
          >
            Search
          </h2>
          <button
            type="button"
            className={cx(
              untitledButtonStyles.common.root,
              untitledButtonStyles.sizes.sm.root,
              untitledButtonStyles.colors.tertiary.root,
              // UNTITLED-04 — the product's 44px target on both axes, like the
              // command palette's. `min-w-11` already stated the inline half.
              "dh-search__close min-h-11 min-w-11",
            )}
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close search"
          >
            <span data-text aria-hidden="true" className="px-0.5">
              Esc
            </span>
          </button>
        </div>

        <AriaTextField
          aria-label="Search everything"
          className="relative border-b border-secondary p-3"
        >
          <CommandInput
            ref={inputRef}
            type="text"
            // UNTITLED-04 — the 44px floor on the inner field; see the
            // command palette's input for why the variant is needed.
            className="dh-search__inputrow p-3 [&_input]:min-h-11"
            name="search"
            placeholder="Search everything…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-label="Search everything"
            aria-expanded={controller.hasResults}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            value={controller.query}
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            shortcutKeys={["/"]}
          />
        </AriaTextField>

        {/* tabIndex keeps the scroll region axe-clean when results overflow
            (WCAG scrollable-region-focusable); the combobox input keeps focus.
            Conflicts with jsx-a11y/no-noninteractive-tabindex, disabled with intent. */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
        <div
          className="dh-search__results flex-1 overflow-y-auto p-2"
          tabIndex={0}
        >
          <SearchResults
            controller={controller}
            listboxId={listboxId}
            optionId={optionId}
            indexById={indexById}
            onRowClick={handleRowClick}
            onRowHover={controller.setActiveIndex}
            currentLocation={location}
          />
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}

        <div className="dh-search__footer flex items-center justify-between gap-3 border-t border-secondary px-4 py-2 text-xs text-tertiary">
          <span className="dh-search__count" aria-hidden="true">
            {buildVisibleSummary(controller)}
          </span>
          <span
            className="dh-search__hint whitespace-nowrap max-sm:hidden"
            aria-hidden="true"
          >
            ↑↓ to navigate · Enter to open · Esc to close
          </span>
        </div>

        <div
          id={statusId}
          className="dh-visually-hidden"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </div>
      </div>
    </div>
  );
}

type SearchResultsProps = {
  readonly controller: ReturnType<typeof useSearchController>;
  readonly listboxId: string;
  readonly optionId: (index: number) => string;
  readonly indexById: ReadonlyMap<string, number>;
  readonly onRowClick: (
    event: MouseEvent<HTMLAnchorElement>,
    result: RankedSearchResult,
  ) => void;
  readonly onRowHover: (index: number) => void;
  readonly currentLocation: {
    readonly pathname: string;
    readonly search: string;
  };
};

function SearchResults({
  controller,
  listboxId,
  optionId,
  indexById,
  onRowClick,
  onRowHover,
  currentLocation,
}: SearchResultsProps) {
  const { phase, query, groups, activeIndex } = controller;

  /*
   * FIND-01 — `idle` is now only the instant BEFORE the first response.
   *
   * The empty query is a real request (the recency list), so this phase lasts
   * one round trip rather than until the owner types. It renders nothing at all
   * — not the sentence that used to live here, which restated the placeholder
   * directly above it, and not a spinner for a read this fast. The status
   * region announces the result when it lands.
   */
  if (phase === "idle") {
    return null;
  }

  if (phase === "error") {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Search is unavailable"
        headingLevel={3}
        description="Something went wrong reaching your results."
        primaryAction={
          <Button size="sm" onPress={controller.retry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (controller.isEmpty) {
    /*
     * Two different facts, two different sentences. "Nothing matched X" is
     * false in a workspace that simply has no history yet, and telling a new
     * owner their search failed when they have not searched is the kind of
     * dead end `AGENTS.md` §6 forbids.
     */
    if (controller.isEmptyQuery) {
      return (
        <EmptyState
          icon={<InboxIcon />}
          title="Nothing recent yet"
          headingLevel={3}
          description="Records you work on will appear here. Start typing to search everything in your workspace."
        />
      );
    }
    return (
      <EmptyState
        icon={<SearchIcon />}
        title="No results"
        headingLevel={3}
        description={`Nothing matched “${query}”.`}
      />
    );
  }

  // Loading with no prior results yet — a calm searching hint, not an empty
  // listbox (which would read as "no results").
  if (phase === "loading" && groups.length === 0) {
    return (
      <p className="dh-search__idle m-0 p-4 text-sm text-tertiary">
        Searching…
      </p>
    );
  }

  // ready, or loading with prior results kept visible as stale content.
  return (
    <>
      {controller.isPartial ? (
        <p
          className="dh-search__partial m-0 mb-2 rounded-lg bg-warning-primary px-4 py-3 text-sm text-warning-primary"
          role="note"
        >
          Some sources didn’t respond. Showing what we found.
        </p>
      ) : null}
      {controller.isEmptyQuery ? (
        /*
         * The privacy consequence, in one line, on the surface — ADR-112
         * decision 5's requirement, met where the owner can actually read it
         * rather than only in a document. It is stated whenever the list
         * renders, not conditionally on the workspace HAVING Diary entries,
         * because a rule the owner can only discover by owning the excluded
         * data is not a rule they have been told.
         */
        <p
          className="dh-search__note m-0 px-4 pt-4 pb-2 text-sm text-tertiary"
          role="note"
        >
          Your most recently worked-on records. Diary entries are never listed
          here — search for one to find it.
        </p>
      ) : null}
      <div
        className="dh-search__listbox"
        id={listboxId}
        role="listbox"
        aria-label={
          controller.isEmptyQuery ? RECENT_GROUP_LABEL : "Search results"
        }
        aria-busy={phase === "loading" || undefined}
      >
        {groups.map((group) => {
          const { label, icon } = groupPresentation(group);
          const groupHeadingId = `${listboxId}-${group.id}`;
          return (
            <div
              className="dh-search__group mb-2"
              key={group.id}
              role="group"
              aria-labelledby={groupHeadingId}
            >
              <p
                className="dh-search__grouptitle m-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide text-tertiary uppercase"
                id={groupHeadingId}
              >
                <span
                  className="dh-search__groupicon inline-flex text-xs"
                  aria-hidden="true"
                >
                  {icon}
                </span>
                {label}
                <span
                  className="dh-search__groupcount ml-auto tabular-nums text-tertiary"
                  aria-hidden="true"
                >
                  {group.results.length}
                </span>
              </p>
              {group.results.map((result) => {
                const index = indexById.get(result.id) ?? -1;
                return (
                  <SearchOption
                    key={result.id}
                    result={result}
                    index={index}
                    domId={optionId(index)}
                    active={index === activeIndex}
                    interactive={controller.resultsAreCurrent}
                    onClick={onRowClick}
                    onHover={onRowHover}
                    currentLocation={currentLocation}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );
}

type SearchOptionProps = {
  readonly result: RankedSearchResult;
  readonly index: number;
  readonly domId: string;
  readonly active: boolean;
  /** When false (a stale set while loading) the row is inert — no link, no click. */
  readonly interactive: boolean;
  readonly onClick: (
    event: MouseEvent<HTMLAnchorElement>,
    result: RankedSearchResult,
  ) => void;
  readonly onHover: (index: number) => void;
  readonly currentLocation: {
    readonly pathname: string;
    readonly search: string;
  };
};

function SearchOption({
  result,
  index,
  domId,
  active,
  interactive,
  onClick,
  onHover,
  currentLocation,
}: SearchOptionProps) {
  const href = destinationHref(
    buildResultDestination(result.target, currentLocation),
  );
  const identity =
    result.entityType === undefined
      ? null
      : getEntityIdentity(result.entityType);
  /*
   * The trailing chip names the record's TYPE in the identity vocabulary. A type
   * with no visual identity of its own (PROJECT-02: a Project template wears the
   * Project mark rather than a twelfth accent) simply has no chip — a raw
   * `entities.type` slug is never shown to a person, and such a provider carries
   * the type in its own subtitle instead ("Template · 4 tasks").
   */
  const typeLabel = identity?.label;

  const body = (
    <>
      <span
        className="dh-search__optionicon inline-flex shrink-0"
        aria-hidden="true"
      >
        {identity !== null ? (
          <EntityIcon type={identity.type} />
        ) : (
          <InboxIcon />
        )}
      </span>
      <span className="dh-search__optionbody flex min-w-0 flex-1 flex-col gap-px">
        <span className="dh-search__optiontitle truncate text-sm font-medium text-primary">
          <Highlight text={result.title} ranges={result.titleMatches} />
        </span>
        {result.subtitle !== undefined ? (
          <span className="dh-search__optionsubtitle truncate text-xs text-tertiary">
            <Highlight text={result.subtitle} ranges={result.subtitleMatches} />
          </span>
        ) : null}
        <SearchSignals signals={result.signals} />
      </span>
      {typeLabel !== undefined ? (
        <span className="dh-search__optiontype ml-auto shrink-0 pl-2 text-xs tracking-wide text-tertiary">
          {typeLabel}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      id={domId}
      role="option"
      aria-selected={interactive ? active : false}
      className="dh-search__option rounded-lg"
      data-active={(interactive && active) || undefined}
    >
      {interactive ? (
        // A real link: plain click opens in-app; modified/middle-click follows the
        // href (new tab). Only CURRENT results are links.
        <a
          className={cx(
            "dh-search__optionlink flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-inherit no-underline transition duration-100 ease-linear",
            active &&
              "bg-brand-primary_alt outline-1 -outline-offset-1 outline-brand",
          )}
          href={href}
          tabIndex={-1}
          onClick={(event) => onClick(event, result)}
          onMouseMove={() => onHover(index)}
        >
          {body}
        </a>
      ) : (
        // Stale results (a new query is loading) render as inert text — no href,
        // so neither a plain click nor a modified-click can open them.
        <span
          className="dh-search__optionlink flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-inherit opacity-70"
          aria-disabled="true"
        >
          {body}
        </span>
      )}
    </div>
  );
}

function buildStatusMessage(
  controller: ReturnType<typeof useSearchController>,
): string {
  switch (controller.phase) {
    case "idle":
      return "";
    case "loading":
      return "Searching…";
    case "error":
      return "Search is unavailable. Select try again to retry.";
    case "ready": {
      const count = controller.flatResults.length;
      // FIND-01 — the recency list is announced as what it IS. "8 results"
      // after typing nothing would leave a screen-reader user with no idea
      // what the eight things are or why they are there.
      if (controller.isEmptyQuery) {
        return count === 0
          ? "No recent records yet. Type to search."
          : `${count} recently worked-on ${count === 1 ? "record" : "records"}.`;
      }
      if (controller.isEmpty) {
        return `No results for ${controller.query}.`;
      }
      return controller.isPartial
        ? `${count} results. Some sources are unavailable.`
        : `${count} results.`;
    }
    default:
      return "";
  }
}

function buildVisibleSummary(
  controller: ReturnType<typeof useSearchController>,
): string {
  if (controller.phase === "idle") {
    return "";
  }
  if (controller.phase === "loading" && !controller.hasResults) {
    return "Searching…";
  }
  const count = controller.flatResults.length;
  if (count === 0) {
    if (controller.phase === "error") return "";
    return controller.isEmptyQuery ? "Nothing recent" : "No results";
  }
  if (controller.isEmptyQuery) {
    return `${count} recent`;
  }
  const noun = count === 1 ? "result" : "results";
  const truncated = controller.outcome?.truncated ? "+" : "";
  return `${count}${truncated} ${noun}`;
}
