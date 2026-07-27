import { expect, test, type Page } from "@playwright/test";

const DEMO_PATH = "/design/feedback";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("DS-10 feedback & inspector — desktop", () => {
  test("raises a notification and dismisses it", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Feedback & Inspector" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Success", exact: true }).click();
    const toast = page.getByRole("group", { name: "Task completed" });
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Dismiss: Task completed" }).click();
    await expect(toast).toBeHidden();
  });

  test("coalesces repeated notifications instead of stacking", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    const repeat = page.getByTestId("notify-coalesce");
    await repeat.click();
    await repeat.click();
    await repeat.click();
    await expect(
      page.getByRole("group", { name: "Message received" }),
    ).toHaveCount(1);
    await expect(page.getByText("×3")).toBeVisible();
  });

  test("keeps an error notification sticky and announces via live region", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    await page.getByRole("button", { name: "Error", exact: true }).click();
    const toast = page.getByRole("group", { name: "Couldn’t save" });
    await expect(toast).toBeVisible();
    // Still present after well past the success/info window (errors are sticky).
    await page.waitForTimeout(1500);
    await expect(toast).toBeVisible();
    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Couldn’t save",
    );
  });

  test("undo restores an optimistically deleted record", async ({ page }) => {
    await page.goto(DEMO_PATH);
    const undoPanel = page.getByTestId("undo-panel");
    await undoPanel.getByRole("button", { name: "Delete" }).first().click();
    // Item removed optimistically; an Undo toast appears.
    await expect(page.getByRole("group", { name: /^Deleted/ })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(undoPanel.getByText("Draft launch plan")).toBeVisible();
  });

  test("runs a background operation to success", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("op-success").click();
    await expect(page.getByText("Working…")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Export ready" }),
    ).toBeVisible();
  });

  test("cancels a cancellable operation", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("op-cancel").click();
    const op = page.getByRole("group", { name: "Syncing calendar" });
    await expect(op).toBeVisible();
    await op.getByRole("button", { name: "Cancel" }).click();
    await expect(op).toBeHidden();
  });

  test("opens a record in the Inspector and closes it", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("inspect-r1").click();
    const panel = page.getByRole("complementary", {
      name: "Draft launch plan",
    });
    await expect(panel).toBeVisible();
    // The URL reflects the open state (deep-linkable).
    await expect(page).toHaveURL(/inspector=edit%3Ar1/);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/inspector=/);
  });

  test("Inspector is deep-linkable and keyboard-resizable", async ({
    page,
  }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r2`);
    await expect(
      page.getByRole("complementary", { name: "Review budget" }),
    ).toBeVisible();
    const separator = page.getByRole("separator", { name: "Resize inspector" });
    const before = Number(await separator.getAttribute("aria-valuenow"));
    // Retry to absorb client-hydration timing (a keydown before the handler
    // attaches is a no-op). Widening is monotonic, so retries stay valid.
    await expect(async () => {
      await separator.focus();
      await page.keyboard.press("ArrowLeft"); // widens the right-anchored panel
      const after = Number(await separator.getAttribute("aria-valuenow"));
      expect(after).toBeGreaterThan(before);
    }).toPass();
  });

  test("no horizontal overflow with the Inspector open", async ({ page }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    await expect(
      page.getByRole("complementary", { name: "Draft launch plan" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-10 feedback & inspector — mobile", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("Inspector becomes a modal sheet on a phone", async ({ page }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    // Compact viewport → the panel is a modal dialog (sheet), not a landmark.
    const sheet = page.getByRole("dialog", { name: "Draft launch plan" });
    await expect(sheet).toBeVisible();
    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("notifications remain usable and don't cause overflow", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Feedback & Inspector" }),
    ).toBeVisible();
    // The coalescing button is idempotent, so retrying past hydration timing
    // can't stack duplicate toasts.
    await expect(async () => {
      await page.getByTestId("notify-coalesce").click();
      await expect(
        page.getByRole("group", { name: "Message received" }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

/**
 * DEBT-38 — the notification region's pointer contract, proven at both the
 * desktop anchor (bottom-right column) and the mobile one (bottom, full-width,
 * safe-area inset). Both overlay the page, so both must be click-through.
 */
for (const layout of [
  { name: "desktop", viewport: { width: 1280, height: 720 } },
  { name: "mobile", viewport: { width: 390, height: 780 } },
] as const) {
  test.describe(`DS-10 feedback — pointer contract (${layout.name})`, () => {
    test.use({ viewport: layout.viewport });

    /**
     * DEBT-38 — the notification region is `position: fixed` over the bottom-right
     * of every page, which is where record lifecycle controls (Archive / Restore /
     * Delete) sit. It must therefore be transparent to the pointer everywhere
     * except its own controls, or a stack of transient confirmations silently eats
     * the next click aimed at the page beneath it. Asserted by real hit-testing —
     * `elementFromPoint` is exactly what the browser (and Playwright's
     * actionability check) uses — so this cannot be satisfied by CSS that only
     * looks right.
     */
    test("the notification stack never intercepts clicks meant for the page", async ({
      page,
    }) => {
      await page.goto(DEMO_PATH);
      // Build a stack that exercises every kind of control the region can show:
      // a warning, a sticky error, and an ACTIONABLE toast (the Undo offered by
      // an optimistic delete). More than one notification also brings up the
      // dismiss-all toolbar, whose full-width empty area was the deterministic
      // half of DEBT-38.
      await page.getByRole("button", { name: "Warning", exact: true }).click();
      await expect(
        page.getByRole("group", { name: "Storage almost full" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Error", exact: true }).click();
      await expect(
        page.getByRole("group", { name: "Couldn’t save" }),
      ).toBeVisible();
      await page
        .getByTestId("undo-panel")
        .getByRole("button", { name: "Delete" })
        .first()
        .click();
      const undo = page.getByRole("button", { name: "Undo" });
      await expect(undo).toBeVisible();

      // Focusing a control in the stack pauses auto-dismiss (DS-10). That freezes
      // the stack for the audit below — and proves the focus-pause contract
      // survived the pointer change, since focus never depended on hit-testing.
      await undo.focus();
      await expect(page.locator(".dh-toast")).toHaveCount(3);
      await expect(page.locator(".dh-feedback__toolbar")).toBeVisible();

      const audit = await page.evaluate(() => {
        const region = document.querySelector<HTMLElement>(".dh-feedback");
        if (!region) return { error: "no region" };
        // The only elements permitted to take pointer input inside the region.
        const controls = Array.from(
          region.querySelectorAll<HTMLElement>(
            ".dh-feedback__dismiss-all, .dh-toast__action, .dh-toast__close",
          ),
        );
        const isAllowed = (node: Element | null) =>
          node !== null && controls.some((control) => control.contains(node));

        const box = region.getBoundingClientRect();
        const blockers: string[] = [];
        // Sample the whole region on a fine grid; every point that hits the region
        // without landing on a control is a pixel that would swallow a click.
        for (let y = box.top + 1; y < box.bottom - 1; y += 4) {
          for (let x = box.left + 1; x < box.right - 1; x += 4) {
            const hit = document.elementFromPoint(x, y);
            if (hit && region.contains(hit) && !isAllowed(hit)) {
              blockers.push(
                `${Math.round(x)},${Math.round(y)} → ${hit.className}`,
              );
            }
          }
        }

        // …and the controls themselves must still be hit-testable at their centre.
        const unreachable = controls
          .map((control) => {
            const r = control.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return hit && control.contains(hit)
              ? null
              : `${control.className} unreachable`;
          })
          .filter((entry): entry is string => entry !== null);

        return {
          controls: controls.length,
          actions: region.querySelectorAll(".dh-toast__action").length,
          blockers,
          unreachable,
        };
      });

      expect(audit.error).toBeUndefined();
      // dismiss-all + three closes + the Undo action.
      expect(audit.controls).toBe(5);
      expect(audit.actions, "the actionable toast keeps its action").toBe(1);
      expect(
        audit.blockers?.slice(0, 8),
        "notification region pixels that would absorb a page click",
      ).toEqual([]);
      expect(
        audit.unreachable,
        "notification controls must stay operable",
      ).toEqual([]);

      // The controls are not merely hit-testable — they still work, with an
      // ordinary click (no force, no coordinates). The actionable toast first:
      await undo.click();
      await expect(
        page.getByTestId("undo-panel").getByText("Draft launch plan"),
      ).toBeVisible();
      // …then the dismiss-all control at the top of the region.
      await page.getByRole("button", { name: "Dismiss all" }).click();
      await expect(page.locator(".dh-toast")).toHaveCount(0);
    });
  });
}

test.describe("DS-10 feedback — reduced motion", () => {
  test("notifications and the Inspector still work with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    await expect(
      page.getByRole("complementary", { name: "Draft launch plan" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Sync scheduled" }),
    ).toBeVisible();
  });
});
