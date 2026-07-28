/**
 * MOBILE-01 — the shared "captured" confirmation every capture panel shows.
 *
 * One consistent set of next steps after any successful capture:
 *
 *   Done · Open <record> · Add another
 *
 * "Add another" is what makes repeated capture (five diary entries, a burst of
 * tasks after a meeting) fast: it clears the form and returns focus to the first
 * field, so the next capture is typing plus Enter with no navigation at all.
 *
 * The confirmation is a `role="status"` live region so a screen-reader user hears
 * that the record was created — a save is announced, never silent (AGENTS.md §15).
 */

import { Link } from "react-router";

import type { CaptureSuccess } from "./types";

export type CaptureResultProps = {
  readonly success: CaptureSuccess;
  /** Clear the form and focus the first field again. */
  readonly onAddAnother: () => void;
  /** Close the sheet. */
  readonly onDone: () => void;
};

export function CaptureResult({
  success,
  onAddAnother,
  onDone,
}: CaptureResultProps) {
  return (
    <div className="dh-capture-result" data-testid="capture-result">
      <p className="dh-capture-result__message" role="status">
        {success.message}
      </p>
      <div className="dh-capture-result__actions">
        <button
          type="button"
          className="dh-btn dh-btn--primary"
          onClick={onAddAnother}
          data-testid="capture-add-another"
        >
          Add another
        </button>
        <Link
          to={success.href}
          className="dh-btn dh-btn--secondary"
          onClick={onDone}
          data-testid="capture-open-record"
        >
          {success.openLabel}
        </Link>
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onDone}
          data-testid="capture-done"
        >
          Done
        </button>
      </div>
    </div>
  );
}
