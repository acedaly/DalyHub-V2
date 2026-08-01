/**
 * DS-06 Shared Forms — the autosave RECONCILIATION banner (NOTES-05 §18,
 * closing [DEBT-47]).
 *
 * Shown when a field changed on the SERVER while the user had unsaved work here.
 * The autosave coordinator has already done the safe thing — it kept the draft
 * untouched and parked the newer version — so this component's whole job is to
 * say so plainly and let the user decide.
 *
 * The two choices are deliberately the only two:
 *
 *   - **Load the newer version** — take the server's content, discarding the
 *     draft. Destructive, so it is never automatic and never the default.
 *   - **Keep mine** — dismiss, and go on saving the draft. That IS
 *     last-write-wins, but a deliberate one the user asked for.
 *
 * There is deliberately no third "merge" option. Markdown has no deterministic
 * safe merge, and a wrong merge produces content neither person wrote — worse
 * than either version. An honest banner beats a clever guess.
 *
 * Accessibility: it is a `status` live region so the change is ANNOUNCED rather
 * than only drawn (a user who is typing is not looking at the top of the
 * editor), but polite, so it never interrupts. Meaning is carried by WORDS, not
 * by the banner's colour. It does not steal focus — the user is mid-sentence,
 * and the choice can wait for them.
 */

export interface RemoteChangeBannerProps {
  /**
   * The record noun, so the message names what changed ("This note", "This
   * meeting"). Defaults to the generic wording.
   */
  readonly what?: string;
  /** Take the server's version. Disabled while a save is in flight. */
  readonly onAdopt: () => void;
  /** Keep the local draft and dismiss. */
  readonly onDismiss: () => void;
  /**
   * True while a save is in flight. Adopting mid-save cannot be honoured — the
   * in-flight save would land afterwards and overwrite what was just adopted —
   * so the action waits rather than lying about what it did.
   */
  readonly saving?: boolean;
}

export function RemoteChangeBanner({
  what = "This record",
  onAdopt,
  onDismiss,
  saving = false,
}: RemoteChangeBannerProps) {
  return (
    // Named, because the editor already has a save-status live region: two
    // unnamed `status` regions on one screen are indistinguishable to anyone
    // navigating by region rather than reading top to bottom.
    <div
      className="dh-remote-change"
      role="status"
      aria-live="polite"
      aria-label="Changed elsewhere"
    >
      <p className="dh-remote-change__message">
        <span className="dh-remote-change__icon" aria-hidden="true">
          ⟳
        </span>
        {what} changed somewhere else while you were writing. Your unsaved
        changes are still here and nothing has been overwritten.
      </p>
      <div className="dh-remote-change__actions">
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          disabled={saving}
          onClick={onAdopt}
        >
          Load the newer version
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--ghost"
          onClick={onDismiss}
        >
          Keep mine
        </button>
      </div>
      {saving ? (
        <p className="dh-remote-change__note">
          Saving your changes first — the newer version can be loaded in a
          moment.
        </p>
      ) : (
        <p className="dh-remote-change__note">
          Loading the newer version will discard what you have written here.
        </p>
      )}
    </div>
  );
}
