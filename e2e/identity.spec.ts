/**
 * IDENTITY-01 — choosing a record's identity, and watching it follow the record.
 *
 * The unit layer proves the resolver, the vocabulary and the ramp. What it
 * cannot prove is the thing the pass actually promises: that an owner can open a
 * record, pick a colour and an icon, and find that combination waiting for them
 * on the card, on the row, on the phone and after a reload. That is a journey,
 * and it is what this file walks.
 *
 * It also walks the two failures that matter more than the happy path — reverting
 * to Automatic, and losing the network mid-save — because a picker that cannot
 * be undone, or that claims a save it did not make, is worse than no picker.
 */

import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/** The seeded Area the journey edits. It carries no chosen colour at rest. */
const AREA_ID = "a-dh";
const AREA_TITLE = "DalyHub V2";

/** Open the identity picker on an Area's Settings tab. */
async function openPicker(page: import("@playwright/test").Page) {
  await gotoFixture(page, `/areas/${AREA_ID}?tab=settings`);
  const trigger = page.locator(".dh-icon-picker__trigger").first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return trigger;
}

test.describe("IDENTITY-01 — a chosen identity", () => {
  test("choose a colour and an icon, and they follow the record", async ({
    page,
  }) => {
    /*
     * Snapshot every Area's identity BEFORE anything is chosen, so the "nothing
     * else moved" assertion below is a real comparison rather than a guess about
     * which slots the derived ramp happens to produce. `teal` is both a
     * choosable slot and the sixth DERIVED one, so counting occurrences would
     * have proved nothing.
     */
    await gotoFixture(page, "/areas");
    const before = await page
      .getByRole("article")
      .evaluateAll((cards) =>
        cards.map((card) => [
          card.getAttribute("aria-label"),
          card
            .querySelector(".dh-accent-icon")
            ?.getAttribute("data-identity") ?? null,
        ]),
      );

    const trigger = await openPicker(page);

    /*
     * The picker is ONE surface for both halves, so both are picked before
     * anything is committed. That is the behaviour under test as much as the
     * result: a half-applied identity must not be reachable.
     */
    await page.getByRole("button", { name: "Teal", exact: true }).click();
    await page.getByRole("button", { name: "Wellbeing", exact: true }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // The trigger states the combination in WORDS, not only in colour.
    await expect(trigger).toContainText("Wellbeing");
    await expect(trigger).toContainText("Teal");

    // …and it survives a reload, which is the only proof it was persisted
    // rather than held in a component.
    await page.reload();
    await expect(
      page.locator(".dh-icon-picker__trigger").first(),
    ).toContainText("Teal");

    // The record's own header wears it.
    await gotoFixture(page, `/areas/${AREA_ID}`);
    await expect(
      page.locator('.dh-accent-icon[data-identity="teal"]').first(),
    ).toBeVisible();
    await expect(page.locator('[data-icon-key="heart"]').first()).toBeVisible();

    // The COLLECTION row wears the same one — the promise that a chosen
    // identity follows the record everywhere, not just where it was chosen.
    await gotoFixture(page, "/areas");
    const row = page.getByRole("article", { name: AREA_TITLE });
    await expect(row.locator('[data-identity="teal"]').first()).toBeVisible();
    await expect(row.locator('[data-icon-key="heart"]')).toBeVisible();

    /*
     * Every other Area is UNTOUCHED. This is §14's promise stated as a test: a
     * release that lets one record choose must not repaint the ones that did
     * not.
     */
    const after = await page
      .getByRole("article")
      .evaluateAll((cards) =>
        cards.map((card) => [
          card.getAttribute("aria-label"),
          card
            .querySelector(".dh-accent-icon")
            ?.getAttribute("data-identity") ?? null,
        ]),
      );
    const changed = after.filter(([title, slot], index) => {
      const [beforeTitle, beforeSlot] = before[index] ?? [];
      expect(title).toBe(beforeTitle);
      return slot !== beforeSlot;
    });
    expect(changed).toEqual([[AREA_TITLE, "teal"]]);
    // …and a page of Areas is still scannable by colour rather than uniform.
    expect(new Set(after.map(([, slot]) => slot)).size).toBeGreaterThan(1);
  });

  test("Automatic gives the derived colour back", async ({ page }) => {
    await openPicker(page);
    await page.getByRole("button", { name: "Fuchsia", exact: true }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await gotoFixture(page, "/areas");
    await expect(
      page
        .getByRole("article", { name: AREA_TITLE })
        .locator('[data-identity="fuchsia"]')
        .first(),
    ).toBeVisible();

    // Back to Automatic. The record must return to the colour its RANK gives
    // it — which is the colour it had before anyone chose anything — rather
    // than to no colour at all.
    await openPicker(page);
    const automatic = page.getByRole("button", { name: /^Automatic/ });
    await expect(automatic).toBeVisible();
    await automatic.click();
    await page.getByRole("button", { name: "Apply" }).click();

    await gotoFixture(page, "/areas");
    const mark = page
      .getByRole("article", { name: AREA_TITLE })
      .locator(".dh-accent-icon")
      .first();
    const slot = await mark.getAttribute("data-identity");
    expect(slot).not.toBe("fuchsia");
    // A derived slot is still one of the six the fallback folds over — never
    // absent, because the Area has a rank.
    expect(["violet", "green", "red", "orange", "blue", "teal"]).toContain(
      slot,
    );
  });

  test("a failed save restores the previous identity and says so", async ({
    page,
  }) => {
    await openPicker(page);
    await page.getByRole("button", { name: "Rose", exact: true }).click();

    // The network dies between Apply and the response. The picker must NOT
    // claim a save it did not make.
    await page.route("**/areas/*/mutate", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Apply" }).click();

    // The failure is stated, in words, where the owner is looking.
    await expect(page.locator(".dh-field__error")).toBeVisible();

    await page.unroute("**/areas/*/mutate");

    // …and the record still wears what it wore. A reload proves nothing was
    // written, rather than that the component merely re-rendered.
    await page.reload();
    await expect(
      page.locator(".dh-icon-picker__trigger").first(),
    ).not.toContainText("Rose");
  });

  test("the picker is reachable and usable from the keyboard", async ({
    page,
  }) => {
    await openPicker(page);

    // The swatch grid is a roving focus: arrow keys walk it, and Enter selects.
    // No custom activation code is under test here — these are real buttons —
    // but the NAVIGATION is bespoke and is what would break silently.
    const violet = page.getByRole("button", { name: "Violet", exact: true });
    await violet.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("button", { name: "Green", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(violet).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(violet).toHaveAttribute("aria-pressed", "true");

    // Escape closes the sheet and nothing is committed.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("search narrows a hundred icons to the one being looked for", async ({
    page,
  }) => {
    await openPicker(page);
    await page.getByRole("searchbox", { name: "Search icons" }).fill("gym");
    // `gym` is a SYNONYM of Fitness, not its label — the reason synonyms exist
    // at all once the catalogue passed thirty keys.
    await expect(
      page.getByRole("button", { name: "Fitness", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Folder", exact: true }),
    ).toBeHidden();
  });

  test("the picker is accessible, in both appearances", async ({ page }) => {
    await openPicker(page);
    await expectNoAxeViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("the picker works as a sheet on a phone", async ({ page }) => {
    const phone = RESPONSIVE_VIEWPORTS[0];
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await openPicker(page);

    await expectNoHorizontalOverflow(page);
    // WCAG 2.2 2.5.8 — the whole swatch cell is the target, name included.
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Teal", exact: true }),
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Wellbeing", exact: true }),
    );
  });
});
