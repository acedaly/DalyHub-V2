/**
 * DS-10 — Global Inspector, Notifications, Undo & Background operations
 * demonstration route (development only).
 *
 * A FIXTURE, not a product surface. Added to the route tree only when NOT building
 * for production (the `NODE_ENV` guard in `app/routes.ts`), so it never reaches a
 * deployed Worker, and it is not a module (never in registry-driven navigation).
 * It composes ENTIRELY from the shared DS-10 platform (`~/shared/feedback` +
 * `~/shared/inspector`) over DS-01 tokens and DS-06 form controls — there is no
 * bespoke feedback or inspector logic here.
 *
 * All data is in-memory fixture data (no repositories, D1 or bindings). The point
 * is to prove the ONE shared interaction layer every future module inherits:
 * calm notifications, undoable actions, a unified background-operation lifecycle,
 * and the standard depth-editing Inspector.
 */

import { useCallback, useMemo, useState } from "react";

import {
  SaveStatusIndicator,
  TextField,
  required,
  useAutosaveField,
} from "~/shared/forms";
import { useFeedback } from "~/shared/feedback";
import {
  InspectorProvider,
  useInspector,
  type InspectorEntry,
  type InspectorRenderResult,
} from "~/shared/inspector";

import "~/styles/feedback-demo.css";

export function meta() {
  return [{ title: "Feedback & Inspector · DalyHub design fixtures" }];
}

// ---------------------------------------------------------------- fixture data

type DemoRecord = {
  readonly id: string;
  readonly title: string;
  readonly note: string;
};

const INITIAL_RECORDS: readonly DemoRecord[] = [
  {
    id: "r1",
    title: "Draft launch plan",
    note: "Outline the phases and owners.",
  },
  {
    id: "r2",
    title: "Review budget",
    note: "Confirm Q3 numbers with finance.",
  },
  { id: "r3", title: "Plan offsite", note: "Pick dates and a venue." },
];

// ---------------------------------------------------------------- helpers

/** A cancellable, abortable wait used by the background-operation demos. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

// ---------------------------------------------------------------- notifications

function NotificationsPanel() {
  const feedback = useFeedback();
  return (
    <section className="fb-demo__panel" data-testid="notifications-panel">
      <h2>Notifications</h2>
      <p className="fb-demo__note">
        One implementation, four calm tones. Success/info auto-dismiss; warnings
        linger; errors stay until dismissed. Repeats coalesce instead of
        stacking.
      </p>
      <div className="fb-demo__actions">
        <button
          type="button"
          onClick={() =>
            feedback.notifySuccess("Task completed", {
              message: "“Draft launch plan” is done.",
            })
          }
        >
          Success
        </button>
        <button
          type="button"
          onClick={() => feedback.notifyInfo("Sync scheduled")}
        >
          Info
        </button>
        <button
          type="button"
          onClick={() =>
            feedback.notifyWarning("Storage almost full", {
              message: "You’re using 92% of your quota.",
            })
          }
        >
          Warning
        </button>
        <button
          type="button"
          onClick={() =>
            feedback.notifyError("Couldn’t save", {
              message: "You’re offline. We’ll retry when you reconnect.",
            })
          }
        >
          Error
        </button>
        <button
          type="button"
          data-testid="notify-coalesce"
          onClick={() =>
            feedback.notifyInfo("Message received", {
              dedupeKey: "message-received",
            })
          }
        >
          Coalescing repeat
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- undo

function UndoPanel({
  records,
  onDelete,
  onRestore,
}: {
  readonly records: readonly DemoRecord[];
  readonly onDelete: (id: string) => void;
  readonly onRestore: (record: DemoRecord, index: number) => void;
}) {
  const feedback = useFeedback();

  const remove = (record: DemoRecord, index: number) => {
    // Optimistic + reversible: apply immediately, offer Undo (prefer undo over a
    // confirm dialog). Dismissing/expiring commits; Undo restores.
    onDelete(record.id);
    feedback.notifyUndo(`Deleted “${record.title}”`, {
      onUndo: () => onRestore(record, index),
    });
  };

  return (
    <section className="fb-demo__panel" data-testid="undo-panel">
      <h2>Undo</h2>
      <p className="fb-demo__note">
        A platform capability, not per-module logic. Any reversible action gets
        a time-boxed Undo.
      </p>
      <ul className="fb-demo__list">
        {records.map((record, index) => (
          <li key={record.id} className="fb-demo__row">
            <span>{record.title}</span>
            <button type="button" onClick={() => remove(record, index)}>
              Delete
            </button>
          </li>
        ))}
        {records.length === 0 ? (
          <li className="fb-demo__empty">
            All deleted — undo one from its toast.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- operations

function OperationsPanel() {
  const feedback = useFeedback();
  return (
    <section className="fb-demo__panel" data-testid="operations-panel">
      <h2>Background operations</h2>
      <p className="fb-demo__note">
        One shared lifecycle for long-running work (AI, imports, exports, sync):
        pending → running → success | failure, with retry and cancellation.
      </p>
      <div className="fb-demo__actions">
        <button
          type="button"
          data-testid="op-success"
          onClick={() =>
            void feedback
              .runOperation({
                label: "Exporting workspace",
                run: ({ signal }) => wait(600, signal),
                successMessage: "Export ready",
              })
              .catch(() => {})
          }
        >
          Run (succeeds)
        </button>
        <button
          type="button"
          data-testid="op-retry"
          onClick={() => {
            let attempts = 0;
            void feedback
              .runOperation({
                label: "Importing from Todoist",
                retryable: true,
                run: async ({ signal }) => {
                  await wait(500, signal);
                  attempts += 1;
                  if (attempts < 2) {
                    throw new Error("Temporary network error.");
                  }
                },
              })
              .catch(() => {});
          }}
        >
          Run (fails, retryable)
        </button>
        <button
          type="button"
          data-testid="op-cancel"
          onClick={() =>
            void feedback
              .runOperation({
                label: "Syncing calendar",
                description: "This can take a moment",
                cancellable: true,
                run: ({ signal }) => wait(60_000, signal),
              })
              .catch(() => {})
          }
        >
          Run (cancellable)
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- inspector

function InspectorField({
  label,
  initial,
  onCommit,
}: {
  readonly label: string;
  readonly initial: string;
  readonly onCommit: (value: string) => void;
}) {
  const field = useAutosaveField<string>({
    initialValue: initial,
    debounceMs: 300,
    validate: required("This can’t be empty."),
    onSave: async (value) => {
      // Optimistic field-by-field save (no network here); commit to the fixture.
      await new Promise((resolve) => setTimeout(resolve, 150));
      onCommit(value);
    },
  });
  return (
    <div className="fb-demo__field">
      <TextField
        label={label}
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        error={field.validationError}
      />
      <SaveStatusIndicator
        status={field.status}
        error={field.error}
        onRetry={field.retry}
      />
    </div>
  );
}

function InspectorList({
  records,
  onDelete,
}: {
  readonly records: readonly DemoRecord[];
  readonly onDelete: (id: string) => void;
}) {
  const inspector = useInspector();
  return (
    <section className="fb-demo__panel" data-testid="inspector-panel">
      <h2>Inspector</h2>
      <p className="fb-demo__note">
        The standard depth-editing surface for any record. Resizable docked
        panel on desktop, a modal sheet on mobile — one implementation, every
        module.
      </p>
      <ul className="fb-demo__list">
        {records.map((record) => (
          <li key={record.id} className="fb-demo__row">
            <span>{record.title}</span>
            <button
              type="button"
              data-testid={`inspect-${record.id}`}
              onClick={() => inspector.openInspector(`edit:${record.id}`)}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(record.id);
                // Delete from the list keeps the Inspector honest if it was open.
                if (inspector.openKey === `edit:${record.id}`) {
                  inspector.closeInspector();
                }
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p className="fb-demo__hint" aria-hidden="true">
        Tip: restore a deleted record from its Undo toast.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- page

function DesignFeedbackPage() {
  const [records, setRecords] =
    useState<readonly DemoRecord[]>(INITIAL_RECORDS);

  const deleteRecord = useCallback((id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const restoreRecord = useCallback((record: DemoRecord, index: number) => {
    setRecords((prev) => {
      if (prev.some((r) => r.id === record.id)) {
        return prev;
      }
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, record);
      return next;
    });
  }, []);

  const updateRecord = useCallback((id: string, patch: Partial<DemoRecord>) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }, []);

  const renderInspector = useCallback(
    (entry: InspectorEntry): InspectorRenderResult | null => {
      const id = entry.key.startsWith("edit:") ? entry.key.slice(5) : null;
      const record = id ? records.find((r) => r.id === id) : undefined;
      if (!record) {
        return null;
      }
      return {
        title: record.title,
        description: "Edit — changes save as you type",
        children: (
          <div className="fb-demo__inspector-form">
            <InspectorField
              label="Title"
              initial={record.title}
              onCommit={(value) => updateRecord(record.id, { title: value })}
            />
            <InspectorField
              label="Note"
              initial={record.note}
              onCommit={(value) => updateRecord(record.id, { note: value })}
            />
          </div>
        ),
      };
    },
    [records, updateRecord],
  );

  const panels = useMemo(
    () => ({ records, deleteRecord, restoreRecord }),
    [records, deleteRecord, restoreRecord],
  );

  return (
    <InspectorProvider renderInspector={renderInspector}>
      <div className="fb-demo">
        <header className="fb-demo__header">
          <h1>Feedback &amp; Inspector</h1>
          <p>
            DS-10 — the global interaction layer: notifications, undo,
            background operations and the shared Inspector. One implementation,
            inherited by every module.
          </p>
        </header>
        <div className="fb-demo__grid">
          <NotificationsPanel />
          <UndoPanel
            records={panels.records}
            onDelete={panels.deleteRecord}
            onRestore={panels.restoreRecord}
          />
          <OperationsPanel />
          <InspectorList
            records={panels.records}
            onDelete={panels.deleteRecord}
          />
        </div>
      </div>
    </InspectorProvider>
  );
}

export default function DesignFeedbackRoute() {
  return <DesignFeedbackPage />;
}
