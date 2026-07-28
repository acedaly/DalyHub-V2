import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ENTITY_TYPES, type EntityType } from "~/shared/entity";
import { FeedbackProvider } from "~/shared/feedback";
import { OverflowMenu } from "~/shared/overflow-menu";
import {
  lifecycleActionLabel,
  lifecycleConfirmTitle,
  lifecycleSuccessMessage,
  useRecordLifecycle,
  type RecordLifecycleOptions,
} from "~/shared/record-lifecycle";

/**
 * PX-04 — the shared record lifecycle, as BEHAVIOUR.
 *
 * The point of this hook is that "how do I remove this?" has ONE answer on every
 * entity. So these assertions are mostly about sameness: the same wording derived
 * from the identity map, the same ordering, the same confirmation friction scaled
 * to reversibility, and a failure that keeps the dialog open with a retry rather
 * than closing as if it had worked.
 */

function Harness(options: RecordLifecycleOptions) {
  const lifecycle = useRecordLifecycle(options);
  return (
    <>
      <OverflowMenu
        items={lifecycle.overflowActions}
        label={`More actions for ${options.title}`}
      />
      {lifecycle.dialogs}
    </>
  );
}

function renderLifecycle(options: RecordLifecycleOptions) {
  // The hook reports through the DS-10 Feedback platform, so the one provider
  // must sit above it — exactly as it does in the real app shell.
  return render(
    <FeedbackProvider>
      <Harness {...options} />
    </FeedbackProvider>,
  );
}

function openMenu(title: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `More actions for ${title}` }),
  );
}

describe("lifecycle copy", () => {
  it("derives every label from the ONE entity-identity map, for every entity type", () => {
    const labels: Record<EntityType, string> = {} as Record<EntityType, string>;
    for (const type of ENTITY_TYPES) {
      labels[type] = lifecycleActionLabel("archive", type);
    }
    // Never a bespoke verb per module: the sentence shape is identical and only
    // the product's own noun changes.
    expect(labels.project).toBe("Archive Project");
    expect(labels.area).toBe("Archive Area");
    expect(labels.person).toBe("Archive Person");
    for (const type of ENTITY_TYPES) {
      expect(labels[type].startsWith("Archive ")).toBe(true);
    }
  });

  it("distinguishes reversible deletion from permanent deletion in words", () => {
    expect(lifecycleActionLabel("delete", "note")).toBe("Delete Note");
    expect(lifecycleActionLabel("delete-permanently", "area")).toBe(
      "Delete Area permanently",
    );
    expect(lifecycleConfirmTitle("delete-permanently", "area")).toBe(
      "Delete this Area permanently?",
    );
    expect(lifecycleSuccessMessage("restore", "goal")).toBe("Goal restored");
  });
});

describe("useRecordLifecycle", () => {
  it("offers Archive while active and Restore while archived — never both", () => {
    const options: RecordLifecycleOptions = {
      entityType: "project",
      title: "Website relaunch",
      onArchive: vi.fn(async () => {}),
      onRestore: vi.fn(async () => {}),
    };
    const { unmount } = renderLifecycle(options);
    openMenu("Website relaunch");
    expect(
      screen.getByRole("menuitem", { name: "Archive Project" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Restore Project" }),
    ).not.toBeInTheDocument();
    unmount();

    renderLifecycle({ ...options, archived: true });
    openMenu("Website relaunch");
    expect(
      screen.getByRole("menuitem", { name: "Restore Project" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Archive Project" }),
    ).not.toBeInTheDocument();
  });

  it("orders lifecycle actions after the module's own items, always last", () => {
    renderLifecycle({
      entityType: "asset",
      title: "Ute",
      leadingItems: [{ id: "rename", label: "Rename", onSelect: vi.fn() }],
      onArchive: vi.fn(async () => {}),
      onDelete: vi.fn(async () => {}),
    });
    openMenu("Ute");
    const labels = screen
      .getAllByRole("menuitem")
      .map((item) => item.getAttribute("aria-label") ?? item.textContent);
    expect(labels).toEqual([
      "Rename",
      "Archive Asset",
      "Delete Asset permanently",
    ]);
  });

  it("confirms a permanent delete with a typed phrase and only then runs it", async () => {
    const onDelete = vi.fn(async () => {});
    renderLifecycle({
      entityType: "area",
      title: "Career",
      onDelete,
    });
    openMenu("Career");
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Delete Area permanently" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete this Area permanently?");
    const confirm = screen.getByRole("button", {
      name: "Delete Area permanently",
    });
    expect(confirm).toBeDisabled();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Type the Area name to confirm"), {
      target: { value: "Career" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Area permanently" }),
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it("runs a REVERSIBLE delete immediately — Undo is the recovery, not a dialog", () => {
    const onDelete = vi.fn(async () => {});
    renderLifecycle({
      entityType: "note",
      title: "Reading list",
      deleteMode: "reversible",
      onDelete,
    });
    openMenu("Reading list");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Note" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a blocked delete visible and inert, explaining the precondition", () => {
    const onDelete = vi.fn(async () => {});
    renderLifecycle({
      entityType: "area",
      title: "Career",
      onDelete,
      deleteBlockedReason: "Move or remove everything inside this Area first.",
    });
    openMenu("Career");
    const item = screen.getByRole("menuitem", {
      name: "Delete Area permanently",
    });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open with an error when the mutation fails", async () => {
    const onArchive = vi.fn(async () => {
      throw new Error("Couldn’t archive this Project.");
    });
    renderLifecycle({
      entityType: "project",
      title: "Website relaunch",
      onArchive,
    });
    openMenu("Website relaunch");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive Project" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Project" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t archive this Project.",
    );
    // Still open, so the user can retry rather than wonder what happened.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders no overflow at all for a record with no lifecycle capability", () => {
    renderLifecycle({ entityType: "task", title: "Email Ana" });
    expect(
      screen.queryByRole("button", { name: /More actions/ }),
    ).not.toBeInTheDocument();
  });
});
