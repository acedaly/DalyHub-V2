/**
 * DS-09 — the global Command Palette surface (default export, lazy-loaded).
 *
 * A premium, accessible command modal that composes the pure model + controller
 * with the DS-03 modal machinery. It does NOT build a second focus trap, scroll
 * lock or inertness system — it reuses the Drawer's hooks exactly as DS-08's
 * SearchSurface does (ADR-020 §20.9, ADR-024 §24.12). It merges contextual actions
 * + registered commands + DS-08 record Search into ONE grouped list, executes a
 * command through its single execution path, and shows calm inline pending /
 * success / failure feedback (there is no DS-10 toast yet).
 *
 * Accessibility: a WAI-ARIA combobox controlling a `listbox`, `aria-activedescendant`
 * tracking the active option, grouped `option`s, a polite status region announcing
 * counts / pending / outcome, and full keyboard operation (↑/↓ wrap, Home/End,
 * Enter, Escape). Highlighting is plain text + `<mark>` — never raw HTML.
 */

import { useCallback, useEffect, useId, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useLocation } from "react-router";

import { useBodyScrollLock } from "~/shared/drawer/use-body-scroll-lock";
import { useDrawerFocus } from "~/shared/drawer/use-drawer-focus";
import { useInertBackground } from "~/shared/drawer/use-inert-background";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, getEntityIdentity, isEntityType } from "~/shared/entity";
import { CommandIcon, InboxIcon } from "~/shared/icons";
import {
  Highlight,
  buildResultDestination,
  destinationHref,
  type SearchFn,
} from "~/shared/search";

import { useContextualActions } from "./CommandContextProvider";
import { formatShortcut } from "./model";
import type { PaletteOption, PaletteSection } from "./model";
import { useCommandContext } from "./useCommandContext";
import {
  useCommandController,
  type CommandController,
} from "./useCommandController";
import type { CommandCatalogueFn } from "./catalogue-client";
import type { ExecuteCommandFn } from "./execution-client";

export type CommandPaletteProps = {
  /** Close the palette (restores focus to the opener). */
  readonly onClose: () => void;
  /** The element that opened the palette; focus returns here on close. */
  readonly opener: HTMLElement | null;
  /** Injectable catalogue fetcher — defaults to the server transport. */
  readonly catalogue?: CommandCatalogueFn;
  /** Injectable record-search fn — defaults to the DS-08 server transport. */
  readonly search?: SearchFn;
  /** Injectable command executor — defaults to the server transport. */
  readonly execute?: ExecuteCommandFn;
  /** Search debounce (ms) — for demos/tests. */
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

export default function CommandPalette({
  onClose,
  opener,
  catalogue,
  search,
  execute,
  debounceMs,
}: CommandPaletteProps) {
  const contextualActions = useContextualActions();
  const context = useCommandContext();
  const location = useLocation();

  const controller = useCommandController({
    contextualActions,
    context,
    onClose,
    ...(catalogue ? { catalogue } : {}),
    ...(search ? { search } : {}),
    ...(execute ? { execute } : {}),
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });

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

  // Escape closes the palette (top-most surface) — document-capture, matching
  // the DS-03/Search convention.
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

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
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
          if (controller.view.count > 0) {
            event.preventDefault();
            controller.moveHome();
          }
          break;
        case "End":
          if (controller.view.count > 0) {
            event.preventDefault();
            controller.moveEnd();
          }
          break;
        case "Enter":
          if (controller.activeOption !== null) {
            event.preventDefault();
            controller.activate(controller.activeOption);
          }
          break;
        default:
          break;
      }
    },
    [controller],
  );

  const activeDescendant =
    controller.activeIndex >= 0 ? optionId(controller.activeIndex) : undefined;

  const statusMessage = buildStatusMessage(controller);
  const pendingCommandId =
    controller.execution.phase === "pending"
      ? controller.execution.commandId
      : null;

  return (
    <div className="dh-command" role="presentation" ref={modalRootRef}>
      <div className="dh-command__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="dh-command__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dh-command__header">
          <h2 className="dh-command__title" id={titleId}>
            Command palette
          </h2>
          <button
            type="button"
            className="dh-command__close"
            ref={closeButtonRef}
            onClick={onClose}
          >
            <span aria-hidden="true">Esc</span>
            <span className="dh-visually-hidden">Close command palette</span>
          </button>
        </div>

        <div className="dh-command__inputrow">
          <span className="dh-command__inputicon" aria-hidden="true">
            <CommandIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="dh-command__input"
            name="command"
            placeholder="What do you want to do?"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-label="Search commands and records"
            aria-expanded={controller.view.count > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            value={controller.query}
            onChange={(event) => controller.setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>

        <CommandFeedback controller={controller} />

        <div className="dh-command__results">
          <CommandResults
            controller={controller}
            listboxId={listboxId}
            optionId={optionId}
            pendingCommandId={pendingCommandId}
            currentLocation={location}
          />
        </div>

        <div className="dh-command__footer">
          <span className="dh-command__count" aria-hidden="true">
            {controller.view.count > 0 ? `${controller.view.count}` : ""}
          </span>
          <span className="dh-command__hint" aria-hidden="true">
            ↑↓ to navigate · Enter to run · Esc to close
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

/** Calm inline pending/success/failure feedback (no DS-10 toast yet). */
function CommandFeedback({ controller }: { controller: CommandController }) {
  const { execution } = controller;
  if (execution.phase === "idle") {
    return null;
  }
  if (execution.phase === "pending") {
    return (
      <p className="dh-command__feedback" data-tone="pending" role="note">
        Running…
      </p>
    );
  }
  if (execution.phase === "success") {
    return execution.message ? (
      <p className="dh-command__feedback" data-tone="success" role="note">
        {execution.message}
      </p>
    ) : null;
  }
  // error
  return (
    <p className="dh-command__feedback" data-tone="error" role="note">
      <span className="dh-command__feedback-text">{execution.message}</span>
      {execution.retryable ? (
        <button
          type="button"
          className="dh-command__retry"
          onClick={controller.retryExecution}
        >
          Retry
        </button>
      ) : null}
    </p>
  );
}

type CommandResultsProps = {
  readonly controller: CommandController;
  readonly listboxId: string;
  readonly optionId: (index: number) => string;
  readonly pendingCommandId: string | null;
  readonly currentLocation: {
    readonly pathname: string;
    readonly search: string;
  };
};

function CommandResults({
  controller,
  listboxId,
  optionId,
  pendingCommandId,
  currentLocation,
}: CommandResultsProps) {
  const { view, cataloguePhase, hasQuery, searchPhase } = controller;

  const catalogueNote =
    cataloguePhase === "error" ? (
      <EmptyState
        icon={<InboxIcon />}
        title="Commands couldn’t load"
        headingLevel={3}
        description="You can still search records below."
        primaryAction={
          <button
            type="button"
            className="dh-command__retry"
            onClick={controller.retryCatalogue}
          >
            Try again
          </button>
        }
      />
    ) : null;

  if (view.count === 0) {
    if (catalogueNote !== null && !hasQuery) {
      return catalogueNote;
    }
    if (!hasQuery) {
      return (
        <p className="dh-command__idle">
          Type to search commands and records, or press ↓ to browse.
        </p>
      );
    }
    if (searchPhase === "loading") {
      return <p className="dh-command__idle">Searching…</p>;
    }
    return (
      <EmptyState
        icon={<CommandIcon />}
        title="No matches"
        headingLevel={3}
        description={`Nothing matched “${controller.query}”.`}
      />
    );
  }

  return (
    <>
      {catalogueNote}
      {controller.searchIsPartial ? (
        <p className="dh-command__partial" role="note">
          Some record sources didn’t respond. Showing what we found.
        </p>
      ) : null}
      <div
        className="dh-command__listbox"
        id={listboxId}
        role="listbox"
        aria-label="Commands and records"
      >
        {view.sections.map((section) => (
          <CommandGroup
            key={section.key}
            section={section}
            activeIndex={controller.activeIndex}
            optionId={optionId}
            platform={controller.platform}
            pendingCommandId={pendingCommandId}
            onActivate={controller.activate}
            onHover={controller.setActiveIndex}
            currentLocation={currentLocation}
          />
        ))}
      </div>
    </>
  );
}

type CommandGroupProps = {
  readonly section: PaletteSection;
  readonly activeIndex: number;
  readonly optionId: (index: number) => string;
  readonly platform: CommandController["platform"];
  readonly pendingCommandId: string | null;
  readonly onActivate: (option: PaletteOption) => void;
  readonly onHover: (index: number) => void;
  readonly currentLocation: {
    readonly pathname: string;
    readonly search: string;
  };
};

function CommandGroup({
  section,
  activeIndex,
  optionId,
  platform,
  pendingCommandId,
  onActivate,
  onHover,
  currentLocation,
}: CommandGroupProps) {
  const headingId = `${section.key}-heading`;
  // Upgrade a record section's default slug to the entity's plural label via the
  // shared entity identity (the model stays React-free and never resolves it).
  const label =
    section.kind === "result" &&
    section.entityType !== undefined &&
    isEntityType(section.entityType)
      ? (getEntityIdentity(section.entityType)?.pluralLabel ?? section.label)
      : section.label;
  return (
    <div className="dh-command__group" role="group" aria-labelledby={headingId}>
      <p className="dh-command__grouptitle" id={headingId}>
        {label}
        <span className="dh-command__groupcount" aria-hidden="true">
          {section.options.length}
        </span>
      </p>
      {section.options.map((option) =>
        option.kind === "command" ? (
          <CommandOption
            key={`c-${option.ranked.command.id}`}
            option={option}
            domId={optionId(option.index)}
            active={option.index === activeIndex}
            platform={platform}
            pending={pendingCommandId === option.ranked.command.id}
            onActivate={onActivate}
            onHover={onHover}
          />
        ) : (
          <ResultOption
            key={`r-${option.result.id}`}
            option={option}
            domId={optionId(option.index)}
            active={option.index === activeIndex}
            onActivate={onActivate}
            onHover={onHover}
            currentLocation={currentLocation}
          />
        ),
      )}
    </div>
  );
}

function CommandOption({
  option,
  domId,
  active,
  platform,
  pending,
  onActivate,
  onHover,
}: {
  readonly option: Extract<PaletteOption, { kind: "command" }>;
  readonly domId: string;
  readonly active: boolean;
  readonly platform: CommandController["platform"];
  readonly pending: boolean;
  readonly onActivate: (option: PaletteOption) => void;
  readonly onHover: (index: number) => void;
}) {
  const { command, titleMatches } = option.ranked;
  const disabled = command.disabled === true;
  // A disabled option is never the active option (skip-disabled selection), so it
  // must not read as selected even if a stale `active` slips through.
  const showActive = active && !disabled;
  // Only advertise a keyboard shortcut when it is actually dispatched globally —
  // i.e. NAVIGATION commands/actions. Executable-command global shortcuts are
  // deferred to DS-10 (they need a feedback surface outside the palette), so their
  // hint is suppressed rather than shown as a control that does nothing.
  const shortcut =
    command.shortcut !== undefined && command.kind === "navigate"
      ? formatShortcut(command.shortcut, platform)
      : null;

  const body = (
    <>
      <span className="dh-command__optionbody">
        <span className="dh-command__optiontitle">
          <Highlight text={command.title} ranges={titleMatches} />
        </span>
        {command.subtitle !== undefined ? (
          <span className="dh-command__optionsubtitle">{command.subtitle}</span>
        ) : null}
      </span>
      {/* A visible, non-colour "Unavailable" cue (never opacity/colour alone). */}
      {disabled ? (
        <span className="dh-command__optionunavailable">Unavailable</span>
      ) : null}
      {command.moduleLabel !== undefined ? (
        <span className="dh-command__optiontype">{command.moduleLabel}</span>
      ) : null}
      {shortcut !== null ? (
        <kbd className="dh-command__optionshortcut" aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
    </>
  );

  return (
    <div
      id={domId}
      role="option"
      aria-selected={showActive}
      aria-disabled={disabled || undefined}
      aria-busy={pending || undefined}
      className="dh-command__option"
      data-active={showActive || undefined}
      data-disabled={disabled || undefined}
      data-pending={pending || undefined}
    >
      {disabled ? (
        // Non-interactive: no button/link, no click, no hover-to-activate — the
        // controller guard is the authoritative boundary, this removes the
        // affordance so pointer/keyboard cannot reach a handler at all.
        <span className="dh-command__optionstatic">{body}</span>
      ) : (
        <button
          type="button"
          className="dh-command__optionbtn"
          tabIndex={-1}
          onClick={() => onActivate(option)}
          onMouseMove={() => onHover(option.index)}
        >
          {body}
        </button>
      )}
    </div>
  );
}

function ResultOption({
  option,
  domId,
  active,
  onActivate,
  onHover,
  currentLocation,
}: {
  readonly option: Extract<PaletteOption, { kind: "result" }>;
  readonly domId: string;
  readonly active: boolean;
  readonly onActivate: (option: PaletteOption) => void;
  readonly onHover: (index: number) => void;
  readonly currentLocation: {
    readonly pathname: string;
    readonly search: string;
  };
}) {
  const { result } = option;
  const href = destinationHref(
    buildResultDestination(result.target, currentLocation),
  );
  const identity =
    result.entityType !== undefined && isEntityType(result.entityType)
      ? getEntityIdentity(result.entityType)
      : null;
  const typeLabel = identity?.label ?? result.entityType;

  return (
    <div
      id={domId}
      role="option"
      aria-selected={active}
      className="dh-command__option"
      data-active={active || undefined}
    >
      <a
        className="dh-command__optionlink"
        href={href}
        tabIndex={-1}
        onClick={(event) => {
          if (isModifiedClick(event)) {
            return;
          }
          event.preventDefault();
          onActivate(option);
        }}
        onMouseMove={() => onHover(option.index)}
      >
        <span className="dh-command__optionicon" aria-hidden="true">
          {identity !== null ? (
            <EntityIcon type={identity.type} />
          ) : (
            <InboxIcon />
          )}
        </span>
        <span className="dh-command__optionbody">
          <span className="dh-command__optiontitle">
            <Highlight text={result.title} ranges={result.titleMatches} />
          </span>
          {result.subtitle !== undefined ? (
            <span className="dh-command__optionsubtitle">
              <Highlight
                text={result.subtitle}
                ranges={result.subtitleMatches}
              />
            </span>
          ) : null}
        </span>
        {typeLabel !== undefined ? (
          <span className="dh-command__optiontype">{typeLabel}</span>
        ) : null}
      </a>
    </div>
  );
}

function buildStatusMessage(controller: CommandController): string {
  const { execution } = controller;
  if (execution.phase === "pending") {
    return "Running command…";
  }
  if (execution.phase === "error") {
    return execution.retryable
      ? `${execution.message} Select retry to try again.`
      : (execution.message ?? "");
  }
  if (execution.phase === "success" && execution.message) {
    return execution.message;
  }
  if (controller.cataloguePhase === "error" && !controller.hasQuery) {
    return "Commands couldn’t load. You can still search records.";
  }
  if (controller.view.count === 0 && controller.hasQuery) {
    return controller.searchPhase === "loading"
      ? "Searching…"
      : `No matches for ${controller.query}.`;
  }
  if (controller.view.count > 0) {
    return `${controller.view.count} ${controller.view.count === 1 ? "result" : "results"}.`;
  }
  return "";
}
