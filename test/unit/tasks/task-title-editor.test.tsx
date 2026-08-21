/**
 * DHDS-10 §13 — inline Task title editing, as a contract three surfaces share.
 *
 * The component moved out of `TasksWorkspace` so `/tasks`, Today and Plan can
 * all rename a row in place. What has to survive that move is every rule that
 * makes inline editing safe rather than merely quick: Enter commits, Escape
 * cancels, a blur saves but never while an error is showing, an empty title is
 * refused before anything is sent, and a REFUSAL keeps the owner's words.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskTitleEditor } from "~/shared/task-record/TaskTitleEditor";

const ACCEPTED = {
  ok: true,
  json: async () => ({ kind: "update", status: "success" }),
};

function refusal(message: string) {
  return {
    ok: true,
    json: async () => ({
      kind: "update",
      status: "error",
      fieldErrors: { title: message },
    }),
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ACCEPTED as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderEditor(overrides: Record<string, unknown> = {}) {
  const onDone = vi.fn();
  const onSaved = vi.fn();
  render(
    <TaskTitleEditor
      taskId="t-1"
      title="Chase the plumber"
      onDone={onDone}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return {
    onDone,
    onSaved,
    input: screen.getByRole("textbox", { name: "Rename Chase the plumber" }),
  };
}

describe("TaskTitleEditor", () => {
  it("opens with the current title selected, so typing replaces it", () => {
    const { input } = renderEditor();
    expect((input as HTMLInputElement).value).toBe("Chase the plumber");
    expect(document.activeElement).toBe(input);
  });

  it("commits on Enter through the canonical rename intent", async () => {
    const { input, onSaved, onDone } = renderEditor();
    fireEvent.change(input, { target: { value: "Chase the plumber again" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/tasks/t-1");
    expect((init.body as FormData).get("intent")).toBe("rename");
    expect((init.body as FormData).get("title")).toBe(
      "Chase the plumber again",
    );
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith("t-1", "Chase the plumber again"),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it("cancels on Escape without sending anything", () => {
    const { input, onDone, onSaved } = renderEditor();
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("does not send an unchanged title", () => {
    const { input, onDone } = renderEditor();
    fireEvent.keyDown(input, { key: "Enter" });
    // Not worth a request, and — more importantly — not worth an Activity
    // entry claiming the record was edited.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("refuses an empty title locally, and keeps the field open", async () => {
    const { input, onDone } = renderEditor();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A title is required.",
    );
    // Nothing was sent, and nothing was queued — the domain stays the
    // authority, but there is no point posting a structurally invalid value.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("keeps the typed text when the server refuses, and says why", async () => {
    fetchMock.mockResolvedValueOnce(
      refusal("A task with that name already exists.") as unknown as Response,
    );
    const { input, onDone, onSaved } = renderEditor();
    fireEvent.change(input, { target: { value: "Duplicate" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A task with that name already exists.",
    );
    // The owner's words survive a refusal — losing them is the one thing an
    // inline editor may never do (§30).
    expect((input as HTMLInputElement).value).toBe("Duplicate");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("saves on blur, but never while an unresolved error is showing", async () => {
    fetchMock.mockResolvedValueOnce(
      refusal("That couldn’t be saved.") as unknown as Response,
    );
    const { input } = renderEditor();
    fireEvent.change(input, { target: { value: "First try" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByRole("alert");

    fireEvent.blur(input);
    // A blur with an unresolved error would throw the text away; it keeps
    // editing instead, and no second request is made.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((input as HTMLInputElement).value).toBe("First try");
  });

  it("never claims success when the request could not be sent", async () => {
    // PWA-12 — a transport failure goes to the offline queue, and the queue
    // answers honestly. In this environment there is no prior authenticated
    // session on the device, so the queue REFUSES and says why; either way the
    // one thing that must not happen is `onSaved`, which is the surface's
    // "DalyHub has this" signal.
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const onQueued = vi.fn();
    const onSaved = vi.fn();
    const onDone = vi.fn();
    render(
      <TaskTitleEditor
        taskId="t-1"
        title="Chase the plumber"
        onDone={onDone}
        onSaved={onSaved}
        onQueued={onQueued}
      />,
    );
    const input = screen.getByRole("textbox", {
      name: "Rename Chase the plumber",
    });
    fireEvent.change(input, { target: { value: "Offline title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // The refusal names the REAL reason rather than "try again", and the
    // owner's words are still in the field.
    expect(await screen.findByRole("alert")).toHaveTextContent(/offline/i);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onQueued).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("Offline title");
  });
});
