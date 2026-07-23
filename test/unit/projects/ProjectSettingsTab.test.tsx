import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectSettingsTab } from "~/modules/projects/ProjectSettingsTab";
import type { SerializedProjectOverview } from "~/modules/projects/project-view";
import type { ProjectWorkflowStatus } from "~/kernel/project-settings";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * PROJ-05 Slice 3 — the project record's Settings tab as behaviour: current
 * Area/Goal/status/archive state render; the searchable Area/Goal picker
 * (reusing `/projects/parent-options`); status change success/no-op/failure +
 * revert; move success/failure; the archive confirmation (incl. the blocked
 * message); an archived project's read-only affordances; restore; duplicate-
 * submit prevention (via the shared confirmation single-flight phase).
 */

function overview(
  over: Partial<SerializedProjectOverview> = {},
): SerializedProjectOverview {
  return {
    id: "p1",
    title: "DalyHub V2",
    createdAt: "2026-07-18T09:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    completedAt: null,
    status: "planned",
    archivedAt: null,
    healthVisible: false,
    area: { kind: "area", id: "a1", title: "Career" },
    goal: null,
    ...over,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noop() {
  return Promise.resolve();
}

afterEach(() => vi.unstubAllGlobals());

function renderTab(
  props: Partial<React.ComponentProps<typeof ProjectSettingsTab>> = {},
) {
  return render(
    <FeedbackProvider>
      <ProjectSettingsTab
        overview={overview()}
        onSetStatus={noop}
        onMove={noop}
        onArchive={noop}
        onRestore={noop}
        {...props}
      />
    </FeedbackProvider>,
  );
}

describe("ProjectSettingsTab", () => {
  it("renders the current Area/Goal and workflow status", () => {
    renderTab();
    const parentCombo = screen.getByRole("combobox", { name: /Area or Goal/ });
    expect(parentCombo).toHaveValue("Career");
    const statusSelect = screen.getByRole("combobox", {
      name: "Workflow status",
    });
    expect(statusSelect).toHaveValue("planned");
  });

  it("prefers the Goal as the current structural parent when both are present", () => {
    // A project advancing a Goal has the Goal (not its derived Area) as its
    // actual structural parent (project.ts / ADR-034) — the picker must show
    // that, not the resolved Area.
    renderTab({
      overview: overview({
        area: { kind: "area", id: "a1", title: "Career" },
        goal: { kind: "goal", id: "g1", title: "Ship v2" },
      }),
    });
    expect(screen.getByRole("combobox", { name: /Area or Goal/ })).toHaveValue(
      "Ship v2",
    );
  });

  it("applies a workflow-status change and confirms success", async () => {
    const onSetStatus = vi.fn(
      (_status: ProjectWorkflowStatus, _signal: AbortSignal) =>
        Promise.resolve(),
    );
    renderTab({ onSetStatus });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Workflow status" }),
      {
        target: { value: "active" },
      },
    );
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledTimes(1));
    expect(onSetStatus.mock.calls[0]?.[0]).toBe("active");
    expect(
      (await screen.findAllByText("Workflow status saved")).length,
    ).toBeGreaterThan(0);
  });

  it("does not apply when reselecting the same workflow status (no-op, no Activity churn)", () => {
    const onSetStatus = vi.fn(() => Promise.resolve());
    renderTab({ onSetStatus, overview: overview({ status: "planned" }) });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Workflow status" }),
      {
        target: { value: "planned" },
      },
    );
    expect(onSetStatus).not.toHaveBeenCalled();
  });

  it("reverts the workflow-status control and reports failure", async () => {
    const onSetStatus = vi.fn(() => Promise.reject(new Error("nope")));
    renderTab({ onSetStatus, overview: overview({ status: "planned" }) });
    const select = screen.getByRole("combobox", {
      name: "Workflow status",
    }) as unknown as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "active" } });
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledTimes(1));
    // Revert-on-failure (DS-10b immediate-setting contract): the control
    // returns to the last committed value.
    await waitFor(() => expect(select.value).toBe("planned"));
    expect(
      (await screen.findAllByText(/Couldn.t save/)).length,
    ).toBeGreaterThan(0);
  });

  async function chooseParent(label: string) {
    const combo = screen.getByRole("combobox", { name: /Area or Goal/ });
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: label } });
    const option = await screen.findByRole("option", {
      name: new RegExp(label),
    });
    fireEvent.click(option);
  }

  it("moves the project to a newly-selected Area/Goal and confirms success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          options: [
            { value: "a1", label: "Career", description: "Area" },
            { value: "g1", label: "Ship v2", description: "Goal" },
          ],
        }),
      ),
    );
    const onMove = vi.fn((_parentId: string, _signal: AbortSignal) =>
      Promise.resolve(),
    );
    renderTab({ onMove });
    await chooseParent("Ship v2");
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    expect(onMove.mock.calls[0]?.[0]).toBe("g1");
    expect(
      (await screen.findAllByText("Organisation updated")).length,
    ).toBeGreaterThan(0);
  });

  it("reverts the Area/Goal picker and reports failure when the move is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          options: [
            { value: "a1", label: "Career", description: "Area" },
            { value: "g1", label: "Ship v2", description: "Goal" },
          ],
        }),
      ),
    );
    const onMove = vi.fn(() =>
      Promise.reject(new Error("Choose an available Area or Goal.")),
    );
    renderTab({ onMove });
    await chooseParent("Ship v2");
    await waitFor(() => expect(onMove).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: /Area or Goal/ }),
      ).toHaveValue("Career"),
    );
    expect(
      (await screen.findAllByText("Choose an available Area or Goal.")).length,
    ).toBeGreaterThan(0);
  });

  describe("Archive (dangerous action)", () => {
    it("opens the confirmation, explains the consequences, and archives on confirm", async () => {
      const onArchive = vi.fn(() => Promise.resolve());
      renderTab({ onArchive });
      fireEvent.click(screen.getByRole("button", { name: "Archive project…" }));
      const dialog = await screen.findByRole("dialog", {
        name: "Archive this project?",
      });
      expect(dialog).toHaveTextContent("read-only until you restore it");
      expect(dialog).toHaveTextContent("Archived Projects collection");
      fireEvent.click(screen.getByRole("button", { name: "Archive project" }));
      await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));
      expect(
        (await screen.findAllByText("Project archived")).length,
      ).toBeGreaterThan(0);
    });

    it("shows the typed blocked-archive message inline and keeps the dialog open for retry", async () => {
      const onArchive = vi.fn(() =>
        Promise.reject(
          new Error(
            "Complete or move the unfinished tasks before archiving this project.",
          ),
        ),
      );
      renderTab({ onArchive });
      fireEvent.click(screen.getByRole("button", { name: "Archive project…" }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Archive project" }),
      );
      await waitFor(() =>
        expect(
          screen.getByText(
            "Complete or move the unfinished tasks before archiving this project.",
          ),
        ).toBeInTheDocument(),
      );
      // The dialog stays open for retry — never claims success.
      expect(
        screen.getByRole("dialog", { name: "Archive this project?" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Project archived")).not.toBeInTheDocument();
    });

    it("prevents a duplicate archive submission while one is in flight", async () => {
      let resolveArchive: () => void = () => {};
      const onArchive = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveArchive = resolve;
          }),
      );
      renderTab({ onArchive });
      fireEvent.click(screen.getByRole("button", { name: "Archive project…" }));
      const confirmButton = await screen.findByRole("button", {
        name: "Archive project",
      });
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
      resolveArchive();
      await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));
    });
  });

  describe("Archived (read-only) rendering", () => {
    function archivedOverview() {
      return overview({
        status: "active",
        archivedAt: "2026-07-21T00:00:00.000Z",
      });
    }

    it("shows Restore and the preserved Area/Goal and workflow status as read-only", () => {
      renderTab({ overview: archivedOverview() });
      expect(
        screen.getByRole("button", { name: "Restore project…" }),
      ).toBeInTheDocument();
      // Preserved, read-only — plain text, not an editable control.
      expect(screen.getByText("Career")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: /Area or Goal/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Workflow status" }),
      ).not.toBeInTheDocument();
      // No second "archive again" control renders for an already-archived
      // project — the mutation would only fail.
      expect(
        screen.queryByRole("button", { name: "Archive project…" }),
      ).not.toBeInTheDocument();
    });

    it("restores the project via the ordinary (non-destructive) Restore action", async () => {
      const onRestore = vi.fn(() => Promise.resolve());
      renderTab({ overview: archivedOverview(), onRestore });
      fireEvent.click(screen.getByRole("button", { name: "Restore project…" }));
      const dialog = await screen.findByRole("dialog", {
        name: "Restore this project?",
      });
      // Ordinary/restorative styling, not destructive — no danger tone class.
      expect(dialog.className).not.toContain("dh-confirm--danger");
      fireEvent.click(screen.getByRole("button", { name: "Restore project" }));
      await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
      expect(
        (await screen.findAllByText("Project restored")).length,
      ).toBeGreaterThan(0);
    });

    it("moves focus to the shared settings region when the archived state changes after revalidation", async () => {
      const { rerender } = renderTab({ overview: archivedOverview() });
      const restore = screen.getByRole("button", { name: "Restore project…" });
      restore.focus();
      expect(document.activeElement).toBe(restore);

      rerender(
        <FeedbackProvider>
          <ProjectSettingsTab
            overview={overview({ status: "active", archivedAt: null })}
            onSetStatus={noop}
            onMove={noop}
            onArchive={noop}
            onRestore={noop}
          />
        </FeedbackProvider>,
      );

      const settingsRegion = screen.getByRole("region", {
        name: "Project settings",
      });
      await waitFor(() => expect(document.activeElement).toBe(settingsRegion));
    });
  });
});
