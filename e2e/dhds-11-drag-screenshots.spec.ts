import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture, taskRow, waitForInteractive } from "./helpers";
import {
  CHECKLIST_STEPS,
  CHECKLIST_TASK,
  DRAG_DELEGATE,
  GOAL_STAGES,
  HOME_PROJECT,
  STAGED_GOAL,
  WORK_PROJECT,
  WORK_TASKS,
  cleanupDragFixture,
  seedDragFixture,
} from "./drag-fixtures";

/**
 * DHDS-11 — drag, reorder and continuity, as visual evidence.
 *
 * The phase's acceptance test is a question about a STILL that no assertion can
 * answer: *does the object being dragged look like the same object, and does the
 * page around it stay calm?* So the frames are the evidence, and they are
 * captured in PAIRS wherever the pair is the argument:
 *
 *   - a Task list **at rest** beside the same list **engaged with**, because the
 *     grip is latent until the owner points at a row — and a page of grips is
 *     precisely what this phase must not have produced;
 *   - a Task **lifted**, so the preview, the quiet source row and the candidate
 *     destinations are all in one frame;
 *   - the **active** destination beside the candidates, because progressive
 *     disclosure is a difference between two treatments rather than a treatment;
 *   - a checklist **mid-reorder**, where the gap the step will land in is the
 *     whole indicator.
 *
 * Both appearances, because elevation and a dotted edge are exactly the kind of
 * restraint that survives light and fails dark. Plus a **forced-colours** frame,
 * where every shadow and every tint is discarded by the user agent and the drag
 * has to be legible from its borders alone — the case a designer never sees.
 *
 * Opt-in, like every capture pass in this repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/dhds-11-drag-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "dhds-11-2026-08",
);

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 393, height: 852 };

const GROUPED = `/tasks?view=list&group=parent&person=${encodeURIComponent(
  DRAG_DELEGATE,
)}`;

function recordUrl(taskId: string): string {
  return `/tasks?view=list&group=none&sort=created&dir=desc&drawer=task%3A${encodeURIComponent(taskId)}`;
}

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  seedDragFixture();
});

test.afterAll(() => {
  cleanupDragFixture();
});

/**
 * Shoot, once every entry animation has finished.
 *
 * Inherited from the DHDS-08…DHDS-10 passes for the reason recorded there: a
 * capture taken mid-animation produces a frame that looks exactly like a real
 * defect and is not one. Evidence that can be mistaken for a bug is worse than
 * no evidence.
 */
async function shoot(page: Page, name: string) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** Lift an object and hold it — the frames this phase exists to produce. */
async function lift(page: Page, handle: Locator): Promise<void> {
  const box = await handle.boundingBox();
  if (box === null) throw new Error("the handle should be on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24, {
    steps: 6,
  });
}

async function holdOver(page: Page, destination: Locator): Promise<void> {
  const box = await destination.boundingBox();
  if (box === null) throw new Error("the destination should be on screen");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 10,
  });
  await expect(destination).toHaveAttribute("data-dh-drop-active", "true");
}

function bucket(page: Page, title: string): Locator {
  return page.getByTestId("task-group").filter({
    has: page.getByRole("heading", { name: new RegExp(`^${title}\\b`) }),
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`DHDS-11 evidence — ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`a grouped Task list, at rest and engaged with (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, GROUPED);
      await waitForInteractive(page);

      // The acceptance frame: nothing here may look like a drag surface.
      await shoot(page, `tasks-rest-${scheme}`);

      await taskRow(page, WORK_TASKS[0].title).first().hover();
      await shoot(page, `tasks-hover-${scheme}`);
    });

    test(`a Task lifted, and the destination it is over (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, GROUPED);
      await waitForInteractive(page);

      const row = taskRow(page, WORK_TASKS[0].title).first();
      await row.hover();
      await lift(
        page,
        row.getByRole("button", { name: `Move ${WORK_TASKS[0].title}` }),
      );
      // The preview, the quiet source, and the candidate destination.
      await shoot(page, `task-lifted-${scheme}`);

      await holdOver(page, bucket(page, HOME_PROJECT.title));
      await shoot(page, `task-over-project-${scheme}`);

      await page.mouse.up();
      await expect(
        bucket(page, HOME_PROJECT.title).getByText(WORK_TASKS[0].title),
      ).toBeVisible();
      // Settled, with the toast that says where it went.
      await shoot(page, `task-settled-${scheme}`);
    });

    test(`a checklist mid-reorder — the gap IS the indicator (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
      await waitForInteractive(page);
      const list = page.getByRole("dialog").getByTestId("task-checklist");
      await expect(list).toBeVisible();

      await shoot(page, `checklist-rest-${scheme}`);

      const rows = list.getByTestId("checklist-item");
      await rows.nth(2).hover();
      await lift(
        page,
        list.getByRole("button", { name: `Reorder ${CHECKLIST_STEPS[2]}` }),
      );
      const first = await rows.nth(0).boundingBox();
      if (first !== null) {
        await page.mouse.move(first.x + 40, first.y + first.height / 2, {
          steps: 10,
        });
      }
      await shoot(page, `checklist-reordering-${scheme}`);
      await page.mouse.up();
      await shoot(page, `checklist-settled-${scheme}`);
    });

    test(`a Goal's stages, with their grips revealed (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(LAPTOP);
      await gotoFixture(page, `/goals/${STAGED_GOAL.id}`);
      await waitForInteractive(page);
      const stages = page.getByTestId("goal-milestones");
      await expect(stages).toBeVisible();
      await shoot(page, `goal-stages-rest-${scheme}`);

      await stages
        .getByRole("button", { name: `Reorder ${GOAL_STAGES[1]}` })
        .focus();
      await shoot(page, `goal-stages-focus-${scheme}`);
    });

    test(`the phone: a grip where there is an order, and none where there is not (${scheme})`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: PHONE,
        isMobile: true,
        hasTouch: true,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
      await waitForInteractive(page);
      // The grip is simply DRAWN on a coarse pointer, at the touch floor.
      await shoot(page, `phone-checklist-${scheme}`);

      await gotoFixture(page, GROUPED);
      await waitForInteractive(page);
      // …and the Task list has none at all: the move is the row's overflow.
      await shoot(page, `phone-tasks-${scheme}`);
      await context.close();
    });
  });
}

test("forced colours: the drag is legible from its borders alone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: LAPTOP,
    forcedColors: "active",
  });
  const page = await context.newPage();
  await gotoFixture(page, GROUPED);
  await waitForInteractive(page);

  const row = taskRow(page, WORK_TASKS[0].title).first();
  await row.hover();
  await lift(
    page,
    row.getByRole("button", { name: `Move ${WORK_TASKS[0].title}` }),
  );
  await holdOver(page, bucket(page, HOME_PROJECT.title));
  await shoot(page, "forced-colours-drag");
  await page.mouse.up();
  await context.close();
});

test("reduced motion: the same operation, with no travel", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: LAPTOP,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await gotoFixture(page, GROUPED);
  await waitForInteractive(page);
  await shoot(page, "reduced-motion-rest");

  const row = taskRow(page, WORK_TASKS[1].title).first();
  await row.hover();
  await lift(
    page,
    row.getByRole("button", { name: `Move ${WORK_TASKS[1].title}` }),
  );
  await holdOver(page, bucket(page, WORK_PROJECT.title).first());
  await shoot(page, "reduced-motion-dragging");
  await page.mouse.up();
  await context.close();
});
