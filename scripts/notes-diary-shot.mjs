/**
 * UNTITLED-12 — the Notes and Diary shooter and MEASURER.
 *
 * A sibling of `ux-02-shot.mjs`, narrowed to the surfaces this pass owns and
 * widened in the dimension a WRITING pass has to measure: it does not only
 * photograph the screens, it reports the writing MEASURE — the rendered width of
 * the document column and of the editor's own text — because "does the writing
 * dominate?" is a question with a number behind it, and a column that measures
 * 950px is not a reading column whatever it looks like in a screenshot.
 *
 * Appearance is forced through the product's OWN switch (`data-appearance`), for
 * the reason REDESIGN-03 documented: Playwright's `colorScheme` only sets
 * `prefers-color-scheme`, and the theme keys its dark blocks on the stored
 * preference the server writes onto `<html>`. A "dark" capture taken any other
 * way is evidence of nothing.
 *
 * Not part of the gate, and not a test: it asserts nothing. It needs the
 * `notes-diary-seed.mjs` fixture, or every surface it photographs is an empty
 * state.
 *
 *   node scripts/notes-diary-seed.mjs
 *   node scripts/notes-diary-shot.mjs --out /tmp/nd/before
 *   node scripts/notes-diary-shot.mjs --measure 1        (numbers only)
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/notes-diary";
const BASE = args.get("base") ?? "http://localhost:4173";
const MEASURE_ONLY = args.get("measure") === "1";
const ONLY = args.get("only") ?? null;
const SCHEME_ARG = args.get("scheme") ?? null;

if (!MEASURE_ONLY) mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * The review matrix.
 *
 * 1440 and 1280 are the two laptop widths the design system reviews at, 1024 is
 * where the Notes rail is deliberately absent, 820 the tablet, 393 the reference
 * phone and 320 the narrowest viewport the product supports.
 */
const SURFACES = [
  { slug: "notes", path: "/notes", widths: [1440, 1280, 820, 393, 320] },
  {
    slug: "notes-archived",
    path: "/notes?state=archived",
    widths: [1440, 393],
  },
  {
    slug: "notes-deleted",
    path: "/notes?state=deleted",
    widths: [1440],
  },
  {
    slug: "note-record",
    path: "/notes/nd12-note-record-is-the-file",
    widths: [1440, 1280, 1024, 820, 393, 320],
    measureWriting: true,
  },
  {
    slug: "note-record-short",
    path: "/notes/nd12-note-roof-quote",
    widths: [1440, 393],
  },
  { slug: "diary", path: "/diary", widths: [1440, 1280, 820, 393, 320] },
  {
    slug: "diary-timeline",
    path: "/diary?mode=timeline",
    widths: [1440, 1280, 820, 393, 320],
  },
  {
    slug: "diary-filtered",
    path: "/diary?mode=timeline&type=decision",
    widths: [1440, 393],
  },
  {
    slug: "diary-entry",
    path: "/diary?mode=timeline&inspector=view:nd12-diary-0-1000",
    widths: [1440, 393],
  },
];

const SCHEMES = SCHEME_ARG ? [SCHEME_ARG] : ["light", "dark"];

function heightFor(width) {
  if (width <= 430) return 844;
  if (width <= 820) return 1024;
  return 950;
}

async function settle(page) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

/** Force the product's OWN appearance switch, not `prefers-color-scheme`. */
async function setScheme(page, scheme) {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-appearance", value);
  }, scheme);
}

const measurements = [];

const context = await browser.newContext({ deviceScaleFactor: 2 });
const page = await context.newPage();

for (const surface of SURFACES) {
  if (ONLY && surface.slug !== ONLY) continue;
  for (const width of surface.widths) {
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.goto(`${BASE}${surface.path}`, { waitUntil: "networkidle" });
    await settle(page);

    const measured = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewport = window.innerWidth;
      const pick = (selector) => {
        const element = document.querySelector(selector);
        return element
          ? Math.round(element.getBoundingClientRect().width)
          : null;
      };
      return {
        overflows: docWidth > viewport + 1,
        scrollWidth: docWidth,
        // The writing column, the editor's scroller and the rendered line of
        // text inside it — three different widths that are easy to conflate and
        // that a reading measure depends on telling apart.
        column: pick(".dh-note-body, .dh-diary-entry__main"),
        editor: pick(".cm-editor, .dh-md-editor textarea"),
        line: pick(".cm-content, .dh-md-editor textarea"),
        rail: pick(".dh-notes-rail"),
      };
    });

    measurements.push({ surface: surface.slug, width, ...measured });

    if (!MEASURE_ONLY) {
      for (const scheme of SCHEMES) {
        // 320 is a survival width rather than a design; one appearance is enough.
        if (width <= 320 && scheme === "dark") continue;
        await setScheme(page, scheme);
        await settle(page);
        await page.screenshot({
          path: `${OUT}/${surface.slug}-${width}-${scheme}.png`,
          fullPage: width > 430,
        });
      }
      await setScheme(page, "light");
    }
  }
}

await context.close();
await browser.close();

process.stdout.write(`${JSON.stringify(measurements, null, 2)}\n`);
const overflowing = measurements.filter((m) => m.overflows);
if (overflowing.length > 0) {
  process.stdout.write(
    `\nHORIZONTAL OVERFLOW at: ${overflowing
      .map((m) => `${m.surface}@${m.width} (${m.scrollWidth}px)`)
      .join(", ")}\n`,
  );
} else {
  process.stdout.write("\nNo horizontal overflow at any measured width.\n");
}
