import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { DangerousAction } from "~/shared/settings";

function renderAction(
  props: Partial<React.ComponentProps<typeof DangerousAction>> = {},
) {
  const onConfirm = props.onConfirm ?? vi.fn(() => Promise.resolve());
  render(
    <FeedbackProvider>
      <DangerousAction
        label="Delete this workspace"
        description="Permanently delete the workspace."
        actionLabel="Delete workspace…"
        confirmTitle="Delete workspace?"
        confirmBody="This cannot be undone."
        confirmLabel="Delete workspace"
        successMessage="Workspace deleted"
        onConfirm={onConfirm}
        {...props}
      />
    </FeedbackProvider>,
  );
  return { onConfirm };
}

describe("DS-10b DangerousAction", () => {
  it("renders the setting row and opens the confirmation on the action", async () => {
    renderAction();
    // The row's action is a button; the dialog is not yet present.
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace…" }));
    expect(
      await screen.findByRole("dialog", { name: "Delete workspace?" }),
    ).toBeInTheDocument();
  });

  it("cancels without running the action", async () => {
    const { onConfirm } = renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("completes the action and raises a success toast through Feedback", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderAction({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace…" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete workspace" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(
      (await screen.findAllByText("Workspace deleted")).length,
    ).toBeGreaterThan(0);
  });

  it("requires the typed phrase before it can run", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderAction({ onConfirm, typedConfirmation: { phrase: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace…" }));
    const confirm = await screen.findByRole("button", {
      name: "Delete workspace",
    });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "DELETE" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("disables the action when disabled", () => {
    renderAction({ disabled: true });
    expect(
      screen.getByRole("button", { name: "Delete workspace…" }),
    ).toBeDisabled();
  });
});
