/**
 * X-02 / TASKS-03 — the ONE saved-view switcher.
 *
 * Extracted verbatim from TASKS-03's `TasksViewSwitcher` and parameterised, so
 * Tasks and cross-module views share one control instead of one each. The markup,
 * the class names, the test ids and the copy are unchanged for Tasks — the
 * component takes them as props rather than hard-coding one collection's.
 *
 * Deliberately a MENU, not a permanent secondary sidebar. A saved-view rail is the
 * usual answer and the wrong one here: it eats horizontal space on every ordinary
 * screen to show a list a user touches a few times a day, and it makes the records
 * — the thing they actually came for — cramped. One trigger showing the ACTIVE
 * view's name costs a single control and still says, at a glance, what is applied.
 *
 * System views and the owner's own views are separated into two headed groups —
 * "Built-in views" and "Your views" — with the built-in group carrying an explicit
 * note that it cannot be changed or deleted. The distinction is therefore carried
 * by WORDS, never by colour or position (AGENTS.md §15). Selecting a view is an
 * ordinary link navigation: the view IS a URL, so it is shareable, bookmarkable and
 * Back/Forward-correct without any extra machinery.
 *
 * Every management action posts to the collection's canonical saved-view route;
 * nothing here writes storage. Deleting asks for confirmation through the shared
 * DS-10b `ConfirmationDialog` — the one confirmation surface in the product.
 *
 * ## HARDEN-06D (F-04) — a management action is AWAITED
 *
 * These mutations used to leave through a bare, un-awaited `fetcher.submit`,
 * and both callers closed their own UI on the next line. That defeated the
 * shared dialog's whole contract: its single-flight phase, its `busyLabel` and
 * its inline error could never engage, and — worse — an owner who confirmed
 * "Delete view" and navigated immediately took the in-flight request with them.
 * The view was still there, and nothing said so. The naming form did the same
 * on save, rename and duplicate.
 *
 * Every mutation now goes through one awaited `post` that RESOLVES WITH THE
 * SERVER'S ANSWER, in the shape `ProjectTemplateRecord` and the other eight
 * `ConfirmationDialog` consumers already use. `onConfirm` throws on refusal, so
 * the dialog stays open with the reason; the naming form keeps its input open
 * for the same reason. There is no fetcher left to be destroyed by a
 * navigation.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";

import { ConfirmationDialog } from "~/shared/settings";
import { OverflowMenu } from "~/shared/overflow-menu";
import type { OverflowMenuItem } from "~/shared/overflow-menu";

/** One selectable view in the switcher: built-in or the owner's own. */
export interface SavedViewOption {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly kind: "system" | "user";
  /** The query string that applies this view, without the leading `?`. */
  readonly query: string;
  readonly isDefault?: boolean;
}

/** What a saved-view mutation route replies with. */
export interface SavedViewActionResult {
  readonly ok: boolean;
  readonly message?: string;
  readonly formError?: string;
}

export interface SavedViewSwitcherProps {
  readonly views: readonly SavedViewOption[];
  readonly activeViewId: string | null;
  readonly modified: boolean;
  /** The current configuration's query string — what "save" and "update" store. */
  readonly currentQuery: string;
  /** The shareable URL of the current configuration, for "Copy link". */
  readonly shareUrl: string;
  /** Where selecting a view navigates (e.g. `/tasks`). */
  readonly basePath: string;
  /** Where management intents POST (e.g. `/tasks/views`). */
  readonly actionPath: string;
  /** The collection's own nouns, used in menu labels and confirmation copy. */
  readonly collectionLabel: string;
  readonly defaultViewLabel: string;
  readonly newViewPlaceholder: string;
  readonly deleteExplanation: string;
  /** Whether this collection supports an owner default view. */
  readonly supportsDefault?: boolean;
  /**
   * UIX-01 — the views promoted to a permanent TAB RAIL, in the order given.
   *
   * A collection with ten built-in views cannot show them all as tabs, and a
   * collection whose everyday views are one menu-click away reads as an
   * administrative tool rather than as a productivity one. Naming a handful
   * here draws them as a quiet destination rail in front of the trigger; every
   * view — pinned or not — stays in the panel behind it, so this is a second
   * AFFORDANCE onto one model, never a second list to keep in step.
   *
   * An id that matches no view is ignored rather than rendered empty, so a
   * collection can pin a view it only sometimes offers.
   */
  readonly pinnedViewIds?: readonly string[];
  /** BEM block, so an existing stylesheet keeps working unchanged. */
  readonly classPrefix: string;
  /** `data-testid` stem, so existing end-to-end selectors keep working. */
  readonly testIdPrefix: string;
}

export function SavedViewSwitcher({
  views,
  activeViewId,
  modified,
  currentQuery,
  shareUrl,
  basePath,
  actionPath,
  collectionLabel,
  defaultViewLabel,
  newViewPlaceholder,
  deleteExplanation,
  supportsDefault = true,
  pinnedViewIds,
  classPrefix,
  testIdPrefix,
}: SavedViewSwitcherProps) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // A COUNT, not a flag: two overlapping posts must not have the first to
  // finish re-enable the menu while the second is still in flight.
  const [inFlight, setInFlight] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<SavedViewOption | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const nameId = useId();

  const active = views.find((view) => view.id === activeViewId) ?? null;
  // The rail is built from the SAME `views` model the panel renders, in the
  // order the collection pinned them — never from a second list.
  const pinned = (pinnedViewIds ?? [])
    .map((id) => views.find((view) => view.id === id))
    .filter((view): view is SavedViewOption => view !== undefined);
  const systemViews = views.filter((view) => view.kind === "system");
  const userViews = views.filter((view) => view.kind === "user");
  const busy = inFlight > 0;
  /**
   * Post one management intent and RESOLVE WITH THE ANSWER.
   *
   * Every outcome — success and failure — is announced through the one polite
   * live region, so a keyboard or screen-reader user learns what happened
   * without hunting; a success also revalidates, so the panel's list is the
   * server's list. The returned result is what lets the confirmation dialog and
   * the naming form decide whether to close.
   */
  const post = useCallback(
    async (fields: Record<string, string>): Promise<SavedViewActionResult> => {
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      body.set("query", currentQuery);
      setInFlight((count) => count + 1);
      let result: SavedViewActionResult;
      try {
        const response = await fetch(actionPath, { method: "post", body });
        result = (await response.json()) as SavedViewActionResult;
      } catch {
        result = {
          ok: false,
          formError: "That couldn’t be saved. Please try again.",
        };
      } finally {
        setInFlight((count) => count - 1);
      }
      setStatus((result.ok ? result.message : result.formError) ?? null);
      if (result.ok) revalidator.revalidate();
      return result;
    },
    [currentQuery, actionPath, revalidator],
  );

  /** The intents with no confirmation step of their own: fire, report, done. */
  const submit = useCallback(
    (fields: Record<string, string>) => {
      void post(fields);
    },
    [post],
  );

  // Naming a view is one short string, so it is asked for INLINE — a labelled
  // input in the switcher panel — rather than through a modal. Focus moves to the
  // input when it appears and Escape cancels, so it is keyboard-complete without a
  // second focus trap (there is exactly one modal machinery in the product, DS-03).
  const [naming, setNaming] = useState<{
    readonly intent: "create" | "rename" | "duplicate";
    readonly label: string;
    readonly initial: string;
    readonly viewId?: string;
  } | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (naming) nameInputRef.current?.focus();
  }, [naming]);

  const askForName = useCallback(
    (
      intent: "create" | "rename" | "duplicate",
      label: string,
      initial: string,
      viewId?: string,
    ) => {
      setOpen(true);
      setNaming({ intent, label, initial, ...(viewId ? { viewId } : {}) });
    },
    [],
  );

  const manageItems: OverflowMenuItem[] = [
    {
      id: "save-as",
      label: "Save as new view…",
      disabled: busy,
      onSelect: () =>
        askForName(
          "create",
          "Name this view",
          active?.name ?? newViewPlaceholder,
        ),
    },
    ...(active && active.kind === "user"
      ? [
          {
            id: "update",
            label: `Update “${active.name}”`,
            description: modified
              ? "Save the current filters, sort and grouping."
              : "Already matches this configuration.",
            disabled: busy,
            onSelect: () => submit({ intent: "update", viewId: active.id }),
          },
          {
            id: "rename",
            label: "Rename…",
            disabled: busy,
            onSelect: () =>
              askForName("rename", "Rename this view", active.name, active.id),
          },
          {
            id: "duplicate",
            label: "Duplicate…",
            disabled: busy,
            onSelect: () =>
              askForName(
                "duplicate",
                "Name the duplicate",
                `${active.name} copy`,
                active.id,
              ),
          },
        ]
      : []),
    ...(supportsDefault
      ? [
          {
            id: "set-default",
            label: active
              ? active.isDefault
                ? `Clear default ${defaultViewLabel}`
                : `Make “${active.name}” the default`
              : `Clear default ${defaultViewLabel}`,
            separatorBefore: true,
            disabled: busy,
            onSelect: () =>
              submit({
                intent: "set_default",
                viewId: active && !active.isDefault ? active.id : "",
              }),
          },
        ]
      : []),
    {
      id: "copy-link",
      label: "Copy link to this configuration",
      description: "Shares exactly what you see, without saving a view.",
      separatorBefore: !supportsDefault,
      onSelect: () => {
        void navigator.clipboard
          ?.writeText(shareUrl)
          .then(() => setStatus("Link copied."))
          .catch(() =>
            setStatus("Couldn’t copy the link. Copy it from the address bar."),
          );
      },
    },
    ...(active && active.kind === "user"
      ? [
          {
            id: "delete",
            label: `Delete “${active.name}”…`,
            tone: "danger" as const,
            separatorBefore: true,
            disabled: busy,
            onSelect: () => setPendingDelete(active),
          },
        ]
      : []),
  ];

  return (
    /*
     * POLISH-01 — the SWITCHER is the scroll strip, not the rail inside it.
     *
     * On a phone this whole band scrolls as one object (the tabs, the "View"
     * trigger and the manage menu together — `tasks.css`), so the shared
     * affordance belongs here. Putting it on the rail as well would nest two
     * scroll containers and paint a cue on the one that never moves.
     */
    <div className={`${classPrefix} dh-scroll-strip`}>
      {pinned.length > 0 ? (
        /*
         * The rail is a `nav`, because that is what it is: each tab is an
         * ordinary link to the URL that IS the view, so it is shareable,
         * middle-clickable and Back/Forward-correct with no extra machinery.
         * The current one carries `aria-current`, so selection is semantic and
         * never rests on the violet underline the stylesheet draws.
         */
        <nav
          /*
           * UIX-02 — the rail carries the SHARED `dh-viewtabs` classes as well
           * as its own prefixed ones.
           *
           * The prefixed pair stays because this module's stylesheet and its
           * end-to-end tests address it; the shared pair is where the rail is
           * now actually DRAWN. Until UIX-02 the treatment lived in
           * `tasks.css`, scoped to `.dh-collection--tasks`, which meant the
           * next collection that wanted the same tabs had to copy it — and
           * "do not independently reinvent view tabs" is the brief's own rule.
           * One definition, two consumers.
           */
          className={`${classPrefix}__rail dh-viewtabs`}
          aria-label={collectionLabel}
          data-testid={`${testIdPrefix}-rail`}
        >
          {pinned.map((view) => (
            <Link
              key={view.id}
              to={`${basePath}?${view.query}`}
              className={`${classPrefix}__tab dh-viewtabs__tab`}
              aria-current={view.id === activeViewId ? "page" : undefined}
              preventScrollReset
            >
              {view.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <button
        type="button"
        ref={triggerRef}
        className={`${classPrefix}__trigger`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid={`${testIdPrefix}-trigger`}
      >
        <span className={`${classPrefix}__label`}>View</span>
        <span className={`${classPrefix}__name`}>
          {active ? active.name : "Custom"}
        </span>
        {/* "Modified" is a WORD, so an unsaved change is legible without colour. */}
        {modified ? (
          <span className={`${classPrefix}__modified`}> · Modified</span>
        ) : null}
      </button>

      <OverflowMenu
        items={manageItems}
        label={`Manage ${collectionLabel}`}
        triggerClassName={`${classPrefix}__manage`}
        data-testid={`${testIdPrefix}-manage`}
      />

      {open ? (
        <div
          id={listId}
          className={`${classPrefix}__panel`}
          data-testid={`${testIdPrefix}-panel`}
        >
          {naming ? (
            <form
              className={`${classPrefix}__name-form`}
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("name");
                const name = String(value ?? "").trim();
                if (name.length === 0) {
                  setStatus("Give this view a name.");
                  return;
                }
                // HARDEN-06D (F-04) — the form closes only once the server has
                // answered, and stays open (with the reason in the live region)
                // when it refuses. Closing on submit is what let a navigation
                // destroy the request with nothing said.
                void post({
                  intent: naming.intent,
                  name,
                  ...(naming.viewId ? { viewId: naming.viewId } : {}),
                }).then((result) => {
                  if (result.ok) setNaming(null);
                });
              }}
              /* Escape cancels naming without leaving the panel. It is bound on
                 the INPUT (a real interactive element) rather than the form, so the
                 handler sits where the keyboard focus actually is. */
            >
              <label className={`${classPrefix}__name-label`} htmlFor={nameId}>
                {naming.label}
              </label>
              <input
                id={nameId}
                ref={nameInputRef}
                name="name"
                type="text"
                className="dh-input"
                defaultValue={naming.initial}
                maxLength={80}
                required
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setNaming(null);
                    triggerRef.current?.focus();
                  }
                }}
                data-testid={`${testIdPrefix}-name-input`}
              />
              <div className={`${classPrefix}__name-actions`}>
                <button
                  type="button"
                  className="dh-btn dh-btn--ghost"
                  onClick={() => {
                    setNaming(null);
                    triggerRef.current?.focus();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dh-btn dh-btn--primary"
                  disabled={busy}
                  data-testid={`${testIdPrefix}-name-save`}
                >
                  Save view
                </button>
              </div>
            </form>
          ) : null}

          <ViewGroup
            heading="Built-in views"
            note="Always available. These can’t be changed or deleted."
            views={systemViews}
            activeViewId={activeViewId}
            basePath={basePath}
            classPrefix={classPrefix}
            onSelect={() => setOpen(false)}
          />
          {userViews.length > 0 ? (
            <ViewGroup
              heading="Your views"
              note={null}
              views={userViews}
              activeViewId={activeViewId}
              basePath={basePath}
              classPrefix={classPrefix}
              onSelect={() => setOpen(false)}
            />
          ) : (
            <p className={`${classPrefix}__empty`}>
              You haven’t saved any views yet. Set up filters, sorting and
              grouping, then choose <strong>Save as new view</strong>.
            </p>
          )}
        </div>
      ) : null}

      <p className="dh-visually-hidden" role="status" aria-live="polite">
        {status ?? ""}
      </p>

      <ConfirmationDialog
        open={pendingDelete !== null}
        opener={triggerRef.current}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const result = await post({
            intent: "delete",
            viewId: pendingDelete.id,
          });
          // Thrown, not swallowed: the dialog shows it inline and stays open to
          // retry, which is what its contract asks for.
          if (!result.ok) {
            throw new Error(
              result.formError ?? "That couldn’t be deleted. Please try again.",
            );
          }
          setPendingDelete(null);
        }}
        title={`Delete “${pendingDelete?.name ?? ""}”?`}
        confirmLabel="Delete view"
        busyLabel="Deleting…"
      >
        {deleteExplanation}
      </ConfirmationDialog>
    </div>
  );
}

function ViewGroup({
  heading,
  note,
  views,
  activeViewId,
  basePath,
  classPrefix,
  onSelect,
}: {
  readonly heading: string;
  readonly note: string | null;
  readonly views: readonly SavedViewOption[];
  readonly activeViewId: string | null;
  readonly basePath: string;
  readonly classPrefix: string;
  readonly onSelect: () => void;
}) {
  const headingId = useId();
  return (
    <section className={`${classPrefix}__group`} aria-labelledby={headingId}>
      <h2 id={headingId} className={`${classPrefix}__heading`}>
        {heading}
      </h2>
      {note ? <p className={`${classPrefix}__note`}>{note}</p> : null}
      <ul className={`${classPrefix}__list`}>
        {views.map((view) => (
          <li key={view.id}>
            <Link
              to={`${basePath}?${view.query}`}
              className={`${classPrefix}__item`}
              aria-current={view.id === activeViewId ? "true" : undefined}
              onClick={onSelect}
              preventScrollReset
            >
              <span className={`${classPrefix}__item-name`}>{view.name}</span>
              {view.description ? (
                <span className={`${classPrefix}__item-note`}>
                  {view.description}
                </span>
              ) : null}
              {view.isDefault ? (
                <span className={`${classPrefix}__badge`}>Default</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
