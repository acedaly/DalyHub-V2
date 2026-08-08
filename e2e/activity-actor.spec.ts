import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * IDENT-01 — authenticated activity names the real user, end to end.
 *
 * The regression this guards: every event in production read `Someone`, and a
 * registered-but-undescribed event type read `Unrecognised event`. Driven against
 * the development-auth server, whose fixed identity supplies a display name the
 * SAME way Cloudflare Access does — so this exercises the whole path (request
 * boundary → workspace membership → actor directory → shared renderer), not a
 * stub.
 */

const ACTOR = "Local Developer";

/**
 * Open a record's Activity tab and wait for a page of events.
 *
 * This used to read Today's "Recent activity" widget. The Today redesign removed
 * that widget — the day surface is the day, not a history of everything — so the
 * journey now runs against a RECORD's Activity tab. That is a stronger place to
 * assert from anyway: it is the shared DS-05 feed over the same FND-05 stream, on
 * a surface the owner reaches every day, rather than the one dashboard panel that
 * happened to render it.
 */
async function openRecordActivity(page: Page, record: string) {
  await page.goto(record);
  await page.getByRole("tab", { name: "Activity" }).click();
  const feed = page.getByRole("feed").first();
  await expect(feed).toBeVisible();
  await expect(feed.getByRole("article").first()).toBeVisible({
    timeout: 15_000,
  });
  return feed;
}

/** The seeded project whose timeline carries SYSTEM-authored events. */
const SEEDED_RECORD = "/projects/pr-activity";

test.describe("IDENT-01 — the activity feed names the person who acted", () => {
  test("a newly captured record is attributed to the signed-in user", async ({
    page,
  }) => {
    // Create something through the real UI, so there is at least one event
    // authored by THIS authenticated session.
    // Fixture setup, not a UI assertion: the Notes header's duplicate "New Note"
    // button was removed by the shell cleanup, so this opens the SAME (untouched,
    // URL-backed) create drawer by its canonical URL.
    await page.goto("/notes?drawer=new-note");
    const dialog = page.getByRole("dialog", { name: "New Note" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Title/).fill(`Identity check ${Date.now()}`);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);

    // The note this session just created — its own timeline is authored by the
    // signed-in identity and by nobody else.
    const feed = await openRecordActivity(page, page.url());

    // The actor is the real signed-in identity…
    await expect(feed.getByText(ACTOR).first()).toBeVisible();
    // …and never the anonymous placeholder, on any row.
    await expect(feed.getByText("Someone", { exact: true })).toHaveCount(0);
  });

  test("no event renders as an unrecognised event", async ({ page }) => {
    const widget = await openRecordActivity(page, SEEDED_RECORD);

    // The production build hides the raw-type diagnostic entirely; either way,
    // the words the owner used to see must not appear.
    await expect(widget.getByText(/Unrecognised event/)).toHaveCount(0);
    // Every row still carries a description and a time (never colour alone).
    const articles = widget.getByRole("article");
    const count = await articles.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < Math.min(count, 5); index += 1) {
      const article = articles.nth(index);
      await expect(article.locator("time")).toHaveCount(1);
      await expect(
        article.locator(".dh-activity-item__description"),
      ).not.toBeEmpty();
    }
  });

  test("desktop and mobile render the actor identically", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 320, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      const widget = await openRecordActivity(page, SEEDED_RECORD);
      // The one shared actor component is used at both sizes: a genuine system
      // event still reads "System", and nothing anywhere reads "Someone".
      await expect(widget.getByText("Someone", { exact: true })).toHaveCount(0);
      await expect(widget.getByText("System").first()).toBeVisible();
    }
  });
});
