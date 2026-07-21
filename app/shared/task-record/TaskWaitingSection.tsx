/**
 * TODAY-03 — the Task Drawer's waiting control.
 *
 * A focused, shared-primitive composition (NOT a new form framework) shown in the
 * DS-02 Record Layout Summary, beside completion. It presents the waiting state
 * read-only and, on demand, an explicit-save editor with two mutually-exclusive
 * subject modes: an entity target (the DS-06 async `SelectField` combobox over the
 * waiting-target search) OR a free-text subject (`TextField`). One Save / Cancel,
 * server-authoritative validation, pending controls, and a calm read-only summary.
 *
 * The control owns only local edit state; persistence goes through the callbacks
 * the Drawer supplies (which post to the trusted task action). A completed task is
 * never shown as waiting — the Drawer hides this control's active state via
 * `completed`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EntityIcon, isEntityType } from "~/shared/entity";
import { FormButton, SelectField, TextField } from "~/shared/forms";
import type { SelectOption } from "~/shared/forms/types";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import {
  formatWaitingElapsed,
  formatWaitingSince,
  waitingSubjectLabel,
  type SerializedTaskWaiting,
} from "./task-view";

/** The outcome the Drawer's waiting mutations return to this control. */
export interface WaitingActionOutcome {
  readonly ok: boolean;
  readonly formError?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

type WaitingMode = "entity" | "text";

interface TaskWaitingSectionProps {
  readonly waiting: SerializedTaskWaiting | null;
  readonly completed: boolean;
  readonly searchTargets: (
    query: string,
    signal: AbortSignal,
  ) => Promise<readonly EntityLinkTargetOption[]>;
  readonly onSetWaiting: (
    payload:
      | { readonly mode: "entity"; readonly targetId: string }
      | { readonly mode: "text"; readonly note: string },
  ) => Promise<WaitingActionOutcome>;
  readonly onClear: () => Promise<WaitingActionOutcome>;
  /** Injectable clock for the elapsed label (a test clock keeps it deterministic). */
  readonly nowMs?: number;
}

const SEARCH_DEBOUNCE_MS = 250;

export function TaskWaitingSection({
  waiting,
  completed,
  searchTargets,
  onSetWaiting,
  onClear,
  nowMs,
}: TaskWaitingSectionProps) {
  const active = waiting !== null && !completed;

  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<WaitingMode>("entity");
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [options, setOptions] = useState<readonly SelectOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const optionLabels = useRef(new Map<string, string>());
  const searchSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginEdit = useCallback(() => {
    // Seed the editor from the current waiting subject so a "Change" keeps context.
    if (waiting && waiting.subject.kind === "entity") {
      setMode("entity");
      setTargetId(waiting.subject.id ?? "");
      setSelectedLabel(waiting.subject.title ?? null);
      setNote("");
    } else if (waiting && waiting.subject.kind === "text") {
      setMode("text");
      setNote(waiting.subject.note);
      setTargetId("");
      setSelectedLabel(null);
    } else {
      setMode("entity");
      setTargetId("");
      setNote("");
      setSelectedLabel(null);
    }
    setOptions([]);
    setFieldError(null);
    setFormError(null);
    setEditing(true);
  }, [waiting]);

  const cancel = useCallback(() => {
    setEditing(false);
    setFieldError(null);
    setFormError(null);
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const seq = ++searchSeq.current;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setSearching(true);
        void searchTargets(query, controller.signal)
          .then((results) => {
            if (seq !== searchSeq.current) return;
            for (const r of results) optionLabels.current.set(r.id, r.title);
            setOptions(results.map((r) => ({ value: r.id, label: r.title })));
            setSearching(false);
          })
          .catch(() => {
            if (seq !== searchSeq.current) return;
            setSearching(false);
          });
      }, SEARCH_DEBOUNCE_MS);
    },
    [searchTargets],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Ensure the currently-selected option is always shown, even before/without a
  // search (e.g. re-opening the editor on an existing entity subject).
  const shownOptions = useMemo<readonly SelectOption[]>(() => {
    if (targetId.length === 0) return options;
    if (options.some((o) => o.value === targetId)) return options;
    const label =
      selectedLabel ?? optionLabels.current.get(targetId) ?? targetId;
    return [{ value: targetId, label }, ...options];
  }, [options, targetId, selectedLabel]);

  const save = useCallback(async () => {
    setFieldError(null);
    setFormError(null);
    if (mode === "entity") {
      if (targetId.trim().length === 0) {
        setFieldError("Choose who or what this task is waiting on.");
        return;
      }
    } else if (note.trim().length === 0) {
      setFieldError("Enter what or whom this task is waiting on.");
      return;
    }
    setPending(true);
    try {
      const outcome =
        mode === "entity"
          ? await onSetWaiting({ mode: "entity", targetId })
          : await onSetWaiting({ mode: "text", note });
      if (outcome.ok) {
        setEditing(false);
        return;
      }
      const fieldMessage =
        outcome.fieldErrors?.["waitingTargetId"] ??
        outcome.fieldErrors?.["waitingNote"] ??
        null;
      setFieldError(fieldMessage);
      setFormError(
        fieldMessage ? null : (outcome.formError ?? "That couldn't be saved."),
      );
    } finally {
      setPending(false);
    }
  }, [mode, targetId, note, onSetWaiting]);

  const clear = useCallback(async () => {
    setPending(true);
    setFormError(null);
    try {
      const outcome = await onClear();
      if (!outcome.ok) {
        setFormError(outcome.formError ?? "That couldn't be saved.");
      } else {
        setEditing(false);
      }
    } finally {
      setPending(false);
    }
  }, [onClear]);

  if (editing) {
    return (
      <div className="dh-task-waiting dh-task-waiting--editing">
        <fieldset className="dh-task-waiting__modes">
          <legend className="dh-task-waiting__legend">Waiting on</legend>
          <label className="dh-task-waiting__mode">
            <input
              type="radio"
              name="waiting-mode"
              checked={mode === "entity"}
              onChange={() => {
                setMode("entity");
                setFieldError(null);
              }}
            />
            <span>A record in DalyHub</span>
          </label>
          <label className="dh-task-waiting__mode">
            <input
              type="radio"
              name="waiting-mode"
              checked={mode === "text"}
              onChange={() => {
                setMode("text");
                setFieldError(null);
              }}
            />
            <span>Something else</span>
          </label>
        </fieldset>

        {mode === "entity" ? (
          <SelectField
            label="Which record"
            placeholder="Search people, projects, goals…"
            emptyMessage="No matching records."
            value={targetId}
            options={shownOptions}
            loading={searching}
            onSearch={runSearch}
            onChange={(value) => {
              setTargetId(value);
              setSelectedLabel(optionLabels.current.get(value) ?? null);
              setFieldError(null);
            }}
            error={fieldError}
            required
          />
        ) : (
          <TextField
            label="What it's waiting on"
            placeholder="e.g. finance confirmation"
            help="What or whom is this task waiting on?"
            value={note}
            onChange={(value) => {
              setNote(value);
              setFieldError(null);
            }}
            error={fieldError}
            required
          />
        )}

        {formError ? (
          <p className="dh-task-waiting__error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="dh-task-waiting__actions">
          <FormButton
            type="button"
            variant="primary"
            pending={pending}
            onClick={() => void save()}
          >
            Save
          </FormButton>
          <FormButton
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={cancel}
          >
            Cancel
          </FormButton>
          {active ? (
            <FormButton
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => void clear()}
            >
              Clear waiting
            </FormButton>
          ) : null}
        </div>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="dh-task-waiting">
        <FormButton type="button" variant="secondary" onClick={beginEdit}>
          Mark as waiting
        </FormButton>
      </div>
    );
  }

  const subject = waiting.subject;
  const since = formatWaitingSince(waiting.since);
  const elapsed = formatWaitingElapsed(waiting.since, nowMs ?? Date.now());
  const subjectType = subject.kind === "entity" ? subject.type : null;

  return (
    <div
      className="dh-task-waiting dh-task-waiting--active"
      role="group"
      aria-label="Waiting"
    >
      <p className="dh-task-waiting__label">
        <span className="dh-task-waiting__badge">Waiting</span>
        <span className="dh-task-waiting__subject">
          {subjectType && isEntityType(subjectType) ? (
            <EntityIcon type={subjectType} />
          ) : null}
          <span>{waitingSubjectLabel(subject)}</span>
        </span>
      </p>
      {since ? (
        <p className="dh-task-waiting__since">
          Since {since}
          {elapsed ? ` · ${elapsed}` : ""}
        </p>
      ) : null}
      <div className="dh-task-waiting__actions">
        <FormButton type="button" variant="secondary" onClick={beginEdit}>
          Change
        </FormButton>
        <FormButton
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => void clear()}
        >
          Clear waiting
        </FormButton>
      </div>
    </div>
  );
}
