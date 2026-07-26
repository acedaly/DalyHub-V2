/**
 * AREA-05 — the Area record's Settings tab: the lifecycle & danger section.
 *
 * Composed ENTIRELY from the shared DS-10b Settings system (`~/shared/settings`)
 * over the DS-10 Feedback platform — no bespoke settings screen, confirmation
 * dialog or notification system. It offers the two distinct Area lifecycle
 * actions, with the friction each deserves:
 *
 *   - **Archive / Restore** — the normal, reversible action. `DangerousAction` in a
 *     `tone="danger"` group, NO typed phrase (reversible). Archiving preserves
 *     every child Goal/Project/Task, link and Activity; it only hides the Area from
 *     active collections while keeping it readable by URL. An archived Area shows a
 *     plain (non-danger) Restore instead.
 *   - **Delete permanently** — the exceptional, irreversible action, guarded hard.
 *     When the Area still has dependents, it shows a calm explanation and the
 *     blocking counts (grouped, with links where practical) and offers NO delete
 *     button — no bypass. Only when the Area is genuinely empty does it render a
 *     `DangerousAction` with a TYPED confirmation whose phrase is the Area's exact
 *     title, so Confirm stays disabled until the title matches.
 *
 * The component encodes no server rule: it renders from the loader-supplied
 * archival state and dependency summary and calls the async `onArchive`/
 * `onRestore`/`onDelete` callbacks (which post to the trusted
 * `/areas/:areaId/mutate` action). The trusted repository boundary re-checks
 * deletion eligibility atomically, so this UI is advisory, never the gate.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { AreaDependencySummary } from "~/kernel/areas";
import {
  ConfirmationDialog,
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";
import { useFeedback } from "~/shared/feedback";

import {
  areaDependencyBlockers,
  type SerializedAreaOverview,
} from "./area-view";

export interface AreaSettingsTabProps {
  readonly overview: SerializedAreaOverview;
  readonly dependencies: AreaDependencySummary;
  /** Archive the Area (`archive`). Reject (typed message) to fail. */
  readonly onArchive: () => Promise<void>;
  /** Restore an archived Area (`restore`). Reject to fail. */
  readonly onRestore: () => Promise<void>;
  /** Permanently delete the empty Area (`delete`). Reject (typed message) to fail
   * and keep the dialog open with an inline error + retry. */
  readonly onDelete: () => Promise<void>;
}

function LifecycleStateRow({ archived }: { readonly archived: boolean }) {
  return (
    <SettingsRow
      label="Lifecycle state"
      description="Whether this Area appears in your active Areas and creation pickers."
      control={
        <span
          className="dh-settings-readonly-value"
          data-state={archived ? "archived" : "active"}
        >
          {archived ? "Archived" : "Active"}
        </span>
      }
    />
  );
}

function ArchiveGroup({
  overview,
  onArchive,
}: {
  readonly overview: SerializedAreaOverview;
  readonly onArchive: () => Promise<void>;
}) {
  return (
    <SettingsGroup
      title="Archive"
      description="Move this Area out of your active Areas. Everything inside it is kept, and you can restore it at any time."
      tone="danger"
    >
      <DangerousAction
        label="Archive this Area"
        description="It leaves your active Areas and creation pickers, but stays readable and fully intact."
        actionLabel="Archive area…"
        confirmTitle="Archive this Area?"
        confirmBody={
          <>
            <p>
              Archiving <strong>{overview.title}</strong> moves it out of your
              active Areas.
            </p>
            <ul>
              <li>
                Its Goals, Projects, Tasks, links and history are all preserved.
              </li>
              <li>
                It stops appearing in your active Areas list and in creation
                pickers, but stays readable at its own address.
              </li>
              <li>You can restore it at any time from this page.</li>
            </ul>
          </>
        }
        confirmLabel="Archive area"
        busyLabel="Archiving…"
        successMessage="Area archived"
        onConfirm={onArchive}
      />
    </SettingsGroup>
  );
}

function RestoreGroup({
  onRestore,
}: {
  readonly onRestore: () => Promise<void>;
}) {
  const feedback = useFeedback();
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  const confirm = useCallback(async () => {
    await onRestore();
    feedback.notifySuccess("Area restored");
  }, [onRestore, feedback]);

  return (
    <SettingsGroup
      title="Archived"
      description="This Area is archived and hidden from your active Areas. Restore it to bring it back."
    >
      <SettingsRow
        label="Restore this Area"
        description="Bring it back into your active Areas and creation pickers. Nothing inside it changed."
        control={
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            onClick={(event) => {
              setOpener(event.currentTarget);
              setOpen(true);
            }}
          >
            Restore area…
          </button>
        }
      />
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        title="Restore this Area?"
        confirmLabel="Restore area"
        busyLabel="Restoring…"
        tone="default"
        opener={opener}
      >
        <p>
          This brings it back into your active Areas and creation pickers. Its
          Goals, Projects, Tasks and links are unaffected.
        </p>
      </ConfirmationDialog>
    </SettingsGroup>
  );
}

function DeleteBlockedGroup({
  dependencies,
}: {
  readonly dependencies: AreaDependencySummary;
}) {
  const blockers = areaDependencyBlockers(dependencies);
  return (
    <SettingsGroup
      title="Delete permanently"
      description="This Area still contains records, so it can't be permanently deleted yet."
      tone="danger"
    >
      <div className="dh-area-delete-blocked">
        <p>
          To delete this Area permanently, first move, archive or delete
          everything it still holds:
        </p>
        <ul className="dh-area-delete-blocked__list">
          {blockers.map((blocker) => (
            <li key={blocker.id}>
              {blocker.href ? (
                <a href={blocker.href}>{blocker.label}</a>
              ) : (
                <span>{blocker.label}</span>
              )}
            </li>
          ))}
        </ul>
        <p>
          Permanent deletion is only offered once this Area is empty. Nothing is
          ever cascade-deleted for you.
        </p>
      </div>
    </SettingsGroup>
  );
}

function DeleteGroup({
  overview,
  onDelete,
}: {
  readonly overview: SerializedAreaOverview;
  readonly onDelete: () => Promise<void>;
}) {
  return (
    <SettingsGroup
      title="Delete permanently"
      description="This Area is empty, so it can be permanently deleted. This cannot be undone."
      tone="danger"
    >
      <DangerousAction
        label="Delete this Area permanently"
        description="This removes the Area for good. It cannot be undone."
        actionLabel="Delete area…"
        confirmTitle="Delete this Area permanently?"
        confirmBody={
          <>
            <p>
              This permanently deletes <strong>{overview.title}</strong>. This
              action <strong>cannot be undone</strong>.
            </p>
            <p>
              To confirm, type the Area's exact name below. Deletion stays
              disabled until it matches.
            </p>
          </>
        }
        confirmLabel="Delete area permanently"
        busyLabel="Deleting…"
        typedConfirmation={{
          phrase: overview.title,
          label: "Type the Area name to confirm",
          placeholder: overview.title,
        }}
        successMessage="Area deleted"
        onConfirm={onDelete}
      />
    </SettingsGroup>
  );
}

export function AreaSettingsTab({
  overview,
  dependencies,
  onArchive,
  onRestore,
  onDelete,
}: AreaSettingsTabProps) {
  const archived = overview.archivedAt !== null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previousArchived = useRef(archived);

  // Belt-and-braces with SettingsLayout's own focus safety net: when the archived
  // flag flips (archive ↔ restore) the conditional group swaps, so reclaim focus to
  // the settings region rather than let it fall to <body>.
  useEffect(() => {
    if (previousArchived.current === archived) {
      return;
    }
    previousArchived.current = archived;
    const frame = requestAnimationFrame(() => {
      const settings = rootRef.current?.querySelector<HTMLElement>(
        ".dh-settings[aria-label='Area settings']",
      );
      settings?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [archived]);

  return (
    <div className="dh-area-settings" ref={rootRef}>
      <h2 className="dh-visually-hidden">Settings</h2>
      <SettingsLayout aria-label="Area settings">
        <SettingsGroup
          title="Lifecycle"
          description="Where this Area sits in its life — active, archived, or ready to remove."
        >
          <LifecycleStateRow archived={archived} />
        </SettingsGroup>
        {archived ? (
          <RestoreGroup onRestore={onRestore} />
        ) : (
          <ArchiveGroup overview={overview} onArchive={onArchive} />
        )}
        {dependencies.deletable ? (
          <DeleteGroup overview={overview} onDelete={onDelete} />
        ) : (
          <DeleteBlockedGroup dependencies={dependencies} />
        )}
      </SettingsLayout>
    </div>
  );
}
