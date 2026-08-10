import { useEffect, useState } from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import {
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useAutosaveField,
} from "~/shared/forms";
import { MarkdownContent } from "~/shared/markdown";
import { LiveMarkdownEditor } from "~/shared/markdown-editor";

/**
 * A Meeting's Agenda or Notes body, on the Notebook tab.
 *
 * `readOnly` is the meeting's ARCHIVED state, and it is not decoration: the
 * repository refuses every write to an archived meeting, so a live autosaving
 * editor here is a control that invites the owner to type and then answers with
 * a save failure. UIX-04 §26 made the Notebook the tab an archived meeting
 * OPENS on, which put two of those controls at the top of the record — so the
 * archived body is rendered as what it actually is, a document to read.
 */
export function MeetingMarkdown({
  meetingId,
  field,
  label,
  initial,
  onSaved,
  readOnly = false,
}: {
  meetingId: string;
  field: "agendaMarkdown" | "notesMarkdown";
  label: string;
  initial: string;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  // Two components rather than one with a branch, because the editing half owns
  // an autosave hook — and a hook that exists only when the record is live is a
  // hook whose call order changes with the data.
  return readOnly ? (
    <MeetingMarkdownReading label={label} source={initial} />
  ) : (
    <MeetingMarkdownEditor
      meetingId={meetingId}
      field={field}
      label={label}
      initial={initial}
      onSaved={onSaved}
    />
  );
}

function MeetingMarkdownEditor({
  meetingId,
  field,
  label,
  initial,
  onSaved,
}: {
  meetingId: string;
  field: "agendaMarkdown" | "notesMarkdown";
  label: string;
  initial: string;
  onSaved: () => void;
}) {
  const a = useAutosaveField({
    initialValue: initial,
    debounceMs: 1200,
    onSave: async (value, signal) => {
      const b = new FormData();
      b.set("intent", "update");
      b.set(field, value);
      const r = await fetch(`/meeting/${meetingId}/mutate`, {
        method: "POST",
        body: b,
        signal,
      });
      if (!r.ok || ((await r.json()) as { ok: boolean }).ok !== true)
        throw new Error("save rejected");
      onSaved();
    },
  });
  return (
    <>
      <UnsavedChangesGuard
        when={["unsaved", "saving", "error"].includes(a.status)}
      />
      <LiveMarkdownEditor
        label={label}
        value={a.value}
        onChange={a.onChange}
        onBlur={a.onBlur}
        placeholder={
          label === "Agenda"
            ? "What should this meeting cover?"
            : "Capture context, observations and discussion…"
        }
        toolbarLabel={`${label} formatting`}
        statusSlot={
          <SaveStatusIndicator
            status={a.status}
            error={a.error}
            onRetry={a.retry}
          />
        }
      />
    </>
  );
}

/**
 * The stored Markdown, through the ONE FND-08 sink (`renderMarkdownSource` →
 * `MarkdownContent`), lazily loaded exactly as the editor's own Read view loads
 * it — and wearing that view's classes, so an archived body reads identically to
 * a live one that has been toggled to Read rather than inventing a third look.
 */
function MeetingMarkdownReading({
  label,
  source,
}: {
  readonly label: string;
  readonly source: string;
}) {
  const [html, setHtml] = useState<SanitizedMarkdownHtml | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setRenderFailed(false);
    void import("~/platform/markdown")
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

  return (
    // The same root contract the editor publishes — one named `group` per body,
    // so a selector (or a screen reader) finds "Agenda" and "Notes" in the same
    // place whether the meeting is live or archived.
    <div
      className="dh-md-editor"
      data-mode="read"
      data-disabled="true"
      role="group"
      aria-label={label}
    >
      <div className="dh-md-editor__bar">
        <span className="dh-md-editor__reading-note">Reading</span>
      </div>
      <div className="dh-md-editor__reading">
        {source.trim().length === 0 ? (
          <p className="dh-md-editor__reading-empty">Nothing to read yet.</p>
        ) : renderFailed ? (
          <p className="dh-md-editor__reading-error">
            This content can’t be shown right now.
          </p>
        ) : html === null ? (
          <p className="dh-md-editor__reading-loading">Rendering…</p>
        ) : (
          <MarkdownContent html={html} />
        )}
      </div>
    </div>
  );
}
