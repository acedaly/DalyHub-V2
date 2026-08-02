/**
 * PWA-05 — offline capture.
 *
 * The narrow, append-only capture surface: a new Inbox task, a new quick note or
 * a new diary entry. Nothing else is offered, because nothing else can be
 * replayed without conflict analysis this milestone deliberately did not do.
 *
 * The form is unavailable — and says WHY, in one sentence — when this device has
 * never synchronised. That is not a technicality: without a stored snapshot there
 * is no identity + workspace namespace to file the capture under, and a capture
 * with no namespace could be replayed into the wrong workspace when someone signs
 * in later. Refusing is the correct behaviour, and it is stated rather than
 * silently disabling a button.
 */

import { useId, useState } from "react";

import type { OfflineCapturePayload } from "~/kernel/offline";

import { useOffline } from "./OfflineProvider";

const CAPTURE_CHOICES = [
  {
    kind: "task",
    label: "Inbox task",
    hint: "Something to do. Lands in Inbox.",
  },
  { kind: "note", label: "Note", hint: "A title now; write the body online." },
  { kind: "diary", label: "Diary entry", hint: "A moment worth recording." },
] as const;

type CaptureChoice = (typeof CAPTURE_CHOICES)[number]["kind"];

export interface OfflineCaptureFormProps {
  readonly headingLevel?: 2 | 3;
  readonly className?: string;
}

export function OfflineCaptureForm({
  headingLevel = 2,
  className,
}: OfflineCaptureFormProps) {
  const offline = useOffline();
  const titleId = useId();
  const [kind, setKind] = useState<CaptureChoice>("task");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!offline) return null;
  const Heading = `h${headingLevel}` as const;
  // PWA-11 — one of three bounded answers ("checking" is itself bounded by the
  // provider's storage deadline), and the unavailable one always carries the
  // reason. A disabled form that does not say why is a bug report waiting to be
  // written by the only person who uses this.
  const availability = offline.capture;
  const ready = availability.kind === "available";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError("Give it a title — that is all this needs.");
      return;
    }
    const payload: OfflineCapturePayload =
      kind === "task"
        ? { kind: "task", title: trimmed, dueDate: null }
        : kind === "note"
          ? { kind: "note", title: trimmed }
          : { kind: "diary", title: trimmed, entryType: "note" };

    const queued = await offline.enqueue(payload);
    if (!queued) {
      setError(
        "This device could not store the capture. Nothing was lost — try again, or reconnect and capture normally.",
      );
      return;
    }
    setTitle("");
    setMessage(
      offline.status.connection === "online"
        ? "Captured. Synchronising now."
        : "Captured on this device. It will sync when DalyHub is reachable.",
    );
    // A capture made while ONLINE (a flaky connection, a failed request) should
    // not sit waiting: try immediately. Offline, this is a no-op that costs one
    // failed probe.
    void offline.sync();
  };

  return (
    <section
      className={`dh-offline-capture${className ? ` ${className}` : ""}`}
      aria-labelledby={`${titleId}-heading`}
      data-dh-offline-capture={availability.kind}
    >
      <Heading id={`${titleId}-heading`} className="dh-offline-capture__title">
        Capture something
      </Heading>

      {!ready ? (
        <p className="dh-offline-capture__unavailable">
          {availability.kind === "checking"
            ? "Checking what this device has stored. This finishes either way."
            : availability.reason}
        </p>
      ) : (
        <form className="dh-offline-capture__form" onSubmit={submit}>
          <fieldset className="dh-offline-capture__kinds">
            <legend>What is it?</legend>
            {CAPTURE_CHOICES.map((choice) => (
              <label key={choice.kind} className="dh-offline-capture__kind">
                <input
                  type="radio"
                  name="offline-capture-kind"
                  value={choice.kind}
                  checked={kind === choice.kind}
                  onChange={() => setKind(choice.kind)}
                />
                <span className="dh-offline-capture__kind-label">
                  {choice.label}
                </span>
                <span className="dh-offline-capture__kind-hint">
                  {choice.hint}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="dh-offline-capture__field">
            <label htmlFor={`${titleId}-input`}>Title</label>
            <input
              id={`${titleId}-input`}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoComplete="off"
              aria-describedby={error ? `${titleId}-error` : undefined}
              aria-invalid={error ? true : undefined}
            />
          </div>

          {error && (
            <p className="dh-offline-capture__error" id={`${titleId}-error`}>
              {error}
            </p>
          )}
          <button type="submit" className="dh-offline-button">
            Capture
          </button>
          <p
            className="dh-offline-capture__status"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        </form>
      )}
    </section>
  );
}
