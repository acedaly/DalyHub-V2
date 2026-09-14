import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
for (const [r,sel] of [["/people",".dh-prow__open"],["/assets",".dh-acard__open"],["/goals",".dh-mrow__open"],["/areas",".dh-areacard__open"],["/views",".dh-views__row-link"]]) {
  await p.goto("http://localhost:4173"+r, { waitUntil:"networkidle" }).catch(()=>{});
  const out = await p.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return "absent";
    const a = getComputedStyle(el, "::after");
    const host = el.closest("li,article,div[class*=card],div[class*=row]");
    return { linkH: Math.round(el.getBoundingClientRect().height),
             rowH: host ? Math.round(host.getBoundingClientRect().height) : null,
             afterContent: a.content, afterPosition: a.position, afterInset: a.inset };
  }, sel);
  console.log(r, sel, JSON.stringify(out));
}
await b.close();
