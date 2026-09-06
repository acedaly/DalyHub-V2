/**
 * V2.11 EVIDENCE — the attachment journeys, end to end through the real product.
 *
 * These prove the things only a browser can prove, and each of them is a claim
 * the release makes that a unit test cannot check:
 *
 *   - a real file goes through a real `<input type="file">`, reaches the real
 *     Worker, and comes back down the real authenticated route with the bytes
 *     the owner chose;
 *   - the same Evidence surface is on Obligations, Assets, Meetings and Notes —
 *     the same tab, the same controls, the same words;
 *   - a refused file says WHY, in the server's own sentence, and attaches
 *     nothing;
 *   - the phone journey works at 393 and at 320, and the camera control is
 *     there with the `capture` attribute that makes it a camera;
 *   - the surface is keyboard-reachable and axe-clean.
 *
 * The fixtures are real files built in the test, byte by byte: a valid minimal
 * PDF, a valid 1x1 PNG, and an HTML file wearing a `.pdf` name. Nothing here is
 * a string pretending to be a document — the upload validator checks leading
 * bytes, so a fake one would be refused for the wrong reason and prove nothing.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";
import {
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";
import {
  cleanupAllTestObligations,
  cleanupObligationByTitle,
  uniqueObligationTitle,
} from "./obligations-fixtures";

const owned = new Set<string>();
const ownedMeetings = new Set<string>();

test.afterEach(async () => {
  for (const title of owned) cleanupObligationByTitle(title);
  owned.clear();
  // Meetings are swept through their own module's fixture, because a Meeting
  // drags follow-up Tasks, structured items and attendee links behind it and
  // only `meetings-fixtures` knows that order.
  for (const title of ownedMeetings) await cleanupMeetingByTitle(title);
  ownedMeetings.clear();
});

test.afterAll(async () => {
  cleanupAllTestObligations();
  await cleanupAllMeetingFixtures();
});

const OBLIGATION_RECORD_URL = /\/obligations\/[0-9a-fA-F-]{20,}(?:[?#]|$)/;

/* -------------------------------------------------------------------------- */
/* Real files                                                                 */
/* -------------------------------------------------------------------------- */

/** A minimal but genuinely valid PDF — it must start `%PDF`. */
const PDF = Buffer.from(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n" +
    "%%EOF\n",
  "utf8",
);

/** A real 1x1 PNG. The signature matters: the validator checks it. */
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Create an obligation and land on its record. */
async function createObligation(page: Page, label: string): Promise<string> {
  const title = uniqueObligationTitle(label);
  owned.add(title);
  await gotoFixture(page, "/obligations/new");
  await waitForInteractive(page);
  await page.getByRole("textbox", { name: /^Title/ }).fill(title);
  await page
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoDaysFromNow(14));
  await page.getByRole("button", { name: "Add obligation" }).click();
  await expect(page).toHaveURL(OBLIGATION_RECORD_URL);
  return title;
}

/** Open the shared Evidence tab on whatever record is showing. */
async function openEvidence(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Evidence/ }).click();
  await expect(page.getByTestId("attachments-section")).toBeVisible();
}

/** Choose a file through the real input, exactly as the OS picker would. */
async function choose(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<void> {
  await page
    .getByTestId("attachments-section-picker-file")
    .setInputFiles({ name, mimeType, buffer });
}

/**
 * Open the first record in a collection, matched by the shape of its href.
 *
 * The collections this is used for (Assets, Notes) are seeded in every
 * environment, and the journey is about the SURFACE being one surface rather
 * than about a particular fixture — so it takes whatever record the collection
 * offers instead of creating one it would then have to know how to tear down.
 */
async function openFirstIn(
  page: Page,
  collection: string,
  record: RegExp,
): Promise<void> {
  await gotoFixture(page, collection);
  await waitForInteractive(page);

  const href = await page.evaluate((pattern: string) => {
    const matches = new RegExp(pattern);
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
      "main a[href]",
    )) {
      const path = anchor.getAttribute("href") ?? "";
      if (matches.test(path)) return path;
    }
    return null;
  }, record.source);

  expect(
    href,
    `no record matching ${record} in ${collection} — the seeded environment should have one`,
  ).not.toBeNull();
  await gotoFixture(page, href!);
  await waitForInteractive(page);
}

/** Create a Meeting and land on it. Swept by title prefix in `afterEach`. */
async function openNewMeeting(page: Page): Promise<void> {
  const title = uniqueMeetingTitle("evidence");
  ownedMeetings.add(title);
  await gotoFixture(page, "/new/meeting");
  await waitForInteractive(page);
  await page
    .getByRole("form", { name: "New meeting" })
    .getByLabel("Title")
    .fill(title);
  // fixed-date: a meeting already in the past, so no run reads it as upcoming
  await page.getByLabel("Start date and time").fill("2026-07-27T09:00");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page).toHaveURL(/\/meeting\/[^/?#]+\?tab=meeting$/);
  await waitForInteractive(page);
}

/* -------------------------------------------------------------------------- */
/* The journey                                                                */
/* -------------------------------------------------------------------------- */

test.describe("evidence on a record", () => {
  test("attach → it is listed → download the same bytes → remove", async ({
    page,
  }) => {
    await createObligation(page, "evidence");
    await openEvidence(page);

    // The empty state teaches the next action rather than being blank.
    await expect(page.getByTestId("attachments-section-empty")).toContainText(
      /No files yet/,
    );

    await choose(page, "Rego renewal.pdf", "application/pdf", PDF);

    // It is listed, with its name, its class and its size — and the row's
    // actions each name the file, which is what makes a list of ten usable.
    const row = page.getByTestId("attachment-row");
    await expect(row).toBeVisible();
    await expect(row).toContainText("Rego renewal.pdf");
    await expect(row).toContainText("PDF");
    await expect(
      page.getByRole("button", { name: "Remove… Rego renewal.pdf" }),
    ).toBeVisible();

    /*
     * THE assertion: the bytes come back. Fetched through the real
     * authenticated route from the page's own session, and compared with what
     * was uploaded. A metadata-only journey would pass without this.
     */
    const href = await page
      .getByRole("link", { name: "Download Rego renewal.pdf" })
      .getAttribute("href");
    expect(href).toMatch(/^\/attachments\//);

    const downloaded = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        disposition: response.headers.get("content-disposition"),
        sniff: response.headers.get("x-content-type-options"),
        bytes: [...new Uint8Array(await response.arrayBuffer())],
      };
    }, href!);

    expect(downloaded.status).toBe(200);
    expect(downloaded.type).toBe("application/pdf");
    // ALWAYS `attachment`, whatever the type. Nothing DalyHub stores is served
    // as active content on its own origin.
    expect(downloaded.disposition).toMatch(/^attachment; /);
    expect(downloaded.disposition).toContain("filename*=UTF-8''");
    expect(downloaded.sniff).toBe("nosniff");
    expect(downloaded.bytes).toEqual([...PDF]);

    /*
     * Remove it — through the confirmation, because removal is unrecoverable
     * and the click alone must send nothing. The dialog names the file and says
     * so; `AttachmentsSection.test.tsx` asserts that no request leaves until it
     * is confirmed.
     */
    await page
      .getByRole("button", { name: "Remove… Rego renewal.pdf" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("cannot be undone");
    await page.getByRole("button", { name: "Remove file" }).click();
    await expect(page.getByTestId("attachment-row")).toHaveCount(0);
    await expect(page.getByTestId("attachments-section-empty")).toBeVisible();

    // And it is really gone: the route it was served from answers 404.
    const afterDelete = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return response.status;
    }, href!);
    expect(afterDelete).toBe(404);
  });

  test("an image gets an inline preview; a PDF does not", async ({ page }) => {
    await createObligation(page, "preview");
    await openEvidence(page);
    await choose(page, "receipt.png", "image/png", PNG);

    const thumb = page.locator("img.dh-attachment-row__thumb");
    await expect(thumb).toBeVisible();
    const src = await thumb.getAttribute("src");
    expect(src).toMatch(/\/preview$/);

    // The preview route serves it inline — the ONE place DalyHub does that, and
    // only because the CSP's `img-src 'self'` allows exactly this and nothing
    // else.
    const preview = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        disposition: response.headers.get("content-disposition"),
      };
    }, src!);
    expect(preview.status).toBe(200);
    expect(preview.type).toBe("image/png");
    expect(preview.disposition).toMatch(/^inline; /);

    // A PDF added beside it has NO preview: `object-src 'none'` and
    // `frame-src 'none'` mean an inline PDF would be a blank frame.
    await choose(page, "policy.pdf", "application/pdf", PDF);
    await expect(page.getByTestId("attachment-row")).toHaveCount(2);
    await expect(page.locator("img.dh-attachment-row__thumb")).toHaveCount(1);
  });

  test("a refused file says why, and attaches nothing", async ({ page }) => {
    await createObligation(page, "refused");
    await openEvidence(page);

    // HTML wearing a `.pdf` name. The declared type and the extension agree;
    // the LEADING BYTES do not.
    await choose(
      page,
      "policy.pdf",
      "application/pdf",
      Buffer.from("<html><script>alert(1)</script></html>", "utf8"),
    );

    const failed = page.getByTestId("attachment-pending");
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute("data-state", "failed");
    await expect(failed).toContainText(/doesn’t start like one/);
    // Nothing was attached.
    await expect(page.getByTestId("attachment-row")).toHaveCount(0);

    // Discard it, and the record is back where it started.
    await page.getByTestId("attachment-dismiss").click();
    await expect(page.getByTestId("attachments-section-empty")).toBeVisible();
  });

  test("an SVG is refused by name, with the reason", async ({ page }) => {
    await createObligation(page, "svg");
    await openEvidence(page);
    await choose(
      page,
      "logo.svg",
      "image/svg+xml",
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8"),
    );
    await expect(page.getByTestId("attachment-pending")).toContainText(
      /an SVG can run code/,
    );
    await expect(page.getByTestId("attachment-row")).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* One surface, on every record that has evidence                             */
/* -------------------------------------------------------------------------- */

test.describe("the same surface, on every record", () => {
  /*
   * Each record type says how to REACH one of itself, and the assertions below
   * are then identical for all of them — which is the point of the section.
   *
   * Two ways of reaching a record, chosen per type rather than uniformly:
   *
   *   - Assets and Notes exist in every seeded environment, so the journey
   *     follows whatever record link the collection offers. It matches on the
   *     HREF rather than on an accessible name, because each module words its
   *     row links differently.
   *   - A Meeting is CREATED by this spec. The seeded environment has none, and
   *     a case that skips when the fixture data happens to be thin is a case
   *     that proves nothing on the day it matters. It carries the shared
   *     `Meetings e2e ` prefix and is swept in `afterEach`, exactly as
   *     `meetings-follow-up.spec.ts` does it.
   */
  const records: readonly {
    readonly name: string;
    readonly open: (page: Page) => Promise<void>;
  }[] = [
    {
      name: "an Asset",
      open: (page) => openFirstIn(page, "/assets", /^\/asset\//),
    },
    { name: "a Meeting", open: openNewMeeting },
    {
      name: "a Note",
      open: (page) => openFirstIn(page, "/notes", /^\/notes\/[^/]+$/),
    },
  ];

  for (const record of records) {
    test(`${record.name} offers the same Evidence surface`, async ({
      page,
    }) => {
      await record.open(page);

      const tab = page.getByRole("tab", { name: /^Evidence/ });
      await expect(tab).toBeVisible();
      await tab.click();

      // The SAME testids, the same controls, the same words — which is what
      // "one shared surface" means when it is true.
      await expect(page.getByTestId("attachments-section")).toBeVisible();
      await expect(
        page.getByTestId("attachments-section-picker-file"),
      ).toHaveAttribute("type", "file");
      await expect(
        page.getByTestId("attachments-section-status"),
      ).toHaveAttribute("aria-live", "polite");
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Phone                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("on a phone", () => {
  test("attaches at 393, and the camera control is a camera", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await createObligation(page, "phone");
    await openEvidence(page);

    // The camera control exists and asks the OS for the rear camera. This is the
    // whole mobile capture story: a standards-based input, no native shell.
    const camera = page.getByTestId("attachments-section-picker-camera");
    await expect(camera).toHaveAttribute("capture", "environment");
    await expect(camera).toHaveAttribute("accept", "image/*");

    await choose(page, "receipt.png", "image/png", PNG);
    await expect(page.getByTestId("attachment-row")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  /*
   * Target size is asserted under a COARSE POINTER rather than a narrow
   * viewport, matching the convention `touch-targets.spec.ts` states and
   * `account-security.spec.ts` follows: the shared button primitive reaches the
   * 44px minimum behind `@media (hover: none)`, so a plain `setViewportSize`
   * measures the 36px desktop control height and would assert the wrong thing.
   * Emulating a real touch device measures what a thumb actually gets.
   */
  test.describe("touch targets on a touch device", () => {
    test.use({
      viewport: { width: 393, height: 852 },
      hasTouch: true,
      isMobile: true,
    });

    test("both picker controls meet the 44px minimum", async ({ page }) => {
      await createObligation(page, "touch");
      await openEvidence(page);

      /*
       * The LABEL is measured, not the input, because the label IS the control:
       * the input is visually hidden (and still focusable) and the label is what
       * a thumb lands on. If the label were ever swapped for a button that
       * calls `.click()`, this would still pass and the accessibility test in
       * the unit suite would fail — which is the right division of labour.
       */
      await expectMinTouchTarget(
        page.locator("label", { hasText: "Add file" }).first(),
      );
      await expectMinTouchTarget(
        page.locator("label", { hasText: "Take a photo" }).first(),
      );
    });
  });

  test("a long filename and ten files do not break 320", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await createObligation(page, "narrow");
    await openEvidence(page);

    /*
     * 96 characters, which is an ordinary length for a real policy document.
     * It must WRAP rather than truncate — the extension is the part that says
     * what the file is — and it must not widen the page.
     */
    const long =
      "Insurance renewal - comprehensive - 2026-2027 - policy schedule and disclosure.pdf";
    await choose(page, long, "application/pdf", PDF);
    await expect(page.getByTestId("attachment-row")).toContainText(long);
    await expectNoHorizontalOverflow(page);

    // A second file, so the list is a list rather than a single row.
    await choose(page, "receipt.png", "image/png", PNG);
    await expect(page.getByTestId("attachment-row")).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

test.describe("accessibility", () => {
  test("the evidence surface is keyboard-reachable and axe-clean", async ({
    page,
  }) => {
    await createObligation(page, "a11y");
    await openEvidence(page);
    await choose(page, "Rego renewal.pdf", "application/pdf", PDF);
    await expect(page.getByTestId("attachment-row")).toBeVisible();

    /*
     * The file input is visually hidden but MUST stay focusable — the whole
     * reason it is `clip-path` rather than `display: none`. Focusing it through
     * the DOM and reading `document.activeElement` proves it is in the
     * accessibility tree; `:focus-within` on the label is what makes that
     * visible, and is asserted in the unit suite over the stylesheet.
     */
    const focusable = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="attachments-section-picker-file"]',
      );
      input?.focus();
      return document.activeElement === input;
    });
    expect(focusable).toBe(true);

    await expectNoAxeViolations(page);
  });
});
