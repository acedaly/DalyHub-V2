/**
 * V2.6 FIND-02 — the ONE way an E2E spec adds a tag.
 *
 * FIND-02's third acceptance criterion is that *"adding a tag is the same
 * interaction on People, Assets and Notes — proven end to end on all three, not
 * on one plus an assertion about the others."* This file is how that claim is
 * made honestly: every spec drives the same steps through the same helper, so a
 * surface that quietly grew its own tag control fails here rather than passing
 * its own bespoke test.
 *
 * The interaction, in the owner's terms: press the field's one button, which
 * opens the shared DHDS-09 picker; type; choose an existing word or create a new
 * one; close. The picker stays open after a choice because it is a multi-select
 * (DHDS-09 §32), so closing is a step rather than an accident.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** The tags field's trigger, within whatever surface hosts it. */
export function tagsTrigger(scope: Page | Locator): Locator {
  return scope.getByRole("button", { name: "Add a tag…" });
}

/** The chips a tags field currently carries, in order. */
export function tagChips(scope: Page | Locator): Locator {
  return scope.locator(".dh-tags__chip-text");
}

/** Open the shared tag picker from a tags field, and return its search field. */
export async function openTagPicker(
  page: Page,
  scope: Page | Locator = page,
): Promise<Locator> {
  await tagsTrigger(scope).click();
  const search = page.getByRole("combobox", { name: "Search tags" });
  await expect(search).toBeVisible();
  return search;
}

/** Close the picker the way a keyboard user does. */
export async function closeTagPicker(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("combobox", { name: "Search tags" }),
  ).toBeHidden();
}

/**
 * Add one tag through the shared picker — choosing the workspace's existing
 * word when it has one, and creating it when it does not.
 */
export async function addTag(
  page: Page,
  tag: string,
  scope: Page | Locator = page,
): Promise<void> {
  const search = await openTagPicker(page, scope);
  await search.fill(tag);
  const existing = page.getByRole("option", { name: tag, exact: true });
  const create = page.getByRole("option", { name: /^Create/ });
  if ((await existing.count()) > 0) {
    await existing.first().click();
  } else {
    await create.first().click();
  }
  await closeTagPicker(page);
}

/** Add several tags in one visit to the picker, as an owner naturally would. */
export async function addTags(
  page: Page,
  tags: readonly string[],
  scope: Page | Locator = page,
): Promise<void> {
  const search = await openTagPicker(page, scope);
  for (const tag of tags) {
    await search.fill(tag);
    const existing = page.getByRole("option", { name: tag, exact: true });
    if ((await existing.count()) > 0) {
      await existing.first().click();
    } else {
      await page
        .getByRole("option", { name: /^Create/ })
        .first()
        .click();
    }
  }
  await closeTagPicker(page);
}
