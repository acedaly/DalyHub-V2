/**
 * STEER-04 (DEBT-210) — "New Project for this Goal".
 *
 * ── The dead end it removes ────────────────────────────────────────────────
 * A Goal whose alignment reads *"No contribution path"* — the product's own
 * diagnosis that *"this Goal was never given a path"* — offered nothing to do
 * about it. `GoalProjectChips`'s "Link project" only re-parents an EXISTING
 * Project, and the Projects tab's empty state said *"Projects created for this
 * Goal appear here"* while naming no way to create one. The distance from "this
 * Goal needs me" to acting was: leave the record, open `/projects/new`, and
 * re-find the Goal in a picker.
 *
 * ── What this is, and what it is not ───────────────────────────────────────
 * It is a DOOR, not a flow. It opens the ONE shared `NewProjectForm` in the
 * DS-03 Drawer with the Goal as its decided parent; the form posts the same
 * `parentId` to the same trusted `POST /projects/new`, and the server resolves
 * the parent's KIND from the id and re-verifies it belongs to this workspace,
 * exactly as it does for a Project created from `/projects`. Nothing about
 * Project creation is duplicated, weakened or bypassed:
 *
 *   - `SpineRepository.createProject` remains the single creation authority;
 *   - the Goal→Project relationship is `project.advances_goal`, written by that
 *     authority, so the new Project is contributing structure the instant it
 *     exists — no manual re-linking, and the Goal's contribution, alignment and
 *     movement all see it on the next read;
 *   - Project defaults are untouched: it is the same form, so a Project created
 *     here is indistinguishable from one created anywhere else.
 *
 * It creates NOTHING automatically. The owner names the Project and saves it;
 * ADR-111 and `AGENTS.md` §8 both rule out the product creating structure on
 * the owner's behalf.
 *
 * ── The Drawer key ─────────────────────────────────────────────────────────
 * `new-project` — deep-linkable through DS-03's URL contract like every other
 * drawer, so the door survives a refresh and Back closes it. On a phone the
 * Drawer is the same full-height sheet every other creation form uses; there is
 * no second layout here.
 */

import { useNavigate } from "react-router";

import { useDrawer } from "~/shared/drawer";

import { NewProjectForm } from "./NewProjectForm";

/** The Drawer key a Goal surface opens to create a contributing Project. */
export const NEW_PROJECT_FOR_GOAL_KEY = "new-project";

/** The Drawer panel's title and description, stated once. */
export const NEW_PROJECT_FOR_GOAL_TITLE = "New Project";

export function newProjectForGoalDescription(goalTitle: string): string {
  return `Give ${goalTitle} a Project to advance it.`;
}

export function NewProjectForGoalDrawer({
  goalId,
  goalTitle,
}: {
  readonly goalId: string;
  readonly goalTitle: string;
}) {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();
  return (
    <NewProjectForm
      // No seed options are read: the picker is not rendered, so a workspace
      // read for it would be work with no consumer.
      parentOptions={[]}
      fixedParent={{ id: goalId, label: goalTitle }}
      onCreated={(projectId) =>
        navigate(`/projects/${encodeURIComponent(projectId)}`)
      }
      onCancel={closeDrawer}
    />
  );
}
