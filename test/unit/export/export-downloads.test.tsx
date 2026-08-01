/**
 * X-04 — the Settings → Privacy & data export controls.
 *
 * The behaviour worth holding: the sensitivity warning is stated BEFORE the
 * actions, the pending state is honest, success is only claimed once a download
 * response actually exists, and a failure is reported in the owner's words.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportDownloads } from "~/modules/settings/ExportDownloads";

/** A promise the test settles by hand, so "pending" is observable. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

let clicks: string[];

beforeEach(() => {
  clicks = [];
  // happy-dom has no object-URL plumbing and would navigate on an anchor click.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ExportDownloads", () => {
  it("states the sensitivity warning before offering either action", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ExportDownloads />);

    const warning = screen.getByText(/An export contains everything/i);
    expect(warning.textContent).toMatch(/People/);
    expect(warning.textContent).toMatch(/Diary/);
    expect(warning.textContent).toMatch(/deleted/);
    expect(warning.textContent).toMatch(/never stored by DalyHub/);

    // Both actions exist and are named, not icon-only.
    expect(
      screen.getByRole("button", { name: "Download full export" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download Obsidian vault" }),
    ).toBeInTheDocument();
  });

  it("shows an honest pending state and only claims success after the response", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    render(<ExportDownloads />);

    const button = screen.getByRole("button", { name: "Download full export" });
    fireEvent.click(button);

    // Pending: the control says so, is disabled and is marked busy.
    const busy = await screen.findByRole("button", { name: "Preparing…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/Preparing your export/i)).toBeInTheDocument();
    // Nothing has been downloaded and nothing claims success yet.
    expect(clicks).toEqual([]);
    expect(screen.queryByText(/Downloaded/)).not.toBeInTheDocument();

    pending.resolve(zipResponse("dalyhub-export-2026.zip"));

    await waitFor(() =>
      expect(
        screen.getByText("Downloaded dalyhub-export-2026.zip."),
      ).toBeInTheDocument(),
    );
    expect(clicks).toEqual(["dalyhub-export-2026.zip"]);
    expect(
      screen.getByRole("button", { name: "Download full export" }),
    ).toBeEnabled();
  });

  it("requests the right route for each format", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      void input;
      return zipResponse("x.zip");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ExportDownloads />);

    fireEvent.click(
      screen.getByRole("button", { name: "Download full export" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/settings/export/full");

    fireEvent.click(
      screen.getByRole("button", { name: "Download Obsidian vault" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/settings/export/obsidian");
  });

  it("reports the server's message when generation fails, and downloads nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("The export was stopped because the snapshot failed.", {
            status: 500,
          }),
      ),
    );
    render(<ExportDownloads />);

    fireEvent.click(
      screen.getByRole("button", { name: "Download full export" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("The export was stopped because the snapshot failed."),
      ).toBeInTheDocument(),
    );
    expect(clicks).toEqual([]);
    expect(screen.queryByText(/Downloaded/)).not.toBeInTheDocument();
  });

  it("reports a network failure rather than silently doing nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    render(<ExportDownloads />);

    fireEvent.click(
      screen.getByRole("button", { name: "Download Obsidian vault" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Check your connection and try again/i),
      ).toBeInTheDocument(),
    );
    expect(clicks).toEqual([]);
  });

  it("falls back to a sensible filename when the header is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Blob(["x"]), {
            status: 200,
            headers: { "content-type": "application/zip" },
          }),
      ),
    );
    render(<ExportDownloads />);

    fireEvent.click(
      screen.getByRole("button", { name: "Download full export" }),
    );
    await waitFor(() => expect(clicks).toEqual(["dalyhub-export.zip"]));
  });

  it("ignores a second click while an export is already running", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<ExportDownloads />);

    const button = screen.getByRole("button", { name: "Download full export" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve(zipResponse("x.zip"));
    await waitFor(() => expect(clicks).toHaveLength(1));
  });
});
