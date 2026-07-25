/**
 * DS-06 — the autosave field hook: blur-triggered save, calm status,
 * failure + retry, no save while invalid.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SaveStatusIndicator,
  TextField,
  useAutosaveField,
} from "~/shared/forms";
import { required } from "~/shared/forms/model";

function Harness({
  onSave,
  debounceMs = 0, // blur-only for deterministic tests, by default
  onFlushed,
}: {
  readonly onSave: (value: string) => Promise<void>;
  readonly debounceMs?: number;
  /** Reports each `flush()` call's result, for tests that need to force a
   * save the way a record-level Delete action does (see `use-delete-note.ts`). */
  readonly onFlushed?: (persisted: boolean) => void;
}) {
  const field = useAutosaveField<string>({
    initialValue: "start",
    debounceMs,
    validate: required("Required."),
    onSave: (value) => onSave(value),
  });
  return (
    <div>
      <TextField
        label="Title"
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        error={field.validationError}
      />
      <SaveStatusIndicator
        status={field.status}
        error={field.error}
        onRetry={field.retry}
      />
      <button
        type="button"
        onClick={() => {
          field.flush().then((persisted) => onFlushed?.(persisted));
        }}
      >
        Flush
      </button>
    </div>
  );
}

describe("useAutosaveField", () => {
  it("saves on blur and reaches the Saved status", async () => {
    const onSave = vi.fn(async () => {});
    render(<Harness onSave={onSave} />);
    const input = screen.getByLabelText("Title", { exact: false });
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("edited"));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("keeps input and offers Retry on failure, then recovers", async () => {
    let attempt = 0;
    const onSave = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("boom");
    });
    render(<Harness onSave={onSave} />);
    const input = screen.getByLabelText("Title", { exact: false });
    fireEvent.change(input, { target: { value: "edited" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(screen.getByText("Couldn't save")).toBeInTheDocument(),
    );
    expect(input).toHaveValue("edited"); // input preserved

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("does not save an invalid (empty) value", async () => {
    const onSave = vi.fn(async () => {});
    render(<Harness onSave={onSave} />);
    const input = screen.getByLabelText("Title", { exact: false });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    // Give any scheduled work a chance to (not) run.
    await new Promise((r) => setTimeout(r, 20));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Required.")).toBeInTheDocument();
  });

  // Regression coverage for the codex-review finding on PR #53: deleting a
  // record while its autosave field is unsaved/saving/failed unmounted the
  // field, which discarded the draft outright (an in-flight fetch is
  // aborted, and an unsaved/failed value lives only in this hook's React
  // state) — Undo then restored stale, previously-committed content instead
  // of what the user actually last typed. `flush()` exists so a caller that
  // is about to unmount this field (e.g. `use-delete-note.ts`) can force the
  // latest value to become durably safe first, and know whether it's safe to
  // proceed.
  describe("flush", () => {
    it("resolves true immediately when there is nothing unsaved", async () => {
      const onSave = vi.fn(async () => {});
      const onFlushed = vi.fn();
      render(<Harness onSave={onSave} onFlushed={onFlushed} />);
      fireEvent.click(screen.getByRole("button", { name: "Flush" }));
      await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(true));
      expect(onSave).not.toHaveBeenCalled();
    });

    it("saves a pending debounced edit immediately and resolves true once persisted", async () => {
      const onSave = vi.fn(async () => {});
      const onFlushed = vi.fn();
      render(
        <Harness onSave={onSave} debounceMs={30_000} onFlushed={onFlushed} />,
      );
      const input = screen.getByLabelText("Title", { exact: false });
      fireEvent.change(input, { target: { value: "flushed edit" } });
      // No blur, no elapsed debounce — flush must still save it.
      fireEvent.click(screen.getByRole("button", { name: "Flush" }));
      await waitFor(() => expect(onSave).toHaveBeenCalledWith("flushed edit"));
      await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(true));
      await waitFor(() =>
        expect(screen.getByText("Saved")).toBeInTheDocument(),
      );
    });

    it("waits for an already in-flight save rather than starting a second one", async () => {
      let releaseSave: () => void = () => {};
      const onSave = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseSave = resolve;
          }),
      );
      const onFlushed = vi.fn();
      render(<Harness onSave={onSave} onFlushed={onFlushed} />);
      const input = screen.getByLabelText("Title", { exact: false });
      fireEvent.change(input, { target: { value: "in flight" } });
      fireEvent.blur(input);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole("button", { name: "Flush" }));
      // Give the click's microtask a beat — flush must NOT dispatch a second save.
      await new Promise((r) => setTimeout(r, 20));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onFlushed).not.toHaveBeenCalled();

      releaseSave();
      await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(true));
    });

    it("resolves false on a failed save and preserves the draft", async () => {
      const onSave = vi.fn(async () => {
        throw new Error("boom");
      });
      const onFlushed = vi.fn();
      render(<Harness onSave={onSave} onFlushed={onFlushed} />);
      const input = screen.getByLabelText("Title", { exact: false });
      fireEvent.change(input, { target: { value: "will fail" } });
      fireEvent.click(screen.getByRole("button", { name: "Flush" }));
      await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(false));
      expect(input).toHaveValue("will fail");
      expect(screen.getByText("Couldn't save")).toBeInTheDocument();
    });

    it("resolves false for an invalid value without attempting a save", async () => {
      const onSave = vi.fn(async () => {});
      const onFlushed = vi.fn();
      render(<Harness onSave={onSave} onFlushed={onFlushed} />);
      const input = screen.getByLabelText("Title", { exact: false });
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Flush" }));
      await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(false));
      expect(onSave).not.toHaveBeenCalled();
    });
  });
});
