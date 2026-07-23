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
import { useLocation, useNavigate } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, getEntityIdentity, isEntityType } from "~/shared/entity";
import { InboxIcon, SearchIcon } from "~/shared/icons";
import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";

import { Highlight } from "./HighlightText";
import type { SearchFn } from "./client";
import { buildResultDestination, destinationHref } from "./navigation";
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
  const controller = useSearchController({
    ...(search ? { search } : {}),
    ...(debounceMs !== undefined ? { debounceMs } : {}),
  });
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div className="dh-search" role="presentation" ref={modalRootRef}>
      <div className="dh-search__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="dh-search__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dh-search__header">
          <h2 className="dh-search__title" id={titleId}>
            Search
          </h2>
          <button
            type="button"
            className="dh-search__close"
            ref={closeButtonRef}
            onClick={onClose}
          >
            <span aria-hidden="true">Esc</span>
            <span className="dh-visually-hidden">Close search</span>
          </button>
        </div>

        <div className="dh-search__inputrow">
          <span className="dh-search__inputicon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="dh-search__input"
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
            onChange={(event) => controller.setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>

        <div className="dh-search__results">
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

        <div className="dh-search__footer">
          <span className="dh-search__count" aria-hidden="true">
            {buildVisibleSummary(controller)}
          </span>
          <span className="dh-search__hint" aria-hidden="true">
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

  if (phase === "idle") {
    return (
      <p className="dh-search__idle">
        Search across everything in your workspace.
      </p>
    );
  }

  if (phase === "error") {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="Search is unavailable"
        headingLevel={3}
        description="Something went wrong reaching your results."
        primaryAction={
          <button
            type="button"
            className="dh-search__retry"
            onClick={controller.retry}
          >
            Try again
          </button>
        }
      />
    );
  }

  if (controller.isEmpty) {
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
    return <p className="dh-search__idle">Searching…</p>;
  }

  // ready, or loading with prior results kept visible as stale content.
  return (
    <>
      {controller.isPartial ? (
        <p className="dh-search__partial" role="note">
          Some sources didn’t respond. Showing what we found.
        </p>
      ) : null}
      <div
        className="dh-search__listbox"
        id={listboxId}
        role="listbox"
        aria-label="Search results"
        aria-busy={phase === "loading" || undefined}
      >
        {groups.map((group) => {
          const { label, icon } = groupPresentation(group);
          const groupHeadingId = `${listboxId}-${group.id}`;
          return (
            <div
              className="dh-search__group"
              key={group.id}
              role="group"
              aria-labelledby={groupHeadingId}
            >
              <p className="dh-search__grouptitle" id={groupHeadingId}>
                <span className="dh-search__groupicon" aria-hidden="true">
                  {icon}
                </span>
                {label}
                <span className="dh-search__groupcount" aria-hidden="true">
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
    result.entityType !== undefined && isEntityType(result.entityType)
      ? getEntityIdentity(result.entityType)
      : null;
  const typeLabel = identity?.label ?? result.entityType;

  const body = (
    <>
      <span className="dh-search__optionicon" aria-hidden="true">
        {identity !== null ? (
          <EntityIcon type={identity.type} />
        ) : (
          <InboxIcon />
        )}
      </span>
      <span className="dh-search__optionbody">
        <span className="dh-search__optiontitle">
          <Highlight text={result.title} ranges={result.titleMatches} />
        </span>
        {result.subtitle !== undefined ? (
          <span className="dh-search__optionsubtitle">
            <Highlight text={result.subtitle} ranges={result.subtitleMatches} />
          </span>
        ) : null}
      </span>
      {typeLabel !== undefined ? (
        <span className="dh-search__optiontype">{typeLabel}</span>
      ) : null}
    </>
  );

  return (
    <div
      id={domId}
      role="option"
      aria-selected={interactive ? active : false}
      className="dh-search__option"
      data-active={(interactive && active) || undefined}
    >
      {interactive ? (
        // A real link: plain click opens in-app; modified/middle-click follows the
        // href (new tab). Only CURRENT results are links.
        <a
          className="dh-search__optionlink"
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
        <span className="dh-search__optionlink" aria-disabled="true">
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
    case "ready":
      if (controller.isEmpty) {
        return `No results for ${controller.query}.`;
      }
      return controller.isPartial
        ? `${controller.flatResults.length} results. Some sources are unavailable.`
        : `${controller.flatResults.length} results.`;
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
    return controller.phase === "error" ? "" : "No results";
  }
  const noun = count === 1 ? "result" : "results";
  const truncated = controller.outcome?.truncated ? "+" : "";
  return `${count}${truncated} ${noun}`;
}
