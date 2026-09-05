import { useEffect, useRef, useState } from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import {
  RemoteChangeBanner,
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
  version,
  onSaved,
  readOnly = false,
}: {
  meetingId: string;
  field: "agendaMarkdown" | "notesMarkdown";
  label: string;
  initial: string;
  /**
   * HARDEN-06B (F-01) — the meeting's `detailsUpdatedAt`, as the loader
   * serialised it: the version `initial` came from, and therefore the version
   * every save quotes.
   */
  version: string;
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
      version={version}
      onSaved={onSaved}
    />
  );
}

/**
 * HARDEN-06B (F-01) — is `candidate` a strictly newer version than `against`?
 * Both are the server's own ISO-8601 UTC timestamps, so lexicographic order IS
 * chronological order. The same helper `NoteContentForm` uses, for the same
 * reason: the value handed to the coordinator must only ever move forward, or a
 * clean editor could silently adopt older text.
 */
function isNewerVersion(candidate: string | null, against: string): boolean {
  return candidate !== null && candidate > against;
}

/**
 * The body `meetings/routes/mutate.tsx` answers a save with — refused (`409`)
 * or accepted. Both carry `detailsUpdatedAt`, because both are an authority on
 * the version this editor must quote next: on refusal it is the version that
 * won, and on acceptance it is the version this save itself produced.
 */
type MeetingMutationResponse = {
  readonly ok?: boolean;
  readonly conflict?: boolean;
  readonly serverAgendaMarkdown?: string;
  readonly serverNotesMarkdown?: string;
  readonly detailsUpdatedAt?: string | null;
};

/**
 * HARDEN-06B (F-01) — the editing half, and the reason this file changed.
 *
 * The agenda and notes are WHOLE documents that autosave in full, so before
 * this every save was a blind last-write-wins: two tabs, or a laptop and a
 * phone, and whichever saved second silently replaced the other's paragraphs
 * with no trace and no recovery (`meeting.updated` carries an empty payload).
 *
 * Two mechanisms close it, and they are the two the Note body already uses —
 * deliberately, so there is ONE reconciliation contract in the product rather
 * than a Meetings-only second one:
 *
 *   - `serverValue` opts into the shared DS-06 reconciliation: a change made
 *     elsewhere is ADOPTED while this editor is clean and OFFERED (never
 *     applied, never lost) while it is dirty.
 *   - every save quotes the version it was written against, so when nothing
 *     revalidated between load and save the SERVER refuses rather than
 *     overwrites, and that refusal lands in the same banner.
 */
function MeetingMarkdownEditor({
  meetingId,
  field,
  label,
  initial,
  version,
  onSaved,
}: {
  meetingId: string;
  field: "agendaMarkdown" | "notesMarkdown";
  label: string;
  initial: string;
  version: string;
  onSaved: () => void;
}) {
  /*
   * The version this editor's committed text came from. A ref, not state,
   * because `onSave` must read it without being re-created mid-save. It only
   * ever moves FORWARD, and only from an authority: the version THIS EDITOR'S
   * OWN accepted save produced, a newer loader value this editor has taken on,
   * or the version a refused save came back with — and the last of those only
   * once the owner has answered the banner. Advancing it on refusal alone would
   * make the very next save succeed silently, which is the overwrite this whole
   * mechanism exists to stop.
   */
  const baseVersion = useRef(version);
  const [refused, setRefused] = useState<{
    readonly text: string;
    readonly version: string | null;
  } | null>(null);

  // A refused save is fresher than the last loader value BY DEFINITION — it is
  // why the save was refused — so it wins until the loader catches up.
  const refusedIsNewer =
    refused !== null && isNewerVersion(refused.version, version);
  const serverText = refusedIsNewer ? refused.text : initial;
  const serverVersion = refusedIsNewer ? refused.version! : version;

  const a = useAutosaveField({
    initialValue: initial,
    serverValue: serverText,
    debounceMs: 1200,
    onSave: async (value, signal) => {
      const b = new FormData();
      b.set("intent", "update");
      b.set(field, value);
      // Always sent, so the server always has a precondition to check.
      b.set("expectedUpdatedAt", baseVersion.current);
      const r = await fetch(`/meeting/${meetingId}/mutate`, {
        method: "POST",
        body: b,
        signal,
      });
      let data: MeetingMutationResponse;
      try {
        data = (await r.json()) as MeetingMutationResponse;
      } catch {
        throw new Error("save rejected");
      }
      if (r.ok && data.ok === true) {
        /*
         * HARDEN-06B (F-01) — take the version OUR OWN SAVE produced, before
         * anything revalidates.
         *
         * `onSaved()` asks the route to reload, and until that reload landed
         * this ref still held the version from BEFORE this save. A second save
         * made inside that window — clear the notes, blur; type, blur, correct
         * a word, blur — therefore quoted a version its own predecessor had
         * already superseded, and the server refused it: a "changed elsewhere"
         * banner naming the owner's own keystrokes, with the second edit not
         * saved. MEASURED as `meetings-concurrency.spec.ts:282` timing out in
         * `page.waitForResponse` on CI runs 32629099619, 32818657005 and
         * 33980952506 (p08) — the POST it waited for was answered `409`, so an
         * `ok()`-only predicate never saw it.
         *
         * The response is the most direct authority there is for this fact, and
         * `isNewerVersion` keeps the ref's forward-only rule intact.
         */
        if (
          isNewerVersion(data.detailsUpdatedAt ?? null, baseVersion.current)
        ) {
          baseVersion.current = data.detailsUpdatedAt!;
        }
        onSaved();
        return;
      }
      if (r.status === 409 && data.conflict === true) {
        /*
         * Refused. The draft is still in the editor (the coordinator keeps it
         * and returns to `unsaved`) and the newer stored text is still on the
         * server, so nothing is lost in either direction and the owner picks.
         */
        setRefused({
          text:
            (field === "agendaMarkdown"
              ? data.serverAgendaMarkdown
              : data.serverNotesMarkdown) ?? "",
          version: data.detailsUpdatedAt ?? null,
        });
        // Bring the record's other surfaces up to date with the change that was
        // just discovered; this editor's own text is untouched by it.
        onSaved();
        return { outcome: "conflict" as const };
      }
      throw new Error("save rejected");
    },
  });

  /*
   * Keep the quoted base in step with the text this editor actually holds. It
   * advances only while nothing is parked for the owner to decide on — which is
   * exactly when the coordinator has adopted the server's version silently (a
   * clean editor takes it) or the owner has answered the banner. While a change
   * is parked, the base stays put, so a save attempted before they answer is
   * refused again rather than quietly winning.
   */
  const remoteParked = a.remoteValue !== null;
  useEffect(() => {
    if (remoteParked) return;
    if (isNewerVersion(serverVersion, baseVersion.current)) {
      baseVersion.current = serverVersion;
    }
  }, [serverVersion, remoteParked]);

  return (
    <>
      <UnsavedChangesGuard
        when={["unsaved", "saving", "error"].includes(a.status)}
      />
      {a.remoteValue !== null ? (
        <RemoteChangeBanner
          what={`This meeting’s ${label.toLowerCase()}`}
          saving={a.status === "saving"}
          onAdopt={a.adoptRemote}
          onDismiss={a.dismissRemote}
        />
      ) : null}
      <LiveMarkdownEditor
        label={label}
        value={a.value}
        onChange={a.onChange}
        /*
         * While a change is parked, a blur does not attempt a save: the base is
         * deliberately held until the owner answers, so such a save is CERTAIN
         * to be refused — and it would disable the banner's own buttons for its
         * duration, right as the owner reaches for them.
         */
        onBlur={() => {
          if (a.remoteValue === null) a.onBlur();
        }}
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
