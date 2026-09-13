/**
 * UNTITLED-13 — the Meetings and People shooter and MEASURER.
 *
 * A sibling of `notes-diary-shot.mjs`, and it measures the two things this pass
 * can get wrong in ways a screenshot hides:
 *
 *   - **horizontal overflow**, at every width the design system reviews, on the
 *     hostile content the fixture deliberately plants (a 140-character meeting
 *     title, a 60-character name beside a 70-character organisation, an agenda
 *     item that runs to three lines);
 *   - **touch targets**, because this pass moved several controls into overflow
 *     MENUS and put an avatar group inside a header. A disc small enough to look
 *     right beside a date is easy to make too small to press, and the only way
 *     to know is to measure every interactive box on the page.
 *
 * Appearance is forced through the product's OWN switch (`data-appearance`), for
 * the reason REDESIGN-03 documented: Playwright's `colorScheme` only sets
 * `prefers-color-scheme`, and the theme keys its dark blocks on the stored
 * preference the server writes onto `<html>`. A "dark" capture taken any other
 * way is evidence of nothing.
 *
 * Not part of the gate, and not a test: it asserts nothing. It needs the
 * `meetings-people-seed.mjs` fixture, or every surface it photographs is an
 * empty state.
 *
 *   node scripts/meetings-people-seed.mjs
 *   node scripts/meetings-people-shot.mjs --out /tmp/mp/after
 *   node scripts/meetings-people-shot.mjs --measure 1        (numbers only)
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/meetings-people";
const BASE = args.get("base") ?? "http://localhost:4173";
const MEASURE_ONLY = args.get("measure") === "1";
const ONLY = args.get("only") ?? null;
const SCHEME_ARG = args.get("scheme") ?? null;

if (!MEASURE_ONLY) mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** The fixture's own ids, so a surface can be opened directly. */
const PAST = "mp13-meeting-retro-2";
const UPCOMING = "mp13-meeting-next-1";
const CROWDED = "mp13-meeting-today-2";
const PERSON = "mp13-person-priya";
const PERSON_LONG = "mp13-person-long";

/**
 * The review matrix.
 *
 * 1440 and 1280 are the two laptop widths the design system reviews at, 1024 the
 * narrow laptop, 820 the tablet, 430 and 393 the reference phones and 320 the
 * narrowest viewport the product supports.
 */
const SURFACES = [
  {
    slug: "meetings-upcoming",
    path: "/meetings/upcoming",
    widths: [1440, 1280, 1024, 820, 430, 393, 320],
  },
  {
    slug: "meetings-recent",
    path: "/meetings/recent",
    widths: [1440, 1280, 820, 393, 320],
  },
  {
    slug: "meetings-archived",
    path: "/meetings/archived",
    widths: [1440, 393],
  },
  {
    slug: "meeting-upcoming",
    path: `/meeting/${UPCOMING}`,
    widths: [1440, 1280, 820, 430, 393, 320],
  },
  { slug: "meeting-past", path: `/meeting/${PAST}`, widths: [1440, 393] },
  {
    slug: "meeting-crowded",
    path: `/meeting/${CROWDED}`,
    widths: [1440, 1024, 393, 320],
  },
  {
    slug: "meeting-details",
    path: `/meeting/${UPCOMING}?tab=details`,
    widths: [1440, 393, 320],
  },
  {
    slug: "meeting-follow-up",
    path: `/meeting/${PAST}?tab=follow-up`,
    widths: [1440, 393],
  },
  {
    slug: "people",
    path: "/people",
    widths: [1440, 1280, 1024, 820, 430, 393, 320],
  },
  { slug: "people-work", path: "/people?circle=work", widths: [1440, 393] },
  { slug: "people-catchup", path: "/people?catch_up=1", widths: [1440, 393] },
  { slug: "people-archived", path: "/people/archived", widths: [1440, 393] },
  {
    slug: "person",
    path: `/person/${PERSON}`,
    widths: [1440, 1280, 1024, 820, 430, 393, 320],
  },
  {
    slug: "person-long",
    path: `/person/${PERSON_LONG}`,
    widths: [1440, 393, 320],
  },
  {
    slug: "person-contact",
    path: `/person/${PERSON}?tab=contact`,
    widths: [1440, 393],
  },
  {
    slug: "person-activity",
    path: `/person/${PERSON}?tab=activity`,
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
  await page.waitForTimeout(300);
}

/** Force the product's OWN appearance switch, not `prefers-color-scheme`. */
async function setScheme(page, scheme) {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-appearance", value);
  }, scheme);
}

const measurements = [];

/*
 * TWO contexts, and the second one is the whole reason the touch report means
 * anything.
 *
 * DalyHub's 44px floor is a `(hover: none)` / `(pointer: coarse)` guarantee —
 * `ui.css` states it that way for every button and field, and this pass writes
 * it as a utility for the Meeting header's attendee link. A headless desktop
 * Chromium reports `hover: hover`, so a phone-width capture taken in the
 * desktop context measures the DESKTOP height of every control and reports a
 * floor breach that does not exist on a phone.
 *
 * `hasTouch` is what flips Chromium's pointer media features, so at 430px and
 * below the numbers below are the ones a thumb actually gets. Found by
 * measuring: a first version of this script reported "7 attendees" at 78×20 on
 * a 393px screen with the coarse rule already in place and correct.
 */
const desktop = await browser.newContext({ deviceScaleFactor: 2 });
const touch = await browser.newContext({
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const desktopPage = await desktop.newPage();
const touchPage = await touch.newPage();

/** Phone widths get the coarse-pointer context; everything else the desktop one. */
const pageFor = (width) => (width <= 430 ? touchPage : desktopPage);

for (const surface of SURFACES) {
  if (ONLY && surface.slug !== ONLY) continue;
  for (const width of surface.widths) {
    const page = pageFor(width);
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.goto(`${BASE}${surface.path}`, { waitUntil: "networkidle" });
    await settle(page);

    const measured = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewport = window.innerWidth;

      /*
       * Every VISIBLE interactive box on the page, measured.
       *
       * The product's floor is 44px and it is a `(pointer: coarse)` guarantee,
       * so this reports the smallest boxes rather than failing: the number is
       * the evidence, and whether it matters depends on the width. Controls
       * inside a closed menu are not in the DOM, so nothing here measures
       * something a person cannot press.
       */
      const smallest = [];
      for (const el of document.querySelectorAll(
        'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea',
      )) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        /*
         * The EFFECTIVE hit area, which is not always the element's own box.
         *
         * DalyHub's row pattern is a small inline anchor with an absolutely
         * positioned `::after` stretched over its whole row — the row is the
         * target and the text is merely where the words are. Measuring the
         * anchor reports 106x18 for a control a thumb gets 60px of, which is a
         * false positive that would train a reader to ignore this report.
         *
         * So where an `::after` is absolutely positioned and has a real size,
         * it is the target. `inset: 0` gives the row; a centred fixed-size
         * `::after` (the search field's Clear) gives its own 44px.
         */
        const after = getComputedStyle(el, "::after");
        let w = box.width;
        let h = box.height;
        if (after.position === "absolute" && after.content !== "none") {
          const aw = Number.parseFloat(after.width);
          const ah = Number.parseFloat(after.height);
          if (Number.isFinite(aw) && Number.isFinite(ah) && aw > 0 && ah > 0) {
            w = Math.max(w, aw);
            h = Math.max(h, ah);
          }
        }

        smallest.push({
          w: Math.round(w),
          h: Math.round(h),
          name:
            (el.getAttribute("aria-label") ||
              el.textContent?.trim().slice(0, 32) ||
              el.tagName.toLowerCase()) ??
            "?",
        });
      }
      smallest.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h));

      const pick = (selector) => {
        const element = document.querySelector(selector);
        return element
          ? Math.round(element.getBoundingClientRect().width)
          : null;
      };

      return {
        overflows: docWidth > viewport + 1,
        scrollWidth: docWidth,
        // The writing measure inside a Meeting's notebook.
        notebook: pick(".dh-meeting-notebook"),
        editor: pick(".cm-editor, .dh-md-editor textarea"),
        // The three smallest interactive boxes, which is where a target floor
        // breaks first.
        tightest: smallest.slice(0, 3),
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

await desktop.close();
await touch.close();
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

/*
 * The touch floor, reported at PHONE widths only — which is where the product
 * actually makes the guarantee (a `(pointer: coarse)` rule), and therefore the
 * only place a number below 44 is a defect rather than a design.
 */
const tight = measurements
  .filter((m) => m.width <= 430)
  .flatMap((m) =>
    m.tightest
      .filter((t) => Math.min(t.w, t.h) < 44)
      .map((t) => `${m.surface}@${m.width}: "${t.name}" ${t.w}x${t.h}`),
  );
process.stdout.write(
  tight.length > 0
    ? `\nBELOW THE 44px TOUCH FLOOR at phone width:\n  ${tight.join("\n  ")}\n`
    : "\nEvery interactive box clears 44px at phone width.\n",
);
