/**
 * V2.11 FILE-01 — the ONE way a file gets chosen, on a desktop and on a phone.
 *
 * ## Two controls, one input each, and no library
 *
 * **Add file** is a plain `<input type="file" multiple>` with the server's own
 * `accept` list. **Take a photo** is a second input carrying
 * `capture="environment"`, which is the standards-based way to ask a phone for
 * its rear camera. On a desktop the second control is hidden, because `capture`
 * there means "the file picker again" and a duplicate button is worse than no
 * button.
 *
 * That is the whole mobile story. No native shell, no plugin, no permissions
 * prompt DalyHub owns — the OS asks, the OS decides, and a browser that supports
 * neither still gets the first control. `share_target` for files was considered
 * and refused for V2.11: it would need a measurement of picker friction that
 * nobody has taken.
 *
 * ## The label IS the control
 *
 * A file input styled with CSS is a well-known accessibility trap — the usual
 * fix, `<button onClick={() => inputRef.current.click()}>`, produces a control
 * that keyboard users can focus and screen readers announce as a button that
 * does nothing they can predict. Here the visible control is a `<label>` bound
 * to a visually-hidden but FOCUSABLE input: the native input keeps its role, its
 * keyboard behaviour and its announcement, and the label gives it the look. The
 * focus ring is drawn on the label through `:focus-within`, so keyboard focus is
 * visible where the eye is.
 *
 * ## `accept` is a convenience, never the rule
 *
 * It filters the OS picker so the owner is not shown files DalyHub will refuse.
 * Some platforms ignore it, every platform lets the owner choose "all files",
 * and the attribute is client-side. The server's allow-list is the boundary.
 */

import { useCallback, useId, useRef } from "react";

import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENT_BYTES,
  formatAttachmentSize,
} from "~/kernel/attachments";

export interface AttachmentPickerProps {
  readonly onSelect: (files: readonly File[]) => void;
  /** Hide the camera control where a camera makes no sense (a print view). */
  readonly allowCapture?: boolean;
  readonly disabled?: boolean;
  readonly "data-testid"?: string;
}

export function AttachmentPicker({
  onSelect,
  allowCapture = true,
  disabled = false,
  "data-testid": testId = "attachment-picker",
}: AttachmentPickerProps) {
  const fileId = useId();
  const cameraId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (input: HTMLInputElement | null) => {
      if (input === null) return;
      const chosen = [...(input.files ?? [])];
      /*
       * Cleared immediately, and this is not tidiness: without it, choosing the
       * SAME file again fires no `change` event, so a failed upload the owner
       * retried by re-picking would silently do nothing.
       */
      input.value = "";
      if (chosen.length > 0) onSelect(chosen);
    },
    [onSelect],
  );

  return (
    <div className="dh-attachment-picker" data-testid={testId}>
      <label
        className="dh-btn dh-btn--secondary dh-attachment-picker__control"
        htmlFor={fileId}
      >
        Add file
        <input
          ref={fileRef}
          id={fileId}
          className="dh-attachment-picker__input"
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
          disabled={disabled}
          onChange={() => handle(fileRef.current)}
          data-testid={`${testId}-file`}
        />
      </label>

      {allowCapture ? (
        <label
          className="dh-btn dh-btn--secondary dh-attachment-picker__control dh-attachment-picker__control--camera"
          htmlFor={cameraId}
        >
          Take a photo
          <input
            ref={cameraRef}
            id={cameraId}
            className="dh-attachment-picker__input"
            type="file"
            // The rear camera, where the platform has one. A desktop browser
            // ignores it and opens its ordinary picker, which is why this
            // control is hidden above the phone breakpoint.
            capture="environment"
            accept="image/*"
            disabled={disabled}
            onChange={() => handle(cameraRef.current)}
            data-testid={`${testId}-camera`}
          />
        </label>
      ) : null}

      <p className="dh-attachment-picker__hint">
        PDFs, photos, text and common office documents, up to{" "}
        {formatAttachmentSize(MAX_ATTACHMENT_BYTES)} each.
      </p>
    </div>
  );
}
