/**
 * PWA — the review screenshots.
 *
 * Mirrors the established `*-screenshots.spec.ts` fixtures: it drives the real
 * application and writes PNGs into `test-results/pwa-screenshots/` so a reviewer
 * can see what shipped at desktop and iPhone dimensions without installing
 * anything. It asserts nothing beyond "the surface rendered" — the behavioural
 * assertions live in `pwa-offline.spec.ts`.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const OUTPUT = join(process.cwd(), "test-results", "pwa-screenshots");

const DESKTOP = { width: 1440, height: 900 };
/** iPhone 15/16 logical resolution. */
const IPHONE = { width: 393, height: 852 };

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUTPUT, `${name}.png`),
    fullPage: true,
  });
}

/**
 * Wait until a DalyHub service worker is ACTIVE and controlling the page.
 *
 * `serviceWorker.ready` resolves when a worker is activated; the controller
 * check then confirms this document is actually under its control (activation
 * and control are separate steps, and only the second one makes the navigation
 * fallback apply). The timeout is generous because the dev server compiles the
 * offline shell on demand during the worker's install, which on a cold server is
 * genuinely slow — a shorter timeout would produce a flaky test, not a faster one.
 */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      navigator.serviceWorker.ready.then(() => {
        if (navigator.serviceWorker.controller) return;
        return new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          );
        });
      }),
    undefined,
  );
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 60_000 },
  );
}

/** Wait until the offline database holds a snapshot. */
async function waitForSnapshot(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("dalyhub-offline");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (!database.objectStoreNames.contains("meta")) {
            database.close();
            return 0;
          }
          const rows = await new Promise<unknown[]>((resolve, reject) => {
            const request = database
              .transaction("meta", "readonly")
              .objectStore("meta")
              .getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return rows.length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

test("captures the PWA review screenshots", async ({ page, context }) => {
  await page.setViewportSize(DESKTOP);

  // The icon review surface, at every shipped size and under each mask.
  await page.goto("/design/app-icon");
  await expect(
    page.getByRole("heading", { level: 1, name: "DalyHub app icon" }),
  ).toBeVisible();
  await shoot(page, "icon-review-desktop");

  // Settings → Offline & app, online and healthy.
  await page.goto("/today");
  await waitForServiceWorker(page);
  await waitForSnapshot(page);
  await page.goto("/settings?section=offline");
  await expect(
    page.getByRole("heading", { name: "Offline & app" }),
  ).toBeVisible();
  await shoot(page, "settings-offline-desktop");

  // The offline surface, online (so the snapshot renders from IndexedDB).
  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
  ).toBeVisible();
  await shoot(page, "offline-page-desktop");

  // iPhone dimensions.
  await page.setViewportSize(IPHONE);
  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
  ).toBeVisible();
  await shoot(page, "offline-page-iphone");

  await page.goto("/settings?section=offline");
  await expect(
    page.getByRole("heading", { name: "Offline & app" }),
  ).toBeVisible();
  await shoot(page, "settings-offline-iphone");

  // A genuinely disconnected launch: the service worker's navigation fallback.
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
  ).toBeVisible();
  await shoot(page, "offline-fallback-iphone");

  await page.setViewportSize(DESKTOP);
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "DalyHub offline" }),
  ).toBeVisible();
  await shoot(page, "offline-fallback-desktop");

  await context.unroute("**/*");
  await context.setOffline(false);
});
