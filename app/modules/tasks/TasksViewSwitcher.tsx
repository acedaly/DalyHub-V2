/**
 * TASKS-03 — the compact Tasks view switcher.
 *
 * Deliberately a MENU, not a permanent secondary sidebar. A saved-view rail is the
 * usual answer and the wrong one here: it eats horizontal space on every ordinary
 * screen to show a list a user touches a few times a day, and it makes the task
 * list — the thing they actually came for — cramped. One trigger showing the ACTIVE
 * view's name costs a single control and still says, at a glance, what is applied.
 *
 * System views and the owner's own views are separated into two headed groups —
 * "Built-in views" and "Your views" — with the built-in group carrying an explicit
 * note that it cannot be changed or deleted. The distinction is therefore carried by
 * WORDS, never by colour or position (AGENTS.md §15). Selecting a view is an ordinary link
 * navigation: the view IS a URL, so it is shareable, bookmarkable and
 * Back/Forward-correct without any extra machinery.
 *
 * Every management action posts to the canonical `/tasks/views` route; nothing here
 * writes storage. Deleting asks for confirmation through the shared DS-10b
 * `ConfirmationDialog` — the one confirmation surface in the product.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";

import { ConfirmationDialog } from "~/shared/settings";
import { OverflowMenu } from "~/shared/overflow-menu";
import type { OverflowMenuItem } from "~/shared/overflow-menu";

import type { TasksViewResult, TasksViewOption } from "./tasks-contract";

export interface TasksViewSwitcherProps {
  readonly views: readonly TasksViewOption[];
  readonly activeViewId: string | null;
  readonly modified: boolean;
  /** The current configuration's query string — what "save" and "update" store. */
  readonly currentQuery: string;
  /** The shareable URL of the current configuration, for "Copy link". */
  readonly shareUrl: string;
}

export function TasksViewSwitcher({
  views,
  activeViewId,
  modified,
  currentQuery,
  shareUrl,
}: TasksViewSwitcherProps) {
  const fetcher = useFetcher<TasksViewResult>();
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TasksViewOption | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const settled = useRef<TasksViewResult | null>(null);
  const listId = useId();
  const nameId = useId();

  const active = views.find((view) => view.id === activeViewId) ?? null;
  const systemViews = views.filter((view) => view.kind === "system");
  const userViews = views.filter((view) => view.kind === "user");
  const busy = fetcher.state !== "idle";

  // Announce every outcome — success AND failure — through one polite live region,
  // so a keyboard or screen-reader user learns what happened without hunting.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (settled.current === fetcher.data) return;
    settled.current = fetcher.data;
    setStatus(fetcher.data.ok ? fetcher.data.message : fetcher.data.formError);
    if (fetcher.data.ok) revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  const submit = useCallback(
    (fields: Record<string, string>) => {
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      body.set("query", currentQuery);
      fetcher.submit(body, { method: "post", action: "/tasks/views" });
    },
    [fetcher, currentQuery],
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
        askForName("create", "Name this view", active?.name ?? "My tasks"),
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
    {
      id: "set-default",
      label: active
        ? active.isDefault
          ? "Clear default Tasks view"
          : `Make “${active.name}” the default`
        : "Clear default Tasks view",
      separatorBefore: true,
      disabled: busy,
      onSelect: () =>
        submit({
          intent: "set_default",
          viewId: active && !active.isDefault ? active.id : "",
        }),
    },
    {
      id: "copy-link",
      label: "Copy link to this configuration",
      description: "Shares exactly what you see, without saving a view.",
      onSelect: () => {
        void navigator.clipboard
          ?.writeText(shareUrl)
          .then(() => setStatus("Link copied."))
          .catch(() => setStatus("Couldn’t copy the link. Copy it from the address bar."));
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
    <div className="dh-tasks-views">
      <button
        type="button"
        ref={triggerRef}
        className="dh-tasks-views__trigger"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid="tasks-view-trigger"
      >
        <span className="dh-tasks-views__label">View</span>
        <span className="dh-tasks-views__name">
          {active ? active.name : "Custom"}
        </span>
        {/* "Modified" is a WORD, so an unsaved change is legible without colour. */}
        {modified ? (
          <span className="dh-tasks-views__modified"> · Modified</span>
        ) : null}
      </button>

      <OverflowMenu
        items={manageItems}
        label="Manage Tasks views"
        triggerClassName="dh-tasks-views__manage"
        data-testid="tasks-view-manage"
      />

      {open ? (
        <div
          id={listId}
          className="dh-tasks-views__panel"
          data-testid="tasks-view-panel"
        >
          {naming ? (
            <form
              className="dh-tasks-views__name-form"
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("name");
                const name = String(value ?? "").trim();
                if (name.length === 0) {
                  setStatus("Give this view a name.");
                  return;
                }
                submit({
                  intent: naming.intent,
                  name,
                  ...(naming.viewId ? { viewId: naming.viewId } : {}),
                });
                setNaming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setNaming(null);
                  triggerRef.current?.focus();
                }
              }}
            >
              <label className="dh-tasks-views__name-label" htmlFor={nameId}>
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
                data-testid="tasks-view-name-input"
              />
              <div className="dh-tasks-views__name-actions">
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
                  data-testid="tasks-view-name-save"
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
            onSelect={() => setOpen(false)}
          />
          {userViews.length > 0 ? (
            <ViewGroup
              heading="Your views"
              note={null}
              views={userViews}
              activeViewId={activeViewId}
              onSelect={() => setOpen(false)}
            />
          ) : (
            <p className="dh-tasks-views__empty">
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
          if (pendingDelete) submit({ intent: "delete", viewId: pendingDelete.id });
          setPendingDelete(null);
        }}
        title={`Delete “${pendingDelete?.name ?? ""}”?`}
        confirmLabel="Delete view"
        busyLabel="Deleting…"
      >
        This deletes the saved view only. Your tasks are not affected, and you can
        save the same configuration again at any time.
      </ConfirmationDialog>
    </div>
  );
}

function ViewGroup({
  heading,
  note,
  views,
  activeViewId,
  onSelect,
}: {
  readonly heading: string;
  readonly note: string | null;
  readonly views: readonly TasksViewOption[];
  readonly activeViewId: string | null;
  readonly onSelect: () => void;
}) {
  const headingId = useId();
  return (
    <section className="dh-tasks-views__group" aria-labelledby={headingId}>
      <h2 id={headingId} className="dh-tasks-views__heading">
        {heading}
      </h2>
      {note ? <p className="dh-tasks-views__note">{note}</p> : null}
      <ul className="dh-tasks-views__list">
        {views.map((view) => (
          <li key={view.id}>
            <Link
              to={`/tasks?${view.query}`}
              className="dh-tasks-views__item"
              aria-current={view.id === activeViewId ? "true" : undefined}
              onClick={onSelect}
              preventScrollReset
            >
              <span className="dh-tasks-views__item-name">{view.name}</span>
              {view.description ? (
                <span className="dh-tasks-views__item-note">
                  {view.description}
                </span>
              ) : null}
              {view.isDefault ? (
                <span className="dh-tasks-views__badge">Default</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
