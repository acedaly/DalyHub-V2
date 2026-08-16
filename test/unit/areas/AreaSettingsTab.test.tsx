/**
 * AREA-05 — the Area record's Settings tab (lifecycle & danger section).
 *
 * Component behaviour over the shared DS-10b Settings system: the active vs
 * archived lifecycle layout, the dependency-count blockers, the exact-title
 * confirmation gate for permanent deletion, accessible dialog semantics, and
 * focus restoration on cancel. Rendered under a `FeedbackProvider` because the
 * shared danger action raises a success toast through the Feedback platform.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AreaDependencySummary } from "~/kernel/areas";
import { FeedbackProvider } from "~/shared/feedback";

import { AreaSettingsTab } from "~/modules/areas/AreaSettingsTab";
import type { SerializedAreaOverview } from "~/modules/areas/area-view";

const ACTIVE_OVERVIEW: SerializedAreaOverview = {
  id: "a1",
  title: "Career",
  colourRank: 0,
  createdAt: "2026-07-18T09:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z",
  archivedAt: null,
  iconKey: null,
  colourSlot: null,
};

const ARCHIVED_OVERVIEW: SerializedAreaOverview = {
  ...ACTIVE_OVERVIEW,
  archivedAt: "2026-07-21T09:00:00.000Z",
};

function summary(
  over: Partial<AreaDependencySummary> = {},
): AreaDependencySummary {
  const base = {
    areaId: "a1",
    goals: 0,
    projects: 0,
    tasks: 0,
    notes: 0,
    diary: 0,
    other: 0,
    ...over,
  };
  const total =
    base.goals +
    base.projects +
    base.tasks +
    base.notes +
    base.diary +
    base.other;
  return { ...base, total, deletable: total === 0 };
}

function renderTab(
  props: Partial<React.ComponentProps<typeof AreaSettingsTab>> = {},
) {
  const onArchive = props.onArchive ?? vi.fn(() => Promise.resolve());
  const onRestore = props.onRestore ?? vi.fn(() => Promise.resolve());
  const onDelete = props.onDelete ?? vi.fn(() => Promise.resolve());
  render(
    <FeedbackProvider>
      <AreaSettingsTab
        overview={ACTIVE_OVERVIEW}
        dependencies={summary()}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={onDelete}
        {...props}
      />
    </FeedbackProvider>,
  );
  return { onArchive, onRestore, onDelete };
}

describe("AREA-05 AreaSettingsTab", () => {
  it("shows the active lifecycle layout: state Active + an Archive action", () => {
    renderTab();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archive area…" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore area…" })).toBeNull();
  });

  it("shows the archived lifecycle layout: state Archived + a Restore action", () => {
    renderTab({ overview: ARCHIVED_OVERVIEW });
    // The lifecycle state value reads "Archived" (the group heading does too).
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Restore area…" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive area…" })).toBeNull();
  });

  it("presents grouped dependency counts and offers NO delete button when blocked", () => {
    renderTab({ dependencies: summary({ goals: 2, projects: 1, notes: 3 }) });
    expect(screen.getByText("2 Goals")).toBeInTheDocument();
    expect(screen.getByText("1 Project")).toBeInTheDocument();
    expect(screen.getByText("3 linked Notes")).toBeInTheDocument();
    // No permanent-delete affordance at all — no bypass.
    expect(screen.queryByRole("button", { name: "Delete area…" })).toBeNull();
  });

  it("gates permanent deletion behind an exact-title confirmation", async () => {
    const onDelete = vi.fn(() => Promise.resolve());
    renderTab({ onDelete });
    fireEvent.click(screen.getByRole("button", { name: "Delete area…" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Delete this Area permanently?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const confirm = screen.getByRole("button", {
      name: "Delete area permanently",
    });
    expect(confirm).toBeDisabled();

    // A wrong phrase keeps it disabled…
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "career" },
    });
    expect(confirm).toBeDisabled();

    // …the exact title (case-significant) enables it.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Career" },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("restores focus to the exact opener when a delete confirmation is cancelled", async () => {
    renderTab();
    const opener = screen.getByRole("button", { name: "Delete area…" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog", {
      name: "Delete this Area permanently?",
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
