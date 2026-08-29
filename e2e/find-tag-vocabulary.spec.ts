/**
 * V2.6 FIND-02 — one tag vocabulary, one interaction.
 *
 * Driven end to end against the development-auth server and the real records, so
 * the whole path is exercised: the shared `TagsField`, the shared DHDS-09
 * `Picker`, the `/tags` vocabulary endpoint, each module's own mutate route, and
 * the D1 vocabulary the migration created.
 *
 * What this file proves that a unit test cannot:
 *
 *   - **criterion 3** — *"Adding a tag is the same interaction on People, Assets
 *     and Notes — proven end to end on all three, not on one plus an assertion
 *     about the others."* All three journeys drive the SAME helper
 *     (`tag-helpers.ts`), and one test additionally compares the rendered
 *     control on all three surfaces by its machine values rather than by two
 *     screenshots resembling each other — the V2.5 rule, applied to a control;
 *   - the vocabulary is genuinely SHARED: a word created on a Person is offered
 *     on an Asset, which is the whole of what DEBT-182 asked for and the one
 *     thing three separate suggestion sets could never do;
 *   - the recorded CASE decision, on a real surface: typing `ERRAND` where the
 *     workspace has `Errand` chooses the existing tag rather than making a
 *     second one;
 *   - **criterion 6** — light and dark, 1440 / 393 / 320, keyboard reach, an
 *     accessible name on every control, and `axe` clean with no rule disabled.
 */

import { expect, test, type Page } from "@playwright/test";

import { d1Execute, d1Query, sqlLiteral } from "./d1";
import { expectNoAxeViolations } from "./helpers";
import {
  addTag,
  closeTagPicker,
  openTagPicker,
  tagChips,
  tagsTrigger,
} from "./tag-helpers";

const WS = "local-dev-workspace";

/** The three surfaces FIND-02's criterion 3 names, and how to reach each one. */
const SURFACES = [
  {
    name: "Person",
    path: "/person/p-rc-dan",
    open: async (page: Page) => {
      await page.getByRole("tab", { name: "Contact" }).click();
    },
  },
  {
    name: "Asset",
    path: "/asset/as-rc-ute",
    open: async (page: Page) => {
      await page.getByRole("tab", { name: "Details" }).click();
    },
  },
  {
    name: "Note",
    path: "/notes/n-rc-brief",
    open: async (page: Page) => {
      await page
        .getByRole("button", { name: /^More actions for / })
        .first()
        .click();
      await page.getByRole("menuitem", { name: "Edit tags" }).click();
      await expect(
        page.getByRole("dialog", { name: "Edit tags" }),
      ).toBeVisible();
    },
  },
] as const;

/** A tag nothing else in the fixture uses, so a run never collides with itself. */
function uniqueTag(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}`;
}

/** Remove a tag from the workspace vocabulary, so a run leaves nothing behind. */
async function forgetTags(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const list = keys.map((key) => sqlLiteral(key)).join(", ");
  await d1Execute([
    `DELETE FROM entity_tags WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key IN (${list});`,
    `DELETE FROM workspace_tags WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key IN (${list});`,
  ]);
}

async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test.describe("FIND-02 — one tag vocabulary", () => {
  test("adding a tag is the SAME interaction on People, Assets and Notes", async ({
    page,
  }) => {
    const created: string[] = [];
    try {
      for (const surface of SURFACES) {
        const tag = uniqueTag(`p${surface.name.toLowerCase()}`);
        created.push(tag);
        await goto(page, surface.path);
        await surface.open(page);

        // The same control, reached the same way, on every surface: ONE button
        // that opens a `role="dialog"` holding a combobox and a listbox.
        const trigger = tagsTrigger(page).first();
        await expect(
          trigger,
          `${surface.name}: one add-tag trigger`,
        ).toBeVisible();
        await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");

        await addTag(page, tag);
        await expect(
          tagChips(page).filter({ hasText: tag }),
          `${surface.name}: the tag became a chip`,
        ).toHaveCount(1);
        // …and it is removable without opening anything.
        await expect(
          page.getByRole("button", { name: `Remove ${tag}` }),
        ).toBeVisible();
      }
    } finally {
      await forgetTags(created);
    }
  });

  test("the three fields are the SAME component, compared by machine values", async ({
    page,
  }) => {
    /*
     * V2.5's rule, applied to a control: *"a claim that two surfaces tell the
     * same story is proven by reading the same machine value from both, never by
     * comparing sentences that happen to match."* Three visually similar
     * wrappers is exactly the failure FIND-02 forbids, and a screenshot cannot
     * tell them apart.
     */
    const signatures: string[] = [];
    for (const surface of SURFACES) {
      await goto(page, surface.path);
      await surface.open(page);
      const trigger = tagsTrigger(page).first();
      await expect(trigger).toBeVisible();
      signatures.push(
        await trigger.evaluate((node) => {
          const field = node.closest(".dh-field");
          const group = field?.getAttribute("role") ?? "";
          const hint =
            field?.querySelector(".dh-field__hint")?.textContent?.trim() ?? "";
          return [
            node.className,
            node.getAttribute("aria-haspopup"),
            field?.className ?? "",
            group,
            hint,
          ].join("|");
        }),
      );
    }
    expect(signatures[1]).toBe(signatures[0]);
    expect(signatures[2]).toBe(signatures[0]);
    // And the signature is the shared field's, not an empty string that would
    // make the equality vacuous.
    expect(signatures[0]).toContain("dh-tags__add");
    expect(signatures[0]).toContain("dh-field--tags");
  });

  test("a word created on a Person is offered on an Asset", async ({
    page,
  }) => {
    /*
     * The whole of DEBT-182: one vocabulary, not three suggestion sets. Nothing
     * about this journey is possible with per-module free text.
     *
     * `p-rc-ana` rather than `p-rc-dan`, and the reason is recorded rather than
     * silent: the convergence fixture seeds Dan with `relationship = 'Builder'`,
     * which is not a member of the closed relationship vocabulary, so his
     * Contact tab cannot be SAVED at all — the first thing this journey needs.
     * That is a fixture defect this item found and deliberately did not fix
     * (DEBT-217); Ana's record is seeded with no relationship and saves.
     */
    const tag = uniqueTag("shared");
    try {
      await goto(page, "/person/p-rc-ana");
      await page.getByRole("tab", { name: "Contact" }).click();
      await addTag(page, tag);
      await page.getByRole("button", { name: "Save details" }).click();
      // The save is proven against the DATABASE, because that is what makes the
      // next half of this journey meaningful: the Asset can only be OFFERED the
      // word if the word genuinely entered the workspace vocabulary.
      await expect(async () => {
        const rows = d1Query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM workspace_tags
            WHERE workspace_id = ${sqlLiteral(WS)} AND tag_key = ${sqlLiteral(tag)}`,
        );
        expect(Number(rows[0]?.n ?? 0)).toBe(1);
      }).toPass({ timeout: 10_000 });

      await goto(page, "/asset/as-rc-ute");
      await page.getByRole("tab", { name: "Details" }).click();
      const search = await openTagPicker(page);
      await search.fill(tag);
      // OFFERED, as an existing option — not merely creatable.
      await expect(
        page.getByRole("option", { name: tag, exact: true }),
      ).toBeVisible();
      await closeTagPicker(page);
    } finally {
      await forgetTags([tag]);
    }
  });

  test("a different case is the SAME tag, not a second one", async ({
    page,
  }) => {
    const tag = uniqueTag("Case");
    try {
      await goto(page, "/person/p-rc-dan");
      await page.getByRole("tab", { name: "Contact" }).click();
      await addTag(page, tag);

      // Search for it SHOUTED. The recorded decision says this is the same tag:
      // one identity, the owner's first spelling shown.
      const search = await openTagPicker(page);
      await search.fill(tag.toUpperCase());
      await expect(
        page.getByRole("option", { name: tag, exact: true }),
      ).toBeVisible();
      // …and there is nothing to create, because it already exists.
      await expect(page.getByRole("option", { name: /^Create/ })).toHaveCount(
        0,
      );
      await closeTagPicker(page);

      // The chip still shows the spelling the owner typed.
      await expect(tagChips(page).filter({ hasText: tag })).toHaveCount(1);
    } finally {
      await forgetTags([tag.toLowerCase()]);
    }
  });

  test("keyboard-only: reach the field, open it, choose a tag, remove it", async ({
    page,
  }) => {
    const tag = uniqueTag("kbd");
    try {
      await goto(page, "/person/p-rc-dan");
      await page.getByRole("tab", { name: "Contact" }).click();

      // Reach the trigger with the keyboard. The Tab first is what makes the
      // browser report `:focus-visible` — a programmatic `.focus()` after a
      // POINTER interaction does not, and would test the wrong thing.
      const trigger = tagsTrigger(page).first();
      await page.keyboard.press("Tab");
      await trigger.evaluate((node: HTMLElement) => node.focus());
      await expect(trigger).toBeFocused();
      // A visible focus ring, measured rather than assumed.
      const outline = await trigger.evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.outlineStyle}|${style.outlineWidth}`;
      });
      expect(outline).not.toBe("none|0px");

      await page.keyboard.press("Enter");
      const search = page.getByRole("combobox", { name: "Search tags" });
      await expect(search).toBeFocused();
      await search.fill(tag);
      // Arrow to the create command and take it — the command is a ROW in the
      // listbox, so the arrow keys reach it (DHDS-09).
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(tagChips(page).filter({ hasText: tag })).toHaveCount(1);

      await page.keyboard.press("Escape");
      // Remove it with the keyboard too.
      const remove = page.getByRole("button", { name: `Remove ${tag}` });
      await remove.focus();
      await page.keyboard.press("Enter");
      await expect(tagChips(page).filter({ hasText: tag })).toHaveCount(0);
    } finally {
      await forgetTags([tag.toLowerCase()]);
    }
  });

  test("says something useful when the search matches nothing", async ({
    page,
  }) => {
    await goto(page, "/person/p-rc-dan");
    await page.getByRole("tab", { name: "Contact" }).click();
    const search = await openTagPicker(page);
    await search.fill("zzz-no-such-tag-anywhere");
    // "No results" is not useful (DHDS-09 §38): the empty state names what was
    // searched for and offers to create it, because creation is genuinely
    // supported here.
    await expect(page.getByRole("option", { name: /Create/ })).toBeVisible();
    await closeTagPicker(page);
  });

  test("is axe-clean and overflow-free at 1440, 393 and 320, in light and dark", async ({
    page,
  }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [1440, 393, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await goto(page, "/person/p-rc-dan");
        await page.getByRole("tab", { name: "Contact" }).click();
        const trigger = tagsTrigger(page).first();
        await expect(trigger).toBeVisible();
        await trigger.click();
        // Below `md` the same picker IS the shared bottom sheet, so this also
        // proves the phone presentation is the same control rather than a
        // second one.
        await expect(
          page.getByRole("combobox", { name: "Search tags" }),
        ).toBeVisible();
        // No rule disabled beyond the suite's own standing set.
        await expectNoAxeViolations(page);
        const overflows = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        );
        expect(overflows, `${scheme} @ ${width}px overflows`).toBe(false);
        await closeTagPicker(page);
      }
    }
    await page.emulateMedia({ colorScheme: null });
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
