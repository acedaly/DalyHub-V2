import {
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useAutosaveField,
} from "~/shared/forms";
import { LiveMarkdownEditor } from "~/shared/markdown-editor";
export function MeetingMarkdown({
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
