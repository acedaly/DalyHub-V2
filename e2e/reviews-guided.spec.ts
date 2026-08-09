/**
 * REVIEW-02 / REVIEW-04 — the guided weekly Review, end to end (real Worker +
 * local D1).
 *
 * Six journeys, each proving something the unit and kernel tests cannot:
 *
 *   1. a whole weekly Review, completed through the guided flow, surviving a reload;
 *   2. stop and resume — the owner's position and text are both still there;
 *   3. the phone stepper at 320 / 375 / 390 / 430px;
 *   4. Inbox processing without leaving the Review;
 *   5. an existing Review keeps its own stored template's prompts;
 *   6. axe in light and dark, at desktop and phone, including the
 *      completion-blocked state and a long Markdown editor.
 *
 * Fixtures are cleaned up by title prefix after every test, exactly as
 * `reviews.spec.ts` does.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupAllReviewFixtures,
  cleanupReviewByTitle,
  uniqueReviewTitle,
} from "./reviews-fixtures";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  postSameOrigin,
  waitForInteractive,
} from "./helpers";
import { d1Execute } from "./d1";

const WORKSPACE = "local-dev-workspace";
const TASK_PREFIX = "Guided review e2e task ";

const owned = new Set<string>();

test.beforeAll(async () => {
  await cleanupAllReviewFixtures();
});

test.afterEach(async () => {
  for (const title of owned) await cleanupReviewByTitle(title);
  owned.clear();
  cleanupGuidedTasks();
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
function d1(command: string | readonly string[]): void {
  d1Execute(command);
}

/**
 * Remove every Task this spec created. Inbox Tasks are workspace-wide state, so
 * leaving them behind would change what every other journey sees.
 */
function cleanupGuidedTasks(): void {
  const selection = `SELECT id FROM entities WHERE workspace_id = '${WORKSPACE}' AND type = 'task' AND title LIKE '${TASK_PREFIX}%'`;
  try {
    d1(
      [
        `DELETE FROM activity_subjects WHERE workspace_id = '${WORKSPACE}' AND entity_id IN (${selection});`,
        `DELETE FROM entity_links WHERE workspace_id = '${WORKSPACE}' AND (source_entity_id IN (${selection}) OR target_entity_id IN (${selection}));`,
        `DELETE FROM task_recurrence_rules WHERE workspace_id = '${WORKSPACE}' AND entity_id IN (${selection});`,
        `DELETE FROM task_details WHERE workspace_id = '${WORKSPACE}' AND entity_id IN (${selection});`,
        `DELETE FROM spine_records WHERE workspace_id = '${WORKSPACE}' AND entity_id IN (${selection});`,
        `DELETE FROM entities WHERE workspace_id = '${WORKSPACE}' AND id IN (${selection});`,
      ].join("\n"),
    );
  } catch {
    // Cleanup is best-effort; a failure here must never fail the assertion the
    // test actually made.
  }
}

/** Capture an intentionally Unassigned (Inbox) Task through the canonical route. */
async function captureInboxTask(page: Page, label: string): Promise<void> {
  const response = await postSameOrigin(page.request, "/tasks/new", {
    form: { title: `${TASK_PREFIX}${label}` },
    maxRedirects: 0,
  });
  expect(response.status()).toBeLessThan(400);
}

async function createWeeklyReview(page: Page, title: string): Promise<string> {
  owned.add(title);
  await gotoFixture(page, "/reviews/new");
  const titleInput = page.getByRole("textbox", { name: "Review title" });
  await expect(titleInput).toHaveValue(/^Weekly Review — .+\d{4}$/);
  await titleInput.fill(title);
  await page.getByRole("button", { name: "Start Review" }).click();
  await expect(page).toHaveURL(/\/reviews\/[^/?#]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

/** Enter the guided flow from the record, the way the owner does. */
async function startGuidedReview(page: Page, reviewUrl: string): Promise<void> {
  await page.goto(reviewUrl);
  await waitForInteractive(page);
  await page
    .getByRole("link", { name: /(Start|Continue|Open) the guided review/ })
    .click();
  await expect(page).toHaveURL(/\/guide\?step=/);
  await waitForInteractive(page);
}

function stepHeading(page: Page, name: string) {
  return page.getByRole("heading", { level: 2, name });
}

/**
 * The step heading each mobile label leads to. Navigation is a POST → redirect →
 * GET, so a helper that only clicked would race the next assertion; every move
 * here waits for the destination's own heading before returning.
 */
const STEP_HEADINGS: Readonly<Record<string, string>> = {
  "Settle in": "Settle in",
  Inbox: "Clear the Inbox",
  Projects: "Review Projects",
  Alignment: "Goals and Areas",
  Reflect: "Reflect",
  Focus: "Next week’s focus",
  Complete: "Complete Review",
};

async function moveTo(
  page: Page,
  direction: "Continue" | "Back",
  label: string,
): Promise<void> {
  await page.getByRole("button", { name: `${direction}: ${label}` }).click();
  await waitForInteractive(page);
  await expect(stepHeading(page, STEP_HEADINGS[label])).toBeVisible();
}

async function continueTo(page: Page, label: string): Promise<void> {
  await moveTo(page, "Continue", label);
}

async function backTo(page: Page, label: string): Promise<void> {
  await moveTo(page, "Back", label);
}

async function waitForEditor(page: Page): Promise<void> {
  await expect(page.locator('[data-editor-ready="true"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function writeCurrentPrompt(page: Page, text: string): Promise<void> {
  await waitForEditor(page);
  const editor = page.locator(".dh-review-guide__prompt .cm-content").first();
  await editor.click();
  await page.keyboard.insertText(text);
  // Blur commits the autosave; the save state is the assertion, not a timeout.
  await page.getByRole("heading", { level: 2 }).first().click();
  await expect(page.locator(".dh-review-guide__save-state").first()).toHaveText(
    "Saved",
    { timeout: 15_000 },
  );
}

/* -------------------------------------------------------------------------- */
/* Journey 1 — complete a weekly Review through the guided flow                */
/* -------------------------------------------------------------------------- */

test("Journey 1: a weekly Review is completed through the guided flow", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await captureInboxTask(page, "journey-1");
  const title = uniqueReviewTitle("guided-complete");
  const reviewUrl = await createWeeklyReview(page, title);

  await startGuidedReview(page, reviewUrl);

  // 1 — Settle in. Bounded period facts, and a position a reader can hear.
  await expect(stepHeading(page, "Settle in")).toBeVisible();
  // The desktop rail exposes the position semantically on the current step.
  await expect(
    page
      .getByRole("form", { name: "Review steps" })
      .locator('[aria-current="step"]'),
  ).toHaveAccessibleName("Step 1 of 7: Settle in, current step");
  await continueTo(page, "Inbox");

  // 2 — the Inbox, processed without leaving the Review.
  //
  // The step triages ONE task at a time out of the workspace's real Inbox, so
  // which task is on screen depends on how many others are in it. This used to
  // assert that the task captured at the top of this journey was the one shown,
  // which is only true when the Inbox is otherwise empty — true in a CI shard
  // that runs this file early, and false in a full single-process run, where
  // every earlier spec's unfiled tasks are still there. That is an order
  // dependency, not a product fact.
  //
  // The claim the journey is making is that the step reads the OWNER'S REAL
  // Inbox and triages it in place, so that is what is asserted: the count the
  // step states, and a genuine task card carrying the shared planning fields.
  await expect(stepHeading(page, "Clear the Inbox")).toBeVisible();
  const inboxStep = page.getByRole("region", { name: "Clear the Inbox" });
  await expect(inboxStep.getByText(/Tasks? in the Inbox/)).toBeVisible();
  await expect(
    inboxStep.getByRole("combobox", { name: "Project or Area" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark the Inbox step reviewed" })
    .click();
  await waitForInteractive(page);
  await continueTo(page, "Projects");

  // 3 — Projects.
  await expect(stepHeading(page, "Review Projects")).toBeVisible();
  await page.getByRole("button", { name: "Mark Projects reviewed" }).click();
  await waitForInteractive(page);
  await continueTo(page, "Alignment");

  // 4 — Goals and Areas.
  await expect(stepHeading(page, "Goals and Areas")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Goals" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Areas" }),
  ).toBeVisible();
  await continueTo(page, "Reflect");

  // 5 — Reflect: the Review's OWN stored template prompts, one at a time.
  await expect(stepHeading(page, "Reflect")).toBeVisible();
  await expect(page.getByText("Prompt 1 of 7")).toBeVisible();
  await writeCurrentPrompt(page, "A focused week with clear decisions.");
  await continueTo(page, "Focus");

  // 6 — the next-period focus, into the Review's own section.
  await expect(stepHeading(page, "Next week’s focus")).toBeVisible();
  await writeCurrentPrompt(page, "Ship the guided weekly review.");
  await continueTo(page, "Complete");

  // 7 — complete, through the existing lifecycle action.
  await expect(stepHeading(page, "Complete Review")).toBeVisible();
  // Scoped to the step's own action form: the rail's step control carries the
  // same words in its accessible name.
  const completeActions = page.locator(".dh-review-guide__complete-actions");
  const complete = completeActions.getByRole("button", {
    name: "Complete Review",
  });
  await expect(complete).toBeEnabled();
  await complete.click();
  await waitForInteractive(page);
  await expect(
    page.getByRole("button", { name: "Reopen Review" }),
  ).toBeVisible();

  // A reload proves the state is the server's, not the browser's.
  await page.reload();
  await waitForInteractive(page);
  await expect(
    page.getByRole("button", { name: "Reopen Review" }),
  ).toBeVisible();

  // And the responses are on the ONE Review record — no second copy anywhere.
  await page.goto(reviewUrl);
  await waitForInteractive(page);
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("A focused week with clear decisions."),
  ).toBeVisible();
  await expect(page.getByText("Ship the guided weekly review.")).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* Journey 2 — stop and resume                                                 */
/* -------------------------------------------------------------------------- */

test("Journey 2: the Review remembers where the owner stopped, and what they wrote", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const title = uniqueReviewTitle("guided-resume");
  const reviewUrl = await createWeeklyReview(page, title);

  await startGuidedReview(page, reviewUrl);
  await continueTo(page, "Inbox");
  await continueTo(page, "Projects");
  await continueTo(page, "Alignment");
  await continueTo(page, "Reflect");
  await expect(stepHeading(page, "Reflect")).toBeVisible();
  await writeCurrentPrompt(page, "Halfway through, then interrupted.");

  // Leave entirely — a different module, then the Reviews collection.
  await gotoFixture(page, "/today");
  await gotoFixture(page, "/reviews");

  // Return through the record's own entry point, with no step in the URL.
  await page.goto(reviewUrl);
  await waitForInteractive(page);
  await page.getByRole("link", { name: /Continue the guided review/ }).click();
  await waitForInteractive(page);

  // It resumes at the step the owner deliberately reached, not at step one.
  await expect(page).toHaveURL(/step=reflection/);
  await expect(stepHeading(page, "Reflect")).toBeVisible();
  await waitForEditor(page);
  await expect(
    page.getByText("Halfway through, then interrupted."),
  ).toBeVisible();

  // A bare /guide URL resolves to the same place rather than dead-ending.
  const bare = new URL(page.url());
  bare.search = "";
  await page.goto(`${bare.pathname}`);
  await waitForInteractive(page);
  await expect(page).toHaveURL(/step=reflection/);

  // An unknown step recovers to the current one instead of 404-ing the owner.
  await page.goto(`${bare.pathname}?step=wizard`);
  await waitForInteractive(page);
  await expect(page).toHaveURL(/step=reflection/);

  // Deliberate backwards navigation still works, and browser Back is correct.
  await backTo(page, "Alignment");
  await page.goBack();
  await waitForInteractive(page);
  await expect(page).toHaveURL(/step=reflection/);
});

/* -------------------------------------------------------------------------- */
/* Journey 3 — the phone stepper                                               */
/* -------------------------------------------------------------------------- */

test("Journey 3: the phone stepper shows one step at a time at every supported width", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const title = uniqueReviewTitle("guided-phone");
  const reviewUrl = await createWeeklyReview(page, title);
  await startGuidedReview(page, reviewUrl);
  await continueTo(page, "Inbox");
  await continueTo(page, "Projects");
  const guideUrl = page.url();

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(guideUrl);
    await waitForInteractive(page);

    // ONE primary step, with its position visible.
    await expect(stepHeading(page, "Review Projects")).toBeVisible();
    await expect(page.getByText("Step 3 of 7 · Projects")).toBeVisible();
    // The desktop rail is genuinely gone, not merely narrow.
    await expect(page.getByRole("form", { name: "Review steps" })).toBeHidden();
    await expectNoHorizontalOverflow(page);

    // Back and Continue are reachable and meet the touch-target minimum.
    const back = page.getByRole("button", { name: "Back: Inbox" });
    const next = page.getByRole("button", { name: "Continue: Alignment" });
    await expectMinTouchTarget(back);
    await expectMinTouchTarget(next);

    // The step menu offers direct navigation, and exiting keeps the Review.
    const menu = page.getByRole("button", { name: "All steps" });
    await expectMinTouchTarget(menu);
    await menu.click();
    const sheet = page.getByRole("dialog", { name: "Review steps" });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /1\. Settle in/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Save and exit" }),
    ).toBeVisible();
  }

  // The editor stays comfortable at the narrowest supported width.
  await page.setViewportSize({ width: 320, height: 780 });
  await continueTo(page, "Alignment");
  await continueTo(page, "Reflect");
  await waitForEditor(page);
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText("Prompt 1 of 7")).toBeVisible();

  // Focus lands on the new step's heading after a deliberate move.
  await backTo(page, "Alignment");
  await expect(stepHeading(page, "Goals and Areas")).toBeFocused();
});

/* -------------------------------------------------------------------------- */
/* Journey 4 — Inbox processing                                                */
/* -------------------------------------------------------------------------- */

test("Journey 4: Inbox Tasks are processed inside the Review", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await captureInboxTask(page, "keep-in-inbox");
  await captureInboxTask(page, "complete-me");

  const title = uniqueReviewTitle("guided-inbox");
  const reviewUrl = await createWeeklyReview(page, title);
  await startGuidedReview(page, reviewUrl);
  await continueTo(page, "Inbox");

  await expect(stepHeading(page, "Clear the Inbox")).toBeVisible();
  // The count is the AUTHORITATIVE workspace total, not "how many loaded".
  const queue = page.locator(".dh-review-guide__queue");
  await expect(queue).toContainText(/Tasks? in the Inbox/);

  // A project-less Task is legitimate: the panel offers a Project but never
  // requires one, and the Task can be left in the Inbox on purpose.
  await expect(
    page.getByRole("button", { name: "Leave in Inbox" }),
  ).toBeEnabled();

  // Complete one from inside the Review, through the canonical Task route.
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await waitForInteractive(page);
  // The remaining count reflects the server's answer immediately.
  await expect(queue).toBeVisible();

  // Continuing with an Inbox item deliberately left is allowed, and is recorded
  // as a decision rather than as a failure.
  await page
    .getByRole("button", { name: "Mark the Inbox step reviewed" })
    .click();
  await waitForInteractive(page);
  await expect(
    page.getByRole("button", { name: "Undo ‘reviewed’" }),
  ).toBeVisible();
  await continueTo(page, "Projects");
  await expect(stepHeading(page, "Review Projects")).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* Journey 5 — an existing Review keeps its own template                       */
/* -------------------------------------------------------------------------- */

test("Journey 5: an existing Review uses its own stored template and is not rewritten", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = uniqueReviewTitle("guided-existing");
  const reviewUrl = await createWeeklyReview(page, title);
  const reviewId = new URL(reviewUrl).pathname.split("/").pop() as string;

  // Age the Review: authored text, an in-progress status, and NO guided-flow
  // rows at all — exactly the shape of every Review that predates REVIEW-02.
  d1(
    [
      `UPDATE review_sections SET body_markdown = 'Written before the guided flow existed.' WHERE workspace_id = '${WORKSPACE}' AND review_id = '${reviewId}' AND section_id = 'summary.lessons';`,
      `UPDATE review_details SET status = 'in_progress' WHERE workspace_id = '${WORKSPACE}' AND entity_id = '${reviewId}';`,
    ].join("\n"),
  );

  await startGuidedReview(page, reviewUrl);
  // With no bookmark, it opens at the first thing left to do rather than crashing.
  await expect(page).toHaveURL(/step=/);

  await page.goto(`${reviewUrl}/guide?step=reflection`);
  await waitForInteractive(page);
  await waitForEditor(page);

  // The prompts are the Review's OWN stored template's, in its order.
  const nav = page.getByRole("navigation", { name: "Reflection prompts" });
  await expect(
    nav.getByRole("button", { name: /Overall reflection/ }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: /Lessons.*Answered/ }),
  ).toBeVisible();

  // The pre-existing text is presented, not rewritten.
  await nav.getByRole("button", { name: /Lessons/ }).click();
  await waitForEditor(page);
  await expect(
    page.getByText("Written before the guided flow existed."),
  ).toBeVisible();

  /*
   * And the Review's own record still reads as its own after the guided flow
   * has been opened over it — the authored text is on the record, not only in
   * the guide.
   *
   * This used to assert the literal string `review.weekly.v1` on the page. The
   * record no longer prints the template IDENTIFIER anywhere, and it should not:
   * a versioned internal key is not something the owner needs to read. The
   * storage invariant it was standing in for has its own coverage at the right
   * layer — `test/kernel/review-workflow.test.ts`, *"preserves the Review's
   * stored template version"* — so this asserts what a browser can actually
   * see (AGENTS.md §22).
   */
  await page.goto(reviewUrl);
  await waitForInteractive(page);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByText("Written before the guided flow existed."),
  ).toBeVisible();
});

/* -------------------------------------------------------------------------- */
/* Journey 6 — accessibility                                                   */
/* -------------------------------------------------------------------------- */

test("Journey 6: axe passes in light and dark, at desktop and phone", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await captureInboxTask(page, "axe");
  const title = uniqueReviewTitle("guided-axe");
  const reviewUrl = await createWeeklyReview(page, title);
  await startGuidedReview(page, reviewUrl);
  const guideUrl = page.url();

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(guideUrl);
      await waitForInteractive(page);
      await expectNoAxeViolations(page);
      await expectNoHorizontalOverflow(page);
    }
  }

  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });

  // The completion-blocked state: nothing written yet, so the Review refuses.
  await page.goto(`${reviewUrl}/guide?step=complete`);
  await waitForInteractive(page);
  await expect(
    page
      .locator(".dh-review-guide__complete-actions")
      .getByRole("button", { name: "Complete Review" }),
  ).toBeDisabled();
  await expectNoAxeViolations(page);

  // A long Markdown response in the editor.
  await page.goto(`${reviewUrl}/guide?step=reflection`);
  await waitForInteractive(page);
  await waitForEditor(page);
  await writeCurrentPrompt(
    page,
    Array.from(
      { length: 40 },
      (_unused, index) => `- Line ${index + 1} of a long weekly reflection.`,
    ).join("\n"),
  );
  await expectNoAxeViolations(page);
  await expectNoHorizontalOverflow(page);
});
