/**
 * NOTES-05 §5 — the writing editor's record-link picker.
 *
 * What is proven here is the contract that makes the picker trustworthy rather
 * than merely functional: it is keyboard-complete, it names a record's TYPE in
 * words (often the only thing telling two same-titled records apart), it inserts
 * exactly the destination the SERVER supplied, and it never fabricates one.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  RecordLinkPicker,
  type RecordLinkOption,
} from "~/shared/markdown-editor/RecordLinkPicker";
import { recordLinkTransform } from "~/shared/markdown-editor/markdown-transforms";

const ATLAS: RecordLinkOption = {
  id: "p1",
  type: "project",
  title: "Atlas",
  url: "dalyhub://project/p1",
};
const ATLAS_NOTE: RecordLinkOption = {
  id: "n1",
  type: "note",
  title: "Atlas",
  url: "dalyhub://note/n1",
};

function renderPicker(
  options: readonly RecordLinkOption[] = [ATLAS],
  overrides: Partial<React.ComponentProps<typeof RecordLinkPicker>> = {},
) {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  const search = vi.fn(async () => options);
  render(
    <RecordLinkPicker
      search={search}
      onChoose={onChoose}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onChoose, onCancel, search };
}

describe("RecordLinkPicker", () => {
  it("focuses the search field on open, so it is usable from the keyboard immediately", async () => {
    renderPicker();
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Link a record" }),
      ).toHaveFocus(),
    );
  });

  it("lists matching records and names each one's TYPE in words", async () => {
    renderPicker([ATLAS, ATLAS_NOTE]);
    await screen.findByRole("option", { name: /Atlas Project/ });
    expect(
      screen.getByRole("option", { name: /Atlas Note/ }),
    ).toBeInTheDocument();
  });

  it("chooses a record with the keyboard alone (Arrow then Enter)", async () => {
    const { onChoose } = renderPicker([ATLAS]);
    await screen.findByRole("option", { name: /Atlas/ });
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(ATLAS);
  });

  it("chooses a record by clicking it", async () => {
    const { onChoose } = renderPicker([ATLAS]);
    fireEvent.click(await screen.findByRole("option", { name: /Atlas/ }));
    expect(onChoose).toHaveBeenCalledWith(ATLAS);
  });

  it("cancels on Escape without choosing anything", async () => {
    const { onCancel, onChoose } = renderPicker();
    await screen.findByRole("option", { name: /Atlas/ });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("cancels from the Cancel button", () => {
    const { onCancel } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("announces the result state politely rather than only drawing it", async () => {
    renderPicker([ATLAS]);
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(status).toHaveTextContent("1 record found."));
  });

  it("says so honestly when nothing matches", async () => {
    renderPicker([]);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "zzz" },
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "No records match that.",
      ),
    );
  });

  it("reports a failed search instead of showing an empty list as if it were a result", async () => {
    const onChoose = vi.fn();
    render(
      <RecordLinkPicker
        search={() => Promise.reject(new Error("offline"))}
        onChoose={onChoose}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Records couldn’t be searched just now.",
      ),
    );
  });

  it("passes the query through to the caller's workspace-scoped search", async () => {
    const { search } = renderPicker();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "atl" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith("atl", expect.any(AbortSignal)),
    );
  });
});

describe("recordLinkTransform (what actually gets written)", () => {
  it("inserts the SERVER's destination verbatim — the client mints nothing", () => {
    const result = recordLinkTransform({ url: ATLAS.url, title: ATLAS.title })({
      value: "See ",
      selectionStart: 4,
      selectionEnd: 4,
    });
    expect(result.value).toBe("See [Atlas](dalyhub://project/p1)");
  });

  it("selects the inserted label with no selection, so typing replaces it", () => {
    const result = recordLinkTransform({ url: ATLAS.url, title: "Atlas" })({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe(
      "Atlas",
    );
  });

  it("uses the SELECTED text as the label — the author already said what to call it", () => {
    const result = recordLinkTransform({ url: ATLAS.url, title: "Atlas" })({
      value: "the big project",
      selectionStart: 4,
      selectionEnd: 15,
    });
    expect(result.value).toBe("the [big project](dalyhub://project/p1)");
    // Caret lands after the link, ready to keep writing.
    expect(result.selectionStart).toBe(result.value.length);
    expect(result.selectionEnd).toBe(result.value.length);
  });

  it("escapes brackets in a label so a title cannot break out of the link syntax", () => {
    const result = recordLinkTransform({
      url: ATLAS.url,
      title: "Atlas [v2]",
    })({ value: "", selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe("[Atlas \\[v2\\]](dalyhub://project/p1)");
  });

  it("leaves the rest of the document byte-for-byte untouched", () => {
    const before = "line one\r\nline two";
    const result = recordLinkTransform({ url: ATLAS.url, title: "X" })({
      value: before,
      selectionStart: 8,
      selectionEnd: 8,
    });
    expect(result.value.startsWith("line one")).toBe(true);
    expect(result.value.endsWith("\r\nline two")).toBe(true);
  });
});
