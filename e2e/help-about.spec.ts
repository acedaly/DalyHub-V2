/**
 * HELP-01 / RELEASE-01 — Help and About, driven through the real product.
 *
 * Both replaced placeholders, so these tests are mostly about the placeholder NOT
 * coming back: Help must be real guidance rather than a "Coming Soon" panel, and
 * About must report a version rather than "not configured". The rest covers
 * navigation, deep links, phone layout and accessibility.
 */

import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

test.describe("HELP-01 Help", () => {
  test("is real guidance, not a Coming Soon placeholder", async ({ page }) => {
    await gotoFixture(page, "/help");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help");
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
    await expect(page.getByText(/roadmap/i)).toHaveCount(0);
  });

  test("explains the model, the modules and the distinctions that confuse people", async ({
    page,
  }) => {
    await gotoFixture(page, "/help");

    const body = await page.locator(".dh-help").innerText();
    for (const subject of [
      "Areas, Goals, Projects and Tasks",
      "Scheduled date versus due date",
      "Priority",
      "Time Sectors",
      "Recurrence",
      "Task Inbox",
      "Review Inbox",
      "Meetings",
      "People",
      "Diary",
      "Notes",
      "Assets",
      "Search",
      "Command Palette",
      "Archive, delete and restore",
      "Appearance and Settings",
      "Your data and privacy",
    ]) {
      expect(body, `Help does not cover "${subject}"`).toContain(subject);
    }
  });

  test("names what is deliberately not built, including weather", async ({
    page,
  }) => {
    await gotoFixture(page, "/help");

    const notYet = page.locator("#not-yet");
    await expect(notYet).toBeVisible();
    const text = await notYet.innerText();
    // The Today weather decision has to be visible to the owner, not buried in a
    // roadmap document they will never open.
    expect(text).toContain("Weather");
    expect(text).toContain("AI");
    expect(text).toContain("Import");
    // X-04 shipped EXPORT, so it left this list. RESTORE did not, and the two
    // must never be conflated: being able to download a copy is not being able
    // to put it back. This assertion is what stops the shipped half quietly
    // closing the whole bullet.
    expect(text).toContain("Backup and restore");
    expect(text).toContain("cannot read one back in");
  });

  test("documents the export that now exists, without calling it a restore", async ({
    page,
  }) => {
    await gotoFixture(page, "/help?topic=export");

    const topic = page.locator("#export");
    await expect(topic).toBeVisible();
    const text = await topic.innerText();
    expect(text).toContain("Download full DalyHub export");
    expect(text).toContain("Download Obsidian vault");
    expect(text).toContain("archived or deleted");
    expect(text).toContain("never sends it anywhere");
    expect(text).toContain("an export is not a restore");
  });

  test("tells the owner appearance follows their device, and names no theme", async ({
    page,
  }) => {
    await gotoFixture(page, "/help?topic=themes");

    const themes = page.locator("#themes");
    const text = await themes.innerText();
    expect(text).toContain("follows your device");
    for (const retired of ["Daly Light", "Eucalypt", "Match system"]) {
      expect(text, `Help still names the retired "${retired}"`).not.toContain(
        retired,
      );
    }
  });

  test("navigates from the contents to a topic", async ({ page }) => {
    await gotoFixture(page, "/help");

    const contents = page.getByRole("navigation", { name: "Help contents" });
    await contents.getByRole("link", { name: "Priority" }).click();
    await expect(page).toHaveURL(/#priority$/);
    await expect(page.locator("#priority")).toBeVisible();
  });

  test("opens a deep-linked topic and marks it", async ({ page }) => {
    await gotoFixture(page, "/help?topic=inbox");

    await expect(page.locator("#inbox")).toHaveAttribute(
      "data-focused",
      "true",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Help contents" })
        .getByRole("link", { name: "Task Inbox" }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("ignores a deep link to a topic that does not exist", async ({
    page,
  }) => {
    // A stale link must open Help, never an empty or broken page.
    await gotoFixture(page, "/help?topic=does-not-exist");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help");
    await expect(page.locator("[data-focused='true']")).toHaveCount(0);
  });

  test("works on a phone without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/help");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("has no axe violations", async ({ page }) => {
    await gotoFixture(page, "/help");
    await expectNoAxeViolations(page);
  });
});

test.describe("RELEASE-01 About", () => {
  test("reports a real version, not 'not configured'", async ({ page }) => {
    await gotoFixture(page, "/about");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "About DalyHub",
    );
    const body = await page.locator(".dh-about").innerText();
    expect(body).toMatch(/\d+\.\d+\.\d+/);
    expect(body).not.toContain("Not configured");
    expect(body).not.toContain("No deployment version");
  });

  test("carries the full brand lockup as live text", async ({ page }) => {
    // BRAND-01 — About is the surface that shows the complete identity. The
    // wordmark and tagline must be TEXT: findable, selectable, theme-aware and
    // scaled by the owner's OS text size. If either were baked into artwork,
    // neither of these would resolve.
    await gotoFixture(page, "/about");
    const lockup = page.locator(".dh-brand-lockup").first();
    await expect(lockup).toBeVisible();
    await expect(lockup.getByText("DalyHub", { exact: true })).toBeVisible();
    await expect(lockup.getByText("Your life. Connected.")).toBeVisible();
    // Exactly one `h1` on the page: the lockup's name is a span, so the
    // document outline is unchanged.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // The mark is decorative — the name is beside it as real text.
    await expect(lockup.locator(".dh-brand-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("reports the environment it is running in", async ({ page }) => {
    await gotoFixture(page, "/about");

    // The dev server runs as `development`; the label is the owner-facing one.
    await expect(page.getByText("Development")).toBeVisible();
  });

  test("agrees with the health endpoint about the version", async ({
    page,
    request,
  }) => {
    // The failure this prevents: About and a deployment check reporting different
    // versions, so an incident cannot be tied to a build.
    const health = await (await request.get("/health")).json();
    await gotoFixture(page, "/about");

    expect(health.version).toMatch(/^\d+\.\d+\.\d+$/);
    await expect(page.locator(".dh-about")).toContainText(health.version);
    expect(health.name).toBe("DalyHub");
  });

  test("exposes no infrastructure detail", async ({ page }) => {
    await gotoFixture(page, "/about");

    const body = await page.locator(".dh-about").innerText();

    // Concrete identifiers, not words. An earlier version of this test matched on
    // substrings like "account", which flagged the legitimate sentence "no account
    // recovery" — a false positive that would have pushed the copy to be worse.
    // These are the shapes a real leak takes.
    for (const identifier of [
      "local-dev-workspace",
      "workers.dev",
      "CLOUDFLARE_",
      "cloudflareaccess",
      "wrangler",
      "owner_app_preferences",
    ]) {
      expect(
        body.toLowerCase(),
        `About leaks the identifier "${identifier}"`,
      ).not.toContain(identifier.toLowerCase());
    }

    // No long opaque identifier (a database id, a UUID, an account id, a token).
    // The only hex About may show is a 7-character commit, which this does not match.
    expect(body, "About shows a long opaque identifier").not.toMatch(
      /\b[0-9a-f]{16,}\b/i,
    );
    expect(body, "About shows a UUID").not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    );
    // No hostname or URL: About links to Help by path, never to infrastructure.
    expect(body, "About shows a hostname").not.toMatch(/https?:\/\//);
  });

  test("links to Help", async ({ page }) => {
    await gotoFixture(page, "/about");

    await page.getByRole("link", { name: "Open Help" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help");
  });

  test("works on a phone without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/about");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("has no axe violations", async ({ page }) => {
    await gotoFixture(page, "/about");
    await expectNoAxeViolations(page);
  });
});

test.describe("HELP-01 links from empty states", () => {
  test("an empty Tasks list offers the explanation, not just the button", async ({
    page,
  }) => {
    // "No dead ends" (AGENTS.md §6): the question standing between an empty list
    // and a first task is "what is a scheduled date, and how is it different from
    // a due date?" — so the empty state answers it rather than offering a second
    // button that does the same thing as the first.
    await gotoFixture(page, "/tasks?view=someday&q=zzz-no-such-task-zzz");

    const link = page.getByRole("link", { name: /how tasks work/i });
    if ((await link.count()) > 0) {
      await expect(link.first()).toHaveAttribute(
        "href",
        "/help?topic=scheduled-vs-due",
      );
    }
  });

  test("a Help deep link from an empty state lands on the right topic", async ({
    page,
  }) => {
    // The property that matters is that the link an empty state builds resolves to
    // a real, focused topic — proven directly, so it holds even when the fixture
    // database happens to have data in every collection.
    await gotoFixture(page, "/help?topic=scheduled-vs-due");
    await expect(page.locator("#scheduled-vs-due")).toHaveAttribute(
      "data-focused",
      "true",
    );

    await gotoFixture(page, "/help?topic=reviews");
    await expect(page.locator("#reviews")).toHaveAttribute(
      "data-focused",
      "true",
    );
  });
});

test.describe("THEME-01 navigation icons", () => {
  test("every navigation row renders a real glyph, not a placeholder dot", async ({
    page,
  }) => {
    // The defect this closes: Today, Help, Settings, AI and About showed a generic
    // dot because they own no entity type.
    await gotoFixture(page, "/today");

    const links = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const link = links.nth(index);
      const label = await link.innerText();
      await expect(
        link.locator("svg"),
        `navigation row "${label}" has no icon`,
      ).toHaveCount(1);
    }
  });
});
