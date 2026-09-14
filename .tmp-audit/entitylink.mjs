import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
for (const r of ["/views","/today","/tasks"]) {
  await p.goto("http://localhost:4173"+r, { waitUntil:"networkidle" }).catch(()=>{});
  const out = await p.evaluate(() => [...document.querySelectorAll(".dh-entity-link")].slice(0,4).map(el => {
    const r1 = el.getBoundingClientRect();
    const li = el.closest("li,tr,[role=row]");
    const r2 = li?.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // does the link cover the row via ::after?
    const after = getComputedStyle(el, "::after");
    return { linkH: Math.round(r1.height), linkW: Math.round(r1.width),
             rowH: r2 ? Math.round(r2.height) : null, rowTag: li?.tagName,
             display: cs.display, afterContent: after.content, afterPos: after.position,
             cls: el.className.slice(0,60) };
  }));
  console.log(r, JSON.stringify(out, null, 1));
}
await b.close();
