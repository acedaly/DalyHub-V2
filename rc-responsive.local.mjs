import { chromium } from "@playwright/test";
const WIDTHS = [[320,720],[390,844],[700,900],[1024,768],[1280,800],[1440,900]];
const RECORDS = [
  ["area", "/areas/a-rc-home"],
  ["area-quiet", "/areas/a-rc-admin"],
  ["goal", "/goals/g-rc-move"],
  ["project", "/projects/pr-rc-kitchen"],
  ["long-title", "/projects/pr-rc-long"],
  ["note", "/notes/n-rc-brief"],
  ["meeting", "/meeting/m-rc-site?tab=meeting"],
  ["person", "/person/p-rc-dan"],
  ["asset", "/asset/as-rc-ute?tab=history"],
  ["review", "/reviews/rv-rc-week"],
];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const rows = [];
for (const [w,h] of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  for (const [name, path] of RECORDS) {
    await p.goto("http://localhost:4173"+path, { waitUntil: "networkidle" });
    await p.waitForTimeout(250);
    const m = await p.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;
      const t = document.querySelector(".record-title");
      const lh = t ? parseFloat(getComputedStyle(t).lineHeight) : 0;
      const lines = t && lh ? Math.round(t.getBoundingClientRect().height / lh) : 0;
      const panel = document.querySelector(".record-tabs__panel:not([hidden])") ?? document.querySelector(".record-layout__content");
      let contentTop = null;
      if (panel) for (const el of panel.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.height > 24 && r.width > 80) { contentTop = Math.round(r.top); break; }
      }
      // Tabs must not wrap: compare strip height to a single tab's.
      const strip = document.querySelector(".record-tabs__list");
      const tab = document.querySelector(".record-tab");
      const tabsWrap = strip && tab ? strip.getBoundingClientRect().height > tab.getBoundingClientRect().height * 1.5 : false;
      // Empty bands: gap between header bottom and tabs top.
      const hdr = document.querySelector(".record-header");
      const tabsEl = document.querySelector(".record-tabs__strip");
      const band = hdr && tabsEl ? Math.round(tabsEl.getBoundingClientRect().top - hdr.getBoundingClientRect().bottom) : null;
      return { overflow, lines, contentTop, tabsWrap, band };
    });
    rows.push({ w, name, ...m });
  }
  await ctx.close();
}
await b.close();
console.log("width record        ovf lines content band tabsWrap");
for (const r of rows) {
  const bad = r.overflow > 1 || r.tabsWrap;
  console.log(
    String(r.w).padEnd(6), r.name.padEnd(13),
    String(r.overflow).padEnd(4), String(r.lines).padEnd(6),
    String(r.contentTop ?? "-").padEnd(8), String(r.band ?? "-").padEnd(5),
    r.tabsWrap ? "WRAP" : "", bad ? "  <-- CHECK" : "");
}
