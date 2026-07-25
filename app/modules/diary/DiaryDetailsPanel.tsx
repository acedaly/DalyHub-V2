/**
 * DIARY-01 / DIARY-01B — the entry details panel (hosted in the shared DS-10
 * Inspector: docked beside the timeline on desktop, a modal sheet on mobile).
 *
 * Opening an entry preserves the timeline context: the Inspector reflows the page
 * rather than covering it on wide screens, and becomes a focus-trapped sheet on
 * mobile — one shared implementation, no bespoke drawer. Selection is route-backed
 * (`?inspector=view:<id>` / `edit:<id>`), so it is deep-linkable and Back/Forward
 * correct, and focus restores to the row on close (the Inspector owns that).
 *
 * A polished READ state (title, type, occurred date/time, backdated status, body,
 * created/updated) with a deliberate EDIT state — the edit form saves title through
 * `EntityRepository.update` and the detail slice through `DiaryRepository.update`
 * (ADR-041's split ownership), reporting partial success honestly. NOTHING is
 * fabricated: mood, attendees, links, attachments and projects are omitted cleanly
 * because the current data model does not carry them. Markdown is rendered only
 * through the one FND-08 sink, lazily loaded.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { useFeedback } from "~/shared/feedback";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  MarkdownField,
  SaveStatusIndicator,
  SelectField,
  TextField,
  required as requiredRule,
  useForm,
  type AutosaveStatus,
  type SubmitOutcome,
} from "~/shared/forms";
import { MarkdownContent } from "~/shared/markdown";

import { entryTypeOptions } from "./diary-view";
import { WhenField } from "./WhenField";
import type {
  DiaryEntryEditData,
  DiaryEntryEditResponse,
} from "./routes/entry";
import type { DiaryMutationResult } from "./routes/mutate";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  entryType: "Type",
  body: "Details",
  when: "When",
};

type Values = {
  readonly title: string;
  readonly entryType: string;
  readonly body: string;
  readonly when: string;
};

export type DetailsPanelMode = "read" | "edit";

export interface DiaryDetailsHostProps {
  readonly entryId: string;
  readonly initialMode: DetailsPanelMode;
  /** Called after a successful save (to revalidate the timeline). */
  readonly onChanged: () => void;
  /** Close the panel (delegates to the Inspector). */
  readonly onClose: () => void;
}

/**
 * Loads the entry, then renders the read view or edit form. Kept separate so the
 * edit form mounts with real initial values (so `useForm`'s dirty baseline is
 * correct from the first render).
 */
export function DiaryDetailsHost({
  entryId,
  initialMode,
  onChanged,
  onClose,
}: DiaryDetailsHostProps) {
  const fetcher = useFetcher<DiaryEntryEditResponse>();
  const [mode, setMode] = useState<DetailsPanelMode>(initialMode);
  // Track the LAST entry id we loaded: if the panel key changes while this
  // instance is retained, reload the new id rather than showing the stale one.
  const requestedId = useRef<string | null>(null);

  useEffect(() => {
    if (requestedId.current !== entryId) {
      requestedId.current = entryId;
      setMode(initialMode);
      fetcher.load(`/diary/${encodeURIComponent(entryId)}`);
    }
  }, [entryId, initialMode, fetcher]);

  const reload = useCallback(() => {
    fetcher.load(`/diary/${encodeURIComponent(entryId)}`);
  }, [entryId, fetcher]);

  const data = fetcher.data;
  const matchesCurrent = data?.entry.id === entryId;

  if (data && matchesCurrent) {
    if (mode === "edit") {
      return (
        <DiaryEditForm
          key={`edit:${entryId}`}
          entry={data.entry}
          onSaved={() => {
            onChanged();
            reload();
            setMode("read");
          }}
          onCancel={() => setMode("read")}
        />
      );
    }
    return <DiaryReadView entry={data.entry} onEdit={() => setMode("edit")} />;
  }

  const failed =
    fetcher.state === "idle" &&
    requestedId.current === entryId &&
    !matchesCurrent;

  return (
    <div className="dh-diary-detail__loading" aria-live="polite">
      {failed ? (
        <div className="dh-diary-detail__error">
          <p>That entry is no longer available.</p>
          <FormButton type="button" variant="secondary" onClick={onClose}>
            Close
          </FormButton>
        </div>
      ) : (
        <p className="dh-diary-detail__pending">Loading entry…</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Read view                                                                  */
/* -------------------------------------------------------------------------- */

function DiaryReadView({
  entry,
  onEdit,
}: {
  readonly entry: DiaryEntryEditData;
  readonly onEdit: () => void;
}) {
  return (
    <div className="dh-diary-detail">
      <h3 className="dh-diary-detail__title">{entry.title}</h3>

      <dl className="dh-diary-detail__facts">
        <div className="dh-diary-detail__fact">
          <dt>Type</dt>
          <dd>
            <span className="dh-diary-detail__type">
              {entry.entryTypeLabel}
            </span>
          </dd>
        </div>
        <div className="dh-diary-detail__fact">
          <dt>When</dt>
          <dd>
            <time dateTime={entry.occurredAtIso}>
              {entry.occurredDateLabel} at {entry.occurredTimeLabel}
            </time>
            {entry.backdated ? (
              <span className="dh-diary-detail__badge">Backdated</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <section className="dh-diary-detail__section" aria-label="Details">
        {entry.bodySource.trim().length > 0 ? (
          <DiaryBody source={entry.bodySource} />
        ) : (
          <p className="dh-diary-detail__empty-body">No details recorded.</p>
        )}
      </section>

      <dl className="dh-diary-detail__stamps">
        <div className="dh-diary-detail__fact">
          <dt>Created</dt>
          <dd>{entry.createdLabel}</dd>
        </div>
        {entry.edited ? (
          <div className="dh-diary-detail__fact">
            <dt>Updated</dt>
            <dd>{entry.updatedLabel}</dd>
          </div>
        ) : null}
      </dl>

      <div className="dh-diary-detail__actions">
        <FormButton type="button" variant="primary" onClick={onEdit}>
          Edit entry
        </FormButton>
      </div>
    </div>
  );
}

/** The stored Markdown body, rendered through the one FND-08 sink (lazily loaded). */
function DiaryBody({ source }: { readonly source: string }) {
  const [html, setHtml] = useState<SanitizedMarkdownHtml | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let active = true;
    import("~/platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (!active) return;
        try {
          setHtml(renderMarkdownSource(source).html);
        } catch {
          setRenderFailed(true);
        }
      })
      .catch(() => {
        if (active) setRenderFailed(true);
      });
    return () => {
      active = false;
    };
  }, [source]);

  if (renderFailed) {
    return (
      <p className="dh-diary-detail__render-error">
        This content can’t be shown right now.
      </p>
    );
  }
  if (html === null) {
    return <p className="dh-diary-detail__pending">Rendering…</p>;
  }
  return <MarkdownContent html={html} />;
}

/* -------------------------------------------------------------------------- */
/* Edit form                                                                  */
/* -------------------------------------------------------------------------- */

function saveStatus(
  isSubmitting: boolean,
  submitStatus: string,
  isDirty: boolean,
): AutosaveStatus {
  if (isSubmitting) return "saving";
  if (submitStatus === "error") return "error";
  if (isDirty) return "unsaved";
  return "idle";
}

function DiaryEditForm({
  entry,
  onSaved,
  onCancel,
}: {
  readonly entry: DiaryEntryEditData;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
}) {
  const feedback = useFeedback();
  const options = entryTypeOptions();
  const [partialNotice, setPartialNotice] = useState<string | null>(null);

  const form = useForm<Values>({
    initialValues: {
      title: entry.title,
      entryType: entry.entryType,
      body: entry.bodySource,
      when: entry.occurredLocal,
    },
    fields: { title: { validate: requiredRule("A title is required") } },
    fieldOrder: ["title", "entryType", "when", "body"],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      setPartialNotice(null);
      const body = new FormData();
      body.set("title", values.title);
      body.set("entryType", values.entryType);
      body.set("body", values.body);
      body.set("when", values.when);
      let data: DiaryMutationResult;
      try {
        const response = await fetch(
          `/diary/${encodeURIComponent(entry.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as DiaryMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That entry couldn't be saved. Please try again.",
        };
      }
      if (data.ok) {
        feedback.notifySuccess("Entry updated");
        onSaved();
        return { status: "success" };
      }
      if (data.savedParts && data.savedParts.length > 0) {
        setPartialNotice(
          "Some changes were saved before an error. Reopen the entry to see the current state.",
        );
      }
      return {
        status: "error",
        formError: data.formError,
        fieldErrors: data.fieldErrors as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  const titleField = form.field("title");
  const typeField = form.field("entryType");
  const bodyField = form.field("body");
  const whenField = form.field("when");

  return (
    <Form
      aria-label="Edit entry"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
      className="dh-diary-editor"
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />
      <TextField label="Title" required maxLength={512} {...titleField} />
      <SelectField label="Type" options={options} {...typeField} />
      <WhenField binding={whenField} label="When" required />
      <MarkdownField
        label="Details"
        rows={8}
        placeholder="Optional notes, in Markdown."
        showOptionalCue={false}
        {...bodyField}
      />
      {partialNotice ? (
        <p className="dh-diary-editor__partial" role="status">
          {partialNotice}
        </p>
      ) : null}
      <div className="dh-diary-editor__footer">
        <SaveStatusIndicator
          status={saveStatus(
            form.isSubmitting,
            form.submit.status,
            form.isDirty,
          )}
          error={form.formError}
        />
        <FormActions>
          <FormButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={form.isSubmitting}
          >
            Cancel
          </FormButton>
          <FormButton
            type="submit"
            variant="primary"
            pending={form.isSubmitting}
            disabled={!form.isDirty}
          >
            Save changes
          </FormButton>
        </FormActions>
      </div>
    </Form>
  );
}
