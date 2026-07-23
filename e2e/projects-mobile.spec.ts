import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

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
  for (const command of MOBILE_CLEANUP_SQL) {
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--command",
        command,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        stdio: "pipe",
      },
    );
  }
}

async function enterProjectsFromMobileShell(page: Page) {
  await gotoFixture(page, "/today");
  const navButton = page.getByRole("button", { name: /open navigation/i });
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
  const dialog = page.getByRole("dialog", { name: "New project" });
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

  const createDialog = page.getByRole("dialog", { name: "New task" });
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
  name: "Tasks" | "Key links" | "Activity" | "Settings",
) {
  const tab = page.getByRole("tab", { name });
  await expectMinTouchTarget(tab);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expectNoHorizontalOverflow(page);
}

async function expectImportantTouchTargets(page: Page) {
  await expectMinTouchTarget(
    page.getByRole("button", { name: "Rename" }).first(),
  );
  await expectMinTouchTarget(
    page.getByRole("button", { name: "Complete project" }).first(),
  );
  await expectMinTouchTarget(page.getByRole("tab", { name: "Tasks" }));
  await expectMinTouchTarget(page.getByRole("tab", { name: "Key links" }));
}

test.describe("PROJ-06 — mobile Projects", () => {
  test.beforeAll(() => cleanupMobileProjects());
  test.afterEach(() => cleanupMobileProjects());

  test("drives the complete Projects workflow on a phone", async ({ page }) => {
    const title = `${MOBILE_PROJECT_TITLE_PREFIX}${Date.now()} with a very long owner-visible title that must wrap calmly`;

    await enterProjectsFromMobileShell(page);

    const filter = page.getByRole("group", {
      name: "Filter projects by state",
    });
    await expect(filter).toBeVisible();
    for (const label of ["All", "Open", "Completed", "Archived"]) {
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
    await taskDialog.getByRole("checkbox", { name: /Mark complete/ }).check();
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

    await page.getByRole("link", { name: "Open", exact: true }).click();
    await addTask(page, BLOCKING_TASK);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: `Open ${BLOCKING_TASK}` }),
    ).toBeVisible();

    await openTab(page, "Key links");
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
    const status = page.getByRole("combobox", { name: "Workflow status" });
    await expect(status).toHaveValue("planned");
    await status.selectOption("active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();
    await expect(status).toHaveValue("active");

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
    await expect(
      page.getByRole("link", { name: "All", exact: true }),
    ).toHaveAttribute("aria-current", "true");
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
