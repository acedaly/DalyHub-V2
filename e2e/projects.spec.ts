import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * PROJ-01 — the Projects module, driven end to end against the development-auth
 * server over real (seeded) D1. Role-based and non-brittle: browse real projects,
 * open a project through normal navigation, verify its Area/Goal, create a task,
 * open it in the SAME shared Task Drawer used on Today, complete it and see the
 * roll-up progress change, test Back/Forward/Escape + focus restoration, reload for
 * persistence, complete + reopen the project, and hold the accessibility + responsive
 * baseline. Mutations target the seeded `pr-website` / `pr-launch` projects.
 */

test.describe("PROJ-01 — Projects", () => {
  test("browses projects from the sidebar and opens one by navigation", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    // The registry-driven sidebar exposes a real Projects route.
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);

    // Real project cards render with their Area context.
    const card = page.getByRole("link", { name: "Open Website relaunch" });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", "/projects/pr-website");

    // Gate D: the entity card states the Area context, ONE status chip and a
    // progress bar whose accessible value names the denominator.
    const article = page.getByRole("article", { name: "Website relaunch" });
    await expect(article.getByText(/DalyHub V2/)).toBeVisible();
    /*
     * UIX-02 — ONE attention line, and no filled status chip at all. The pill
     * and the health sentence beneath it were one fact drawn as two objects.
     */
    await expect(article.locator(".dh-pill")).toHaveCount(0);
    await expect(article.locator(".dh-pcard__attention")).toHaveCount(1);
    await expect(article.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      /^\d+% — \d+ of \d+ tasks? complete$/,
    );

    // Selecting a project opens its overview through normal client navigation.
    await card.click();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
    // The Area context is resolved from the hierarchy (not a copied label).
    await expect(page.getByText("DalyHub V2").first()).toBeVisible();
  });

  test("resolves a goal-advancing project’s Goal and Area", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-launch");
    await expect(
      page.getByRole("heading", { name: "Launch checklist" }),
    ).toBeVisible();
    // The Goal is shown, and the Area is resolved THROUGH the Goal.
    await expect(page.getByText("Launch the site").first()).toBeVisible();
    await expect(page.getByText("DalyHub V2").first()).toBeVisible();
  });

  test("creates a task, opens it in the shared Drawer, completes it, and progress updates", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");

    // THEME-01 — the roll-up is now the shared progress meter, so this reads the
    // value assistive tech reads rather than a component-specific class name.
    // RECORD-01 renamed it: the summary band's meter is labelled "Tasks", which
    // is what the band actually shows beside the count.
    const progress = page.getByRole("progressbar", { name: "Tasks" });
    const before = (await progress.getAttribute("aria-valuetext")) ?? "";
    expect(before).not.toBe("");

    // Add a task through the shared create Drawer.
    await page.getByRole("link", { name: "Add task" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "New Task" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/Title/).fill("E2E launch task");
    await createDialog.getByRole("button", { name: "Add task" }).click();

    // The new task opens in the SAME shared Task Drawer (deep-linkable URL).
    const taskDialog = page.getByRole("dialog");
    await expect(
      taskDialog.getByRole("heading", { name: "E2E launch task" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/drawer=task%3A/);

    // Complete the task through the shared Drawer.
    await taskDialog.getByRole("checkbox", { name: /Mark complete/ }).check();
    await expect(
      taskDialog.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();

    // Close the Drawer; the project roll-up progress reflects the change.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => (await progress.getAttribute("aria-valuetext")) ?? "")
      .not.toBe(before);

    // The completed task persists after a reload (seen under the Completed filter).
    await page.reload();
    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Open E2E launch task" }).first(),
    ).toBeVisible();
  });

  test("Back / Forward / Escape and focus restoration for an opened task", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");
    const taskLink = page
      .getByRole("link", { name: "Open Design the homepage" })
      .first();
    await taskLink.focus();
    await taskLink.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=task%3Apt-design/);

    // Back closes; Forward reopens (the stack lives in the URL — DS-03).
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Escape closes and restores focus to the originating task card link.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(taskLink).toBeFocused();
  });

  test("completes and reopens the project (tasks are untouched)", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-launch");

    await page.getByRole("button", { name: "Complete project" }).click();
    await expect(
      page.getByRole("button", { name: "Reopen project" }),
    ).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();

    await page.getByRole("button", { name: "Reopen project" }).click();
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toBeVisible();
  });

  test("Today’s Continue working opens the SAME canonical project record", async ({
    page,
  }) => {
    // Continue working is bounded (RECENT_PROJECTS_COUNT) and Active-only
    // (PROJ-05 Slice 4), so exactly WHICH Active project appears here can shift
    // as other e2e journeys activate/restore projects earlier in the same
    // shared-D1 suite run. This proves the canonical-navigation CONTRACT — any
    // card opens its own `/projects/:id` record, never a fixture or a
    // mismatched route — without pinning to one specific project's presence.
    await gotoFixture(page, "/today");
    const section = page.getByRole("region", { name: "Continue working" });

    // Scoped to a RECORD link, not simply the first link in the section. The
    // section also carries its own "View all" link to the `/projects`
    // collection, and that one leads in DOM order — so `.first()` picked the
    // collection and asserted it against the record pattern. The href prefix
    // excludes it structurally (`/projects` has no trailing slash), which is
    // what makes this independent of where the section header sits.
    const link = section.locator('a[href^="/projects/"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/projects\/[^/]+$/);
    const title = (await link.textContent())?.replace(/^Open\s+/, "").trim();
    await link.click();
    await expect(page).toHaveURL(
      new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("collection: Load more reaches a project beyond the first keyset page", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");

    // A project on the SECOND page is not present until "Load more" is used —
    // proving the first render is a bounded page, not the whole (62-row) set.
    const latecomer = page.getByRole("link", {
      name: "Open Paginated project 060",
    });
    await expect(latecomer).toHaveCount(0);

    /*
     * The subtitle must not present the loaded count as the total while more
     * remain — and it says so in the product's own noun.
     *
     * HARDEN-02 — this asserted a lower-case "projects loaded". UIX-06 gave every
     * collection ONE count line through `collectionCountLabel`, and its first
     * rule is that the noun is CAPITALISED because these are the product's nouns
     * ("50 Projects loaded"). The assertion had been failing ever since and
     * nobody could see it: this spec sat inside the tests shards 4 and 8 never
     * started before `globalTimeout`.
     */
    await expect(page.getByText(/\d+ Projects loaded/)).toBeVisible();
    // Task roll-ups stay authoritative across pagination: the cards state each
    // Project's OWN totals, never a figure derived from the loaded page.
    const websiteBar = page
      .getByRole("article", { name: "Website relaunch" })
      .getByRole("progressbar");
    const beforeLoadMore = await websiteBar.getAttribute("aria-valuetext");

    const loadMore = page.getByRole("button", { name: "Load more projects" });
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    // The previously-unreachable project is now loaded, exactly once (no duplicate).
    await expect(latecomer).toHaveCount(1);
    // The full set is loaded, so the affordance retires and the count is final.
    await expect(
      page.getByRole("button", { name: "Load more projects" }),
    ).toHaveCount(0);
    // The first-page project remains present (the page appended, not replaced).
    await expect(
      page.getByRole("link", { name: "Open Website relaunch" }),
    ).toHaveCount(1);
    // …and its roll-up is unchanged by loading more rows. A total derived from
    // the loaded page would have moved here.
    await expect(websiteBar).toHaveAttribute(
      "aria-valuetext",
      beforeLoadMore ?? "",
    );
  });

  test("collection: icons, parent context and the exclusive status chip", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");

    // The seed is deliberately partial (PR #121): `pr-website` carries a chosen
    // icon and `pr-launch` carries none, so BOTH the persisted and the fallback
    // paths are proven in a browser rather than only one of them.
    const withIcon = page.getByRole("article", { name: "Website relaunch" });
    await expect(withIcon.locator('[data-icon-key="travel"]')).toBeVisible();

    const fallback = page.getByRole("article", { name: "Launch checklist" });
    await expect(fallback.locator("[data-icon-key]")).toHaveCount(0);
    await expect(
      fallback.locator('.dh-accent-icon [data-entity="project"]'),
    ).toBeVisible();

    // A goal-advancing Project resolves its Area THROUGH its Goal, and names
    // the Area first so the Area stays discoverable from the card.
    await expect(
      fallback.getByText("DalyHub V2 · Launch the site"),
    ).toBeVisible();

    // Both cards inherit the SAME Area's accent, because they share an Area.
    const accents = await page
      .locator(".dh-accent-icon")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-accent")),
      );
    expect(accents.filter(Boolean).length).toBeGreaterThan(0);

    // Exactly one status treatment per card — never a state chip AND a health
    // chip saying overlapping things.
    for (const article of await page.getByRole("article").all()) {
      expect(await article.locator(".dh-pill").count()).toBeLessThanOrEqual(1);
    }
  });

  test("collection: axe is clean in the dark appearance too", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/projects");
    await expect(page.getByRole("article").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("collection: every non-interactive part of a card opens the record", async ({
    page,
  }) => {
    /*
     * Real hit testing, which is the only thing that can prove this: the
     * whole-card link is an absolutely-positioned `::after` overlay, and
     * whether a click reaches it is decided by stacking order, not by the DOM
     * tree. jsdom dispatches on whatever node a test names and would pass
     * regardless — which is how a raised, NON-interactive status chip turned
     * the top-right corner of every card into a dead zone unnoticed.
     */
    /*
     * UIX-02 — the card's two non-interactive REGIONS, by their new names. The
     * status chip and the metadata row became the attention line and the
     * figures row; the hazard they were tested for is unchanged, because it is
     * a property of the stretched-link technique rather than of any one
     * element: anything painted above the `::after` overlay becomes a dead
     * zone, and a raised chip in the top-right corner of every card is exactly
     * how that goes unnoticed.
     */
    const targets = ["project-card-attention", "project-card-figures"] as const;
    for (const testid of targets) {
      await gotoFixture(page, "/projects");
      const card = page.getByRole("article", { name: "Website relaunch" });
      await expect(card).toBeVisible();
      const region = card.getByTestId(testid);
      await expect(region).toBeVisible();
      const box = (await region.boundingBox())!;
      // The geometric CENTRE of the region, so this is genuinely "what is on
      // top here?" rather than a click that slipped past the edge.
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page, `clicking ${testid} should open the record`).toHaveURL(
        /\/projects\/pr-website/,
      );
    }
  });

  test("card family: an overflow action is clickable and does NOT open the card", async ({
    page,
  }) => {
    // The other half of the contract. Static content must fall through to the
    // card's link; a real control must not.
    await gotoFixture(page, "/design/card-family");
    const card = page.getByRole("article", { name: "Fixture entity card" });
    await expect(card).toBeVisible();

    const action = card.getByTestId("entity-card-fixture-action");
    await action.click();
    // The button received the click…
    await expect(action).toHaveAttribute("data-clicked", "true");
    // …and the card's own destination was NOT followed.
    expect(new URL(page.url()).hash).toBe("");

    // The card still navigates from its ordinary content.
    const status = card.getByTestId("entity-card-status");
    const box = (await status.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/#entity-1$/);
  });

  test("collection: the empty and filtered-empty states are distinct", async ({
    page,
  }) => {
    // The states seeded data cannot reach without destroying the shared local
    // D1 every other spec in this run depends on — see
    // `app/routes/design-collection-states.tsx`.
    await gotoFixture(page, "/design/collection-states?state=projects-empty");
    await expect(page.getByText("No Projects yet")).toBeVisible();
    await expectNoAxeViolations(page);

    await gotoFixture(
      page,
      "/design/collection-states?state=projects-filtered",
    );
    await expect(page.getByText("No archived projects")).toBeVisible();
    // A filtered-empty state must NOT reuse the true-empty copy.
    await expect(page.getByText("No Projects yet")).toHaveCount(0);
  });

  test("collection: progress is authoritative across zero, partial and complete", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/design/collection-states?state=projects-progress",
    );

    // Zero tasks: NO progressbar at all. An empty bar at 0% would read as
    // "nothing done yet" when the truth is "nothing planned yet".
    const zero = page.getByRole("article", { name: "Nothing planned yet" });
    await expect(zero.getByRole("progressbar")).toHaveCount(0);
    await expect(zero.getByText("No tasks yet")).toBeVisible();

    // Partial: exact, and the visible percentage agrees with the value.
    const partial = page.getByRole("article", { name: "Website relaunch" });
    const bar = partial.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", "67");
    await expect(bar).toHaveAttribute(
      "aria-valuetext",
      "67% — 12 of 18 tasks complete",
    );
    await expect(partial.getByText("67%")).toBeVisible();

    // Fully complete.
    const full = page.getByRole("article", { name: "Kitchen renovation" });
    await expect(full.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    // DS-16 — the run-on sentence became a compact fact group. The COMPLETE
    // phrasing survives where assistive tech reads it, and nothing outstanding
    // means the "open tasks" fact is omitted rather than shown as zero.
    await expect(full.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "100% — 6 of 6 tasks complete",
    );
    await expect(full.getByText("open tasks")).toHaveCount(0);
    await expect(full.getByText("done")).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("collection: meets touch targets and stays overflow-free at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/projects");
    const card = page.getByRole("article", { name: "Website relaunch" });
    await expect(card).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The destination is a STRETCHED link — the title anchor's `::after` covers
    // the whole card — so the card is the target a finger hits. Measuring the
    // anchor's own box would report the height of its text and be wrong about
    // the product. Proven by tapping the card's bottom-LEFT corner, far outside
    // the anchor's own box (which sits top-right of the icon) and clear of the
    // capture FAB's fixed bottom-right position.
    await expectMinTouchTarget(card);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height - 8);
    await expect(page).toHaveURL(/\/projects\/pr-website/);
  });

  test("tasks tab: Load more reaches a task beyond the first page; roll-up total stays authoritative", async ({
    page,
  }) => {
    // The 60 seeded tasks are completed, so view them under the All filter.
    await gotoFixture(page, "/projects/pg-tasks?tasks=all");

    // The authoritative roll-up reflects ALL 60 tasks even though only the first
    // page of task rows is loaded (the total is not the loaded-row count).
    // The meter states the roll-up in text as well as in the bar, so both the
    // visible summary and the accessible value have to name all 60 tasks.
    await expect(page.getByText("60 of 60 tasks complete")).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Tasks" }),
    ).toHaveAttribute("aria-valuetext", "100% — 60 of 60 tasks complete");

    const latecomer = page.getByRole("link", {
      name: "Open Paginated task 060",
    });
    await expect(latecomer).toHaveCount(0);

    const loadMore = page.getByRole("button", { name: "Load more tasks" });
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect(latecomer).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Load more tasks" }),
    ).toHaveCount(0);
  });

  test("tasks tab: an appended (page-2) task opens the shared Drawer without disturbing state", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pg-tasks?tasks=all");

    // Load the second page, then open a page-2 task in the shared Task Drawer: the
    // appended rows are fully interactive and open the SAME deep-linkable Drawer,
    // proving pagination and drawer state coexist (the drawer param is added on top
    // of the already-loaded list, which is not reset).
    await page.getByRole("button", { name: "Load more tasks" }).click();
    const latecomer = page.getByRole("link", {
      name: "Open Paginated task 060",
    });
    await expect(latecomer).toHaveCount(1);
    await latecomer.click();

    await expect(page).toHaveURL(/drawer=task%3Apgt-060/);
    await expect(page.getByRole("dialog")).toBeVisible();

    // Closing the Drawer leaves the fully-loaded list intact (page 2 still present).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(latecomer).toHaveCount(1);
  });

  test("New Project: the parent picker searches the server for an Area", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await page.getByRole("link", { name: "New Project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New Project" });
    await expect(dialog).toBeVisible();

    // Typing queries the server-backed endpoint; the "Pagination" Area is selectable
    // even though it is not one of the first statically-listed options.
    const combo = dialog.getByRole("combobox", { name: /Area or Goal/ });
    await combo.click();
    await combo.fill("Pagination");
    const option = dialog.getByRole("option", { name: /Pagination/ });
    await expect(option).toBeVisible();
    await option.click();

    await dialog.getByLabel(/Title/).fill("Search-picked project");
    await dialog.getByRole("button", { name: "Create project" }).click();

    // A successful create navigates to the new project's record.
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: "Search-picked project" }),
    ).toBeVisible();
  });

  test("is accessible: axe clean on the record and with the task Drawer open", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await expectNoAxeViolations(page);

    await gotoFixture(page, "/projects/pr-website?drawer=task%3Apt-design");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("has no horizontal overflow across the responsive matrix", async ({
    page,
  }) => {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects/pr-website");
      await expect(
        page.getByRole("heading", { name: "Website relaunch" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("meets touch targets on the narrow layout", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/projects");
    // The state-segment controls meet the 44px touch target.
    await expectMinTouchTarget(
      page.getByRole("link", { name: "Completed", exact: true }),
    );
  });
});
