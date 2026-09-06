/**
 * V2.11 FILE-01 — the shared Evidence surface, driven as a user drives it.
 *
 * What is proven here is the honesty of the states and the accessibility of the
 * controls, because both are claims the release makes in prose and neither is
 * self-enforcing:
 *
 *   - "uploaded" is said only when the SERVER has stored the file;
 *   - a retry sends the SAME operation id, so a retry cannot duplicate;
 *   - every row action carries its filename in its accessible name;
 *   - the picker is a real, focusable file input with the server's own `accept`;
 *   - a failure shows the SERVER's sentence, which is the one that says what to
 *     do about it;
 *   - a read-only record shows its evidence and offers no way to change it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  type SerializedAttachment,
} from "~/kernel/attachments";
import { AttachmentsSection } from "~/shared/attachments";
import { FeedbackProvider } from "~/shared/feedback";

const PDF: SerializedAttachment = {
  id: "att-1",
  filename: "Rego renewal.pdf",
  mediaType: "application/pdf",
  kindLabel: "PDF",
  byteSize: 2048,
  sizeLabel: "2.0 KB",
  createdAt: "2026-09-06T00:00:00.000Z",
  createdLabel: "6 September 2026",
  downloadHref: "/attachments/att-1",
  previewHref: null,
};

const IMAGE: SerializedAttachment = {
  ...PDF,
  id: "att-2",
  filename: "receipt.png",
  mediaType: "image/png",
  kindLabel: "Image",
  downloadHref: "/attachments/att-2",
  previewHref: "/attachments/att-2/preview",
};

function renderSection(
  props: Partial<React.ComponentProps<typeof AttachmentsSection>> = {},
) {
  return render(
    <FeedbackProvider>
      <AttachmentsSection ownerEntityId="owner-1" attachments={[]} {...props} />
    </FeedbackProvider>,
  );
}

/** A chosen file, as the OS picker would hand it over. */
function file(name = "receipt.pdf", type = "application/pdf"): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type });
}

/**
 * Choose files through the real input.
 *
 * `fireEvent.change` with a defined `files` list is what a picker selection
 * actually is; `@testing-library/user-event` would be a new dependency for one
 * helper, and AGENTS.md §10 asks that a dependency clear a bar this does not.
 */
function choose(input: HTMLInputElement, ...files: readonly File[]): void {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: files,
  });
  fireEvent.change(input);
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function uploadResponse(attachment: SerializedAttachment, created = true) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, attachment, created }),
  } as unknown as Response;
}

function refusal(message: string, status = 415) {
  return {
    ok: false,
    status,
    json: async () => ({ ok: false, message }),
  } as unknown as Response;
}

describe("the empty state teaches the next action", () => {
  it("says what belongs here and offers the picker", () => {
    renderSection();
    expect(screen.getByTestId("attachments-section-empty")).toHaveTextContent(
      /No files yet/,
    );
    expect(
      screen.getByTestId("attachments-section-picker-file"),
    ).toBeInTheDocument();
  });

  it("says something different, and offers nothing, when read-only", () => {
    renderSection({ readOnly: true, attachments: [] });
    expect(screen.getByTestId("attachments-section-empty")).toHaveTextContent(
      /No files are attached/,
    );
    expect(
      screen.queryByTestId("attachments-section-picker-file"),
    ).not.toBeInTheDocument();
  });
});

/**
 * Ask to remove the seeded PDF and go through with it.
 *
 * Removal is confirmed rather than immediate, because it is unrecoverable — the
 * row is hard-deleted and the bytes are purged. `AttachmentsSection` documents
 * why undo, the rule's usual preference, is not available to prefer here.
 */
async function removeThroughConfirmation(): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", { name: "Remove… Rego renewal.pdf" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Remove file" }));
}

describe("removing is confirmed, because it cannot be undone", () => {
  it("asks first, names the file, and posts nothing until it is confirmed", async () => {
    renderSection({ attachments: [PDF] });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove… Rego renewal.pdf" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rego renewal.pdf");
    expect(dialog).toHaveTextContent("cannot be undone");
    // THE assertion: a click on Remove has sent nothing. The permanent delete
    // used to leave on this click, so a stray one destroyed the evidence.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the file when the confirmation is cancelled", async () => {
    renderSection({ attachments: [PDF] });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove… Rego renewal.pdf" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Keep it" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Download Rego renewal.pdf" }),
    ).toBeInTheDocument();
  });
});

describe("a row carries its filename into every accessible name", () => {
  it("names the file on Download and on Remove", () => {
    renderSection({ attachments: [PDF] });
    expect(
      screen.getByRole("link", { name: "Download Rego renewal.pdf" }),
    ).toBeInTheDocument();
    // The ellipsis is the house signal that a confirmation follows, and the
    // filename is still in the name — which is what makes a list of ten usable.
    expect(
      screen.getByRole("button", { name: "Remove… Rego renewal.pdf" }),
    ).toBeInTheDocument();
    // The name itself is a link to the same authenticated route.
    expect(
      screen.getByRole("link", { name: "Rego renewal.pdf" }),
    ).toHaveAttribute("href", "/attachments/att-1");
  });

  it("shows a thumbnail only where the server offered a preview", () => {
    const { container } = renderSection({ attachments: [PDF, IMAGE] });
    const images = container.querySelectorAll("img.dh-attachment-row__thumb");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/attachments/att-2/preview");
    // Decoration: the filename beside it is the content.
    expect(images[0]).toHaveAttribute("alt", "");
  });

  it("offers no Remove on a read-only record, and still offers Download", () => {
    renderSection({ attachments: [PDF], readOnly: true });
    expect(
      screen.getByRole("link", { name: "Download Rego renewal.pdf" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove/ }),
    ).not.toBeInTheDocument();
  });
});

describe("the picker is a real file input", () => {
  it("is focusable, is labelled, and carries the server's own accept list", () => {
    renderSection();
    const input = screen.getByTestId(
      "attachments-section-picker-file",
    ) as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(ATTACHMENT_ACCEPT_ATTRIBUTE);
    // Not `display: none` — the input keeps its role and its place in the tab
    // order, and the label draws the ring through `:focus-within`.
    expect(input).toBeVisible();
    expect(input.labels?.[0]).toHaveTextContent("Add file");
  });

  it("offers a camera control that asks for the rear camera", () => {
    renderSection();
    const camera = screen.getByTestId(
      "attachments-section-picker-camera",
    ) as HTMLInputElement;
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(camera.accept).toBe("image/*");
    expect(camera.labels?.[0]).toHaveTextContent("Take a photo");
  });
});

describe("uploading is honest about what has happened", () => {
  it("says uploading, then attached — and only after the server stored it", async () => {
    let resolveUpload: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveUpload = resolve;
        }),
    );

    renderSection();
    choose(
      screen.getByTestId("attachments-section-picker-file") as HTMLInputElement,
      file(),
    );

    // Mid-flight: a pending entry that is NOT an attachment — no download link.
    const pending = await screen.findByTestId("attachment-pending");
    expect(pending).toHaveAttribute("data-state", "uploading");
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect(screen.getByTestId("attachments-section-status")).toHaveTextContent(
      "Uploading receipt.pdf",
    );

    resolveUpload(
      uploadResponse({
        ...PDF,
        id: "att-new",
        filename: "receipt.pdf",
        downloadHref: "/attachments/att-new",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Download receipt.pdf" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("attachment-pending")).toBeNull();
    expect(screen.getByTestId("attachments-section-status")).toHaveTextContent(
      "receipt.pdf attached",
    );
  });

  it("shows the SERVER's refusal, not a generic one", async () => {
    fetchMock.mockResolvedValueOnce(
      refusal(
        "SVG files aren’t accepted as evidence, because an SVG can run code.",
      ),
    );
    renderSection();
    choose(
      screen.getByTestId("attachments-section-picker-file") as HTMLInputElement,
      file("logo.svg", "image/svg+xml"),
    );

    const pending = await screen.findByTestId("attachment-pending");
    expect(pending).toHaveAttribute("data-state", "failed");
    expect(pending).toHaveTextContent(/an SVG can run code/);
    // Nothing was added to the record.
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });

  it("retries with the SAME operation id, so a retry cannot duplicate", async () => {
    fetchMock
      .mockResolvedValueOnce(refusal("That file couldn’t be stored.", 502))
      .mockResolvedValueOnce(
        uploadResponse({
          ...PDF,
          id: "att-retry",
          filename: "receipt.pdf",
          downloadHref: "/attachments/att-retry",
        }),
      );

    renderSection();
    choose(
      screen.getByTestId("attachments-section-picker-file") as HTMLInputElement,
      file(),
    );
    fireEvent.click(await screen.findByTestId("attachment-retry"));

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Download receipt.pdf" }),
      ).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]![1] as { body: FormData };
    const second = fetchMock.mock.calls[1]![1] as { body: FormData };
    /*
     * THE assertion of this whole file. The server's UNIQUE index turns a repeat
     * of the same operation into "you already have this"; a client that minted a
     * fresh id per attempt would make that constraint useless.
     */
    expect(second.body.get("operation")).toBe(first.body.get("operation"));
    expect(second.body.get("owner")).toBe("owner-1");
  });

  it("uploads several chosen files one at a time, in order", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(
      async (_url: string, init: { body: FormData }) => {
        const name = (init.body.get("file") as File).name;
        order.push(name);
        return uploadResponse({
          ...PDF,
          id: `att-${name}`,
          filename: name,
          downloadHref: `/attachments/att-${name}`,
        });
      },
    );

    renderSection();
    choose(
      screen.getByTestId("attachments-section-picker-file") as HTMLInputElement,
      file("one.pdf"),
      file("two.pdf"),
    );

    await waitFor(() => expect(order).toEqual(["one.pdf", "two.pdf"]));
  });
});

describe("removing", () => {
  it("removes the row once the server confirms it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as unknown as Response);
    // The reconciliation read that follows a successful delete.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ attachments: [] }),
    } as unknown as Response);

    renderSection({ attachments: [PDF] });
    await removeThroughConfirmation();

    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /Rego renewal/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("attachments-section-status")).toHaveTextContent(
      "Rego renewal.pdf removed",
    );
  });

  it("keeps the row when the server refuses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({
        ok: false,
        message: "That file couldn’t be removed.",
      }),
    } as unknown as Response);

    renderSection({ attachments: [PDF] });
    await removeThroughConfirmation();

    await waitFor(() =>
      expect(
        screen.getByTestId("attachments-section-status"),
      ).toHaveTextContent("could not be removed"),
    );
    expect(
      screen.getByRole("link", { name: "Download Rego renewal.pdf" }),
    ).toBeInTheDocument();
  });
});

describe("the live region", () => {
  it("exists before it has anything to say, and holds one sentence", () => {
    renderSection({ attachments: [PDF] });
    const status = screen.getByTestId("attachments-section-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveTextContent("");
  });
});
