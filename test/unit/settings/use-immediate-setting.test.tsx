import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { SettingsRow, useImmediateSetting } from "~/shared/settings";

function ToggleRow({
  onApply,
}: {
  onApply: (value: boolean, signal: AbortSignal) => Promise<void>;
}) {
  const setting = useImmediateSetting<boolean>({
    initialValue: false,
    successMessage: "Preference saved",
    onApply,
  });
  return (
    <SettingsRow
      label="Compact mode"
      control={(ids) => (
        <input
          id={ids.controlId}
          type="checkbox"
          role="switch"
          aria-labelledby={ids.labelId}
          checked={setting.value}
          disabled={setting.pending}
          onChange={(event) => setting.apply(event.target.checked)}
        />
      )}
    />
  );
}

function renderRow(
  onApply: (value: boolean, signal: AbortSignal) => Promise<void>,
) {
  return render(
    <FeedbackProvider>
      <ToggleRow onApply={onApply} />
    </FeedbackProvider>,
  );
}

describe("DS-10b useImmediateSetting", () => {
  it("applies optimistically and raises a success toast on completion", async () => {
    const onApply = vi.fn(() => Promise.resolve());
    renderRow(onApply);
    const control = screen.getByRole("switch", { name: "Compact mode" });
    expect(control).not.toBeChecked();

    fireEvent.click(control);
    // Optimistic: reflects the new value immediately.
    expect(control).toBeChecked();
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith(true, expect.any(AbortSignal)),
    );
    // Success confirmed through the shared Feedback platform (visible toast +
    // a visually-hidden live-region announcement both carry the text).
    expect(
      (await screen.findAllByText("Preference saved")).length,
    ).toBeGreaterThan(0);
    // Value stays applied.
    expect(control).toBeChecked();
  });

  it("reverts the control and raises an error toast on failure", async () => {
    const onApply = vi.fn(() => Promise.reject(new Error("Server error")));
    renderRow(onApply);
    const control = screen.getByRole("switch", { name: "Compact mode" });

    fireEvent.click(control);
    expect(control).toBeChecked(); // optimistic
    // Reverts after the failure settles.
    await waitFor(() => expect(control).not.toBeChecked());
    expect(
      (await screen.findAllByText("Couldn’t save that change.")).length,
    ).toBeGreaterThan(0);
  });
});
