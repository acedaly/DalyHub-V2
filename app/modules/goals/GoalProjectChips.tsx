/**
 * REDESIGN-04 §6.2 — the Goal Overview's LINKED PROJECTS row.
 *
 * `mockup3.png` closes the Goal pane with a row of compact chips — a small
 * project mark and its name — and a `+ Link project` action beside them. It is
 * the same data `GoalProjectsTab` renders as full cards, re-presented: the
 * Overview answers "what is advancing this?" at a glance, and the Projects tab
 * remains where that work is read in detail.
 *
 * Three things it does not do:
 *
 *   - **It does not read.** The Projects come from the pane's own loader, which
 *     already had them; the chip row costs nothing.
 *   - **It does not invent a link model.** A Goal↔Project link IS
 *     `project.advances_goal`, and the spine allows one active structural
 *     parent per child — so the link belongs to the PROJECT, and creating one
 *     posts the Project's own trusted `move` intent. There is no
 *     goal-side link mutation, because there is no goal-side link to own.
 *   - **It does not hide the rest.** When more Projects advance the Goal than
 *     the pane's bounded page holds, the row says so and points at the tab that
 *     lists them all, rather than silently showing the first few.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";

import { AccentIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import type { SelectOption } from "~/shared/forms/types";
import { PlusIcon } from "~/shared/icons";
import { Sheet } from "~/shared/sheet";

import type { SerializedGoalProjectItem } from "./goal-view";
import type { GoalLinkProjectOptionsData } from "./routes/link-projects";

export function GoalProjectChips({
  goalId,
  goalTitle,
  projects,
  total,
}: {
  readonly goalId: string;
  readonly goalTitle: string;
  readonly projects: readonly SerializedGoalProjectItem[];
  /** The EXACT contribution total, which may exceed the loaded page. */
  readonly total: number;
}) {
  const headingId = useId();
  const [picking, setPicking] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <section className="dh-goalchips" aria-labelledby={headingId}>
      <div className="dh-goalchips__head">
        <h3 className="dh-goalchips__title" id={headingId}>
          Linked projects
        </h3>
        <button
          type="button"
          ref={openerRef}
          className="dh-btn dh-btn--outlined dh-btn--sm"
          data-testid="goal-link-project"
          onClick={() => setPicking(true)}
        >
          <PlusIcon aria-hidden="true" />
          Link project
        </button>
      </div>

      {projects.length === 0 ? (
        /*
         * One quiet invitation, not an empty-card graveyard (§9). A Goal with
         * nothing advancing it is an ordinary state — it is how every Goal
         * starts — so the copy says what a link would do rather than treating
         * the absence as a problem.
         */
        <p className="dh-goalchips__empty">
          No Projects advance this Goal yet. Linking one moves it under{" "}
          {goalTitle}.
        </p>
      ) : (
        <ul className="dh-goalchips__list">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                className="dh-goalchips__chip"
                to={`/projects/${encodeURIComponent(project.id)}`}
                data-testid="goal-project-chip"
              >
                <span className="dh-goalchips__mark" aria-hidden="true">
                  <AccentIcon entityType="project" iconKey={null} size="sm" />
                </span>
                <span className="dh-goalchips__name">{project.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > projects.length ? (
        <p className="dh-goalchips__more">
          <Link to={`/goals/${encodeURIComponent(goalId)}?tab=projects`}>
            {`See all ${total} Projects`}
          </Link>
        </p>
      ) : null}

      {picking ? (
        <LinkProjectSheet
          goalId={goalId}
          goalTitle={goalTitle}
          opener={openerRef.current}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * The picker.
 *
 * A bounded, server-backed search — the set of linkable Projects can exceed any
 * static list — and a choice that posts the PROJECT's own `move` intent. The
 * confirmation wording says what will actually happen, because it is a move: a
 * Project has one structural parent, so linking it to a Goal takes it out of
 * wherever it currently sits.
 */
function LinkProjectSheet({
  goalId,
  goalTitle,
  opener,
  onClose,
}: {
  readonly goalId: string;
  readonly goalTitle: string;
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
}) {
  const revalidator = useRevalidator();
  const { notifySuccess, notifyError } = useFeedback();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  /*
   * The Sheet's own `initialFocusRef` rather than `autoFocus`.
   *
   * A picker whose whole purpose is to be typed into should open with the
   * caret in the field, and the shared Sheet already owns that contract — it
   * places initial focus deliberately and restores it to the opener on close.
   * `autoFocus` would move focus outside the Sheet's own management, which is
   * what the accessibility rule against it is guarding.
   */
  const queryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Debounced, and aborted on every change — a picker must never render the
    // results of a query the owner has already typed past.
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetch(
        `/goals/${encodeURIComponent(goalId)}/link-projects?q=${encodeURIComponent(query)}`,
        { signal: controller.signal, headers: { accept: "application/json" } },
      )
        .then(
          (response) => response.json() as Promise<GoalLinkProjectOptionsData>,
        )
        .then((data) => setOptions(data.options ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [goalId, query]);

  const link = useCallback(
    async (projectId: string, projectTitle: string) => {
      setPendingId(projectId);
      try {
        const body = new FormData();
        // The PROJECT's own trusted intent. It re-verifies the parent's kind
        // and workspace ownership server-side; this call is a request, never an
        // assertion.
        body.set("intent", "move");
        body.set("parentId", goalId);
        const response = await fetch(
          `/projects/${encodeURIComponent(projectId)}/mutate`,
          { method: "POST", body, headers: { accept: "application/json" } },
        );
        const result = (await response.json()) as {
          readonly ok: boolean;
          readonly formError?: string;
        };
        if (!result.ok) {
          notifyError(
            result.formError ?? "That couldn’t be saved. Please try again.",
          );
          return;
        }
        revalidator.revalidate();
        notifySuccess(`${projectTitle} now advances ${goalTitle}.`);
        onClose();
      } catch {
        notifyError("That couldn’t be saved. Please try again.");
      } finally {
        setPendingId(null);
      }
    },
    [goalId, goalTitle, notifyError, notifySuccess, onClose, revalidator],
  );

  return (
    <Sheet
      title="Link a project"
      description={`Move a Project under ${goalTitle}, so its work advances this Goal.`}
      opener={opener}
      initialFocusRef={queryRef}
      onClose={onClose}
    >
      <div className="dh-goalchips__picker">
        <label className="dh-field">
          <span className="dh-field__label-text">Search projects</span>
          <input
            className="dh-input"
            type="search"
            value={query}
            ref={queryRef}
            placeholder="Search projects…"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {failed ? (
          <p className="dh-goalchips__picker-note" role="status">
            We couldn’t load your projects. Please try again.
          </p>
        ) : loading ? (
          <p className="dh-goalchips__picker-note" role="status">
            Searching…
          </p>
        ) : options.length === 0 ? (
          <p className="dh-goalchips__picker-note" role="status">
            {query.length > 0
              ? `No projects match “${query}”.`
              : "Every project already advances this Goal, or there are none yet."}
          </p>
        ) : (
          <ul className="dh-goalchips__picker-list">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className="dh-goalchips__picker-option"
                  disabled={pendingId !== null}
                  onClick={() => void link(option.value, option.label)}
                >
                  <span className="dh-goalchips__picker-name">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="dh-goalchips__picker-context">
                      {pendingId === option.value
                        ? "Linking…"
                        : option.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
