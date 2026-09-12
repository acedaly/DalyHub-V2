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
 *
 * ── UNTITLED-07 — the chips, the heading and the picker ────────────────────
 *
 * `goals.css` drew all three: a hand-written pill with its own radius, border
 * and hover; a heading rung that matched nothing else on the pane; and a picker
 * whose search field was a bare `.dh-input` and whose results were a bordered
 * `<ul>` of `<button>`s with a hand-rolled hover. The picker's field in
 * particular was the cascade problem this migration keeps finding: `ui.css` is
 * unlayered, so `.dh-input` repainted the control's height, radius and focus
 * ring whatever an Untitled utility said.
 *
 * Now: the section heading is Untitled's `application/section-headers`
 * (`SectionLabel.Root`), the actions are the shared Untitled-backed `Button`,
 * the picker's field is the genuine `base/input` `InputBase` with its search
 * icon, and the results are Untitled's divided list body
 * (`divide-y divide-secondary`) with its own `hover:bg-primary_hover`.
 *
 * The chip itself stays a LINK rather than becoming Untitled's `base/tags`
 * `Tag`: a `TagGroup` is a React Aria selection collection whose items are
 * selected or removed, and these are destinations. It takes Untitled's `modern`
 * badge geometry — a hairline ring on the primary surface — so it sits in the
 * same family as every other chip in the product without claiming an
 * interaction model it does not have.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";

import { SearchLg } from "@untitledui/icons";

import { DrawerTrigger } from "~/shared/drawer";
import { AccentIcon } from "~/shared/entity";
import { NEW_PROJECT_FOR_GOAL_KEY } from "~/shared/project-creation";
import { useFeedback } from "~/shared/feedback";
import type { SelectOption } from "~/shared/forms/types";
import { PlusIcon } from "~/shared/icons";
import { Sheet } from "~/shared/sheet";

import type { SerializedGoalProjectItem } from "./goal-view";
import type { GoalLinkProjectOptionsData } from "./routes/link-projects";
import { Button, buttonClassName } from "~/shared/ui";
import { InputBase } from "~/shared/ui/untitled/base/input/input";
import { SectionLabel } from "~/shared/ui/untitled/application/section-headers/section-label";

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
    <section
      className="dh-goalchips flex min-w-0 flex-col gap-3 border-t border-secondary px-4 py-4 md:px-5"
      aria-labelledby={headingId}
    >
      <div className="dh-goalchips__head flex flex-wrap items-start justify-between gap-3">
        <SectionLabel.Root
          className="dh-goalchips__title min-w-0"
          title={<span id={headingId}>Linked projects</span>}
          description="The work that advances this Goal."
        />
        <div className="dh-goalchips__actions flex flex-wrap gap-2">
          {/*
           * STEER-04 (DEBT-210) — CREATE the missing structure, beside the
           * action that only re-parents an existing Project.
           *
           * The two are genuinely different verbs and the register named the
           * gap: "`GoalProjectChips`'s '+ Link project' only re-parents an
           * EXISTING Project". This opens the ONE shared Project form with the
           * Goal as its decided, server-verified parent.
           */}
          <DrawerTrigger
            drawerKey={NEW_PROJECT_FOR_GOAL_KEY}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
            data-testid="goal-chips-new-project"
          >
            <PlusIcon aria-hidden="true" />
            New Project
          </DrawerTrigger>
          <Button
            ref={openerRef}
            variant="secondary"
            size="sm"
            icon={<PlusIcon aria-hidden="true" />}
            data-testid="goal-link-project"
            onClick={() => setPicking(true)}
          >
            Link project
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        /*
         * One quiet invitation, not an empty-card graveyard (§9). A Goal with
         * nothing advancing it is an ordinary state — it is how every Goal
         * starts — so the copy says what a link would do rather than treating
         * the absence as a problem.
         */
        <p className="dh-goalchips__empty m-0 text-sm text-tertiary">
          No Projects advance this Goal yet. Linking one moves it under{" "}
          {goalTitle}.
        </p>
      ) : (
        <ul className="dh-goalchips__list m-0 flex list-none flex-wrap gap-2 p-0">
          {projects.map((project) => (
            <li key={project.id} className="min-w-0">
              {/*
               * Untitled's `modern` badge geometry, on a link: a hairline ring
               * on the primary surface, at the badge's own radius and type rung.
               */}
              <Link
                className="dh-goalchips__chip flex min-w-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-sm font-medium text-secondary shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                to={`/projects/${encodeURIComponent(project.id)}`}
                data-testid="goal-project-chip"
              >
                <span
                  className="dh-goalchips__mark inline-flex shrink-0"
                  aria-hidden="true"
                >
                  <AccentIcon entityType="project" iconKey={null} size="sm" />
                </span>
                <span className="dh-goalchips__name max-w-56 truncate">
                  {project.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > projects.length ? (
        <p className="dh-goalchips__more m-0 text-sm">
          <Link
            className="rounded-sm font-medium text-brand-secondary hover:text-brand-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            to={`/goals/${encodeURIComponent(goalId)}?tab=projects`}
          >
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
      <div className="dh-goalchips__picker flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            className="text-sm font-medium text-secondary"
            htmlFor="goal-link-project-search"
          >
            Search projects
          </label>
          {/*
           * The genuine Untitled `base/input`, with its own search icon. The
           * legacy `.dh-field` / `.dh-input` pair drew a second field system on
           * an overlay that already renders Untitled-backed controls elsewhere.
           */}
          <InputBase
            id="goal-link-project-search"
            ref={queryRef}
            icon={SearchLg}
            type="search"
            value={query}
            placeholder="Search projects…"
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        {failed ? (
          <p
            className="dh-goalchips__picker-note m-0 text-sm text-tertiary"
            role="status"
          >
            We couldn’t load your projects. Please try again.
          </p>
        ) : loading ? (
          <p
            className="dh-goalchips__picker-note m-0 text-sm text-tertiary"
            role="status"
          >
            Searching…
          </p>
        ) : options.length === 0 ? (
          <p
            className="dh-goalchips__picker-note m-0 text-sm text-tertiary"
            role="status"
          >
            {query.length > 0
              ? `No projects match “${query}”.`
              : "Every project already advances this Goal, or there are none yet."}
          </p>
        ) : (
          /* Untitled's divided list body, inside its bounded card boundary. */
          <ul className="dh-goalchips__picker-list m-0 list-none divide-y divide-secondary overflow-hidden rounded-xl p-0 ring-1 ring-secondary">
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className="dh-goalchips__picker-option flex w-full min-w-0 flex-col gap-0.5 px-4 py-3 text-left transition duration-100 ease-linear hover:bg-primary_hover focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pendingId !== null}
                  onClick={() => void link(option.value, option.label)}
                >
                  <span className="dh-goalchips__picker-name text-sm font-medium text-primary">
                    {option.label}
                  </span>
                  {option.description ? (
                    <span className="dh-goalchips__picker-context text-sm text-tertiary">
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
