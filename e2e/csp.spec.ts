/**
 * AUDIT-10 — the Content-Security-Policy, driven in a real browser.
 *
 * Three things are proved here, and they are deliberately proved in different
 * places because they are different claims:
 *
 *   1. **The PRODUCTION BUILD emits the enforcing policy** — asserted against the
 *      production-mode server (`vite preview` of the real build, port 4174),
 *      because the dev server's policy is legitimately different and asserting
 *      the dev server would prove nothing about what ships. Both a served
 *      response and a rejected one are checked: a policy that only covers the
 *      happy path is not a policy.
 *
 *   2. **That exact policy blocks injected script** — a browser is handed the
 *      REAL header string the production build just returned, on the production
 *      origin, and then asked to run inline script, an inline event handler, an
 *      external script and a `javascript:` URL. Every one is refused. A nonced
 *      script is also run, so the suite cannot pass by blocking everything.
 *
 *      This is defence in depth, not a replacement: the Markdown sanitiser still
 *      strips every one of these before they can reach the DOM, and nothing in
 *      this file weakens it. The point is that CSP refuses them independently.
 *
 *   3. **Normal authenticated use produces no violation** — the whole application
 *      is driven on the dev server with a `securitypolicyviolation` listener
 *      attached, and every directive shared with production (`img-src`,
 *      `font-src`, `connect-src`, `worker-src`, `style-src-attr`, `frame-src`,
 *      `object-src`, `base-uri`, `form-action`, `manifest-src`) is enforced there
 *      identically. The dev policy adds `'unsafe-inline'`/`'unsafe-eval'` to
 *      `script-src` for Vite, so this run cannot by itself prove script-src
 *      compatibility — which is why it also asserts that every inline script
 *      DalyHub renders carries the response nonce, and therefore survives the
 *      production `script-src`.
 */

import { expect, test, type Page } from "@playwright/test";

import { enterTaskSelection, waitForInteractive } from "./helpers";

const PROD_BASE = "http://localhost:4174";

/** The directives of a policy, as a name → value map. */
function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const space = trimmed.indexOf(" ");
    if (space === -1) map.set(trimmed, "");
    else map.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return map;
}

/** The `nonce-…` source a policy names. */
function nonceOf(policy: string): string {
  const match = /'nonce-([A-Za-z0-9_-]+)'/.exec(policy);
  expect(match, "the policy must name a nonce").not.toBeNull();
  return match![1];
}

/** Assert every AUDIT-10 invariant against one policy string. */
function expectProductionPolicy(policy: string): void {
  const d = directives(policy);
  // A complete source policy — the finding was that there was none.
  expect(d.get("default-src")).toBe("'self'");
  // A restrictive script policy, with no production escape hatch.
  expect(d.get("script-src")).toMatch(/^'self' 'nonce-[A-Za-z0-9_-]+'$/);
  expect(policy).not.toContain("unsafe-eval");
  expect(d.get("script-src")).not.toContain("'unsafe-inline'");
  // Plugins, framing and embedding.
  expect(d.get("object-src")).toBe("'none'");
  expect(d.get("frame-ancestors")).toBe("'none'");
  expect(d.get("frame-src")).toBe("'none'");
  expect(d.get("base-uri")).toBe("'none'");
  expect(d.get("form-action")).toBe("'self'");
  // The service worker, named explicitly rather than inherited.
  expect(d.get("worker-src")).toBe("'self'");
  expect(d.get("manifest-src")).toBe("'self'");
  // Only the approved connect/image/font/style sources.
  expect(d.get("connect-src")).toBe("'self'");
  expect(d.get("img-src")).toBe("'self' data: https:");
  expect(d.get("font-src")).toBe("'self'");
  expect(d.get("style-src")).toMatch(/^'self' 'nonce-[A-Za-z0-9_-]+'$/);
  expect(d.get("style-src-attr")).toBe("'unsafe-inline'");
}

test.describe("AUDIT-10 — the production build's security headers", () => {
  test("a served response carries the enforcing policy", async ({
    request,
  }) => {
    const response = await request.get(`${PROD_BASE}/health`);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expectProductionPolicy(headers["content-security-policy"] ?? "");
    // Enforcing, not report-only. AUDIT-10 is not resolved by a policy that
    // watches an attack happen.
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });

  test("a REJECTED response carries the same policy", async ({ request }) => {
    // The production-mode server runs Cloudflare Access mode with no configured
    // Access application, so every protected request fails closed. That is the
    // response an attacker is most likely to see, and it is still a document.
    const response = await request.get(`${PROD_BASE}/today`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expectProductionPolicy(response.headers()["content-security-policy"] ?? "");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  });

  test("mints a distinct nonce per response", async ({ request }) => {
    const seen = new Set<string>();
    for (let index = 0; index < 4; index += 1) {
      const policy =
        (await request.get(`${PROD_BASE}/health`)).headers()[
          "content-security-policy"
        ] ?? "";
      const nonce = nonceOf(policy);
      expect(seen.has(nonce)).toBe(false);
      seen.add(nonce);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Attack regression: the shipped policy, exercised by a browser               */
/* -------------------------------------------------------------------------- */

/** Collect `securitypolicyviolation` events as the page reports them. */
async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (
        window as unknown as {
          __cspViolations: { directive: string; blocked: string }[];
        }
      ).__cspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      });
    });
  });
}

/** What the page has recorded so far. */
function violations(
  page: Page,
): Promise<{ directive: string; blocked: string }[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __cspViolations: { directive: string; blocked: string }[];
        }
      ).__cspViolations ?? [],
  );
}

test.describe("AUDIT-10 — the shipped policy refuses executable content", () => {
  /*
   * The document under test is a fixture, but the POLICY is not: it is the exact
   * header string the production build returned a moment earlier, served on the
   * production origin. So what is being tested is the policy DalyHub ships,
   * enforced by a real browser — with a page simple enough that a failure names
   * the directive rather than a framework.
   */
  test("blocks inline script, event handlers, foreign script and javascript: URLs", async ({
    page,
    request,
  }) => {
    const policy =
      (await request.get(`${PROD_BASE}/health`)).headers()[
        "content-security-policy"
      ] ?? "";
    expectProductionPolicy(policy);
    const nonce = nonceOf(policy);

    await watchViolations(page);
    await page.route(`${PROD_BASE}/__csp-fixture`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": policy,
        },
        body: `<!doctype html><html lang="en"><head><title>CSP</title></head><body>
          <div id="sink"></div>
          <script nonce="${nonce}">window.__nonced = true;</script>
        </body></html>`,
      });
    });

    await page.goto(`${PROD_BASE}/__csp-fixture`);

    // The control: a script DalyHub itself rendered, carrying the response
    // nonce, DOES run. Without this the suite could pass by blocking everything.
    expect(
      await page.evaluate(
        () => (window as unknown as { __nonced?: boolean }).__nonced === true,
      ),
    ).toBe(true);

    // 1. An injected inline <script> with no nonce.
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__injected = true;";
      document.body.appendChild(script);
    });

    // 2. An inline event handler, the classic sanitiser-bypass shape.
    await page.evaluate(() => {
      const sink = document.getElementById("sink")!;
      sink.innerHTML =
        '<button id="evil" onclick="window.__handler = true">x</button>';
    });
    await page.locator("#evil").click();

    // 3. A script from an origin the policy does not allow.
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.src = "https://cdn.example.invalid/evil.js";
      document.body.appendChild(script);
    });

    // 4. A `javascript:` URL, navigated by an anchor.
    await page.evaluate(() => {
      const link = document.createElement("a");
      link.id = "js-url";
      link.href = "javascript:window.__jsurl = true";
      link.textContent = "go";
      document.body.appendChild(link);
      link.click();
    });

    await page.waitForTimeout(500);

    // Nothing executed.
    const executed = await page.evaluate(() => ({
      injected:
        (window as unknown as { __injected?: boolean }).__injected === true,
      handler:
        (window as unknown as { __handler?: boolean }).__handler === true,
      jsurl: (window as unknown as { __jsurl?: boolean }).__jsurl === true,
    }));
    expect(executed).toEqual({
      injected: false,
      handler: false,
      jsurl: false,
    });

    // And the browser said WHY, each time, against a script directive.
    const reported = await violations(page);
    expect(reported.length).toBeGreaterThanOrEqual(4);
    for (const violation of reported) {
      expect(violation.directive).toMatch(/^script-src/);
    }
    // The external source is named, so this cannot pass on inline blocks alone.
    expect(
      reported.some((violation) =>
        violation.blocked.includes("cdn.example.invalid"),
      ),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Normal use produces no violation                                            */
/* -------------------------------------------------------------------------- */

/** The surfaces a normal session actually touches. */
const JOURNEY_PATHS = [
  "/today",
  "/tasks",
  "/projects",
  "/areas",
  "/goals",
  "/notes",
  "/meetings",
  "/people",
  "/assets",
  "/diary",
  "/reviews",
  "/search?q=task",
  "/settings",
  "/settings?section=account-security",
  "/settings?section=offline",
  "/settings?section=privacy-data",
  "/about",
  "/help",
];

test.describe("AUDIT-10 — normal application use raises no CSP violation", () => {
  test("every primary surface loads cleanly under the enforcing policy", async ({
    page,
  }) => {
    // Eighteen route modules, each compiled on first request by the dev server.
    // The budget is for the compile, not for the assertions.
    test.setTimeout(240_000);
    await watchViolations(page);

    for (const path of JOURNEY_PATHS) {
      await page.goto(path);
      await waitForInteractive(page);
      const reported = await violations(page);
      expect(
        reported,
        `${path} raised a CSP violation: ${JSON.stringify(reported)}`,
      ).toEqual([]);
    }
  });

  test("the command palette, drawer and a dialog raise none either", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await watchViolations(page);
    await page.goto("/tasks");
    await waitForInteractive(page);

    // The command palette (the shell's keyboard surface).
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // A confirmation dialog, from the Account & security surface, which is the
    // one place this PR added new interactive chrome.
    await page.goto("/settings?section=account-security");
    await waitForInteractive(page);
    await page.getByRole("button", { name: /Clear personal data…/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /Cancel/ }).click();

    expect(await violations(page)).toEqual([]);
  });

  test("the Tasks daily driver's dynamic chrome raises none either", async ({
    page,
  }) => {
    /*
     * The resting-surface sweep above proves the pages LOAD cleanly. It cannot
     * prove anything about chrome that is only constructed once a person starts
     * working, and V2.2 put a lot of DalyHub's newest UI there: DS-16 anchored
     * inline menus and date popovers on the row, a bulk action bar, a custom
     * recurrence editor, and — on a phone — the shared Sheet. Every one of them
     * mounts after hydration and several position themselves with inline styles,
     * which is exactly the shape `style-src` refuses if the nonce discipline
     * ever slips.
     */
    test.setTimeout(180_000);
    await watchViolations(page);

    await page.goto("/tasks?view=list&system=all");
    await waitForInteractive(page);

    // An inline priority menu, anchored and opened on the row.
    const row = page.getByRole("article").first();
    await row.hover();
    await row
      .getByRole("button", { name: /^Priority/ })
      .first()
      .click();
    await expect(page.getByRole("menu").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Selection mode and the bulk action bar.
    await enterTaskSelection(page);
    await page
      .getByRole("checkbox", { name: /^Select / })
      .first()
      .check();
    await expect(
      page.getByRole("group", { name: "Bulk task actions" }),
    ).toBeVisible();
    await page
      .getByRole("group", { name: "Bulk task actions" })
      .getByRole("button", { name: "Done" })
      .click();

    // The same surfaces on a phone, where the shared Sheet replaces the
    // anchored presentations.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tasks?view=list&system=all");
    await waitForInteractive(page);
    await page.getByTestId("collection-filter-trigger").click();
    await expect(page.getByTestId("collection-sheet")).toBeVisible();
    await page.keyboard.press("Escape");

    expect(await violations(page)).toEqual([]);
  });

  test("the Notes writing surface injects its stylesheet with the nonce", async ({
    page,
  }) => {
    // CodeMirror builds its theme as a runtime `<style>` element (`style-mod`).
    // Under `style-src 'self' 'nonce-…'` that element is refused without the
    // nonce, and an editor with no stylesheet is unusable — so this is the one
    // runtime style injection in the product and it gets its own check.
    //
    // The cold mount compiles the code-split CodeMirror chunk, which is slow
    // once per dev server; the budget mirrors `notes.spec.ts`.
    test.setTimeout(120_000);
    await watchViolations(page);
    await page.goto("/notes?drawer=new-note");
    await expect(page.getByRole("dialog", { name: "New Note" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("dialog", { name: "New Note" })
      .getByLabel("Title")
      .fill(`CSP editor check ${Date.now()}`);
    await page
      .getByRole("dialog", { name: "New Note" })
      .getByRole("button", { name: /^Create/ })
      .click();
    await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
      timeout: 90_000,
    });

    expect(await violations(page)).toEqual([]);
    // The theme really did land — an editor whose stylesheet was refused would
    // still be "ready" and would be unusable.
    expect(
      await page.evaluate(() => document.querySelectorAll("style").length),
    ).toBeGreaterThan(0);
  });

  /*
   * The bridge between this dev-server run and production. The dev policy allows
   * `'unsafe-inline'` for Vite's own preamble, so a violation-free dev run does
   * not by itself prove the production `script-src` is satisfiable. What does
   * prove it: every inline script DALYHUB renders carries the response nonce, and
   * the production policy admits exactly those.
   */
  test("every DalyHub-rendered inline script carries the response nonce", async ({
    page,
  }) => {
    await page.goto("/today");

    const unnonced = await page.evaluate(() => {
      // Vite's dev server injects its own preamble and HMR client, neither of
      // which exists in a build. Everything else is DalyHub's.
      const isViteOwn = (script: HTMLScriptElement) =>
        script.textContent?.includes("/@vite/client") === true ||
        script.textContent?.includes("@react-refresh") === true ||
        script.textContent?.includes("__vite__") === true;
      return [...document.querySelectorAll("script")]
        .filter((script) => !script.src && (script.textContent ?? "").trim())
        .filter((script) => !isViteOwn(script as HTMLScriptElement))
        .filter((script) => !script.nonce)
        .map((script) => (script.textContent ?? "").slice(0, 80));
    });
    expect(unnonced, "an inline script would be refused in production").toEqual(
      [],
    );

    // …and every one of them carries the SAME nonce, which is what makes them a
    // single response's scripts rather than a mixture.
    const nonced = await page.evaluate(
      () =>
        [...document.querySelectorAll("script")]
          .map((script) => script.nonce)
          .filter(Boolean) as string[],
    );
    expect(nonced.length).toBeGreaterThan(0);
    expect(new Set(nonced).size).toBe(1);
  });
});
