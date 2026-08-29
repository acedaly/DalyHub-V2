/**
 * V2.6 FIND-04 — `#tag` on the capture line, end to end through the real UI.
 *
 * The kernel and unit suites already prove the GRAMMAR: what a `#` word is, what
 * it is not, and what the title becomes. What only a browser can prove is the
 * half of the acceptance criteria that is about the OWNER seeing it:
 *
 *   - the recognised tag *"appears in the existing capture preview so the owner
 *     can correct it before saving"* — and correcting it restores the literal
 *     words, in the real DOM, with the real remove control;
 *   - the preview WORDS the recorded unknown-tag decision: an existing tag is
 *     named in the workspace's own spelling, a new one is offered as new;
 *   - the saved Task actually carries the tag, asserted against D1 rather than
 *     against the form that submitted it;
 *   - `the #1 priority` survives a real keyboard on a real page;
 *   - all of it on a phone, in light and dark, axe-clean with no rule disabled.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { d1Execute, d1Query, sqlLiteral } from "./d1";
import { expectNoAxeViolations, gotoFixture } from "./helpers";

const WS = "local-dev-workspace";
const NEW_TASK = "/tasks?drawer=new-task";

/** A tag nothing else in the fixture uses, so a run never collides with itself. */
function uniqueTag(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

async function forgetTags(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const list = keys.map((key) => sqlLiteral(key)).join(", ");
  await d1Execute([
    `DELETE FROM entity_tags WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key IN (${list});`,
    `DELETE FROM workspace_tags WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key IN (${list});`,
  ]);
}

/** Put ONE tag in the workspace vocabulary, with a deliberate capital spelling. */
async function seedVocabulary(key: string, label: string): Promise<void> {
  await d1Execute([
    `INSERT OR IGNORE INTO workspace_tags (workspace_id, tag_key, label, created_at, updated_at)
       VALUES (${sqlLiteral(WS)}, ${sqlLiteral(key)}, ${sqlLiteral(label)},
               '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z');`,
  ]);
}

/**
 * Remove the Tasks a journey created, and everything that references them.
 *
 * Dependents first, because every one of these foreign keys is ON DELETE
 * RESTRICT: the Activity subjects, then the events left with no subject, then
 * the tag attachments, the detail row and the spine record, and only then the
 * entity itself.
 */
async function forgetTasks(titles: readonly string[]): Promise<void> {
  const list = titles.map((title) => sqlLiteral(title)).join(", ");
  const ws = sqlLiteral(WS);
  const selection = `SELECT id FROM entities WHERE workspace_id = ${ws} AND title IN (${list})`;
  await d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${selection});`,
    `DELETE FROM activities WHERE workspace_id = ${ws}
       AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                        WHERE s.workspace_id = activities.workspace_id
                          AND s.activity_id = activities.id);`,
    `DELETE FROM entity_tags WHERE workspace_id = ${ws} AND entity_id IN (${selection});`,
    `DELETE FROM task_details WHERE workspace_id = ${ws} AND entity_id IN (${selection});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${selection});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND title IN (${list});`,
  ]);
}

/** The create Drawer, opened by its canonical URL. */
async function openCapture(page: Page) {
  await gotoFixture(page, NEW_TASK);
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * The title field, addressed by its ROLE.
 *
 * Not `getByLabel("Title")`: the preview's own remove controls are labelled
 * "Treat <word> as task title text", which that matcher also finds — a strict
 * mode violation that only appears once a token IS recognised, which is every
 * assertion in this file.
 */
function titleField(dialog: Locator) {
  return dialog.getByRole("textbox", { name: /^Title/ });
}

/** The capture preview — the one surface the grammar explains itself in. */
function preview(dialog: Locator) {
  return dialog.getByRole("group", { name: "Quick-capture interpretation" });
}

/** The tag keys D1 holds for a Task, found by its title. */
function tagsOfTask(title: string): string[] {
  return d1Query<{ tag_key: string }>(
    `SELECT et.tag_key AS tag_key
       FROM entity_tags et
       JOIN entities e ON e.workspace_id = et.workspace_id AND e.id = et.entity_id
      WHERE et.workspace_id = ${sqlLiteral(WS)} AND e.title = ${sqlLiteral(title)}
      ORDER BY et.tag_key`,
  ).map((row) => row.tag_key);
}

test.describe("FIND-04 — `#tag` on the capture line", () => {
  test("recognises a new tag, shows it in the preview, and saves it on the Task", async ({
    page,
  }) => {
    const tag = uniqueTag("cap");
    const title = `E2E Fix the gutter ${tag}`;
    try {
      const dialog = await openCapture(page);
      await titleField(dialog).fill(`${title} #${tag} p2`);

      // The preview states the title the Task will actually get — the tag word
      // and the priority word are both gone from it.
      const panel = preview(dialog);
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(`Title preview ${title}`);
      // The recorded unknown-tag decision, in the owner's own words: OFFERED,
      // not silently created.
      await expect(panel).toContainText(`New tag: ${tag}`);
      await expect(panel).toContainText("Priority 2");

      await dialog.getByRole("button", { name: "Create task" }).click();

      // Asserted against the database, not against the form that submitted it.
      await expect(async () => {
        expect(tagsOfTask(title)).toEqual([tag]);
      }).toPass({ timeout: 15_000 });
    } finally {
      await forgetTasks([title]);
      await forgetTags([tag]);
    }
  });

  test("names an EXISTING tag in the workspace's own spelling, whatever the case typed", async ({
    page,
  }) => {
    const key = uniqueTag("known");
    const label = key.toUpperCase();
    try {
      // The vocabulary holds a capitalised spelling; the owner types a shouted
      // one; the preview shows the workspace's — exactly what choosing it in
      // the picker would have shown, which is FIND-02's case rule reaching the
      // capture line.
      await seedVocabulary(key, label);
      const dialog = await openCapture(page);
      await titleField(dialog).fill(`E2E Ring the roofer #${label}`);

      const panel = preview(dialog);
      await expect(panel).toContainText(`Tag: ${label}`);
      await expect(panel).not.toContainText("New tag:");
      await expect(panel).toContainText("Title preview E2E Ring the roofer");
    } finally {
      await forgetTags([key]);
    }
  });

  test("lets the owner CORRECT it — removing the chip restores the literal words", async ({
    page,
  }) => {
    const tag = uniqueTag("undo");
    const dialog = await openCapture(page);
    await titleField(dialog).fill(`E2E Paint the shed #${tag}`);

    const panel = preview(dialog);
    await expect(panel).toContainText(`New tag: ${tag}`);
    await panel
      .getByRole("button", { name: `Treat #${tag} as task title text` })
      .click();

    // The word is back in the title, and there is no tag left to save. This is
    // the whole of "offered, not created": the preview is a correction surface,
    // and nothing has touched the vocabulary at any point in this journey.
    await expect(panel).toHaveCount(0);
    await expect(titleField(dialog)).toHaveValue(`E2E Paint the shed #${tag}`);
    expect(
      d1Query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM workspace_tags
          WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key = ${sqlLiteral(tag)}`,
      )[0]?.n,
    ).toBe(0);
  });

  test("leaves ordinary text alone — `the #1 priority`, and a pasted heading", async ({
    page,
  }) => {
    const dialog = await openCapture(page);
    const field = titleField(dialog);

    // Typed on a real keyboard rather than set as a value, because this is a
    // claim about what happens WHILE the owner types.
    await field.click();
    await page.keyboard.type("Read the #1 priority before Monday");
    // No tag chip. The preview may appear for `Monday`, so the assertion is
    // about the ABSENCE of a tag rather than the absence of a preview.
    await expect(dialog.getByText(/tag:/i)).toHaveCount(0);

    await field.fill("");
    await page.keyboard.type("## Subheading pasted in");
    await expect(dialog.getByText(/tag:/i)).toHaveCount(0);
    await expect(field).toHaveValue("## Subheading pasted in");
  });

  test("works on a phone, in light and dark, and is axe-clean at 393 and 320", async ({
    page,
  }) => {
    // Four page loads, four axe scans and a save. The default 30s is a budget
    // for one interaction, not for a matrix.
    test.setTimeout(120_000);
    const tag = uniqueTag("ph");
    const title = `E2E Phone capture ${tag}`;
    try {
      for (const scheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [393, 320]) {
          await page.setViewportSize({ width, height: 800 });
          const dialog = await openCapture(page);
          await titleField(dialog).fill(`${title} #${tag}`);
          const panel = preview(dialog);
          await expect(panel).toContainText(`New tag: ${tag}`);
          // The correction control is reachable and named at phone widths too —
          // a preview the owner cannot correct on the surface they capture on is
          // not a preview.
          await expect(
            panel.getByRole("button", {
              name: `Treat #${tag} as task title text`,
            }),
          ).toBeVisible();
          await expectNoAxeViolations(page, { include: ".dh-tasks-capture" });
          const overflows = await page.evaluate(
            () =>
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1,
          );
          expect(overflows, `${scheme} @ ${width}px overflows`).toBe(false);
        }
      }

      // …and the phone can finish the job, not merely display it.
      const dialog = await openCapture(page);
      await titleField(dialog).fill(`${title} #${tag}`);
      await dialog.getByRole("button", { name: "Create task" }).click();
      await expect(async () => {
        expect(tagsOfTask(title)).toEqual([tag]);
      }).toPass({ timeout: 15_000 });
    } finally {
      await page.emulateMedia({ colorScheme: null });
      await page.setViewportSize({ width: 1280, height: 720 });
      await forgetTasks([title]);
      await forgetTags([tag]);
    }
  });
});
