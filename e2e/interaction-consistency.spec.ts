import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  TOUCH_TARGET_MIN,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRows,
} from "./helpers";

/**
 * M3-INT — the interaction contract, measured in a real browser.
 *
 * Three things the audit asked for, each verified where the CSS actually
 * resolves rather than where it is written:
 *
 *   - the shared STATE LAYER reaches hover, focus, pressed, selected and
 *     disabled on the reusable primitives (finding 3);
 *   - SETTINGS uses one selection control, and the PR #124 combobox behaviour
 *     survives the migration (finding 6);
 *   - the shared SWITCH is a real checkbox with a real target (finding 8).
 *
 * The state-layer assertions read the `::after` pseudo-element's computed
 * opacity. That is the one place the contract is observable: a rule can be
 * present and overridden, a class can be applied to the wrong element, and a
 * `background` assertion would pass against a hand-rolled fill — the layer's
 * own opacity passes only if the shared implementation is the thing running.
 */

/** The computed opacity of a host's state layer, right now. */
async function layerOpacity(locator: Locator): Promise<number> {
  return locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element, "::after").opacity || "0"),
  );
}

/**
 * The layer is a REAL BOX, and hovering it changes what is on screen.
 *
 * Every other assertion in this file measures `getComputedStyle(el,
 * "::after").opacity` — and that number is returned whether or not the
 * pseudo-element is GENERATED. `base.css` said `content: none` from M3-INT
 * until 2026-08-25, so for that whole time the shared state layer painted
 * nothing on any host and every opacity assertion here passed anyway: MEASURED
 * on `/design/forms`, a hovered shared Button reported
 * `{content: "none", opacity: "0.08", width: "auto", height: "auto"}` — an
 * opacity on nothing. It was found by review, not by this suite.
 *
 * So one assertion in this file has to be about PIXELS. It is called from the
 * canonical shared-button test and from the module-chrome test, which is enough
 * to prove the implementation is running; the rest can then measure opacity,
 * which is the precise instrument once the box is known to exist.
 */
async function expectLayerPaints(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const generated = await locator.evaluate((element) => {
    const layer = getComputedStyle(element, "::after");
    return { content: layer.content, width: layer.width, height: layer.height };
  });
  expect(
    generated.content,
    "the state layer's `content` is `none`, so the pseudo-element is not " +
      "generated and nothing paints — every opacity assertion in this file " +
      'would still pass. Use `content: ""`.',
  ).not.toBe("none");
  expect(generated.width).not.toBe("auto");
  expect(generated.height).not.toBe("auto");

  await page.mouse.move(0, 0);
  const rest = (await locator.screenshot()).toString("base64");
  await locator.hover();
  await expect
    .poll(async () => (await locator.screenshot()).toString("base64"), {
      timeout: 2_000,
    })
    .not.toBe(rest);

  /*
   * Leave the control RESTING, and settled.
   *
   * The layer transitions, so a caller that moves the mouse away and samples
   * immediately lands mid-animation on a value it is leaving — which is the
   * trap this file's own "Polled, not sampled" comment records for the pressed
   * state. A helper that leaves a control hovered would hand that trap to
   * every caller, so this one waits until the layer is back at zero.
   */
  await page.mouse.move(0, 0);
  await expect.poll(() => layerOpacity(locator), { timeout: 2_000 }).toBe(0);
}

test.describe("M3-INT — the shared state layer", () => {
  test("hover, focus and pressed all light the layer on a shared button", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/forms");

    const button = page.getByRole("button", { name: "Save" }).first();
    await expect(button).toBeVisible();

    // The one assertion in this file that is about PIXELS — see the helper.
    await expectLayerPaints(page, button);

    // Rest: no layer at all.
    expect(await layerOpacity(button)).toBe(0);

    // Hover: M3's 8%.
    await button.hover();
    await expect
      .poll(() => layerOpacity(button), { timeout: 2_000 })
      .toBeGreaterThan(0.05);

    // Focus: the keyboard user gets a layer too, not only the pointer user.
    await page.mouse.move(0, 0);
    await button.focus();
    await expect
      .poll(() => layerOpacity(button), { timeout: 2_000 })
      .toBeGreaterThan(0.05);

    // Pressed: strictly stronger than hover — the state the hand-rolled
    // implementations almost universally lacked.
    //
    // The blur matters. This test just focused the button, and `:focus-visible`
    // carries M3's focus opacity (0.1), which is the same number as pressed —
    // so measuring "hover" on a still-focused control compares 0.1 with 0.1 and
    // proves nothing. Dropping focus first is what makes the comparison real.
    await button.evaluate((element: HTMLElement) => element.blur());
    await page.mouse.move(0, 0);
    await button.hover();
    const hoverOpacity = await layerOpacity(button);
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Polled, not sampled: the layer TRANSITIONS between opacities, so an
    // immediate read lands mid-animation on the value it is leaving.
    await expect
      .poll(() => layerOpacity(button), { timeout: 2_000 })
      .toBeGreaterThan(hoverOpacity);
    await page.mouse.up();
  });

  test("a disabled control has no state layer at all", async ({ page }) => {
    /*
     * DEBT-200 — this used to `test.skip()` when it found no disabled button,
     * which it did on every run: `/design/forms` documented every disabled
     * FIELD and no disabled BUTTON, so the one claim about the disabled state
     * layer had never once been checked in the product. The fixture now shows
     * the state it is meant to document, and the guard is an assertion.
     */
    await gotoFixture(page, "/design/forms");
    const disabled = page.locator("button.dh-btn:disabled");
    expect(
      await disabled.count(),
      "`/design/forms` must document the disabled button state; without it " +
        "this journey asserts nothing (DEBT-200)",
    ).toBeGreaterThan(0);

    // Every variant, not just the first: the rule is that INERT means no layer,
    // and a variant that painted its own disabled hover would pass a
    // first-only check.
    for (let index = 0; index < (await disabled.count()); index += 1) {
      const control = disabled.nth(index);
      await control.hover({ force: true });
      expect(
        await layerOpacity(control),
        `disabled control ${index} paints a state layer on hover`,
      ).toBe(0);
      await page.mouse.move(0, 0);
    }
  });

  test("the module-level chrome DEBT-99 converted are hosts too", async ({
    page,
  }) => {
    /*
     * DEBT-99 — twenty-six module-level controls hand-rolled their own hover
     * fill: `background: color-mix(in srgb, var(--dh-color-text) 8%,
     * transparent)`, written out again in each of nineteen stylesheets. They
     * agreed because their authors read the same rule; nothing made them agree
     * tomorrow, and none of them had a FOCUS or a PRESSED state — which is a
     * hover-only affordance, and AGENTS.md §15 rules those out.
     *
     * Two of the converted controls, on two different surfaces, measured the
     * way the rest of this file measures: the LAYER's own opacity, not a
     * `background` — because a hand-rolled fill would satisfy a background
     * assertion and this one passes only if the shared implementation is what
     * is running. FOCUS is asserted, not hover, because focus is the state
     * these controls did not have before.
     */
    await gotoFixture(page, "/help");
    const contentsLink = page.locator("a.dh-help__contents-link").first();
    await expect(contentsLink).toBeVisible();
    // A converted control paints, rather than merely computing an opacity.
    await expectLayerPaints(page, contentsLink);
    expect(await layerOpacity(contentsLink)).toBe(0);
    await contentsLink.hover();
    await expect
      .poll(() => layerOpacity(contentsLink), { timeout: 2_000 })
      .toBeGreaterThan(0.05);
    await page.mouse.move(0, 0);

    // The keyboard half — the state the hand-rolled rules did not have at all.
    await contentsLink.focus();
    await expect
      .poll(() => layerOpacity(contentsLink), { timeout: 2_000 })
      .toBeGreaterThan(0.05);

    // A second surface and a second converted control — the shared Drawer's
    // close button, reached the way an owner reaches it.
    await gotoFixture(page, "/tasks");
    await taskRows(page).first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const drawerClose = drawer.locator("button.drawer__close");
    await expect(drawerClose).toBeVisible();
    expect(await layerOpacity(drawerClose)).toBe(0);
    await drawerClose.hover();
    await expect
      .poll(() => layerOpacity(drawerClose), { timeout: 2_000 })
      .toBeGreaterThan(0.05);
  });

  test("the record header's own controls are hosts too", async ({ page }) => {
    await gotoFixture(page, "/design/record-layout");
    const region = page.getByRole("region", {
      name: "Short title record",
      exact: true,
    });

    for (const control of [
      region.getByRole("button", { name: "Complete project" }),
      region.getByRole("button", { name: "Link" }),
      region.getByRole("button", { name: /More actions/ }),
    ]) {
      expect(await layerOpacity(control)).toBe(0);
      await control.hover();
      await expect
        .poll(() => layerOpacity(control), { timeout: 2_000 })
        .toBeGreaterThan(0.05);
      await page.mouse.move(0, 0);
    }
  });

  test("SELECTED is a container change, not an opacity", async ({ page }) => {
    await gotoFixture(page, "/design/record-layout");
    const active = page.getByRole("tab", { selected: true }).first();
    // A selected control states its state in `aria-*` and in a real container
    // colour, so it survives forced colours and a colour-blind reader; the
    // state layer only ever composes on top of that.
    await expect(active).toHaveAttribute("aria-selected", "true");
  });

  test("respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoFixture(page, "/design/forms");
    const button = page.getByRole("button", { name: "Save" }).first();
    const duration = await button.evaluate(
      (element) => getComputedStyle(element, "::after").transitionDuration,
    );
    // The global reduced-motion rule zeroes it; the layer still CHANGES, it just
    // does not animate.
    expect(duration.startsWith("0")).toBe(true);
    await button.hover();
    await expect
      .poll(() => layerOpacity(button), { timeout: 2_000 })
      .toBeGreaterThan(0.05);
  });

  test("Tab order is unchanged by the layer (it is a pseudo-element)", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/record-layout");
    const stops: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(
          () => document.activeElement?.tagName.toLowerCase() ?? "",
        ),
      );
    }
    // Nothing non-interactive ever receives focus.
    expect(stops.every((tag) => tag !== "span" && tag !== "div")).toBe(true);
  });
});

test.describe("M3-INT — one selection control in Settings", () => {
  /*
   * "Default landing page" is a REAL preference: it decides where `/` sends the
   * owner, and `px-03-navigation.spec.ts` asserts that destination. A test that
   * changed it and then failed before putting it back took an unrelated spec
   * down with it — which is what happened while this file was being written.
   *
   * The test still restores its own value; this restores it again afterwards,
   * unconditionally, so a mid-test failure cannot leak. `Today` is the value the
   * suite's seeded workspace starts from, and every other spec assumes it.
   */
  test.afterEach(async ({ page }) => {
    await gotoFixture(page, "/settings");
    const combo = page.getByRole("combobox", { name: "Default landing page" });
    if ((await combo.inputValue()) === "Today") return;
    await combo.click();
    await page.getByRole("option", { name: "Today", exact: true }).click();
    await expect(combo).toHaveValue("Today");
  });

  async function openGeneralSettings(page: Page) {
    await gotoFixture(page, "/settings");
    await expect(
      page.getByRole("heading", { name: /General|Settings/ }).first(),
    ).toBeVisible();
  }

  test("no native select survives in the Settings panel", async ({ page }) => {
    await openGeneralSettings(page);
    // The divergence the audit recorded: native `<select>` chrome sitting
    // directly above the shared combobox in one panel.
    expect(await page.locator("main select").count()).toBe(0);
    expect(await page.getByRole("combobox").count()).toBeGreaterThan(0);
  });

  test("a settings select still saves immediately, and keeps PR #124 behaviour", async ({
    page,
  }) => {
    await openGeneralSettings(page);

    const combo = page.getByRole("combobox", { name: "Default landing page" });
    await expect(combo).toBeVisible();
    const before = await combo.inputValue();

    // Reopening a control that already HAS a value offers the whole list —
    // the current value must not act as a search filter (PR #124).
    await combo.click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThan(1);

    // Another value can be chosen directly, with no clearing step first.
    const other = options.filter({ hasNotText: before }).first();
    const otherLabel = (await other.textContent())?.trim() ?? "";
    await other.click();
    await expect(combo).toHaveValue(otherLabel);
    await expect(page.getByText("Saved").first()).toBeVisible();

    // Escape closes without changing anything, and focus comes back.
    await combo.click();
    await expect(options.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(combo).toBeFocused();
    await expect(combo).toHaveValue(otherLabel);

    /*
     * Put it back so the suite leaves no trace.
     *
     * Reopened with ArrowDown rather than a second click, and that is the
     * control's real behaviour rather than a workaround: the list opens on
     * FOCUS, and after Escape the input is still focused, so clicking it fires
     * no focus event and nothing happens. ArrowDown is the combobox's own
     * documented affordance for reopening. (Unchanged by this PR — it is PR
     * #124's model, and worth stating here so the next reader does not mistake
     * it for something the migration introduced.)
     */
    await combo.press("ArrowDown");
    await expect(options.first()).toBeVisible();
    await options.filter({ hasText: before }).first().click();
    await expect(combo).toHaveValue(before);
  });

  test("the settings panel is axe-clean in both appearances", async ({
    page,
  }) => {
    await openGeneralSettings(page);
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("M3-INT — the shared switch", () => {
  /*
   * The switch this suite exercises is a REAL preference: which modules appear
   * in navigation. Toggling it changes shared state that other specs depend on
   * (`areas.spec.ts` clicks the sidebar's "Areas" link), so a test that fails
   * half way through would otherwise leave the module hidden and take unrelated
   * specs down with it — which is exactly what happened while this file was
   * being written.
   *
   * `afterEach` restores every row through the product's own "Reset navigation"
   * control, unconditionally. It runs after a FAILURE as well as after a pass,
   * which is the whole point: the individual tests still put their own toggle
   * back, and this is the net that catches them when they cannot.
   */
  test.afterEach(async ({ page }) => {
    await gotoFixture(page, "/settings?section=navigation");
    await page.getByRole("button", { name: "Reset navigation" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
  });

  test("is a real switch with a real target, and persists", async ({
    page,
  }) => {
    // The product's immediate boolean preferences: which modules appear in
    // navigation. Each takes effect on toggle, which is what makes it a switch.
    await gotoFixture(page, "/settings?section=navigation");

    const toggle = page.locator("input[role='switch']:not(:disabled)").first();
    await expect(toggle).toBeAttached();

    // Accessible name comes from the row's own visible label.
    const name = await toggle.getAttribute("aria-labelledby");
    expect(name).toBeTruthy();

    // ≥44px pointer target — measured on the LABEL, which is the target: the
    // input itself is visually hidden so the switch graphic can be drawn, the
    // same pattern every checkbox in the product already uses.
    const label = page
      .locator(`label[for="${await toggle.getAttribute("id")}"]`)
      .first();
    await expectMinTouchTarget(label);
    const box = (await label.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN - 1);

    const initial = await toggle.isChecked();

    // Space toggles it, with no key handling in the component.
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked({ checked: !initial });
    await expect(page.getByText("Saved").first()).toBeVisible();

    // It survives a reload — the setting really was applied.
    await page.reload();
    const after = page.locator("input[role='switch']:not(:disabled)").first();
    await expect(after).toBeChecked({ checked: !initial });

    // Put it back.
    await page
      .locator(`label[for="${await after.getAttribute("id")}"]`)
      .first()
      .click();
    await expect(after).toBeChecked({ checked: initial });
  });

  test("a disabled switch cannot be toggled", async ({ page }) => {
    await gotoFixture(page, "/settings?section=navigation");
    // DEBT-200 — an assertion, not an exit. `today` and `settings` are
    // MANDATORY_NAVIGATION_MODULES, so their rows are always disabled; a guard
    // here could only ever hide the disappearance of that guarantee.
    const disabled = page.locator("input[role='switch']:disabled").first();
    await expect(disabled).toBeAttached();
    const before = await disabled.isChecked();
    await page
      .locator(`label[for="${await disabled.getAttribute("id")}"]`)
      .first()
      .click({ force: true });
    await expect(disabled).toBeChecked({ checked: before });
  });

  test("states its value without relying on colour", async ({ page }) => {
    await gotoFixture(page, "/design/settings");
    const host = page.getByTestId("toggle-compact");
    const toggle = host.locator("input[role='switch']");
    const target = host.locator("label");
    await expect(target).toBeVisible();

    const thumbX = async () =>
      page
        .getByTestId("toggle-compact")
        .locator(".dh-switch__thumb")
        .evaluate((element) => element.getBoundingClientRect().x);
    const checkOpacity = async () =>
      page
        .getByTestId("toggle-compact")
        .locator(".dh-switch__check")
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).opacity),
        );

    const offX = await thumbX();
    expect(await checkOpacity()).toBeLessThan(0.5);

    await target.click();
    await expect(toggle).toBeChecked();
    /*
     * Position AND glyph, not just a colour.
     *
     * Both are POLLED, because both are animated. The thumb slides on a token
     * transition, so `toBeChecked()` resolves the moment the input's state
     * flips — a frame or more before the thumb has gone anywhere. A single
     * sample there reads the OFF position and fails with `Expected: > 1173,
     * Received: 1173`, which is what a contended CI runner produced. The
     * opacity assertion below already polled for exactly this reason; the
     * position one was the half that did not.
     */
    await expect.poll(thumbX, { timeout: 2_000 }).toBeGreaterThan(offX);
    await expect.poll(checkOpacity, { timeout: 2_000 }).toBeGreaterThan(0.5);
  });

  test("is axe-clean in both appearances", async ({ page }) => {
    await gotoFixture(page, "/design/settings");
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
  });
});
