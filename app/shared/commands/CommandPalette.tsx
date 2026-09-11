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
import { TextField as AriaTextField } from "react-aria-components";
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
import { CommandInput } from "~/shared/ui/untitled/application/command-menus/base-components/command-input";
import {
  Button,
  styles as untitledButtonStyles,
} from "~/shared/ui/untitled/base/buttons/button";
import { cx } from "~/shared/ui/untitled/utils/cx";

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
    <div
      className="dh-command fixed inset-0 z-[var(--dh-layer-modal)] flex flex-col items-center overflow-y-auto bg-overlay/70 p-4 text-center backdrop-blur md:pt-16 xl:pt-[clamp(64px,10vh,243px)]"
      role="presentation"
      ref={modalRootRef}
      data-untitled-source="command-menu"
    >
      <div
        className="dh-command__scrim dh-motion-scrim fixed inset-0 cursor-default border-0 bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="dh-command__panel dh-motion-lift relative flex max-h-[min(34rem,calc(100vh-2rem))] w-full max-w-160 flex-col overflow-hidden rounded-xl bg-primary text-left align-middle shadow-xl ring-1 ring-secondary_alt sm:max-h-[min(34rem,calc(100vh-4rem))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="dh-command__header flex items-center justify-between gap-3 px-4 pt-3">
          <h2
            className="dh-command__title m-0 text-xs font-semibold tracking-wide text-tertiary uppercase"
            id={titleId}
          >
            Command palette
          </h2>
          <button
            type="button"
            className={cx(
              untitledButtonStyles.common.root,
              untitledButtonStyles.sizes.sm.root,
              untitledButtonStyles.colors.tertiary.root,
              // UNTITLED-04 — the product's 44px target on both axes. Untitled's
              // `sm` button is 40px tall, and this control is reached by thumb
              // on a phone; `min-w-11` already stated the inline half.
              "dh-command__close min-h-11 min-w-11",
            )}
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close command palette"
          >
            <span data-text aria-hidden="true" className="px-0.5">
              Esc
            </span>
          </button>
        </div>

        <AriaTextField
          aria-label="Search commands and records"
          className="relative border-b border-secondary p-3"
        >
          <CommandInput
            ref={inputRef}
            type="text"
            /*
             * UNTITLED-04 — the product's 44px floor, on the INPUT.
             *
             * `CommandInput`'s `className` lands on its wrapping group; the
             * `[role="combobox"]` the touch-target contract is written against
             * is the inner field, which sized to its type at 42px. The arbitrary
             * variant is the way to reach it without editing a vendored file
             * that `scripts/vendor-untitled.mjs` regenerates.
             */
            className="dh-command__inputrow p-3 [&_input]:min-h-11"
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
            shortcutKeys={["⌘", "K"]}
          />
        </AriaTextField>

        <CommandFeedback controller={controller} />

        {/* tabIndex makes the scroll region keyboard-accessible so it stays
            axe-clean once the catalogue is tall enough to overflow (WCAG
            scrollable-region-focusable); the combobox input keeps focus and
            aria-activedescendant drives option navigation. This directly conflicts
            with jsx-a11y/no-noninteractive-tabindex’s heuristic, so it is disabled
            here with intent. */}
        {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
        <div
          className="dh-command__results flex-1 overflow-y-auto p-2"
          tabIndex={0}
        >
          <CommandResults
            controller={controller}
            listboxId={listboxId}
            optionId={optionId}
            pendingCommandId={pendingCommandId}
            currentLocation={location}
          />
        </div>
        {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}

        <div className="dh-command__footer flex items-center justify-between gap-3 border-t border-secondary px-4 py-2 text-xs text-tertiary">
          {/*
           * The count says WHAT it is counting.
           *
           * It was a bare number in the corner of the footer — "37" beside the
           * keyboard hints, with nothing to say whether it was results, recent
           * commands or something about the palette itself. A figure with no
           * noun is not a fact, and the August 2026 audit called it a stray
           * count, which is what it looked like.
           *
           * `aria-hidden` stays: the live region below already announces the
           * result count to assistive tech when it changes, and hearing it
           * twice is worse than the label is short.
           */}
          <span className="dh-command__count" aria-hidden="true">
            {controller.view.count > 0
              ? `${controller.view.count} ${controller.view.count === 1 ? "result" : "results"}`
              : ""}
          </span>
          <span
            className="dh-command__hint whitespace-nowrap max-sm:hidden"
            aria-hidden="true"
          >
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
      <p
        className="dh-command__feedback m-0 flex items-center gap-3 border-b border-secondary px-4 py-2 text-xs text-tertiary"
        data-tone="pending"
        role="note"
      >
        Running…
      </p>
    );
  }
  if (execution.phase === "success") {
    return execution.message ? (
      <p
        className="dh-command__feedback m-0 flex items-center gap-3 border-b border-success_subtle bg-success-primary px-4 py-2 text-xs text-success-primary"
        data-tone="success"
        role="note"
      >
        {execution.message}
      </p>
    ) : null;
  }
  // error
  return (
    <p
      className="dh-command__feedback m-0 flex items-center gap-3 border-b border-error_subtle bg-error-primary px-4 py-2 text-xs text-error-primary"
      data-tone="error"
      role="note"
    >
      <span className="dh-command__feedback-text min-w-0 flex-1">
        {execution.message}
      </span>
      {execution.retryable ? (
        <Button size="sm" onPress={controller.retryExecution}>
          Retry
        </Button>
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
          <Button size="sm" onPress={controller.retryCatalogue}>
            Try again
          </Button>
        }
      />
    ) : null;

  if (view.count === 0) {
    if (catalogueNote !== null && !hasQuery) {
      return catalogueNote;
    }
    if (!hasQuery) {
      return (
        <p className="dh-command__idle m-0 p-4 text-sm text-tertiary">
          Type to search commands and records, or press ↓ to browse.
        </p>
      );
    }
    if (searchPhase === "loading") {
      return (
        <p className="dh-command__idle m-0 p-4 text-sm text-tertiary">
          Searching…
        </p>
      );
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
        <p
          className="dh-command__partial m-0 mb-2 rounded-lg bg-warning-primary px-4 py-3 text-sm text-warning-primary"
          role="note"
        >
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
    <div
      className="dh-command__group mb-2"
      role="group"
      aria-labelledby={headingId}
    >
      <p
        className="dh-command__grouptitle m-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wide text-tertiary uppercase"
        id={headingId}
      >
        {label}
        <span
          className="dh-command__groupcount ml-auto tabular-nums text-tertiary"
          aria-hidden="true"
        >
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
  // Only advertise a keyboard shortcut when it is actually dispatched globally, so
  // no hint promises a control that does nothing: NAVIGATION commands/actions, and —
  // since TODAY-05 — CONTEXTUAL run actions (their shortcut fires through the shared
  // dispatcher with DS-10 feedback). REGISTERED executable commands run only through
  // the authenticated boundary and are still not globally dispatched, so their hint
  // stays suppressed.
  const advertised =
    command.kind === "navigate" || command.source === "contextual";
  const shortcut =
    command.shortcut !== undefined && advertised
      ? formatShortcut(command.shortcut, platform)
      : null;

  const body = (
    <>
      <span className="dh-command__optionbody flex min-w-0 flex-1 flex-col gap-px">
        <span className="dh-command__optiontitle truncate text-sm font-medium text-primary">
          <Highlight text={command.title} ranges={titleMatches} />
        </span>
        {command.subtitle !== undefined ? (
          <span className="dh-command__optionsubtitle truncate text-xs text-tertiary">
            {command.subtitle}
          </span>
        ) : null}
      </span>
      {/* A visible, non-colour "Unavailable" cue (never opacity/colour alone). */}
      {disabled ? (
        <span className="dh-command__optionunavailable shrink-0 rounded-full border border-secondary px-2 text-xs font-medium tracking-wide text-tertiary">
          Unavailable
        </span>
      ) : null}
      {command.moduleLabel !== undefined ? (
        <span className="dh-command__optiontype shrink-0 pl-2 text-xs tracking-wide text-tertiary">
          {command.moduleLabel}
        </span>
      ) : null}
      {shortcut !== null ? (
        <kbd
          className="dh-command__optionshortcut shrink-0 rounded border border-secondary bg-secondary px-1.5 py-0.5 font-mono text-xs text-tertiary"
          aria-hidden="true"
        >
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
      // UNTITLED-04 — the listbox option is the palette's primary touch
      // surface, and a one-line option measured 42px.
      className="dh-command__option min-h-11 rounded-lg"
      data-active={showActive || undefined}
      data-disabled={disabled || undefined}
      data-pending={pending || undefined}
    >
      {disabled ? (
        // Non-interactive: no button/link, no click, no hover-to-activate — the
        // controller guard is the authoritative boundary, this removes the
        // affordance so pointer/keyboard cannot reach a handler at all.
        <span className="dh-command__optionstatic flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-inherit opacity-60">
          {body}
        </span>
      ) : (
        <button
          type="button"
          className={cx(
            "dh-command__optionbtn flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-left text-inherit transition duration-100 ease-linear",
            showActive &&
              "bg-brand-primary_alt outline-1 -outline-offset-1 outline-brand",
          )}
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
  // As in Search: the chip speaks the identity vocabulary, so a type without an
  // identity of its own shows no chip rather than a raw `entities.type` slug.
  const typeLabel = identity?.label;

  return (
    <div
      id={domId}
      role="option"
      aria-selected={active}
      className="dh-command__option rounded-lg"
      data-active={active || undefined}
    >
      <a
        className={cx(
          "dh-command__optionlink flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-inherit no-underline transition duration-100 ease-linear",
          active &&
            "bg-brand-primary_alt outline-1 -outline-offset-1 outline-brand",
        )}
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
        <span
          className="dh-command__optionicon inline-flex shrink-0"
          aria-hidden="true"
        >
          {identity !== null ? (
            <EntityIcon type={identity.type} />
          ) : (
            <InboxIcon />
          )}
        </span>
        <span className="dh-command__optionbody flex min-w-0 flex-1 flex-col gap-px">
          <span className="dh-command__optiontitle truncate text-sm font-medium text-primary">
            <Highlight text={result.title} ranges={result.titleMatches} />
          </span>
          {result.subtitle !== undefined ? (
            <span className="dh-command__optionsubtitle truncate text-xs text-tertiary">
              <Highlight
                text={result.subtitle}
                ranges={result.subtitleMatches}
              />
            </span>
          ) : null}
        </span>
        {typeLabel !== undefined ? (
          <span className="dh-command__optiontype shrink-0 pl-2 text-xs tracking-wide text-tertiary">
            {typeLabel}
          </span>
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
