import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";
import { FeedbackProvider } from "~/shared/feedback";

/**
 * Mirrors `ProjectSettingsTab`'s REAL archived/non-archived conditional swap:
 * an "Archive" group (a `DangerousAction` — its own trigger + its own
 * `ConfirmationDialog` instance) is replaced, on success, by a SEPARATE
 * "Restore" group with its own independent trigger — the whole subtree
 * containing the confirmed dialog unmounts together with its trigger in one
 * commit, exactly like the real Project Settings tab. `SettingsLayout` wraps
 * both states and never itself unmounts.
 */
function SwappingSettingsHarness({
  onArchive,
}: {
  readonly onArchive: () => Promise<void>;
}) {
  const [archived, setArchived] = useState(false);
  return (
    <FeedbackProvider>
      <main id="main-content" tabIndex={-1}>
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
      </main>
    </FeedbackProvider>
  );
}

describe("DS-10b SettingsLayout — focus safety net (PROJ-05 Slice 4)", () => {
  it("reclaims focus to the page's main region when a confirmed dangerous action's own subtree (trigger + dialog) unmounts together on success", async () => {
    const onArchive = vi.fn(() => Promise.resolve());
    render(<SwappingSettingsHarness onArchive={onArchive} />);

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
    await waitFor(() =>
      expect(document.activeElement).toBe(
        document.getElementById("main-content"),
      ),
    );
  });
});
