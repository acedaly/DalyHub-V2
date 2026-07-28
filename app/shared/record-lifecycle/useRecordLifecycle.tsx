/**
 * PX-04 — the shared record lifecycle actions.
 *
 * ONE hook every record composes so "how do I remove this?" has the SAME answer
 * on every entity: the actions live in the DS-12 Record Header overflow (⋯), in
 * the same order, with the same wording, behind the same confirmation friction.
 *
 * It owns presentation and interaction only:
 *   - it builds the {@link OverflowMenuItem} list (via `lifecycle-copy`, so no
 *     call site invents a label);
 *   - it renders the DS-10b `ConfirmationDialog` for the acts that deserve
 *     friction, reusing the shared modal machinery (no second focus-trap);
 *   - it reports success through the DS-10 Feedback platform.
 *
 * It knows nothing about D1, repositories or routes: the module supplies async
 * `onArchive`/`onRestore`/`onDelete` callbacks that post to its own trusted
 * action, and the server stays the authority. A rejected callback keeps the
 * dialog open with an inline error and a retry — never a silent failure.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { EntityType } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { ArchiveIcon, RestoreIcon, TrashIcon } from "~/shared/icons";
import type { OverflowMenuItem } from "~/shared/overflow-menu";
import { ConfirmationDialog } from "~/shared/settings";

import {
  entityLabel,
  lifecycleBusyLabel,
  lifecycleConfirmLabel,
  lifecycleConfirmTitle,
  lifecycleConsequence,
  lifecycleActionLabel,
  lifecycleSuccessMessage,
  type LifecycleAction,
} from "./lifecycle-copy";

export interface RecordLifecycleOptions {
  /** The record's entity type — the single source of every label. */
  readonly entityType: EntityType;
  /** The record's title, used in confirmation copy and typed confirmation. */
  readonly title: string;
  /** Whether the record is currently archived (drives Archive ↔ Restore). */
  readonly archived?: boolean;
  /** Archive this record. Omit when the entity has no archive concept. */
  readonly onArchive?: () => Promise<void>;
  /** Restore an archived/deleted record. Omit when there is nothing to restore. */
  readonly onRestore?: () => Promise<void>;
  /** Remove this record. Omit when the entity cannot be removed. */
  readonly onDelete?: () => Promise<void>;
  /**
   * `"permanent"` (default) is irreversible: a typed confirmation whose phrase is
   * the record's exact title. `"reversible"` is a soft-delete the caller pairs
   * with a DS-10 Undo toast, so it needs no dialog at all — friction scales with
   * reversibility (AGENTS.md §7).
   */
  readonly deleteMode?: "permanent" | "reversible";
  /**
   * When set, Delete is still *visible* (so the user learns it exists) but is
   * disabled and explains what must happen first — never a hidden capability and
   * never a dead end (AGENTS.md §6).
   */
  readonly deleteBlockedReason?: ReactNode;
  /** Blocks activation while a lifecycle mutation is already in flight. */
  readonly pending?: boolean;
  /** Items placed ABOVE the lifecycle group (e.g. Rename, Edit details). */
  readonly leadingItems?: readonly OverflowMenuItem[];
  /**
   * Raise the shared success message through the DS-10 Feedback platform when an
   * action lands. Defaults to `true`. Set `false` ONLY when the supplied handler
   * already reports the outcome itself (some modules drive the same handler from
   * their Settings tab too) — in that case the handler must use
   * `lifecycleSuccessMessage` so the wording stays the shared one.
   */
  readonly notifyOnSuccess?: boolean;
}

export interface RecordLifecycle {
  /** Pass straight to `RecordLayout`'s `overflowActions` (or a Card's). */
  readonly overflowActions: readonly OverflowMenuItem[];
  /** Render inside the record — the confirmation dialogs this hook owns. */
  readonly dialogs: ReactNode;
}

export function useRecordLifecycle(
  options: RecordLifecycleOptions,
): RecordLifecycle {
  const {
    entityType,
    title,
    archived = false,
    onArchive,
    onRestore,
    onDelete,
    deleteMode = "permanent",
    deleteBlockedReason,
    pending = false,
    leadingItems,
    notifyOnSuccess = true,
  } = options;

  const feedback = useFeedback();
  const [confirming, setConfirming] = useState<LifecycleAction | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  // Capture the opener so `ConfirmationDialog` can restore focus to it on close.
  // The shared `OverflowMenu` closes and refocuses its persistent ⋯ trigger
  // BEFORE running an item's handler, so the element read here is that live
  // trigger — not the menu item, which is already unmounting. Getting that order
  // wrong dropped the keyboard user at the top of the page after cancelling a
  // confirmation (AGENTS.md §15 — no lost focus).
  const requestConfirm = useCallback((action: LifecycleAction) => {
    setOpener(
      typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null),
    );
    setConfirming(action);
  }, []);

  const run = useCallback(
    async (action: LifecycleAction, handler: () => Promise<void>) => {
      await handler();
      if (notifyOnSuccess) {
        feedback.notifySuccess(lifecycleSuccessMessage(action, entityType));
      }
    },
    [feedback, entityType, notifyOnSuccess],
  );

  const deleteAction: LifecycleAction =
    deleteMode === "permanent" ? "delete-permanently" : "delete";

  const overflowActions = useMemo<OverflowMenuItem[]>(() => {
    const items: OverflowMenuItem[] = [...(leadingItems ?? [])];
    let first = true;
    const push = (item: OverflowMenuItem) => {
      // The lifecycle group is separated from the module's own items by one
      // hairline — decorative; the wording already groups them.
      items.push({
        ...item,
        separatorBefore:
          first && items.length > 0 ? true : item.separatorBefore,
      });
      first = false;
    };

    if (archived && onRestore) {
      push({
        id: "lifecycle-restore",
        label: lifecycleActionLabel("restore", entityType),
        icon: <RestoreIcon />,
        disabled: pending,
        onSelect: () => requestConfirm("restore"),
      });
    } else if (!archived && onArchive) {
      push({
        id: "lifecycle-archive",
        label: lifecycleActionLabel("archive", entityType),
        icon: <ArchiveIcon />,
        disabled: pending,
        onSelect: () => requestConfirm("archive"),
      });
    }

    if (onDelete) {
      push({
        id: "lifecycle-delete",
        label: lifecycleActionLabel(deleteAction, entityType),
        icon: <TrashIcon />,
        tone: "danger",
        disabled: pending || deleteBlockedReason !== undefined,
        description: deleteBlockedReason,
        onSelect: () => {
          if (deleteBlockedReason !== undefined) {
            return;
          }
          if (deleteMode === "reversible") {
            // Reversible removal is Undo-first: no dialog, the caller's DS-10
            // Undo toast is the recovery (ADR-042, the Notes reference pattern).
            // Fired without awaiting, so a handler that rejects must not become
            // an unhandled rejection — the shared `useReversibleDelete` already
            // reports its own failures, and this guards a module that supplies
            // its own handler.
            void Promise.resolve(onDelete()).catch(() => {});
            return;
          }
          requestConfirm("delete-permanently");
        },
      });
    }

    return items;
  }, [
    archived,
    deleteAction,
    deleteBlockedReason,
    deleteMode,
    entityType,
    leadingItems,
    onArchive,
    onDelete,
    onRestore,
    pending,
    requestConfirm,
  ]);

  const handler =
    confirming === "archive"
      ? onArchive
      : confirming === "restore"
        ? onRestore
        : confirming === "delete-permanently"
          ? onDelete
          : undefined;

  const dialogs =
    confirming !== null && handler ? (
      <ConfirmationDialog
        open
        opener={opener}
        onClose={() => setConfirming(null)}
        onConfirm={() => run(confirming, handler)}
        title={lifecycleConfirmTitle(confirming, entityType)}
        confirmLabel={lifecycleConfirmLabel(confirming, entityType)}
        busyLabel={lifecycleBusyLabel(confirming)}
        tone={confirming === "restore" ? "default" : "danger"}
        typedConfirmation={
          confirming === "delete-permanently"
            ? {
                phrase: title,
                label: `Type the ${entityLabel(entityType)} name to confirm`,
                placeholder: title,
              }
            : undefined
        }
      >
        <p className="dh-lifecycle-confirm__record">
          <strong>{title}</strong>
        </p>
        <p>{lifecycleConsequence(confirming, entityType)}</p>
        {confirming === "delete-permanently" ? (
          <p>
            To confirm, type the {entityLabel(entityType)}’s exact name below.
            Deletion stays disabled until it matches.
          </p>
        ) : null}
      </ConfirmationDialog>
    ) : null;

  return { overflowActions, dialogs };
}
