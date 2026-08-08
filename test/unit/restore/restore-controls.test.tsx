/**
 * SET-02 — the Settings → Privacy & data restore controls.
 *
 * The behaviour worth holding is the interaction contract, not the markup:
 *
 *   - choosing a file inspects it and writes NOTHING;
 *   - a valid backup shows a preview that names what will happen to the current
 *     workspace, in the owner's nouns;
 *   - a corrupt / unsupported / incompatible backup gets its OWN explanation and
 *     no way to proceed — never one generic "something went wrong";
 *   - a destructive restore cannot start until a safety backup has been saved,
 *     and then only through the shared typed confirmation;
 *   - a failure says so, and never reports success because some rows were
 *     written.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RestoreFromBackup } from "~/modules/settings/RestoreFromBackup";
import { FeedbackProvider } from "~/shared/feedback";

function counts(total: number, patch: Record<string, number> = {}) {
  return {
    areas: 0,
    goals: 0,
    projects: 0,
    tasks: 0,
    notes: 0,
    diaryEntries: 0,
    meetings: 0,
    people: 0,
    assets: 0,
    reviews: 0,
    other: 0,
    links: 0,
    activityEvents: 0,
    total,
    ...patch,
  };
}

function preview(options: { destructive: boolean }) {
  return {
    operationId: "op-1",
    backup: {
      createdAt: "2026-08-01T09:00:00.000Z",
      schemaVersion: 2,
      applicationVersion: "2.0.1",
      applicationReleaseName: "V2",
      sourceWorkspaceId: "source-workspace",
      counts: counts(42, { tasks: 20, notes: 12, people: 10 }),
    },
    target: {
      workspaceId: "owner-workspace",
      isEmpty: !options.destructive,
      counts: options.destructive ? counts(7, { tasks: 7 }) : counts(0),
    },
    mode: options.destructive ? "replace" : "into-empty",
    destructive: options.destructive,
    safetyBackupRequired: options.destructive,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function zipResponse(filename: string): Response {
  return new Response(new Blob([new Uint8Array([0x50, 0x4b, 0x05, 0x06])]), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * The safety-backup route sequence: the archive, then the acknowledgement.
 *
 * `ackOk: false` models the case that matters most — the server made a valid
 * recovery archive and the client's confirmation did NOT complete. The restore
 * must stay locked.
 */
function safetyBackupFetch(
  options: { readonly destructive: boolean; readonly ackOk?: boolean } = {
    destructive: true,
  },
) {
  return vi.fn((url: string, init?: RequestInit) => {
    void init;
    if (url === "/settings/restore/preview") {
      return Promise.resolve(
        jsonResponse({
          ok: true,
          preview: preview({ destructive: options.destructive }),
        }),
      );
    }
    if (url === "/settings/restore/safety-backup") {
      return Promise.resolve(zipResponse("dalyhub-export-safety.zip"));
    }
    if (url === "/settings/restore/safety-backup-ack") {
      return Promise.resolve(
        (options.ackOk ?? true)
          ? jsonResponse({ ok: true })
          : jsonResponse(
              {
                ok: false,
                kind: "restore_failed",
                message:
                  "The safety backup did not arrive intact, so the restore was not unlocked. Download it again before replacing this workspace.",
                workspaceReplaced: false,
              },
              500,
            ),
      );
    }
    return Promise.resolve(
      jsonResponse({ ok: true, result: { restored: counts(42) } }),
    );
  });
}

function chooseFile() {
  const input = screen.getByTestId("restore-file");
  const file = new File([new Uint8Array([1, 2, 3])], "dalyhub-export.zip", {
    type: "application/zip",
  });
  fireEvent.change(input, { target: { files: [file] } });
}

function renderControls() {
  return render(
    <FeedbackProvider>
      <RestoreFromBackup />
    </FeedbackProvider>,
  );
}

let downloads: string[];

beforeEach(() => {
  downloads = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RestoreFromBackup", () => {
  it("inspects a chosen file and shows a preview instead of restoring it", async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(
        jsonResponse({ ok: true, preview: preview({ destructive: false }) }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderControls();
    chooseFile();

    await waitFor(() => {
      expect(screen.getByTestId("restore-preview")).toBeInTheDocument();
    });
    // ONE request, to the preview step. Nothing was applied.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/settings/restore/preview");

    // The preview speaks in the product's nouns.
    const panel = screen.getByTestId("restore-preview");
    expect(panel.textContent).toMatch(/Tasks/);
    expect(panel.textContent).toMatch(/People/);
    expect(panel.textContent).toMatch(/snapshot version 2/);
  });

  it("says exactly what will happen to a workspace that already has records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ ok: true, preview: preview({ destructive: true }) }),
        ),
      ),
    );
    renderControls();
    chooseFile();

    await waitFor(() => {
      expect(screen.getByTestId("restore-consequence")).toBeInTheDocument();
    });
    const sentence =
      screen.getByTestId("restore-consequence").textContent ?? "";
    expect(sentence).toMatch(/REPLACES/);
    expect(sentence).toMatch(/7 record/);
    expect(sentence).toMatch(/42 record/);
    expect(sentence).toMatch(/will be gone/);
  });

  it("will not start a destructive restore until a safety backup is saved AND confirmed", async () => {
    const fetchMock = safetyBackupFetch({ destructive: true });
    vi.stubGlobal("fetch", fetchMock);
    renderControls();
    chooseFile();

    await waitFor(() => {
      expect(screen.getByTestId("restore-apply")).toBeDisabled();
    });

    fireEvent.click(screen.getByTestId("restore-safety-backup"));
    await waitFor(() => {
      expect(downloads).toEqual(["dalyhub-export-safety.zip"]);
    });
    await waitFor(() => {
      expect(screen.getByTestId("restore-apply")).toBeEnabled();
    });

    // The confirmation is a SEPARATE request carrying a digest the client
    // computed over the bytes it received — the server never sent it, so it
    // cannot be an echo.
    const ack = fetchMock.mock.calls.find(
      (call) => call[0] === "/settings/restore/safety-backup-ack",
    );
    expect(ack, "no acknowledgement was sent").toBeDefined();
    const body = ack![1]!.body as FormData;
    expect(String(body.get("sha256"))).toMatch(/^[0-9a-f]{64}$/);
    expect(body.get("operationId")).toBe("op-1");
  });

  it("keeps the restore locked when the safety backup is generated but never confirmed", async () => {
    // The server made a valid archive; the delivery/acknowledgement did not
    // complete. This is the exact case that must not unlock a replacement.
    vi.stubGlobal(
      "fetch",
      safetyBackupFetch({ destructive: true, ackOk: false }),
    );
    renderControls();
    chooseFile();
    await waitFor(() => screen.getByTestId("restore-safety-backup"));
    fireEvent.click(screen.getByTestId("restore-safety-backup"));

    await waitFor(() => {
      expect(screen.getByText(/did not arrive intact/i)).toBeInTheDocument();
    });
    // No restore action at all — not a disabled one the owner can wonder about.
    expect(screen.queryByTestId("restore-apply")).not.toBeInTheDocument();
  });

  it("requires the typed confirmation before a replacement can be confirmed", async () => {
    vi.stubGlobal("fetch", safetyBackupFetch({ destructive: true }));
    renderControls();
    chooseFile();
    await waitFor(() => screen.getByTestId("restore-safety-backup"));
    fireEvent.click(screen.getByTestId("restore-safety-backup"));
    await waitFor(() =>
      expect(screen.getByTestId("restore-apply")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("restore-apply"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Replace this workspace\?/);
    // The confirmation names the workspace, the backup date and the counts.
    expect(dialog.textContent).toMatch(/owner-workspace/);
    expect(dialog.textContent).toMatch(/42 record/);

    const confirm = screen.getByRole("button", { name: "Replace workspace" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type REPLACE/i), {
      target: { value: "REPLACE" },
    });
    expect(confirm).toBeEnabled();
  });

  it("explains a corrupt backup in its own terms and offers no way to proceed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              ok: false,
              kind: "corrupt",
              message:
                "This backup failed its own integrity check: its contents do not match the checksums it was written with. It will not be restored.",
            },
            422,
          ),
        ),
      ),
    );
    renderControls();
    chooseFile();

    await waitFor(() => {
      expect(
        screen.getByText(/failed its integrity check/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("restore-apply")).not.toBeInTheDocument();
    expect(screen.queryByTestId("restore-preview")).not.toBeInTheDocument();
  });

  it("distinguishes an unsupported snapshot version from a damaged file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              ok: false,
              kind: "unsupported_version",
              message:
                "This backup was written by a version of DalyHub this one cannot read (snapshot version 99).",
            },
            422,
          ),
        ),
      ),
    );
    renderControls();
    chooseFile();

    await waitFor(() => {
      expect(
        screen.getByText(/made by a different DalyHub/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("restore-apply")).not.toBeInTheDocument();
  });

  it("reports a failed restore as a failure, never as a success", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/settings/restore/preview") {
        return Promise.resolve(
          jsonResponse({ ok: true, preview: preview({ destructive: false }) }),
        );
      }
      return Promise.resolve(
        jsonResponse(
          {
            ok: false,
            kind: "restore_failed",
            message:
              "The restore did not complete, and your workspace was left exactly as it was. No records were changed.",
            workspaceReplaced: false,
          },
          500,
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    renderControls();
    chooseFile();
    await waitFor(() =>
      expect(screen.getByTestId("restore-apply")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("restore-apply"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(screen.getByText(/did not complete/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Restore complete/i)).not.toBeInTheDocument();
  });

  it("confirms a successful restore and offers the way back", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "/settings/restore/preview"
          ? jsonResponse({ ok: true, preview: preview({ destructive: false }) })
          : jsonResponse({
              ok: true,
              result: { restored: counts(42, { tasks: 20 }) },
            }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderControls();
    chooseFile();
    await waitFor(() =>
      expect(screen.getByTestId("restore-apply")).toBeEnabled(),
    );

    fireEvent.click(screen.getByTestId("restore-apply"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(screen.getByText(/Restore complete/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Restored 42 record/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to DalyHub" }),
    ).toBeInTheDocument();
  });
});
