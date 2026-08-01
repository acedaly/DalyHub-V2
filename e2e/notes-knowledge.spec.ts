import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  cleanupAllNoteFixtures,
  cleanupNoteByTitle,
  uniqueNoteTitle,
} from "./notes-fixtures";

/**
 * NOTES-02/03/06 — the knowledge completion, driven end to end over the seeded
 * Worker/D1 app.
 *
 * These are the journeys that make Notes a knowledge module rather than a
 * markdown record type, and each one is a claim that has to hold in a real
 * browser against real D1:
 *
 *   - writing `[[Another note]]` creates a REAL relationship, so the other note
 *     shows a backlink — with the sentence that mentions it;
 *   - a note is findable from global Search by its BODY, not just its title;
 *   - the collection can be organised (search / tag / archived / unlinked);
 *   - a note exports as `.md` and `.txt` without leaving the record;
 *   - all of the above works on a phone, by keyboard, and is axe-clean.
 *
 * CodeMirror interaction follows `notes.spec.ts`'s established helpers (the
 * editor is a labelled `textbox`; readiness is the editor's own stable
 * `data-editor-ready` contract, never a library-internal class).
 */
const ownedNoteTitles = new Set<string>();
function ownNote(title: string): string {
  ownedNoteTitles.add(title);
  return title;
}

async function waitForEditor(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
    timeout,
  });
}

async function openNewNoteDialog(page: Page) {
  await page.getByRole("link", { name: "New Note" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Note" });
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  return dialog;
}

async function createNote(page: Page, title: string): Promise<string> {
  ownNote(title);
  await gotoFixture(page, "/notes");
  const dialog = await openNewNoteDialog(page);
  await dialog.getByLabel(/Title/).fill(title);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  return page.url();
}

/** Type `text` as the note's whole body and force an immediate autosave. */
async function writeBody(page: Page, text: string): Promise<void> {
  await waitForEditor(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
  await page
    .locator(".cm-content")
    .evaluate((el) => (el as HTMLElement).blur());
  await expect(page.getByText("Saved", { exact: false }).first()).toBeVisible();
}

async function openOverflow(page: Page) {
  await page.getByRole("button", { name: /^More actions for / }).click();
}

test.describe("NOTES-02/03/06 — knowledge, organisation and export", () => {
  test.beforeAll(async () => {
    await cleanupAllNoteFixtures();
  });

  test.afterEach(async () => {
    for (const title of ownedNoteTitles) {
      await cleanupNoteByTitle(title);
    }
    ownedNoteTitles.clear();
  });

  test("a [[wiki link]] becomes a real backlink, with the sentence that mentions it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const targetTitle = uniqueNoteTitle("target");
    const sourceTitle = uniqueNoteTitle("source");

    const targetUrl = await createNote(page, targetTitle);
    const sourceUrl = await createNote(page, sourceTitle);

    await writeBody(
      page,
      `The decision is recorded in [[${targetTitle}]] for later.`,
    );

    // The source note's Links tab reports what it points at…
    await page.goto(`${sourceUrl}?tab=linked`);
    await expect(
      page.getByRole("heading", { name: "Referenced in this note" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(targetTitle) }).first(),
    ).toBeVisible();

    // …and the TARGET note now knows it was referenced.
    await page.goto(`${targetUrl}?tab=backlinks`);
    await expect(
      page.getByRole("heading", { name: "Referenced by" }),
    ).toBeVisible();
    const backlinks = page.getByRole("list", {
      name: "Records linking to this note",
    });
    await expect(
      backlinks.getByRole("link", { name: new RegExp(sourceTitle) }),
    ).toBeVisible();
    // Context shows the sentence that mentions this note, syntax-free — never
    // raw `[[…]]`. (That the excerpt also stops at the containing block
    // boundary is proven deterministically by
    // `test/unit/markdown/note-document.test.ts`.) The `[[` check is scoped to
    // the LIST, because the tab's own help copy legitimately shows the syntax
    // it is explaining.
    await expect(
      backlinks.getByText("The decision is recorded in", { exact: false }),
    ).toBeVisible();
    await expect(backlinks.getByText("[[")).toHaveCount(0);

    // Opening the backlink navigates to the real record.
    await backlinks
      .getByRole("link", { name: new RegExp(sourceTitle) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/notes/`));
    await expect(
      page.getByRole("heading", { level: 1, name: sourceTitle }),
    ).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test("a plain title mention is NOT a backlink, and a code block is not a link", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const targetTitle = uniqueNoteTitle("plain-target");
    const sourceTitle = uniqueNoteTitle("plain-source");

    const targetUrl = await createNote(page, targetTitle);
    await createNote(page, sourceTitle);
    await writeBody(
      page,
      `We talked about ${targetTitle} today.\n\n\`\`\`\n[[${targetTitle}]]\n\`\`\``,
    );

    await page.goto(`${targetUrl}?tab=backlinks`);
    await expect(
      page.getByRole("heading", { name: "Nothing links here yet" }),
    ).toBeVisible();
  });

  test("global Search finds a note by its BODY, showing where it matched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueNoteTitle("searchable");
    const needle = `hydroponics${Date.now()}`;
    await createNote(page, title);
    await writeBody(page, `## Rig notes\n\nThe ${needle} pump was noisy.`);

    await gotoFixture(page, "/notes");
    await page
      .getByRole("button", { name: /Search/ })
      .first()
      .click();
    const search = page.getByRole("combobox", { name: /Search/ });
    await search.fill(needle);

    const option = page.getByRole("option", { name: new RegExp(title) });
    await expect(option).toBeVisible({ timeout: 15_000 });
    // The excerpt says WHERE it matched and shows readable prose, not Markdown.
    await expect(option).toContainText(needle);
    await expect(option).not.toContainText("##");

    await option.click();
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
  });

  test("the collection filters by search, tag and archived state, and the URL carries it", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const keepTitle = uniqueNoteTitle("keep");
    const archiveTitle = uniqueNoteTitle("archive-me");
    const tag = `e2etag${Date.now()}`;

    await createNote(page, keepTitle);
    // Tags live in the ONE shared overflow, like every other record action.
    await openOverflow(page);
    await page.getByRole("menuitem", { name: "Edit tags" }).click();
    const tagsDialog = page.getByRole("dialog", { name: "Edit tags" });
    await expect(tagsDialog).toBeVisible();
    await tagsDialog.getByRole("textbox").first().fill(tag);
    await page.keyboard.press("Enter");
    await tagsDialog.getByRole("button", { name: "Save tags" }).click();
    await expect(tagsDialog).toBeHidden();

    const archiveUrl = await createNote(page, archiveTitle);
    await openOverflow(page);
    await page.getByRole("menuitem", { name: "Archive Note" }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: /Archive/ }).click();
    await expect(page.getByText("Note archived").first()).toBeVisible();

    // The Active view excludes the archived note…
    await gotoFixture(page, "/notes");
    await expect(
      page.getByRole("link", { name: `Open ${keepTitle}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Open ${archiveTitle}` }),
    ).toHaveCount(0);

    // …the Archived view shows it, flagged in WORDS…
    await page.getByRole("link", { name: "Archived", exact: true }).click();
    await expect(page).toHaveURL(/state=archived/);
    await expect(
      page.getByRole("link", { name: `Open ${archiveTitle}` }),
    ).toBeVisible();

    // …and the tag filter narrows the Active view, deep-linkably.
    await gotoFixture(page, `/notes?tag=${encodeURIComponent(tag)}`);
    await expect(
      page.getByRole("link", { name: `Open ${keepTitle}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Open ${archiveTitle}` }),
    ).toHaveCount(0);

    // An archived note keeps its canonical route (unlike a deleted one).
    await page.goto(archiveUrl);
    await expect(
      page.getByRole("heading", { level: 1, name: archiveTitle }),
    ).toBeVisible();
  });

  test("the filter form is keyboard-operable and applies from the URL", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueNoteTitle("filters");
    await createNote(page, title);

    await gotoFixture(page, "/notes");
    const form = page.getByRole("search", { name: "Filter and search notes" });
    await expect(form).toBeVisible();

    // Every control is reachable and labelled — no custom widget semantics.
    await form.getByLabel("Search notes").fill(title);
    await form.getByLabel("Sort").selectOption("recent");
    await form.getByRole("button", { name: "Apply" }).press("Enter");

    await expect(page).toHaveURL(/sort=recent/);
    await expect(
      page.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();

    // Clearing is offered only once something is set, and restores the default.
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/notes$/);

    await expectNoAxeViolations(page);
  });

  test("exports a note as Markdown and as plain text without leaving the record", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueNoteTitle("exportable");
    const url = await createNote(page, title);
    await writeBody(page, "# Heading\n\n- one\n- two");

    for (const [label, extension, expected] of [
      ["Export as Markdown (.md)", "md", "# Heading"],
      ["Export as plain text (.txt)", "txt", "Heading"],
    ] as const) {
      const downloadPromise = page.waitForEvent("download");
      await openOverflow(page);
      await page.getByRole("menuitem", { name: label }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(
        new RegExp(`\\.${extension}$`),
      );
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      expect(body).toContain(expected);
      // Never a re-render presented as the note.
      expect(body).not.toContain("<li>");

      // Success is ANNOUNCED, and the record never reloaded.
      await expect(page.getByText(/exported as/).first()).toBeVisible();
      await expect(page).toHaveURL(url);
    }
  });

  test("a project's Knowledge tab adds, opens and unlinks a note without deleting it", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const title = uniqueNoteTitle("project-knowledge");
    await createNote(page, title);

    await gotoFixture(page, "/projects");
    const firstProject = page.getByRole("link", { name: /^Open / }).first();
    await expect(firstProject).toBeVisible();
    await firstProject.click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
    const projectUrl = page.url();

    await page.getByRole("tab", { name: "Knowledge" }).click();
    await expect(
      page.getByText(/the note itself is never deleted or archived/i),
    ).toBeVisible();

    // Add the existing note through the shared picker. The first use of the
    // Knowledge tab in a worker compiles its code-split route chunk, so the
    // option can take noticeably longer to appear on a cold, loaded runner than
    // on a warm one — a bounded, targeted wait for that known async work, not
    // the global timeout (the same allowance `notes.spec.ts` makes for the
    // editor's first mount).
    const picker = page.getByRole("combobox", { name: /Add an existing note/ });
    await picker.click();
    // Type rather than `fill`: the picker searches from the input's change
    // events, and a single programmatic value set can land while React is
    // re-rendering the freshly-mounted tab, leaving the combobox open with no
    // search ever issued. Typing is also what a user actually does.
    await picker.pressSequentially(title, { delay: 10 });
    const option = page
      .getByRole("option", { name: new RegExp(title) })
      .first();
    await expect(option).toBeVisible({ timeout: 30_000 });
    await option.click();
    await expect(page.getByText(/added to this project/).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();

    // Remove the ASSOCIATION — the note survives.
    await page
      .getByRole("button", { name: "Remove from project" })
      .first()
      .click();
    await expect(
      page
        .getByText(/removed from this project. The note itself is unchanged/i)
        .first(),
    ).toBeVisible();

    await gotoFixture(page, "/notes");
    await expect(
      page.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();

    await page.goto(`${projectUrl}?tab=knowledge`);
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("creating a note from a project keeps the project relationship automatically", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const title = uniqueNoteTitle("from-project");
    ownNote(title);

    await gotoFixture(page, "/projects");
    await page
      .getByRole("link", { name: /^Open / })
      .first()
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
    const projectUrl = page.url();

    await page.getByRole("tab", { name: "Knowledge" }).click();
    await page.getByRole("textbox", { name: /New note title/ }).fill(title);
    await page.getByRole("button", { name: "Create note" }).click();

    // It lands on the new note, whose Links tab already shows the project.
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    const noteUrl = page.url();
    await page.goto(`${noteUrl}?tab=linked`);
    await expect(
      page.getByRole("heading", { name: "Projects this note documents" }),
    ).toBeVisible();

    await page.goto(`${projectUrl}?tab=knowledge`);
    await expect(
      page.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();
  });

  test("works on a phone: readable, filterable, exportable, 44px targets, axe-clean", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const title = uniqueNoteTitle("mobile");
    await createNote(page, title);
    await writeBody(
      page,
      "# Mobile\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```\nvery-long-code-token-that-must-not-widen-the-page\n```",
    );

    // A wide table and a long code token must not make the PAGE scroll sideways.
    await expectNoHorizontalOverflow(page);

    await page.goto(`${page.url().split("?")[0]}?tab=backlinks`);
    await expect(
      page.getByRole("heading", { name: "Referenced by" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await gotoFixture(page, "/notes");
    const form = page.getByRole("search", { name: "Filter and search notes" });
    await expectMinTouchTarget(form.getByLabel("Search notes"));
    await expectMinTouchTarget(form.getByLabel("Tag"));
    await expectMinTouchTarget(form.getByRole("button", { name: "Apply" }));
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    // Export works from the phone overflow too.
    await page.getByRole("link", { name: `Open ${title}` }).click();
    const downloadPromise = page.waitForEvent("download");
    await openOverflow(page);
    await page
      .getByRole("menuitem", { name: "Export as Markdown (.md)" })
      .click();
    await expect((await downloadPromise).suggestedFilename()).toMatch(/\.md$/);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
  });

  /* ---------------------------------------------------------------------- */
  /* NOTES-05 — record links, backlinks presentation, copy and print          */
  /* ---------------------------------------------------------------------- */

  test("inserting a record link from the editor creates a real relationship the target can see", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const noteTitle = uniqueNoteTitle("record-link-source");
    const targetTitle = uniqueNoteTitle("record-link-target");

    const targetUrl = await createNote(page, targetTitle);
    await createNote(page, noteTitle);
    await waitForEditor(page);

    // Open the picker from the toolbar, search, and choose with the keyboard —
    // the whole flow must be reachable without a mouse (§30).
    await page.locator(".cm-content").click();
    await page.keyboard.type("Decision came from ");
    await page
      .getByRole("button", { name: "Record link", exact: true })
      .click();

    const search = page.getByRole("combobox", { name: "Link a record" });
    await expect(search).toBeFocused();
    await search.fill(targetTitle);
    await expect(
      page.getByRole("option", { name: new RegExp(targetTitle) }),
    ).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // The editor now holds a real Markdown link whose destination is the
    // record's stable id — readable outside DalyHub, unambiguous inside it.
    await expect(page.locator(".cm-content")).toContainText(targetTitle);
    await page
      .locator(".cm-content")
      .evaluate((el) => (el as HTMLElement).blur());
    await expect(
      page.getByText("Saved", { exact: false }).first(),
    ).toBeVisible();

    // The TARGET learns it was referenced — the point of the whole feature.
    await page.goto(`${targetUrl}?tab=backlinks`);
    const backlinks = page.getByRole("list", {
      name: /Records linking to this note/,
    });
    await expect(
      backlinks.getByRole("link", { name: new RegExp(noteTitle) }),
    ).toBeVisible();
  });

  test("a record link survives renaming its target, and opens the renamed record", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const sourceTitle = uniqueNoteTitle("stable-source");
    const targetTitle = uniqueNoteTitle("stable-target");
    const renamedTitle = uniqueNoteTitle("stable-renamed");

    const targetUrl = await createNote(page, targetTitle);
    const sourceUrl = await createNote(page, sourceTitle);
    await waitForEditor(page);
    await page.locator(".cm-content").click();
    await page
      .getByRole("button", { name: "Record link", exact: true })
      .click();
    const search = page.getByRole("combobox", { name: "Link a record" });
    await search.fill(targetTitle);
    await page.getByRole("option", { name: new RegExp(targetTitle) }).click();
    await page
      .locator(".cm-content")
      .evaluate((el) => (el as HTMLElement).blur());
    await expect(
      page.getByText("Saved", { exact: false }).first(),
    ).toBeVisible();

    // Rename the target. The link is stored by id, so it must not break.
    ownNote(renamedTitle);
    await page.goto(targetUrl);
    await page.getByRole("button", { name: "Rename" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename note" });
    await dialog.getByLabel(/Title/).fill(renamedTitle);
    await dialog.getByRole("button", { name: /Save|Rename/ }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: renamedTitle }),
    ).toBeVisible();

    // The source's outgoing link now DISPLAYS the new title (the record moved)
    // while the author's prose is untouched (their words are theirs).
    await page.goto(`${sourceUrl}?tab=linked`);
    await expect(
      page.getByRole("link", { name: new RegExp(renamedTitle) }).first(),
    ).toBeVisible();
  });

  test("a record link to a deleted record lands on an honest 'unavailable' page, and never crashes the note", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const sourceTitle = uniqueNoteTitle("broken-source");
    const targetTitle = uniqueNoteTitle("broken-target");

    const targetUrl = await createNote(page, targetTitle);
    const targetId = targetUrl.split("/notes/")[1]!.split(/[?#]/)[0]!;
    const sourceUrl = await createNote(page, sourceTitle);
    await waitForEditor(page);
    await writeBody(page, `Read [The target](dalyhub://note/${targetId}).`);

    // Delete the target.
    await page.goto(targetUrl);
    await openOverflow(page);
    await page.getByRole("menuitem", { name: /Delete Note/ }).click();
    await expect(page).toHaveURL(/\/notes(\?|$)/);

    // The source note still opens and still renders — a broken link is a normal
    // state in a knowledge base, not an error (§23).
    await page.goto(sourceUrl);
    await waitForEditor(page);
    await expect(
      page.getByRole("heading", { level: 1, name: sourceTitle }),
    ).toBeVisible();

    // Following the link says so plainly rather than dead-ending.
    await page.goto(`/notes/resolve?type=note&id=${targetId}`);
    await expect(page.getByText("That link doesn’t go anywhere")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to Notes" }),
    ).toBeVisible();
  });

  test("backlinks are counted, grouped by module and filterable", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const targetTitle = uniqueNoteTitle("grouped-target");
    const sourceTitle = uniqueNoteTitle("grouped-source");

    const targetUrl = await createNote(page, targetTitle);
    await createNote(page, sourceTitle);
    await writeBody(page, `Points at [[${targetTitle}]].`);

    await page.goto(`${targetUrl}?tab=backlinks`);
    // An honest count in the heading, and a family grouping rather than one
    // undifferentiated dump.
    await expect(
      page.getByRole("heading", { level: 2, name: /Referenced by/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: /Notes \(1\)/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Copy Markdown puts the exported note on the clipboard", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const title = uniqueNoteTitle("copy");
    await createNote(page, title);
    await writeBody(page, "# Heading\n\nSome body text.");

    await openOverflow(page);
    await page.getByRole("menuitem", { name: "Copy Markdown" }).click();
    await expect(page.getByText(/copied as Markdown/).first()).toBeVisible();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    // Copy serves the SAME bytes the matching export writes — front matter and
    // all — so the two can never disagree about what the note is.
    expect(clipboard).toContain("Some body text.");
    expect(clipboard).toContain("title:");
    // Nothing from the UI leaks in.
    expect(clipboard).not.toContain("Load more");
    expect(clipboard).not.toContain("More actions");
  });

  test("the print view carries the note and none of the app chrome", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueNoteTitle("print");
    await createNote(page, title);
    await writeBody(page, "# Printable heading\n\nPrintable body.");
    await page.reload();
    await waitForEditor(page);

    // On screen the print view is hidden and hidden from assistive tech (the
    // record already presents this content).
    const printView = page.locator(".dh-note-print");
    await expect(printView).toBeAttached();
    await expect(printView).toBeHidden();

    // Under print emulation it is the only visible content.
    await page.emulateMedia({ media: "print" });
    await expect(printView).toBeVisible();
    await expect(printView).toContainText("Printable body.");
    await expect(printView).toContainText(title);
    // The formatting toolbar — the worst thing to print — is not visible.
    await expect(
      page.getByRole("toolbar", { name: "Formatting" }),
    ).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("the record-link picker is usable and axe-clean on a phone", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const title = uniqueNoteTitle("phone-link");
    await createNote(page, title);
    await waitForEditor(page);

    await page.locator(".cm-content").click();
    await page
      .getByRole("button", { name: "Record link", exact: true })
      .click();
    const search = page.getByRole("combobox", { name: "Link a record" });
    await expect(search).toBeVisible();
    await expectMinTouchTarget(search);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
  });

  /** The five curated themes, by the id the document carries (THEME-01). */
  const THEMES = [
    "daly-light",
    "daly-dark",
    "eucalypt",
    "coastal",
    "ember",
  ] as const;

  /** Store the owner's theme through the real preferences action. */
  async function storeTheme(
    request: APIRequestContext,
    themeId: string,
  ): Promise<void> {
    const response = await request.post("/preferences/theme", {
      form: { theme: themeId },
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
  }

  test("the knowledge surfaces read correctly and are axe-clean in all five themes", async ({
    page,
    request,
  }) => {
    // MEASURED at 28.9s on an idle machine against the 30s default: a five-theme sweep
    // is genuinely long work, not a hang. Sized to it, as the sibling theme and
    // responsive tests in this suite already are. No assertion changes.
    test.setTimeout(90_000);
    // Five themes over two surfaces with an axe scan on each is genuine work,
    // not a race being papered over — every step below waits on a real
    // condition and none of them polls.
    test.slow();

    const targetTitle = uniqueNoteTitle("themes-target");
    const sourceTitle = uniqueNoteTitle("themes-source");
    const targetUrl = await createNote(page, targetTitle);
    await createNote(page, sourceTitle);
    await writeBody(page, `Points at [[${targetTitle}]].`);

    try {
      for (const theme of THEMES) {
        await storeTheme(request, theme);

        // The Backlinks surface: count, family grouping and the module filter.
        await page.goto(`${targetUrl}?tab=backlinks`);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(
          page.getByRole("heading", { level: 2, name: /Referenced by/ }),
        ).toBeVisible();
        // The count and the group name are WORDS, in every theme — the
        // assertion that proves nothing here depends on colour alone.
        await expect(
          page.getByRole("heading", { level: 3, name: /Notes \(1\)/ }),
        ).toBeVisible();
        await expectNoAxeViolations(page);
        await expectNoHorizontalOverflow(page);

        // The editor with the record-link picker open — the surface with the
        // most new colour in it (an active option, an input, a status line).
        await page.goto(targetUrl);
        await waitForEditor(page);
        await page
          .getByRole("button", { name: "Record link", exact: true })
          .click();
        await expect(
          page.getByRole("combobox", { name: "Link a record" }),
        ).toBeVisible();
        await expectNoAxeViolations(page);
        await expectNoHorizontalOverflow(page);
      }
    } finally {
      // Never leave the shared dev workspace on a non-default theme.
      await storeTheme(request, "daly-light");
    }
  });

  test("the relationship tabs are axe-clean in light and dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const title = uniqueNoteTitle("a11y");
    const url = await createNote(page, title);

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      for (const tab of ["backlinks", "linked"]) {
        await page.goto(`${url}?tab=${tab}`);
        await expect(page.getByRole("tab", { selected: true })).toBeVisible();
        await expectNoAxeViolations(page);
      }
    }
    await page.emulateMedia({ colorScheme: "light" });
  });
});
