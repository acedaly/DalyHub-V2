/**
 * ASSET-01 — the Asset "Settings" tab.
 *
 * Rename / Archive / Restore / Delete, composed from the DS-10b Settings system,
 * mirroring the People/Projects lifecycle convention. Archive is a reversible
 * put-away (a calm button + success toast — undo over confirmation, AGENTS.md §7)
 * and describes the RECORD lifecycle, distinct from the Asset's real-world status;
 * permanent Delete is destructive, guarded behind a confirmation dialog AND behind
 * active relationships (the mutate action refuses while links remain). The callbacks
 * post to `/asset/:id/mutate` (owned by `AssetRecord`).
 */

import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";

import type { SerializedAsset } from "./asset-view";

interface AssetSettingsTabProps {
  readonly asset: SerializedAsset;
  readonly onRename: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => Promise<void>;
  readonly pending: boolean;
}

export function AssetSettingsTab({
  asset,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  pending,
}: AssetSettingsTabProps) {
  return (
    <SettingsLayout aria-label="Asset settings">
      <SettingsGroup title="Name" headingLevel={3}>
        <SettingsRow
          label="Display name"
          description="The name shown everywhere this asset appears."
          control={
            <button
              type="button"
              className="dh-btn dh-btn--secondary"
              onClick={onRename}
            >
              Rename
            </button>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Record lifecycle"
        headingLevel={3}
        description={
          asset.archived
            ? "This asset is archived — hidden from the active collection. Restore it to bring it back. (Archive is separate from the asset’s real-world status.)"
            : "Archive hides this asset from the active collection without deleting it; you can restore it any time. Archive is separate from the asset’s real-world status."
        }
      >
        {asset.archived ? (
          <SettingsRow
            label="Archived"
            description="Bring this asset back into your active collection."
            control={
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={onRestore}
                disabled={pending}
              >
                Restore asset
              </button>
            }
          />
        ) : (
          <SettingsRow
            label="Archive"
            description="Hide this asset from the active collection, keeping all its details."
            control={
              <button
                type="button"
                className="dh-btn dh-btn--secondary"
                onClick={onArchive}
                disabled={pending}
              >
                Archive asset
              </button>
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Danger zone" headingLevel={3} tone="danger">
        <DangerousAction
          label="Delete this asset"
          description="Permanently remove this asset and its details. Blocked while it still has linked records — unlink them first. Linked notes, tasks, people and other records are never deleted."
          actionLabel="Delete asset…"
          confirmTitle={`Delete ${asset.title}?`}
          confirmBody="This permanently removes the asset and its details. It cannot be undone, and is separate from archiving."
          confirmLabel="Delete asset"
          busyLabel="Deleting…"
          successMessage="Asset deleted"
          disabled={pending}
          onConfirm={onDelete}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}
