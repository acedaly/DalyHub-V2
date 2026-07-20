/**
 * TODAY-02 — the Today-card completion failure feedback hook.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { useCompletionFailureFeedback } from "~/modules/today/completion-feedback";
import type { TaskActionData } from "~/modules/today/routes/task-detail";

function Harness({ result }: { result: TaskActionData | undefined }) {
  useCompletionFailureFeedback(result);
  return null;
}

function renderWith(result: TaskActionData | undefined) {
  return render(
    <FeedbackProvider>
      <Harness result={result} />
    </FeedbackProvider>,
  );
}

afterEach(() => {
  // The FeedbackProvider timers are cleaned up by RTL's unmount between tests.
});

describe("useCompletionFailureFeedback", () => {
  it("announces a failed completion with its message", async () => {
    renderWith({
      kind: "completion",
      ok: false,
      message: "That task is no longer available.",
    });
    // The message is announced in both the visible toast and the ARIA live region.
    expect(
      (await screen.findAllByText("That task is no longer available.")).length,
    ).toBeGreaterThan(0);
  });

  it("stays quiet on a successful completion", () => {
    renderWith({
      kind: "completion",
      ok: true,
      task: {
        id: "t1",
        title: "T",
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
        deletedAt: null,
        completedAt: "2026-07-21T00:00:00.000Z",
        status: "todo",
        priority: null,
        dueDate: null,
        scheduledDate: null,
        description: null,
        project: null,
        goal: null,
        area: null,
        waiting: null,
      },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("stays quiet with no action result", () => {
    renderWith(undefined);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
