import { chromium } from "@playwright/test";
const OUT =
  "/tmp/claude-0/-home-user-DalyHub-V2/2d897a19-3698-56bd-9274-78bcf2fa4b0e/scratchpad/shots";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
for (const [name, width] of [
  ["finance-320", 320],
  ["finance-375", 375],
  ["finance-430", 430],
  ["finance-768", 768],
  ["finance-1024", 1024],
  ["finance-1920", 1920],
]) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    hasTouch: width < 500,
    isMobile: width < 500,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/finance", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1200);
  const o = await page.evaluate(() => ({
    s: document.documentElement.scrollWidth,
    c: document.documentElement.clientWidth,
  }));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(
    `${name.padEnd(16)} ${o.s > o.c ? `OVERFLOW ${o.s}>${o.c}` : "no overflow"}`,
  );
  await context.close();
}
await browser.close();
