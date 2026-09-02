import { expect, test, type Page } from "@playwright/test";

import {
  completeTaskRow,
  expectNoHorizontalOverflow,
  gotoFixture,
  reopenTaskRow,
  taskRow as sharedTaskRow,
} from "./helpers";

/**
 * PROJ-05 Slice 3 — the Project Settings tab + Archived Projects collection,
 * driven end to end against the development-auth server over real (seeded) D1.
 * The SMALLEST focused journey proving the shared DS-10b Settings surface and
 * the Archived collection are wired to the real repository/route boundary
 * (Slices 1–2): open a project, open its Settings tab, change its workflow
 * status, move it to a different Goal, archive it, reach it again via the
 * Archived collection, restore it, exercise basic keyboard operation, and hold
 * no 320px overflow. Full PROJ-05 accessibility/responsive/Today-integration
 * closure is Slice 4 — this is deliberately narrow.
 *
 * Mutates the dedicated seeded `pr-settings` project only; its mutable state is
 * reset in `seed-tasks.sql` before every run.
 */

/**
 * M3-INT — the workflow status is the shared `SelectField` combobox now, not a
 * native `<select>`.
 *
 * Two consequences for this suite, and both are mechanical: a combobox reflects
 * its chosen option's LABEL rather than the stored enum value, and it is driven
 * by opening the listbox and choosing an option rather than by `selectOption`.
 * The change behaviour it is testing — immediate save, revert on failure, the
 * `set_status` intent — is untouched.
 */
const STATUS_LABEL = {
  planned: "Planned",
  active: "Active",
  on_hold: "On hold",
} as const;

async function chooseWorkflowStatus(
  page: Page,
  status: keyof typeof STATUS_LABEL,
): Promise<void> {
  const combo = page.getByRole("combobox", { name: "Workflow status" });
  await combo.click();
  await page
    .getByRole("option", { name: STATUS_LABEL[status], exact: true })
    .click();
}

test.describe("PROJ-05 — Project Settings and Archived collection", () => {
  test("changes status, moves the parent, archives, restores via the Archived collection", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-settings");
    await expect(
      page.getByRole("heading", { name: "Settings journey project" }),
    ).toBeVisible();

    // Open the final Settings tab.
    await page.getByRole("tab", { name: "Settings" }).click();
    const statusSelect = page.getByRole("combobox", {
      name: "Workflow status",
    });
    await expect(statusSelect).toHaveValue("Planned");

    // Change the workflow status — an immediate setting, confirmed via a toast.
    await chooseWorkflowStatus(page, "active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();
    await expect(statusSelect).toHaveValue("Active");
    // The header pill reflects the saved status after revalidation.
    await expect(
      page.getByText("Active", { exact: true }).first(),
    ).toBeVisible();

    // Move the project to the seeded Goal via the searchable Area/Goal picker.
    const parentCombo = page.getByRole("combobox", { name: /Area or Goal/ });
    await expect(parentCombo).toHaveValue("DalyHub V2");
    await parentCombo.fill("Launch");
    await page.getByRole("option", { name: /Launch the site/ }).click();
    await expect(
      page.getByRole("group", { name: "Organisation updated" }),
    ).toBeVisible();
    // The header/summary now show the Goal (and its derived Area).
    await expect(page.getByText("Launch the site").first()).toBeVisible();

    // Archive: a deliberate confirmation explaining the consequences.
    await page.getByRole("button", { name: "Archive project…" }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(archiveDialog).toBeVisible();
    await expect(archiveDialog).toContainText("read-only until you restore it");
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project archived" }),
    ).toBeVisible();

    // Archiving replaces the WHOLE Archive group (the trigger and its owning
    // ConfirmationDialog) with the Restore group in one commit — the dialog
    // itself cannot notice its own trigger disappearing, so the shared
    // SettingsLayout's focus safety net is what must land focus somewhere
    // meaningful, never silently lost to <body>. The fallback is the settings
    // surface itself (never a global page region, which would break inside a
    // modal Drawer/Inspector).
    await expect(
      page.getByRole("region", { name: "Project settings" }),
    ).toBeFocused();

    // The record shows the Archived state prominently, with Complete hidden and
    // Settings showing Restore instead of Archive. (EDIT-02: there is no Rename
    // button on any record any more — see the DS-16 assertion below.)
    await expect(
      page.getByText("Archived", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toHaveCount(0);
    // DS-16 — renaming is the heading itself, and an archived Project is
    // read-only, so the heading renders as PLAIN TEXT with no control at all.
    // The absence of the button is still the assertion; only its identity moved.
    await expect(
      page.getByRole("button", { name: /^Project name:/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Restore project…" }),
    ).toBeVisible();

    // Reach it again via the dedicated Archived collection segment.
    await page.goto("/projects");
    await page.getByRole("link", { name: "Archived" }).click();
    await expect(page).toHaveURL(/state=archived/);
    const archivedCard = page.getByRole("link", {
      name: "Open Settings journey project",
    });
    await expect(archivedCard).toBeVisible();
    await archivedCard.click();
    await expect(page).toHaveURL(/\/projects\/pr-settings/);

    // Restore via the ordinary (non-destructive) action in Settings.
    await page.getByRole("tab", { name: "Settings" }).click();
    // Keyboard operation: the Restore button is reachable and activatable by
    // keyboard, and the confirmation traps focus on a real dialog.
    const restoreButton = page.getByRole("button", {
      name: "Restore project…",
    });
    await restoreButton.focus();
    await page.keyboard.press("Enter");
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project restored" }),
    ).toBeVisible();

    // Restoring likewise replaces the WHOLE Restore group (trigger + its
    // ConfirmationDialog) with the Organisation/Workflow/Archive groups in one
    // commit — the same focus-safety-net requirement as the archive above.
    await expect(
      page.getByRole("region", { name: "Project settings" }),
    ).toBeFocused();

    // Normal controls return; the preserved workflow status survives the
    // archive/restore round trip.
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("Active");
  });

  test("has no horizontal overflow at 320px with the Settings tab and a confirmation open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/projects/pr-settings");
    await page.getByRole("tab", { name: "Settings" }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Archive project…" }).click();
    await expect(
      page.getByRole("dialog", { name: "Archive this project?" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Leave the record exactly as this run found it — cancel, mutating nothing.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/**
 * PROJ-05 Slice 4 — Today integration closure. Extends the Slice 3 Settings
 * journey above rather than a second test architecture: it proves the complete
 * Project workflow-status/archive/restore journey affects Today's "Continue
 * working" exactly as ADR-037's Today integration promises. Every transition goes
 * through the real Settings tab UI/mutation route; no client-only filtering ever
 * substitutes for repository state.
 *
 * ONLY the very first navigation of each journey is a full page load
 * (`gotoFixture`, the "initial setup load"). Every transition after that is REAL
 * client-side navigation — the app shell's sidebar links, a Continue-working row
 * link, or `page.goBack()`/`page.goForward()` — proving the whole journey
 * reconciles through live SPA navigation and browser history, never a hard
 * reload.
 *
 * ── Why this is TWO journeys (HARDEN-02) ────────────────────────────────────
 * It used to be one, over the task-free `pr-today`, and it asserted that the
 * project appeared in "Continue working" the moment it was made Active. It
 * cannot: two rules the product states in different places meet here.
 *
 *   - Today's rail lists only projects with OPEN WORK (`rankContinueProjects`
 *     filters `openCount > 0` — "continue working on a project with nothing left
 *     to do is not a suggestion"), added by the Today redesign AFTER this
 *     journey was written;
 *   - archiving is REFUSED while any unfinished task remains directly under the
 *     project (the Archive dialog says so in as many words).
 *
 * So one project can satisfy either half and never both, and the single journey
 * asserting both had been describing a state the product cannot reach. The two
 * halves now run over two fixtures, and neither claim was dropped.
 */
test.describe("PROJ-05 Slice 4 — Today integration", () => {
  test("Planned → Active → On hold → Active, reflected live on Today via real SPA navigation", async ({
    page,
  }) => {
    const nav = () => page.getByRole("navigation", { name: "Primary" });
    const goToToday = () => nav().getByRole("link", { name: "Today" }).click();
    /*
     * Today's "Continue working" panel. The Today redesign replaced its cards
     * with plain rows, so the project is a link inside a labelled region rather
     * than an `article[data-card-id]` — scoping to the region is what keeps this
     * from also matching the Projects collection later in the journey.
     */
    const continueWorking = () =>
      page.getByRole("region", { name: "Continue working" });
    const projectLink = () =>
      continueWorking().getByRole("link", { name: "Today rail project" });
    const statusSelect = () =>
      page.getByRole("combobox", { name: "Workflow status" });

    // 1: the ONE full page load — arrive directly at the project record.
    await gotoFixture(page, "/projects/pr-today-work");
    await expect(
      page.getByRole("heading", { name: "Today rail project" }),
    ).toBeVisible();

    /*
     * 2: put REAL activity on the project, through the product.
     *
     * The rail ranks on `lastMeaningfulActivityAt` from the shared Activity
     * stream and shows three, and a workflow-status change is deliberately NOT
     * one of the meaningful types — so a freshly seeded project is ranked last
     * (no activity at all) and a seven-candidate workspace crowds it out. That
     * is the rail behaving as documented, not a defect, and the honest fixture
     * for "the project I am working on" is one that has just been worked on.
     *
     * Completing the task and reopening it is that work, performed through the
     * row's own control: two meaningful events (`task.completed`,
     * `task.reopened`), and the task is open again afterwards, so the
     * `openCount > 0` precondition still holds.
     */
    await page.getByRole("tab", { name: "Tasks" }).click();
    // The tab's default sub-view is OPEN tasks, so a completed row leaves it —
    // "All" is where both halves of this are visible on one screen.
    await page
      .getByRole("navigation", { name: "Filter tasks by state" })
      .getByRole("link", { name: "All", exact: true })
      .click();
    // V2.8 CONV-01 — the tab renders the shared `TaskRow` (a list item, which
    // has no accessible name of its own), so the row is found the way every
    // Task surface's rows are found: by the shared locator and its title.
    const taskRow = sharedTaskRow(page, "Today rail open task");
    await expect(taskRow).toBeVisible();
    // Start from OPEN whatever an interrupted previous run left behind: the seed
    // resets this task, but only when the dev server (and so the seeding step)
    // restarts, which a re-used local server does not do.
    if (await taskRow.getByRole("checkbox").isChecked()) {
      await reopenTaskRow(taskRow, "Today rail open task");
    }
    await completeTaskRow(taskRow, "Today rail open task");
    await reopenTaskRow(taskRow, "Today rail open task");
    await expect(
      taskRow.getByRole("checkbox", { name: "Complete Today rail open task" }),
    ).toBeVisible();

    // 3–4: open the Settings tab (an in-page URL param, not a navigation away),
    // confirm it starts Planned, and change it to Active.
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(statusSelect()).toHaveValue("Planned");
    await chooseWorkflowStatus(page, "active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    // 5: real client navigation to Today via the sidebar — it now appears and
    // reads Active.
    await goToToday();
    await expect(page).toHaveURL(/\/today$/);
    await expect(projectLink()).toBeVisible();
    /*
     * The row states its open-task count and its STATE in words, never by colour.
     *
     * The state is the project's derived HEALTH where there is any — this project
     * has one open, un-slipped task and activity from a moment ago, so it reads
     * "On track" — and falls back to the workflow status only for a project with
     * no health facts at all (which is what the task-free project in the sibling
     * journey would show). The old assertion expected "· Active" because it ran
     * over that task-free project, where the fallback was the only branch it
     * could take.
     *
     * Scoped to THIS project's row: several projects can be Active at once, and
     * the claim is about this one. `hasText` rather than `has: projectLink()` —
     * an inner locator passed to `has` is re-rooted at each candidate row, so a
     * page-rooted one (`region >> link`) can never match inside a list item and
     * the filter silently resolves to nothing.
     */
    const projectRow = () =>
      continueWorking()
        .getByRole("listitem")
        .filter({ hasText: "Today rail project" });
    await expect(projectRow()).toContainText("1 open task");
    await expect(projectRow()).toContainText("On track");

    // 6: real client navigation BACK to the record via the Continue working
    // row link itself (it is visible, since the project is Active).
    await projectLink().click();
    await expect(page).toHaveURL(/\/projects\/pr-today-work/);
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(statusSelect()).toHaveValue("Active");
    await chooseWorkflowStatus(page, "on_hold");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    // 7: back to Today (sidebar) — it disappears. The URL assertion is load-
    // bearing, not decorative: `projectLink()` has zero count on the project
    // record itself too, so without waiting for the navigation to actually land
    // on Today first, the very next `goBack()` can race an in-flight
    // navigation and land one entry short.
    await goToToday();
    await expect(page).toHaveURL(/\/today$/);
    await expect(projectLink()).toHaveCount(0);

    // 8: it is no longer reachable from Today, so return to the record
    // via REAL browser history (`goBack`) rather than a fresh navigation —
    // this restores the exact `?tab=settings` entry from step 6.
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/pr-today-work\?tab=settings/);
    await expect(statusSelect()).toHaveValue("On hold");
    await chooseWorkflowStatus(page, "active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    // 9: real navigation to Today (sidebar) — it is back.
    await goToToday();
    await expect(page).toHaveURL(/\/today$/);
    await expect(projectLink()).toBeVisible();

    // 10: Back/Forward through the real SPA history built by this journey.
    await projectLink().click();
    await expect(page).toHaveURL(/\/projects\/pr-today-work/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today/);
    await expect(projectLink()).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/projects\/pr-today-work/);
    // The seed resets this project to Planned with its one task open before the
    // next full suite run regardless of where this journey stopped.
  });

  test("Archive → Restore preserves the workflow status, and Today stays honest about a project with no open work", async ({
    page,
  }) => {
    const nav = () => page.getByRole("navigation", { name: "Primary" });
    const goToToday = () => nav().getByRole("link", { name: "Today" }).click();
    const goToProjects = () =>
      nav().getByRole("link", { name: "Projects", exact: true }).click();
    const continueWorking = () =>
      page.getByRole("region", { name: "Continue working" });
    const projectLink = () =>
      continueWorking().getByRole("link", {
        name: "Today integration project",
      });
    const statusSelect = () =>
      page.getByRole("combobox", { name: "Workflow status" });

    // 1: the ONE full page load — `pr-today` has no child tasks, which is what
    // makes it archivable at all.
    await gotoFixture(page, "/projects/pr-today");
    await expect(
      page.getByRole("heading", { name: "Today integration project" }),
    ).toBeVisible();

    // 2–3: Planned → Active through the real mutation route.
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(statusSelect()).toHaveValue("Planned");
    await chooseWorkflowStatus(page, "active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    /*
     * 4: Active is NOT enough to reach Today's rail, and this is the assertion
     * that says so. "Continue working" is a list of work to continue, and a
     * project with nothing open has none — the same rule that lets this project
     * be archived at all. Asserting the absence here is what stops the sibling
     * journey's presence assertion from being read as "Active ⇒ on Today".
     */
    await goToToday();
    await expect(page).toHaveURL(/\/today$/);
    await expect(projectLink()).toHaveCount(0);

    // 5: back to the record through real browser history, and archive it
    // through the real confirmation, keyboard-operated.
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/pr-today\?tab=settings/);
    const archiveButton = page.getByRole("button", {
      name: "Archive project…",
    });
    await archiveButton.focus();
    await page.keyboard.press("Enter");
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(archiveDialog).toBeVisible();
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project archived" }),
    ).toBeVisible();

    // 6: reach the Archived collection via real sidebar + segmented-filter
    // links, then open the archived card — all real client navigation.
    await goToProjects();
    await expect(page).toHaveURL(/\/projects$/);
    await page.getByRole("link", { name: "Archived" }).click();
    await expect(page).toHaveURL(/state=archived/);
    const archivedCard = page.getByRole("link", {
      name: "Open Today integration project",
    });
    await expect(archivedCard).toBeVisible();
    await archivedCard.click();
    await expect(page).toHaveURL(/\/projects\/pr-today/);

    // 7: restore it (keyboard-operated). The workflow status survives the round
    // trip — ADR-037 §37.1/§37.5 — so no second manual status change is needed.
    await page.getByRole("tab", { name: "Settings" }).click();
    const restoreButton = page.getByRole("button", {
      name: "Restore project…",
    });
    await restoreButton.focus();
    await page.keyboard.press("Enter");
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project restored" }),
    ).toBeVisible();
    await expect(statusSelect()).toHaveValue("Active");

    // 8: and Today is unchanged by the round trip — still absent, for the same
    // reason it was absent at step 4 and not because it was ever archived.
    await goToToday();
    await expect(page).toHaveURL(/\/today$/);
    await expect(projectLink()).toHaveCount(0);
    // `pr-today` is left restored (Active, not archived); the seed resets it to
    // its Planned baseline before the next full suite run regardless.
  });

  test("a restored Planned project stays absent from Today’s Continue working", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-today-planned");
    await expect(
      page.getByRole("heading", {
        name: "Planned project (Today absence check)",
      }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("Planned");

    // Archive it directly (it never passes through Active) and restore it.
    await page.getByRole("button", { name: "Archive project…" }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();

    await page.getByRole("button", { name: "Restore project…" }).click();
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    // Workflow status is preserved as Planned across the round trip.
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("Planned");

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Today" })
      .click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("link", {
        name: "Open Planned project (Today absence check)",
      }),
    ).toHaveCount(0);
  });
});
