/**
 * MOBILE-01 — `useForm().resetToInitial()`.
 *
 * `reset()` restores the COMMITTED baseline, which after a successful save is the
 * snapshot that was saved. That is right for "Cancel my edits" and wrong for
 * "capture another one", which needs the empty form back. The two are asserted
 * against each other here so the distinction cannot quietly collapse.
 */

import { act, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Form, TextField, useForm } from "~/shared/forms";

function CaptureHarness({
  onSubmit,
}: {
  readonly onSubmit: () => Promise<{ status: "success" }>;
}) {
  const form = useForm<{ title: string }>({
    initialValues: { title: "" },
    onSubmit,
  });
  return (
    <Form aria-label="Capture" onSubmit={form.handleSubmit}>
      <TextField label="Title" {...form.field("title")} />
      <button type="submit">Save</button>
      <button type="button" onClick={form.reset}>
        Reset
      </button>
      <button type="button" onClick={form.resetToInitial}>
        Reset to initial
      </button>
      <output data-testid="dirty">{form.isDirty ? "dirty" : "clean"}</output>
    </Form>
  );
}

const title = () => screen.getByRole("textbox", { name: /Title/ });

async function saveWith(value: string) {
  fireEvent.change(title(), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
}

describe("resetToInitial", () => {
  it("clears back to the original values after a successful save", async () => {
    const onSubmit = vi.fn(async () => ({ status: "success" }) as const);
    render(<CaptureHarness onSubmit={onSubmit} />);

    await saveWith("First captured task");
    expect((title() as HTMLInputElement).value).toBe("First captured task");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to initial" }));
    });
    expect((title() as HTMLInputElement).value).toBe("");
  });

  it("differs from reset(), which correctly restores what was saved", async () => {
    const onSubmit = vi.fn(async () => ({ status: "success" }) as const);
    render(<CaptureHarness onSubmit={onSubmit} />);

    await saveWith("Saved value");
    fireEvent.change(title(), { target: { value: "Unsaved edit" } });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    });
    // Cancel restores the SAVED snapshot — the established DS-06 behaviour.
    expect((title() as HTMLInputElement).value).toBe("Saved value");
  });

  it("makes the original values the baseline again, so the form reads clean", async () => {
    const onSubmit = vi.fn(async () => ({ status: "success" }) as const);
    render(<CaptureHarness onSubmit={onSubmit} />);

    await saveWith("Captured");
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reset to initial" }));
    });

    // Without re-baselining, an empty form would read as dirty against the saved
    // snapshot and could trip an unsaved-changes guard on close.
    expect(screen.getByTestId("dirty")).toHaveTextContent("clean");
  });

  it("supports repeated capture — each save then clear leaves an empty form", async () => {
    const onSubmit = vi.fn(async () => ({ status: "success" }) as const);
    render(<CaptureHarness onSubmit={onSubmit} />);

    for (const value of ["One", "Two", "Three"]) {
      await saveWith(value);
      act(() => {
        fireEvent.click(
          screen.getByRole("button", { name: "Reset to initial" }),
        );
      });
      expect((title() as HTMLInputElement).value).toBe("");
    }
    expect(onSubmit).toHaveBeenCalledTimes(3);
  });
});
