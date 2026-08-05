import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  postSameOrigin,
  waitForInteractive,
} from "./helpers";
import {
  MEETING_TITLE_PREFIX,
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";
import {
  cleanupAllNoteFixtures,
  cleanupNoteByTitle,
  uniqueNoteTitle,
} from "./notes-fixtures";
import {
  cleanupAllReviewFixtures,
  cleanupReviewByTitle,
  uniqueReviewTitle,
} from "./reviews-fixtures";

/**
 * AI-01 / AI-04 — the AI assistance journeys.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT DO: contact a provider.
 *
 * No paid provider call is required to build, test or ship DalyHub, so no AI
 * request is made here — the local development server has no provider secret,
 * and that is the point rather than a limitation. What these journeys prove is
 * the part that must hold whether or not a key exists, and which no unit test
 * can prove on its own:
 *
 *   - AI is OFF by default, everywhere, and DalyHub is completely usable with it
 *     off — the surface explains itself calmly instead of erroring;
 *   - the AI settings section contains NO field that could store an API key, and
 *     no key is present anywhere in the delivered page;
 *   - the server refuses an AI request when AI is disabled, when the feature is
 *     off, and when no provider is configured — refusal is server-side, not a
 *     hidden button — and the refusal envelope carries a code and a sentence and
 *     nothing else;
 *   - `/ai/apply`, the only path from a proposal to DalyHub data, cannot be
 *     reached without a reviewed proposal;
 *   - every AI surface is accessible and does not overflow from 320px up.
 *
 * The correctness of a model's answer is not an E2E concern and is not asserted
 * here: `test/unit/ai/evaluation.test.ts` holds the schema, citation, date and
 * injection invariants against the checked-in synthetic corpus.
 */

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

function d1Execute(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
}

/**
 * Return AI preferences to the shipped defaults. Deleting the row IS the reset:
 * an absent row means "the defaults", which are AI off, so a crashed run cannot
 * leave AI switched on for the next one.
 */
function resetAiPreferences(): void {
  d1Execute(
    `DELETE FROM workspace_ai_preferences WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
  d1Execute(
    `DELETE FROM ai_usage_requests WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

const ownedMeetings = new Set<string>();
const ownedNotes = new Set<string>();
const ownedReviews = new Set<string>();

async function openAiSettings(page: Page): Promise<void> {
  await gotoFixture(page, "/settings?section=ai");
  await expect(
    page.getByRole("heading", { name: "AI", exact: true }),
  ).toBeVisible();
}

/** Turn AI on through the real control, and wait for the state to come back. */
async function enableAi(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Turn AI on" }).click();
  await expect(page.getByRole("button", { name: "Turn AI off" })).toBeVisible();
}

async function createMeeting(page: Page, title: string): Promise<void> {
  ownedMeetings.add(title);
  await gotoFixture(page, "/new/meeting");
  await page
    .getByRole("form", { name: "New meeting" })
    .getByLabel("Title")
    .fill(title);
  await page.getByLabel("Start date and time").fill("2026-08-04T09:00");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page).toHaveURL(/\/meeting\/[^/?#]+\?tab=meeting$/);
  await waitForInteractive(page);
}

async function createNote(page: Page, title: string): Promise<void> {
  ownedNotes.add(title);
  await gotoFixture(page, "/notes");
  await page.getByRole("link", { name: "New Note" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Note" });
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  await dialog.getByLabel(/Title/).fill(title);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  // The Note detail arrives by CLIENT navigation, so its markup is visible well
  // before React attaches handlers — a tab click in that window is dropped.
  await waitForInteractive(page);
}

test.beforeAll(async () => {
  await cleanupAllMeetingFixtures();
  await cleanupAllNoteFixtures();
  await cleanupAllReviewFixtures();
});

// The `/ai/apply` guard tests deliberately try to create records that must NOT
// exist afterwards, under the shared Meetings prefix. Sweep it once at the end
// so a guard that ever regressed leaves no residue in a developer's local D1.
test.afterAll(async () => {
  await cleanupAllMeetingFixtures();
  await cleanupAllNoteFixtures();
  await cleanupAllReviewFixtures();
});

test.beforeEach(() => resetAiPreferences());

test.afterEach(async () => {
  resetAiPreferences();
  for (const title of ownedMeetings) await cleanupMeetingByTitle(title);
  ownedMeetings.clear();
  for (const title of ownedNotes) await cleanupNoteByTitle(title);
  ownedNotes.clear();
  for (const title of ownedReviews) await cleanupReviewByTitle(title);
  ownedReviews.clear();
});

test.describe("AI-01 — AI is off by default and says so", () => {
  test("Ask DalyHub explains itself instead of failing", async ({ page }) => {
    await gotoFixture(page, "/ai");

    await expect(
      page.getByRole("heading", { level: 1, name: "Ask DalyHub" }),
    ).toBeVisible();
    // The bounded promise is stated on the page itself, not buried in Help.
    await expect(page.getByText("no access to the internet")).toBeVisible();

    // Off by default — and calm about it.
    await expect(
      page.getByText("AI assistance is turned off", { exact: false }),
    ).toBeVisible();
    // No question box is offered while it is off; there is nothing to send.
    await expect(page.getByLabel("Your question")).toHaveCount(0);
    // The way out is a link to Settings, not an error.
    await expect(
      page.getByRole("link", { name: "Open AI settings" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("a Meeting gains an AI tab without disturbing the rest of it", async ({
    page,
  }) => {
    await createMeeting(page, uniqueMeetingTitle("ai-off"));

    await page.getByRole("tab", { name: "AI" }).click();
    await expect(
      page.getByText("AI assistance is turned off", { exact: false }),
    ).toBeVisible();

    // The rest of the Meeting is untouched — the AI tab is purely additive.
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a Note gains an AI tab without disturbing the rest of it", async ({
    page,
  }) => {
    await createNote(page, uniqueNoteTitle("ai-off"));

    await page.getByRole("tab", { name: "AI" }).click();
    await expect(
      page.getByText("AI assistance is turned off", { exact: false }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Note", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Note", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("once enabled, the surface reports the missing provider honestly", async ({
    page,
  }) => {
    await openAiSettings(page);
    await enableAi(page);

    await gotoFixture(page, "/ai");
    // The local server has no provider secret, so this is the true state — and
    // the copy names what is missing rather than showing a generic error.
    await expect(
      page.getByText("No AI provider is configured", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("set up as a server secret", { exact: false }),
    ).toBeVisible();
  });
});

test.describe("AI-01 — the settings section never handles a credential", () => {
  test("offers no field that could store an API key", async ({ page }) => {
    await openAiSettings(page);

    // The decisive assertion: there is no password field and no key input
    // anywhere on the page. A credential manager that cannot read a key back
    // would be a lie about where the secret lives, so none is offered.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    for (const pattern of [/api key/i, /secret/i, /token/i]) {
      await expect(page.getByRole("textbox", { name: pattern })).toHaveCount(0);
    }

    // Instead it states plainly where the key lives and how to change it.
    await expect(
      page.getByText("Provider API keys are server secrets", { exact: false }),
    ).toBeVisible();
    await expect(page.getByText("None", { exact: true }).first()).toBeVisible();

    // And it does not overclaim what the owner may send.
    await expect(
      page.getByText("You remain responsible for your provider account", {
        exact: false,
      }),
    ).toBeVisible();
  });

  test("shows the defaults, and persists a deliberate budget change", async ({
    page,
  }) => {
    await openAiSettings(page);

    // Deep analysis is off by default and never escalates on its own.
    await expect(
      page.getByText("Nothing escalates to it automatically"),
    ).toBeVisible();

    const monthly = page.getByRole("spinbutton", {
      name: "Monthly budget (USD)",
    });
    await expect(monthly).toHaveValue("10");

    await monthly.fill("4.50");
    await monthly.blur();

    await page.reload();
    await expect(
      page.getByRole("spinbutton", { name: "Monthly budget (USD)" }),
    ).toHaveValue("4.5");
  });

  test("no provider credential appears anywhere in the delivered page", async ({
    page,
  }) => {
    await openAiSettings(page);
    const html = await page.content();
    // The shapes a real key takes must never reach the browser. The `sk-` test
    // demands a long UNBROKEN alphanumeric run, so it matches a credential and
    // not a hyphenated class name that happens to contain the letters.
    expect(html).not.toMatch(/(?<![A-Za-z0-9])sk-[A-Za-z0-9]{24,}/);
    expect(html).not.toMatch(/sk-ant-[A-Za-z0-9]/);
    expect(html).not.toMatch(/sk-proj-[A-Za-z0-9]/);
    // Nor may a binding name appear carrying a value.
    expect(html).not.toMatch(/ANTHROPIC_API_KEY\s*[:=]\s*["'][^"']+["']/);
    expect(html).not.toMatch(/OPENAI_API_KEY\s*[:=]\s*["'][^"']+["']/);
    expect(html).not.toMatch(/AI_GATEWAY_TOKEN\s*[:=]\s*["'][^"']+["']/);
  });

  test("is accessible and does not overflow on the narrowest phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openAiSettings(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Turn AI on" }),
    );
  });
});

test.describe("AI-01 — the server refuses, the button is not merely hidden", () => {
  test("refuses an assist request while AI is disabled", async ({
    request,
  }) => {
    const response = await postSameOrigin(request, "/ai/assist", {
      form: {
        feature: "workspace-question-answer",
        question: "What follow-ups do I still owe?",
        idempotencyKey: "e2e-disabled-request",
      },
    });

    const payload = (await response.json()) as {
      ok: boolean;
      code: string;
      message: string;
    };
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("ai_disabled");

    // The envelope carries a code and a sentence — and nothing else. No provider
    // body, no endpoint, no stack, no credential.
    expect(Object.keys(payload).sort()).toEqual(["code", "message", "ok"]);
    expect(payload.message).not.toMatch(/https?:\/\//);
    expect(payload.message).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);

    // AI responses are private and never cached.
    expect(response.headers()["cache-control"]).toContain("no-store");
    // NOTE: the CORS header is deliberately not asserted here. DalyHub adds
    // none, but the Vite DEV server adds one to everything it serves, so an
    // assertion at this origin would be measuring the dev server rather than
    // the application.
  });

  test("refuses an unknown feature before doing any work", async ({
    request,
  }) => {
    const response = await postSameOrigin(request, "/ai/assist", {
      form: {
        feature: "run-arbitrary-prompt",
        idempotencyKey: "e2e-unknown-feature",
      },
    });
    expect(response.status()).toBe(400);
    const payload = (await response.json()) as { ok: boolean };
    expect(payload.ok).toBe(false);
  });

  test("reports the missing provider once AI is enabled", async ({
    page,
    request,
  }) => {
    await openAiSettings(page);
    await enableAi(page);

    const response = await postSameOrigin(request, "/ai/assist", {
      form: {
        feature: "meeting-action-extraction",
        recordId: "does-not-matter",
        idempotencyKey: "e2e-unconfigured-request",
      },
    });
    const payload = (await response.json()) as { ok: boolean; code: string };
    expect(payload.ok).toBe(false);
    // Either the provider is unconfigured or the record does not exist; both are
    // refusals that reach no provider. What must NOT happen is a success.
    expect(payload.code).not.toBe(undefined);
  });

  test("apply refuses an acceptance with nothing in it", async ({
    request,
  }) => {
    const response = await postSameOrigin(request, "/ai/apply", {
      form: {
        intent: "accept",
        usageId: "fabricated-usage-id",
        items: "[]",
      },
    });
    expect(response.status()).toBe(400);
    const payload = (await response.json()) as { ok: boolean };
    expect(payload.ok).toBe(false);
  });

  test("apply refuses an unknown intent", async ({ request }) => {
    const response = await postSameOrigin(request, "/ai/apply", {
      form: { intent: "delete-everything", usageId: "fabricated-usage-id" },
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(false);
  });

  test("apply refuses a Task whose named Project does not exist", async ({
    request,
  }) => {
    const response = await postSameOrigin(request, "/ai/apply", {
      form: {
        intent: "accept",
        usageId: "fabricated-usage-id",
        items: JSON.stringify([
          {
            kind: "task",
            title: `${MEETING_TITLE_PREFIX}apply-guard must never be created`,
            projectId: "no-such-project",
          },
        ]),
      },
    });
    const payload = (await response.json()) as {
      ok: boolean;
      applied?: { ok: boolean; message?: string }[];
    };
    // The parent is re-read at acceptance time, so a Project that has been
    // archived, deleted or was never real refuses the write outright rather
    // than quietly creating an unparented Task the owner did not ask for.
    expect(payload.ok).toBe(false);
    expect(payload.applied?.[0]?.ok).toBe(false);
    expect(payload.applied?.[0]?.message).toContain("no longer available");
  });

  test("apply refuses a Task carrying an impossible date", async ({
    request,
  }) => {
    const response = await postSameOrigin(request, "/ai/apply", {
      form: {
        intent: "accept",
        usageId: "fabricated-usage-id",
        items: JSON.stringify([
          {
            kind: "task",
            title: `${MEETING_TITLE_PREFIX}apply-guard bad date`,
            dueDate: "2026-02-30",
          },
        ]),
      },
    });
    const payload = (await response.json()) as {
      ok: boolean;
      applied?: { ok: boolean; message?: string }[];
    };
    expect(payload.ok).toBe(false);
    expect(payload.applied?.[0]?.message).toContain("real calendar date");
  });

  test("the assist route rejects a GET", async ({ request }) => {
    const response = await request.get("/ai/assist");
    expect(response.ok()).toBe(false);
  });
});

test.describe("AI-01 — the Weekly Review assistant is opt-in and additive", () => {
  test("the Focus step keeps working, with the assistant off to one side", async ({
    page,
  }) => {
    const title = uniqueReviewTitle("ai-focus");
    ownedReviews.add(title);

    await gotoFixture(page, "/reviews/new");
    await page.getByRole("textbox", { name: "Review title" }).fill(title);
    await page.getByRole("button", { name: "Start Review" }).click();
    // `/reviews/new` itself matches a naive `/reviews/<id>` pattern, so gate on
    // the created record's own heading rather than on the URL shape alone.
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await waitForInteractive(page);

    // The step is deep-linkable, so go straight to the one the assistant is on.
    await gotoFixture(page, `${new URL(page.url()).pathname}/guide?step=focus`);
    await expect(
      page.getByRole("heading", { level: 2, name: "Next week’s focus" }),
    ).toBeVisible();

    // The owner's own writing surface is the step — it is present and first.
    await expect(
      page.locator(".dh-review-guide__prompt").first(),
    ).toBeVisible();

    // The assistant is a separate, clearly-labelled region that is off.
    const assistant = page.getByRole("region", { name: "Review assistant" });
    await expect(assistant).toBeVisible();
    await expect(
      assistant.getByText("AI assistance is turned off", { exact: false }),
    ).toBeVisible();
    // Nothing can be generated while it is off.
    await expect(
      assistant.getByRole("button", { name: "Generate assistant summary" }),
    ).toHaveCount(0);

    await expectNoAxeViolations(page);
  });
});

test.describe("AI-01 — responsive and accessible across the phone matrix", () => {
  const phones = RESPONSIVE_VIEWPORTS.filter(
    (viewport) =>
      viewport.label === "mobile-320" ||
      viewport.label === "mobile-375" ||
      viewport.label === "mobile-390" ||
      viewport.label === "mobile-430",
  );

  for (const viewport of phones) {
    test(`Ask DalyHub has no horizontal overflow at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/ai");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("Ask DalyHub passes axe in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/ai");
    await expectNoAxeViolations(page);
  });
});
