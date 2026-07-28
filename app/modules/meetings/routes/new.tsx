import { useState } from "react";
import { useNavigate } from "react-router";
function Field({
  name,
  label,
  type = "text",
  error,
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
      />
      {error && (
        <span id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function meta() {
  return [{ title: "New Meeting · DalyHub" }];
}
export default function NewMeeting() {
  const nav = useNavigate(),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = (await fetch("/meetings/create", {
      method: "POST",
      body: new FormData(e.currentTarget),
    }).then((r) => r.json())) as {
      ok: boolean;
      meetingId?: string;
      fieldErrors?: Record<string, string>;
    };
    setBusy(false);
    if (data.ok) nav(`/meeting/${data.meetingId}`);
    else setErrors(data.fieldErrors ?? {});
  }
  return (
    <main className="dh-meeting-new">
      <h1>New Meeting</h1>
      <p>Capture enough to prepare; everything else can be added later.</p>
      <form onSubmit={submit} aria-label="New Meeting">
        <Field name="title" label="Title" required error={errors.title} />
        <Field
          name="startsAt"
          label="Starts"
          type="datetime-local"
          required
          error={errors.startsAt}
        />
        <Field
          name="endsAt"
          label="Ends (optional)"
          type="datetime-local"
          error={errors.endsAt}
        />
        <input type="hidden" name="timezone" value="UTC" />
        <Field name="location" label="Location" />
        <label>
          Mode
          <select name="mode">
            <option value="">Not set</option>
            <option value="in_person">In person</option>
            <option value="phone">Phone</option>
            <option value="online">Online</option>
          </select>
        </label>
        <Field name="meetingUrl" label="Meeting link" type="url" />
        <label>
          Agenda
          <textarea name="agendaMarkdown" rows={8} />
        </label>
        <button className="dh-btn dh-btn--primary" disabled={busy}>
          {busy ? "Creating…" : "Create meeting"}
        </button>
      </form>
    </main>
  );
}
