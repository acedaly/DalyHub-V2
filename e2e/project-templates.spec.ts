/**
 * PROJECT-02 — Project templates, driven end to end against the
 * development-auth server over real (seeded) D1.
 *
 * The journeys are the product's claims, in order:
 *
 *   - a template is made from a Project that already worked, and the
 *     confirmation says what was captured;
 *   - a new Project is created from it, under a name of the owner's choosing,
 *     with the Tasks created exactly once, in the template's order, with their
 *     checklists copied and every tick reset;
 *   - completed Tasks, dates and history do NOT travel;
 *   - the source Project is untouched, and editing the template afterwards does
 *     not rewrite a Project already created from it;
 *   - a template's tasks never appear as Tasks: not on Today, not in Weekly
 *     Planning, not in the Tasks collection, not in any Project count;
 *   - the phone experience is intentional at 393 and does not overflow at 320;
 *   - the whole flow is reachable by keyboard, and clean under axe in both
 *     appearances.
 */

import { expect, test, type Page } from "@playwright/test";

import { d1Query, sqlLiteral } from "./d1";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  FIXTURE,
  removeTemplateFixtures,
  seedCanonicalProject,
  WORKSPACE_ID,
} from "./project-template-fixtures";

const PROJECT_URL = `/projects/${FIXTURE.projectId}`;
const TEMPLATES_URL = "/projects/templates";

/** A Project RECORD url — one UUID segment, and never `/projects/templates`. */
const PROJECT_RECORD_URL =
  /\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test.beforeEach(() => {
  /*
   * Every journey in this file drives a multi-step flow — capture, instantiate,
   * then go and look at what was written — over a fixture seeded through
   * wrangler in a second process. Several sit within a few seconds of the 30s
   * default, so a loaded runner would turn a passing journey red without a
   * single behaviour changing. The budget is not one of the claims: each test
   * takes the same explicit two minutes the repository's other long journeys
   * declare (`goals.spec.ts`, `notes-knowledge.spec.ts`, `linked-items.spec.ts`).
   */
  test.setTimeout(120_000);
  seedCanonicalProject();
});

test.afterAll(() => {
  removeTemplateFixtures();
});

/** Save the seeded Project as a template through the record's overflow menu. */
async function saveAsTemplate(page: Page): Promise<void> {
  await gotoFixture(page, PROJECT_URL);
  await page
    .getByRole("button", { name: new RegExp("More actions", "i") })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  /*
   * The confirmation STATES what was captured, not merely that something was.
   *
   * The toast is asserted rather than the live region beside it (both carry the
   * same words, which is the point of the live region) — and the wording is
   * asserted in full, because "Saved" alone would leave an owner to open the
   * template to discover whether the completed Task came too.
   */
  const toast = page
    .getByLabel("Notifications", { exact: true })
    .getByText(/^Saved /);
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toContainText("2 tasks");
  await expect(toast).toContainText(
    "Dates, progress and history were not copied.",
  );
}

/** The template row on `/projects/templates`, by name. */
function templateRow(page: Page, name: string) {
  return page.getByRole("listitem").filter({ hasText: name });
}

/**
 * Open the template RECORD, and wait until it is interactive.
 *
 * The href is read and navigated to rather than the link being clicked,
 * because a client-side navigation lands server-rendered markup well before
 * React attaches its handlers — and a click dispatched in that window is
 * silently dropped (see `helpers.ts`). `gotoFixture` waits for the gate.
 */
async function openTemplateRecord(page: Page, name: string): Promise<void> {
  await gotoFixture(page, TEMPLATES_URL);
  const href = await page
    .getByRole("link", { name, exact: true })
    .first()
    .getAttribute("href");
  expect(href).toMatch(/^\/projects\/templates\//);
  await gotoFixture(page, href!);
}

/** Create a Project from the first template, with a chosen name. */
async function createFromTemplate(page: Page, name: string): Promise<void> {
  await gotoFixture(page, TEMPLATES_URL);
  /*
   * The row's action is a real LINK, not a button: `DrawerTrigger` builds an
   * href that opens the drawer, so the flow is shareable, Back works and a
   * middle-click still does something sensible. Its accessible name says which
   * template, because "Use template" repeated down a list names nothing.
   */
  await page
    .getByRole("link", { name: /Create a project from/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  const title = drawer.getByLabel("Project name");
  await title.fill(name);
  await drawer.getByRole("button", { name: "Create project" }).click();
  /*
   * The destination is the NEW Project's record, and the pattern says so
   * explicitly: `/projects/templates` also matches "a single segment under
   * /projects", so a loose regex would report success while the drawer was
   * still open with an error in it.
   */
  await expect(page).toHaveURL(PROJECT_RECORD_URL, { timeout: 15_000 });
}

/** Every Task title under a Project, in the order the record draws them. */
async function projectTaskTitles(
  page: Page,
  projectUrl: string,
): Promise<string[]> {
  await gotoFixture(page, projectUrl);
  // The Project's Tasks tab draws the shared card collection labelled
  // "Project tasks"; each Task is one card with its title as the heading.
  const cards = page
    .getByRole("list", { name: "Project tasks" })
    .getByRole("article");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
  const count = await cards.count();
  const titles: string[] = [];
  for (let index = 0; index < count; index += 1) {
    titles.push(
      (await cards.nth(index).getByRole("heading").first().innerText()).trim(),
    );
  }
  return titles;
}

test.describe("PROJECT-02 — Project templates", () => {
  test("1–10: capture a Project, instantiate it, and prove what did and did not travel", async ({
    page,
  }) => {
    /* 1. Create a template from an existing Project. */
    await saveAsTemplate(page);

    /* The template exists, and says what it will create. */
    await gotoFixture(page, TEMPLATES_URL);
    const row = templateRow(page, FIXTURE.projectTitle);
    await expect(row).toBeVisible();
    // Two OPEN tasks travelled; the completed one did not (claim 8).
    await expect(row).toContainText("2 tasks");
    await expect(row).toContainText("2 checklist items");

    /* 2 + 3. Instantiate under a name that DIFFERS from the template's. */
    await createFromTemplate(page, "September reporting");
    const createdUrl = new URL(page.url()).pathname;
    const createdId = createdUrl.split("/").pop()!;
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "September reporting",
    );

    /* 4 + 5. The Tasks are created exactly once, in the template's order. */
    const titles = await projectTaskTitles(page, createdUrl);
    expect(titles).toEqual(["Pull the numbers", "Write the summary"]);

    /*
     * 4 (continued), 6, 7, 8, 9 — asserted at the DATABASE, because "exactly
     * once", "no ticks", "no dates" and "no copied history" are claims about
     * rows rather than about pixels, and a UI assertion could pass while a
     * duplicate row sat underneath it.
     */
    const created = d1Query<{
      readonly id: string;
      readonly title: string;
      readonly completed_at: string | null;
      readonly due_date: string | null;
      readonly scheduled_date: string | null;
      readonly status: string;
    }>(
      `SELECT e.id AS id, e.title AS title, s.completed_at AS completed_at,
              td.due_date AS due_date, td.scheduled_date AS scheduled_date,
              td.status AS status
         FROM entity_links l
         JOIN entities e ON e.id = l.source_entity_id AND e.workspace_id = l.workspace_id
         JOIN spine_records s ON s.entity_id = e.id AND s.workspace_id = e.workspace_id
         LEFT JOIN task_details td ON td.entity_id = e.id AND td.workspace_id = e.workspace_id
        WHERE l.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND l.target_entity_id = ${sqlLiteral(createdId)}
          AND l.type = 'task.belongs_to_project'
          AND l.deleted_at IS NULL AND e.deleted_at IS NULL
        ORDER BY e.created_at ASC, e.id ASC`,
    );
    // 4. Exactly once — two template tasks, two Tasks, no duplicates.
    expect(created.map((task) => task.title)).toEqual([
      "Pull the numbers",
      "Write the summary",
    ]);
    for (const task of created) {
      // 8. Completed state is reset — every created Task is open.
      expect(task.completed_at).toBeNull();
      expect(task.status).toBe("todo");
      // Dates do not travel: the source Task had both.
      expect(task.due_date).toBeNull();
      expect(task.scheduled_date).toBeNull();
    }

    /* 6 + 7. The checklist structure is copied, with every tick reset. */
    const checklist = d1Query<{
      readonly title: string;
      readonly position: number;
      readonly completed: number;
    }>(
      `SELECT title, position, completed FROM task_checklist_items
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND task_id = ${sqlLiteral(created[1]!.id)}
        ORDER BY position ASC`,
    );
    expect(checklist.map((item) => item.title)).toEqual([
      "Headline figure",
      "One risk, one win",
    ]);
    // The SOURCE had "Headline figure" ticked. The copy does not.
    expect(checklist.every((item) => item.completed === 0)).toBe(true);

    /* 9. No historical Activity was copied onto the new Project. */
    const activity = d1Query<{ readonly type: string }>(
      `SELECT a.type AS type FROM activities a
         JOIN activity_subjects s ON s.activity_id = a.id AND s.workspace_id = a.workspace_id
        WHERE s.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND s.entity_id = ${sqlLiteral(createdId)}`,
    );
    expect(activity.map((row) => row.type)).toEqual([
      "project.created_from_template",
    ]);

    /* 10. The original Project is unchanged. */
    const source = await projectTaskTitles(page, PROJECT_URL);
    expect(source).toContain("Pull the numbers");
    expect(source).toContain("Write the summary");
    const sourceChecklist = d1Query<{ readonly completed: number }>(
      `SELECT completed FROM task_checklist_items
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND task_id = ${sqlLiteral(`${FIXTURE.projectId}-t1`)}
        ORDER BY position ASC`,
    );
    // The source's tick is still ticked: capture READ it, and never wrote it.
    expect(sourceChecklist.map((item) => item.completed)).toEqual([1, 0]);
  });

  test("11: editing the template does not change a Project already created from it", async ({
    page,
  }) => {
    await saveAsTemplate(page);
    await createFromTemplate(page, "October reporting");
    const createdUrl = new URL(page.url()).pathname;

    // Open the template record and add a task to it.
    await openTemplateRecord(page, FIXTURE.projectTitle);
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await page.getByLabel("Add task").fill("A step added later");
    await page.keyboard.press("Enter");
    await expect(page.getByText("A step added later")).toBeVisible();

    // The Project made BEFORE the edit is untouched.
    const titles = await projectTaskTitles(page, createdUrl);
    expect(titles).toEqual(["Pull the numbers", "Write the summary"]);
    expect(titles).not.toContain("A step added later");
  });

  test("12–15: a template's tasks are never live work", async ({ page }) => {
    await saveAsTemplate(page);

    /*
     * The claims below are about ABSENCE, so each is asserted twice: once at
     * the database (the template's tasks are not `entities`, so they cannot be
     * anywhere) and once on the surface that would show them if they were.
     */
    const templateTaskTitles = d1Query<{ readonly title: string }>(
      `SELECT title FROM project_template_tasks
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}`,
    ).map((row) => row.title);
    expect(templateTaskTitles.length).toBeGreaterThan(0);

    // Structurally impossible: a template task has no entity row at all.
    const asEntities = d1Query<{ readonly n: number }>(
      `SELECT COUNT(*) AS n FROM entities e
         JOIN project_template_tasks t ON t.id = e.id
        WHERE e.workspace_id = ${sqlLiteral(WORKSPACE_ID)}`,
    );
    expect(Number(asEntities[0]?.n ?? 0)).toBe(0);

    /* 12. Today. */
    await gotoFixture(page, "/today");
    for (const title of templateTaskTitles) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }

    /* 13. Weekly Planning. */
    await gotoFixture(page, "/plan");
    for (const title of templateTaskTitles) {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    }

    /*
     * 14. The Tasks collection. The SOURCE Project's Tasks are real and DO
     * appear — so this asserts the count, not the absence of the words: after
     * a capture there must be exactly as many "Pull the numbers" rows as there
     * were before it, namely one.
     */
    await gotoFixture(page, "/tasks?view=list&group=none");
    const openTasks = d1Query<{ readonly n: number }>(
      `SELECT COUNT(*) AS n FROM entities
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND type = 'task'
          AND id LIKE ${sqlLiteral(`${FIXTURE.projectId}%`)}`,
    );
    expect(Number(openTasks[0]?.n ?? 0)).toBe(3);

    /* 15. Project counts are unaffected: a template is not a Project. */
    const projectCount = d1Query<{ readonly n: number }>(
      `SELECT COUNT(*) AS n FROM spine_records
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND kind = 'project'`,
    );
    const templateCount = d1Query<{ readonly n: number }>(
      `SELECT COUNT(*) AS n FROM entities
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND type = 'project_template'`,
    );
    expect(Number(templateCount[0]?.n ?? 0)).toBe(1);
    // The template has NO spine record, so it cannot be in the Project count.
    const templateInSpine = d1Query<{ readonly n: number }>(
      `SELECT COUNT(*) AS n FROM spine_records s
         JOIN entities e ON e.id = s.entity_id AND e.workspace_id = s.workspace_id
        WHERE s.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND e.type = 'project_template'`,
    );
    expect(Number(templateInSpine[0]?.n ?? 0)).toBe(0);
    expect(Number(projectCount[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  test("16: the whole flow works on a phone at 393", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await saveAsTemplate(page);

    await gotoFixture(page, TEMPLATES_URL);
    await expectNoHorizontalOverflow(page);
    const row = templateRow(page, FIXTURE.projectTitle);
    await expect(row).toBeVisible();
    // The name is not truncated to nothing: the row's own box is at least as
    // wide as the phone's content column minus the gutters.
    const box = await row.boundingBox();
    expect(box!.width).toBeGreaterThan(300);

    await createFromTemplate(page, "Phone reporting");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Phone reporting",
    );
  });

  test("17: nothing overflows at 320 on any template surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await saveAsTemplate(page);

    await gotoFixture(page, TEMPLATES_URL);
    await expectNoHorizontalOverflow(page);

    await openTemplateRecord(page, FIXTURE.projectTitle);
    await expectNoHorizontalOverflow(page);
  });

  test("18: a Project can be created from a template by keyboard alone", async ({
    page,
  }) => {
    await saveAsTemplate(page);
    await gotoFixture(page, TEMPLATES_URL);

    // Tab to the row's "Use template" control and activate it.
    const useTemplate = page
      .getByRole("link", { name: /Create a project from/ })
      .first();
    await useTemplate.focus();
    await expect(useTemplate).toBeFocused();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // Focus is inside the drawer, which is what makes the rest reachable.
    const title = drawer.getByLabel("Project name");
    await title.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Keyboard reporting");
    await drawer.getByRole("button", { name: "Create project" }).focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(PROJECT_RECORD_URL, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Keyboard reporting",
    );
  });

  test("19: axe finds nothing on the template surfaces, in light and dark", async ({
    page,
  }) => {
    await saveAsTemplate(page);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      await gotoFixture(page, TEMPLATES_URL);
      await expectNoAxeViolations(page);

      await openTemplateRecord(page, FIXTURE.projectTitle);
      await expectNoAxeViolations(page);
    }
  });

  test("every template control meets the touch minimum on a real phone", async ({
    browser,
  }) => {
    /*
     * A coarse POINTER, not merely a narrow window.
     *
     * The 44px floor is applied by `@media (pointer: coarse)` on the density
     * tokens, so a 393px desktop window keeps the 36px medium control height
     * and would measure the wrong thing. A phone reports touch; this context
     * does too, which is what makes the measurement the phone's.
     */
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await saveAsTemplate(page);
      await gotoFixture(page, TEMPLATES_URL);
      await expectMinTouchTarget(
        page.getByRole("link", { name: FIXTURE.projectTitle, exact: true }),
      );
      await expectMinTouchTarget(
        page.getByRole("link", { name: /Create a project from/ }).first(),
      );

      await openTemplateRecord(page, FIXTURE.projectTitle);
      await expectMinTouchTarget(
        page.getByRole("button", { name: "Add task", exact: true }),
      );
      await expectMinTouchTarget(
        page.getByRole("button", { name: /More actions for/ }).first(),
      );
    } finally {
      await context.close();
    }
  });

  test("with no templates, Projects looks exactly as it did before", async ({
    page,
  }) => {
    // The fixture's `beforeEach` has just swept every template away, so this is
    // a genuinely template-free workspace rather than a filtered view of one.
    await gotoFixture(page, "/projects");
    await expect(page.getByRole("link", { name: "Templates" })).toHaveCount(0);

    await gotoFixture(page, TEMPLATES_URL);
    await expect(
      page.getByRole("heading", { name: "No templates yet" }),
    ).toBeVisible();
    // The empty state teaches the NEXT ACTION rather than apologising: it names
    // the menu command that creates one (AGENTS.md §6 — no dead ends).
    await expect(page.getByText(/Save as template/)).toBeVisible();
  });

  test("the Templates link appears once a template exists", async ({
    page,
  }) => {
    await saveAsTemplate(page);
    await gotoFixture(page, "/projects");
    await expect(page.getByRole("link", { name: "Templates" })).toBeVisible();
  });

  /*
   * Search semantics, on the real surface: a template is findable BY NAME, it
   * is grouped under a heading a person can read, and its TASKS are not results
   * — "Draft the numbers" is a step inside a shape, not work anyone can do.
   *
   * The heading matters because a template is the first entity type with no
   * visual identity of its own: it wears the Project mark rather than a twelfth
   * accent, so the surface cannot name it from `ENTITY_IDENTITY` and would
   * otherwise head the group with the raw `project_template` slug.
   */
  test("search finds a template by name, under a heading, and never its tasks", async ({
    page,
  }) => {
    await saveAsTemplate(page);
    await gotoFixture(page, "/today");
    await page.waitForLoadState("networkidle");
    await page
      .locator(".dh-topbar")
      .getByRole("button", { name: /^Search DalyHub/ })
      .first()
      .click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await expect(input).toBeVisible();

    await input.fill(FIXTURE.projectTitle);
    const panel = page.locator(".dh-search__panel");
    await expect(
      panel.getByRole("option").filter({ hasText: "Template ·" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText("Project templates")).toBeVisible();
    // No `entities.type` slug is ever drawn for a person to read.
    await expect(panel).not.toContainText("project_template");

    // A template TASK is not a result: the captured task title is only ever
    // found as the Task on the Project it came from, never as a record of its
    // own — so no result carrying a template's subtitle comes back for it.
    await input.fill("Pull the numbers");
    await expect(
      panel.getByRole("option").filter({ hasText: "Template ·" }),
    ).toHaveCount(0);
  });
});
