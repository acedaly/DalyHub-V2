import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  mobileNavigationOpener,
} from "./helpers";
// V2.3-GATE-01 — the shared D1 helper. This cleanup used to spawn wrangler
// itself, so it carried no `SQLITE_BUSY` retry and could fail the whole file for
// losing a race with the dev server's own write (see `e2e/d1.ts`).
import { d1Execute } from "./d1";

/**
 * PROJ-06 — mobile-complete Projects.
 *
 * A real phone journey over the seeded Worker/D1 app. The test enters Projects
 * from the mobile shell, uses collection filters, opens the create sheet, creates
 * a Project under a real Area, lands on the canonical record, drives Tasks / Key
 * links / Activity / Settings, opens the shared Task Drawer, mutates a task, and
 * proves URL-backed Drawer history, focus restoration, touch targets, axe and no
 * document-level horizontal overflow along the way.
 */

const PHONE = { width: 390, height: 844 };
const SHORT_PHONE = { width: 320, height: 568 };
const MOBILE_PROJECT_TITLE_PREFIX = "Mobile Projects workflow ";
const COMPLETED_TASK =
  "Mobile task to complete and reconcile from the shared drawer";
const BLOCKING_TASK =
  "Unfinished mobile task that deliberately blocks archiving";
const MOBILE_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = 'local-dev-workspace'
    AND (
      (type = 'project' AND title LIKE '${MOBILE_PROJECT_TITLE_PREFIX}%')
      OR (type = 'task' AND title IN ('${COMPLETED_TASK}', '${BLOCKING_TASK}'))
    )
`;
const MOBILE_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM task_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM project_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM spine_records WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM entity_links WHERE workspace_id = 'local-dev-workspace' AND (source_entity_id IN (${MOBILE_ENTITY_QUERY}) OR target_entity_id IN (${MOBILE_ENTITY_QUERY}));`,
  `DELETE FROM entities WHERE workspace_id = 'local-dev-workspace' AND id IN (${MOBILE_ENTITY_QUERY});`,
] as const;

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

function cleanupMobileProjects() {
  // ONE invocation for the ordered sequence: it removes six process spawns and
  // shrinks the window in which the server can interleave a write between the
  // statements, which is the foreign-key half of the contention `d1.ts` retries.
  d1Execute(MOBILE_CLEANUP_SQL);
}

async function enterProjectsFromMobileShell(page: Page) {
  await gotoFixture(page, "/today");
  const navButton = mobileNavigationOpener(page);
  await expectMinTouchTarget(navButton);
  await navButton.click();

  const navSheet = page.getByRole("dialog", { name: /navigation/i });
  await expect(navSheet).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await navSheet.getByRole("link", { name: "Projects", exact: true }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function openNewProjectSheet(page: Page) {
  const trigger = page.getByRole("link", { name: "New project" }).first();
  await expectMinTouchTarget(trigger);
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "New Project" });
  await expect(dialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  return { trigger, dialog };
}

async function createProjectFromSheet(page: Page, title: string) {
  const { dialog } = await openNewProjectSheet(page);
  await dialog.getByLabel(/Title/).fill(title);

  const parent = dialog.getByRole("combobox", { name: /Area or Goal/ });
  await parent.click();
  await parent.fill("DalyHub");
  const option = dialog.getByRole("option", { name: /DalyHub V2/ });
  await expect(option).toBeVisible();
  await option.click();

  await expectNoHorizontalOverflow(page);
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(page.getByText("DalyHub V2").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function addTask(page: Page, title: string) {
  const addTask = page.getByRole("link", { name: "Add task" }).first();
  await expectMinTouchTarget(addTask);
  await addTask.click();

  const createDialog = page.getByRole("dialog", { name: "New Task" });
  await expect(createDialog).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await createDialog.getByLabel(/Title/).fill(title);
  await createDialog.getByRole("button", { name: "Add task" }).click();

  const taskDialog = page.getByRole("dialog").filter({ hasText: title });
  await expect(taskDialog).toBeVisible();
  await expect(page).toHaveURL(/drawer=task%3A/);
  await expectNoHorizontalOverflow(page);
  return taskDialog;
}

async function openTab(
  page: Page,
  name: "Tasks" | "Linked" | "Activity" | "Settings",
) {
  const tab = page.getByRole("tab", { name });
  await expectMinTouchTarget(tab);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expectNoHorizontalOverflow(page);
}

async function expectImportantTouchTargets(page: Page) {
  // DS-16 — the Project name IS the rename control now (the Drawer form is
  // gone), so the target under test is the heading's inline-edit affordance. It
  // has to clear the same 44px minimum: it is the primary way to rename a
  // Project on a phone, and it is a touch target like any other.
  await expectMinTouchTarget(
    page.getByRole("button", { name: /^Project name:/ }).first(),
  );
  await expectMinTouchTarget(
    page.getByRole("button", { name: "Complete project" }).first(),
  );
  await expectMinTouchTarget(page.getByRole("tab", { name: "Tasks" }));
  await expectMinTouchTarget(page.getByRole("tab", { name: "Linked" }));
}

test.describe("PROJ-06 — mobile Projects", () => {
  /*
   * MEASURED at 29.7s and 20.9s on an idle machine against the 30s default. These are multi-step
   * phone journeys, and the specs that already hit this ceiling — `tasks.spec`,
   * `tasks-collection`, `people-timeline`, `people-relationship`,
   * `meetings-people-history`, `project-health` and this suite's own accessibility
   * blocks — each sized their budget to the work with the reason stated. This does
   * the same, before it fails rather than after. No assertion changes.
   *
   * This is NOT the "raise the ceiling" move rejected for the shard matrix: that
   * pins the worst SHARD against a moving line and hides a growing suite. A per-test
   * budget is a bound on ONE interaction, and 30s was never sized for a journey.
   */
  test.describe.configure({ timeout: 90_000 });

  test.beforeAll(() => cleanupMobileProjects());
  test.afterEach(() => cleanupMobileProjects());

  test("drives the complete Projects workflow on a phone", async ({ page }) => {
    const title = `${MOBILE_PROJECT_TITLE_PREFIX}${Date.now()} with a very long owner-visible title that must wrap calmly`;

    await enterProjectsFromMobileShell(page);

    // UIX-02 — the lifecycle mode is the shared TAB RAIL, so it announces as a
    // `navigation` of links rather than a `group` of segments. The NAME is
    // unchanged ("Project views"), because the one-vocabulary-across-every-
    // collection rule is about the wording, not about the control.
    const filter = page.getByRole("navigation", { name: "Project views" });
    await expect(filter).toBeVisible();
    /*
     * "Active", not "Open".
     *
     * REDESIGN-04 took the mockup's WORD for the `open` lifecycle scope and
     * says so at `STATE_OPTIONS`: "`mockup3.png` draws three tabs — Active /
     * All / Archived — and 'Active' is the word it uses for what this
     * repository calls `open`. The label follows the reference; the VALUE does
     * not change, so every `?state=open` link, bookmark and test in the product
     * still resolves." The rail's labels are the shipped vocabulary and this
     * list was the last place still asking for the old one.
     */
    for (const label of ["All", "Active", "Completed", "Archived"]) {
      await expectMinTouchTarget(
        filter.getByRole("link", { name: label, exact: true }),
      );
    }
    const website = page.getByRole("link", { name: "Open Website relaunch" });
    await expect(website).toHaveAttribute("href", "/projects/pr-website");
    await expect(page.locator(".dh-card-swipe")).toHaveCount(0);
    await expectNoAxeViolations(page);

    await filter.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(page).toHaveURL(/state=completed/);
    await expectNoHorizontalOverflow(page);
    await filter.getByRole("link", { name: "All", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);

    const { trigger, dialog } = await openNewProjectSheet(page);
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await createProjectFromSheet(page, title);
    const projectPath = new URL(page.url()).pathname;
    await expectImportantTouchTargets(page);

    await openTab(page, "Tasks");
    await addTask(page, COMPLETED_TASK);
    const taskDialog = page.getByRole("dialog").filter({
      hasText: COMPLETED_TASK,
    });
    await taskDialog.getByRole("button", { name: "Complete task" }).click();
    await expect(
      taskDialog.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("link", { name: "Completed", exact: true }).click();
    const completedTaskLink = page.getByRole("link", {
      name: `Open ${COMPLETED_TASK}`,
    });
    await expect(completedTaskLink).toBeVisible();
    await completedTaskLink.focus();
    await completedTaskLink.click();
    await expect(page).toHaveURL(/drawer=task%3A/);
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(completedTaskLink).toBeFocused();
    await expectNoHorizontalOverflow(page);

    // Switching back to the Open filter is a navigation, and the next step
    // clicks another link ("Add task") whose href is built from the CURRENT
    // URL. Wait for the filter to have actually landed before doing that:
    // otherwise the second click can supersede the first, "Add task" carries
    // `?tasks=completed`, and the open task created below is correctly absent
    // from a completed-only list. Asserting the filter applied — the completed
    // task is gone — is both the wait and a stronger claim than the URL alone.
    await page.getByRole("link", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${projectPath}$`));
    await expect(
      page.getByRole("link", { name: `Open ${COMPLETED_TASK}` }),
    ).toHaveCount(0);

    await addTask(page, BLOCKING_TASK);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: `Open ${BLOCKING_TASK}` }),
    ).toBeVisible();

    await openTab(page, "Linked");
    await expect(page).toHaveURL(new RegExp(`${projectPath}\\?`));
    await expect(page.getByText("DalyHub V2").first()).toBeVisible();
    const related = page.getByRole("combobox", { name: "Related records" });
    await related.click();
    await related.fill("Archive-blocked");
    const linkTarget = page.getByRole("option", {
      name: /Archive-blocked demo project/,
    });
    await expect(linkTarget).toBeVisible();
    await linkTarget.click();
    const removeLink = page.getByRole("button", {
      name: /Remove link to Archive-blocked demo project/,
    });
    await expect(removeLink).toBeVisible();
    await expectMinTouchTarget(removeLink);
    await removeLink.click();
    await expect(removeLink).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await openTab(page, "Activity");
    await expect(page.locator('[aria-label="Project activity"]')).toBeVisible();
    await expect(page.locator(".dh-activity-item").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await openTab(page, "Settings");
    /*
     * M3-INT (PR #127) converged the product's application-style selects on the
     * shared `SelectField`, so Workflow status is a combobox rather than a
     * native `<select>`. Two mechanical consequences, both already applied to
     * `project-settings.spec.ts` in that PR and missed here: the control
     * reflects its chosen option's LABEL rather than the stored enum value, and
     * it is driven by opening the listbox and choosing an option rather than by
     * `selectOption`.
     */
    const status = page.getByRole("combobox", { name: "Workflow status" });
    await expect(status).toHaveValue("Planned");
    await status.click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();
    await expect(status).toHaveValue("Active");

    const archive = page.getByRole("button", { name: "Archive project…" });
    await expectMinTouchTarget(archive);
    await archive.click();
    const confirm = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(confirm).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await confirm.getByRole("button", { name: "Archive project" }).click();
    await expect(confirm.getByRole("alert")).toContainText(/unfinished tasks/i);
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  /*
   * MOBILE-02 §6 — the Project card is a ROW on a phone.
   *
   * The audit's complaint is arithmetic, so this test is too. Measured at
   * 393×852 before the change: 180px per card, the first at y=216, three fully
   * visible. The requirement is five or six, and what a card may keep is
   * enumerated — identity tile, title, the single most important metric, the
   * status line — so all four are asserted present rather than the height being
   * bought by deleting the record's meaning.
   */
  test("collection: cards are row-scale on a phone, and still say everything", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    // ADR-100 — the gallery explicitly; this is about the CARD.
    await gotoFixture(page, "/projects?present=grid");

    const cards = page.getByTestId("project-card");
    await expect(cards.first()).toBeVisible();

    const measured = await cards.evaluateAll((nodes) => {
      const boxes = nodes.map((node) => node.getBoundingClientRect());
      return {
        heights: boxes.map((box) => box.height),
        firstTop: boxes[0]?.top ?? 0,
        fullyVisible: boxes.filter(
          (box) => box.top >= 0 && box.bottom <= window.innerHeight,
        ).length,
        viewport: window.innerHeight,
      };
    });

    const average =
      measured.heights.reduce((sum, value) => sum + value, 0) /
      measured.heights.length;
    const perViewport = (measured.viewport - measured.firstTop) / average;
    expect(
      perViewport,
      `${average.toFixed(0)}px per card gives ${perViewport.toFixed(1)} per viewport`,
    ).toBeGreaterThanOrEqual(5);
    expect(measured.fullyVisible).toBeGreaterThanOrEqual(5);

    // …and the row still carries what the audit says must survive.
    const first = cards.first();
    await expect(first.locator(".dh-pcard__mark")).toBeVisible();
    await expect(first.locator(".dh-pcard__title")).toBeVisible();
    await expect(first.getByRole("progressbar")).toBeVisible();
    await expect(first.locator(".dh-pcard__meta")).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("keeps pagination, filters and sheets stable at the narrowest phone width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await enterProjectsFromMobileShell(page);

    await page.getByRole("button", { name: "Load more projects" }).click();
    await expect(
      page.getByRole("link", { name: "Open Paginated project 060" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Open Website relaunch" }),
    ).toHaveCount(1);

    const { dialog } = await openNewProjectSheet(page);
    await expect(
      page.getByRole("link", { name: "Open Paginated project 060" }),
    ).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await gotoFixture(page, "/projects/pg-tasks?tasks=all");
    await expectNoHorizontalOverflow(page);
    /*
     * UIX-02 — the task-state filter is the shared TAB RAIL, whose current tab
     * carries `aria-current="page"`. That is the rail's existing convention
     * (`SavedViewSwitcher`'s pinned tabs have used it since UIX-01) and the
     * right token here: each tab is a link to the URL that IS that view, so
     * "this is the current page" is literally what it means. The segmented
     * control it replaced used `"true"`, which is the correct token for a
     * control that is not a set of links.
     */
    await expect(
      page.getByRole("link", { name: "All", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Load more tasks" }).click();
    const lateTask = page.getByRole("link", {
      name: "Open Paginated task 060",
    });
    await expect(lateTask).toHaveCount(1);
    await lateTask.click();
    await expect(page).toHaveURL(/tasks=all.*drawer=task%3Apgt-060/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(lateTask).toHaveCount(1);
  });

  test("keeps sheets and confirmation actions usable on a short mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize(SHORT_PHONE);
    await gotoFixture(page, "/projects/pr-settings?tab=settings");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Archive project…" }).click();
    const confirm = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(confirm).toBeVisible();
    await expectMinTouchTarget(
      confirm.getByRole("button", { name: "Archive project" }),
    );
    await expectMinTouchTarget(confirm.getByRole("button", { name: "Cancel" }));
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await gotoFixture(page, "/projects");
    const { dialog } = await openNewProjectSheet(page);
    const parent = dialog.getByRole("combobox", { name: /Area or Goal/ });
    await parent.click();
    await parent.fill("Pagination");
    await expect(
      dialog.getByRole("option", { name: /Pagination/ }),
    ).toBeVisible();
    await expectMinTouchTarget(dialog.getByRole("button", { name: "Cancel" }));
    await expectNoHorizontalOverflow(page);
  });
});
