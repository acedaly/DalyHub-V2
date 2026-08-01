/**
 * X-04 — the owner-facing export controls in `Settings → Privacy & data`.
 *
 * These replace the "Deferred" row that used to sit here. Two deliberate,
 * authenticated actions over the SAME canonical snapshot: the structured export
 * and the Obsidian vault.
 *
 * ## Why a button and a `fetch`, not an anchor with `download`
 *
 * A plain `<a download>` is simpler, and it is the wrong control here. Building a
 * whole-workspace archive takes real time, and an anchor gives the owner nothing
 * to look at while it happens and — worse — no way to distinguish success from a
 * server error, because the browser navigates to whatever comes back. This
 * component waits for the response, checks it, and only then saves the file. The
 * pending state is honest, a failure is reported in the owner's own words, and
 * success is never claimed before a download response exists.
 *
 * It degrades sensibly: if the fetch fails outright (offline, a proxy error), the
 * owner is told to try again rather than left with a button that silently did
 * nothing.
 */

import { useCallback, useRef, useState } from "react";

import { SettingsRow } from "~/shared/settings";

/** One export the owner can take. */
type ExportFormat = "full" | "obsidian";

type ExportStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "working" }
  | { readonly kind: "done"; readonly filename: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Read the filename the server chose. The server always sends an ASCII-safe
 * quoted name (see `exportFilename`), so a simple, bounded parse is enough — and
 * a missing or odd header falls back rather than failing the download.
 */
function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (header === null) return fallback;
  const match = /filename="([^"]{1,120})"/.exec(header);
  return match?.[1] ?? fallback;
}

function useExportDownload(format: ExportFormat, fallbackName: string) {
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  // Guards a double-click from starting a second whole-workspace read.
  const running = useRef(false);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus({ kind: "working" });
    try {
      const response = await fetch(`/settings/export/${format}`, {
        headers: { accept: "application/zip" },
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        setStatus({
          kind: "error",
          message:
            detail === ""
              ? "The export could not be generated. Nothing was changed."
              : detail,
        });
        return;
      }
      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        fallbackName,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus({ kind: "done", filename });
    } catch {
      setStatus({
        kind: "error",
        message:
          "The export could not be downloaded. Check your connection and try again.",
      });
    } finally {
      running.current = false;
    }
  }, [format, fallbackName]);

  return { status, start };
}

function statusText(status: ExportStatus): string | null {
  switch (status.kind) {
    case "working":
      return "Preparing your export. This can take a moment on a large workspace.";
    case "done":
      return `Downloaded ${status.filename}.`;
    case "error":
      return status.message;
    default:
      return null;
  }
}

function statusTone(status: ExportStatus): "neutral" | "success" | "danger" {
  if (status.kind === "error") return "danger";
  if (status.kind === "done") return "success";
  return "neutral";
}

function ExportRow({
  format,
  label,
  description,
  action,
  fallbackName,
}: {
  readonly format: ExportFormat;
  readonly label: string;
  readonly description: string;
  readonly action: string;
  readonly fallbackName: string;
}) {
  const { status, start } = useExportDownload(format, fallbackName);
  const busy = status.kind === "working";
  return (
    <SettingsRow
      label={label}
      description={description}
      status={statusText(status)}
      statusTone={statusTone(status)}
      statusLive
      align="start"
      control={
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={() => {
            void start();
          }}
          disabled={busy}
          aria-busy={busy}
          data-testid={`export-${format}`}
        >
          {busy ? "Preparing…" : action}
        </button>
      }
    />
  );
}

/** Both export actions, with the sensitivity warning stated before them. */
export function ExportDownloads() {
  return (
    <>
      <SettingsRow
        label="Before you export"
        description="An export contains everything in this workspace — including private records: People and their contact details, Diary entries, Meeting notes, Reviews, and records you have archived or deleted. Treat the downloaded file like the workspace itself. It is generated on demand, never stored by DalyHub and never sent anywhere else."
        align="start"
        control={
          <span className="dh-settings-page__text-value">Sensitive</span>
        }
      />
      <ExportRow
        format="full"
        label="Download full DalyHub export"
        description="A ZIP containing the complete structured snapshot (dalyhub-snapshot.json), a manifest of what it holds, the schema description and checksums. This is the format a future restore will read."
        action="Download full export"
        fallbackName="dalyhub-export.zip"
      />
      <ExportRow
        format="obsidian"
        label="Download Obsidian vault"
        description="A ZIP containing a ready-to-open Markdown vault: one file per record, YAML frontmatter, and working relative links. Extract it and open the folder in Obsidian — no plugin needed."
        action="Download Obsidian vault"
        fallbackName="dalyhub-obsidian-vault.zip"
      />
    </>
  );
}
