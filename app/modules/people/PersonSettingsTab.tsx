/**
 * PEOPLE-01 — the Person "Settings" tab.
 *
 * LIFECYCLE only — Archive / Restore / Delete — composed from the DS-10b
 * Settings system, mirroring the Projects lifecycle convention. Archive is a
 * reversible put-away (a calm button + success toast — undo over confirmation,
 * AGENTS.md §7); Delete is destructive and goes through a confirmation dialog.
 * The callbacks post to `/person/:id/mutate` (owned by `PersonRecord`).
 *
 * EDIT-02 removed the "Name" group. It held one button that opened a Drawer
 * form to change a value shown at the top of the same record — the third place
 * (header action, settings row, drawer form) the product offered for one
 * rename. The heading now edits itself, so this tab holds only the actions that
 * genuinely need explaining before you take them.
 */

import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";

import type { SerializedPerson } from "./person-view";

interface PersonSettingsTabProps {
  readonly person: SerializedPerson;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => Promise<void>;
  readonly pending: boolean;
}

export function PersonSettingsTab({
  person,
  onArchive,
  onRestore,
  onDelete,
  pending,
}: PersonSettingsTabProps) {
  return (
    <SettingsLayout aria-label="Person settings">
      <SettingsGroup
        title="Lifecycle"
        headingLevel={3}
        description={
          person.archived
            ? "This person is archived. Restore them to bring them back to People."
            : "Archive puts this person away without deleting them; you can restore them any time."
        }
      >
        {person.archived ? (
          <SettingsRow
            label="Archived"
            description="Bring this person back into your active People list."
            control={
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={onRestore}
                disabled={pending}
              >
                Restore person
              </button>
            }
          />
        ) : (
          <SettingsRow
            label="Archive"
            description="Hide this person from your active list, keeping all their details."
            control={
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                onClick={onArchive}
                disabled={pending}
              >
                Archive person
              </button>
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Danger zone" headingLevel={3} tone="danger">
        <DangerousAction
          label="Delete this person"
          description="Remove this person and their details from People."
          actionLabel="Delete person…"
          confirmTitle={`Delete ${person.title}?`}
          confirmBody="This removes the person from People. This action is not part of the archive flow."
          confirmLabel="Delete person"
          busyLabel="Deleting…"
          successMessage="Person deleted"
          disabled={pending}
          onConfirm={onDelete}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}
