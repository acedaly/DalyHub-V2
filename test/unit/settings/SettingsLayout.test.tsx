import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";
import { FeedbackProvider } from "~/shared/feedback";
import { DrawerProvider, DrawerTrigger } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

/**
 * Mirrors `ProjectSettingsTab`'s REAL archived/non-archived conditional swap:
 * an "Archive" group (a `DangerousAction` — its own trigger + its own
 * `ConfirmationDialog` instance) is replaced, on success, by a SEPARATE
 * "Restore" group with its own independent trigger — the whole subtree
 * containing the confirmed dialog unmounts together with its trigger in one
 * commit, exactly like the real Project Settings tab. `SettingsLayout` wraps
 * both states and never itself unmounts.
 */
function SwappingSettingsContent({
  onArchive,
}: {
  readonly onArchive: () => Promise<void>;
}) {
  const [archived, setArchived] = useState(false);
  return (
    <SettingsLayout aria-label="Project settings">
      {archived ? (
        <SettingsGroup title="Archived">
          <SettingsRow
            label="Restore this project"
            control={
              <button type="button" onClick={() => setArchived(false)}>
                Restore project…
              </button>
            }
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup title="Archive" tone="danger">
          <DangerousAction
            label="Archive this project"
            actionLabel="Archive project…"
            confirmTitle="Archive this project?"
            confirmLabel="Archive project"
            onConfirm={async () => {
              await onArchive();
              setArchived(true);
            }}
          />
        </SettingsGroup>
      )}
    </SettingsLayout>
  );
}

function FullPageHarness({
  onArchive,
}: {
  readonly onArchive: () => Promise<void>;
}) {
  return (
    <FeedbackProvider>
      <main id="main-content" tabIndex={-1}>
        <SwappingSettingsContent onArchive={onArchive} />
      </main>
    </FeedbackProvider>
  );
}

/** A settings surface hosted inside the real DS-03 modal Drawer. */
function DrawerHostedHarness({
  onArchive,
}: {
  readonly onArchive: () => Promise<void>;
}) {
  const renderDrawer = (entry: DrawerEntry): DrawerRenderResult | null => {
    if (entry.key !== "settings:project") {
      return null;
    }
    return {
      title: "Project settings",
      children: <SwappingSettingsContent onArchive={onArchive} />,
    };
  };
  return (
    <MemoryRouter initialEntries={["/host"]}>
      <Routes>
        <Route
          path="/host"
          element={
            <FeedbackProvider>
              <DrawerProvider renderDrawer={renderDrawer}>
                <main id="main-content" tabIndex={-1}>
                  <DrawerTrigger drawerKey="settings:project">
                    Open project settings
                  </DrawerTrigger>
                </main>
              </DrawerProvider>
            </FeedbackProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("DS-10b SettingsLayout — focus safety net (PROJ-05 Slice 4)", () => {
  it("reclaims focus to the settings surface itself — never a global page region — when a confirmed dangerous action's own subtree (trigger + dialog) unmounts together on success", async () => {
    const onArchive = vi.fn(() => Promise.resolve());
    render(<FullPageHarness onArchive={onArchive} />);

    fireEvent.click(screen.getByRole("button", { name: "Archive project…" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Archive project" }),
    );
    await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));

    // The Archive group (trigger + its ConfirmationDialog) is gone, replaced by
    // the Restore group — the exact same-commit unmount the real Project
    // Settings tab performs. Focus must not be silently lost to <body>.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Archive project…" }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Restore project…" }),
    ).toBeInTheDocument();
    const settingsRegion = screen.getByRole("region", {
      name: "Project settings",
    });
    await waitFor(() => expect(document.activeElement).toBe(settingsRegion));
    // Never the global page region — the fallback is local to this surface.
    expect(document.activeElement).not.toBe(
      document.getElementById("main-content"),
    );
  });

  it("keeps focus inside the modal boundary when the same swap happens inside a Drawer (the background main-content stays untouched)", async () => {
    const onArchive = vi.fn(() => Promise.resolve());
    render(<DrawerHostedHarness onArchive={onArchive} />);

    fireEvent.click(
      screen.getByRole("link", { name: "Open project settings" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Project settings",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Archive project…" }),
    );
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Archive project" }),
    );
    await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(
        within(dialog).queryByRole("button", { name: "Archive project…" }),
      ).toBeNull(),
    );
    // Still a modal: the Drawer never closed, and focus stays INSIDE it — on
    // the SettingsLayout region — never escaping to the inert background's
    // #main-content.
    expect(dialog).toBeInTheDocument();
    const settingsRegion = within(dialog).getByRole("region", {
      name: "Project settings",
    });
    await waitFor(() => expect(document.activeElement).toBe(settingsRegion));
    expect(document.activeElement).not.toBe(
      document.getElementById("main-content"),
    );
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("never steals focus for an unrelated mutation when nothing inside this layout was ever focused", async () => {
    function UnrelatedMutationHarness() {
      const [shown, setShown] = useState(false);
      return (
        <FeedbackProvider>
          <main id="main-content" tabIndex={-1}>
            <button type="button" onClick={() => setShown(true)}>
              Toggle unrelated content
            </button>
            <SettingsLayout aria-label="Unrelated settings">
              <SettingsGroup title="Info">
                {shown ? <p>Unrelated content appeared.</p> : null}
              </SettingsGroup>
            </SettingsLayout>
          </main>
        </FeedbackProvider>
      );
    }
    render(<UnrelatedMutationHarness />);

    // Nothing inside SettingsLayout has EVER been focused — activeElement is
    // whatever the environment defaults to (typically <body>).
    const bodyWasActive = document.activeElement;

    // A mutation occurs INSIDE the settings surface's subtree, but it is not
    // the removal of a previously-focused element the layout was tracking.
    fireEvent.click(
      screen.getByRole("button", { name: "Toggle unrelated content" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Unrelated content appeared.")).toBeVisible(),
    );

    // Focus must be exactly where it already was — never hijacked to the
    // settings region.
    expect(document.activeElement).toBe(bodyWasActive);
    expect(document.activeElement).not.toBe(
      screen.getByRole("region", { name: "Unrelated settings" }),
    );
  });

  it("discards a tracked element the moment it is removed, even while focus is elsewhere, so it can never hijack a LATER unrelated mutation once focus reaches <body>", async () => {
    function StaleFocusHarness() {
      const [trackedPresent, setTrackedPresent] = useState(true);
      const [unrelatedShown, setUnrelatedShown] = useState(false);
      return (
        <FeedbackProvider>
          <main id="main-content" tabIndex={-1}>
            <button type="button">Outside control</button>
            <SettingsLayout aria-label="Stale focus settings">
              <SettingsGroup title="Info">
                {trackedPresent ? (
                  <button type="button">Tracked control</button>
                ) : null}
                {unrelatedShown ? <p>Unrelated content appeared.</p> : null}
              </SettingsGroup>
            </SettingsLayout>
            <button type="button" onClick={() => setTrackedPresent(false)}>
              Remove tracked control
            </button>
            <button type="button" onClick={() => setUnrelatedShown(true)}>
              Trigger unrelated mutation
            </button>
          </main>
        </FeedbackProvider>
      );
    }
    render(<StaleFocusHarness />);

    // 1. Focus a control inside SettingsLayout — the layout starts tracking it.
    const tracked = screen.getByRole("button", { name: "Tracked control" });
    act(() => tracked.focus());
    expect(document.activeElement).toBe(tracked);

    // 2. Focus deliberately moves OUTSIDE the layout.
    const outside = screen.getByRole("button", { name: "Outside control" });
    act(() => outside.focus());
    expect(document.activeElement).toBe(outside);

    // 3. The formerly-focused Settings control is removed while focus remains
    // outside — the layout must discard the now-disconnected reference
    // immediately, not just when <body> happens to be active.
    fireEvent.click(
      screen.getByRole("button", { name: "Remove tracked control" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Tracked control" }),
      ).toBeNull(),
    );

    // 4. Focus must remain exactly where it legitimately was.
    expect(document.activeElement).toBe(outside);

    // 5. Focus now legitimately moves to <body> for an unrelated reason.
    act(() => outside.blur());
    expect(document.activeElement).toBe(document.body);

    // 6. A later, genuinely unrelated mutation occurs inside the surface.
    fireEvent.click(
      screen.getByRole("button", { name: "Trigger unrelated mutation" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Unrelated content appeared.")).toBeVisible(),
    );

    // 7. The stale, already-discarded tracked element must not resurrect and
    // pull focus back into the Settings region.
    expect(document.activeElement).toBe(document.body);
    expect(document.activeElement).not.toBe(
      screen.getByRole("region", { name: "Stale focus settings" }),
    );
  });
});
