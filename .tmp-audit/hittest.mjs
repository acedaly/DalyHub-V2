import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
const exe = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
const p = await ctx.newPage();
await p.goto("http://localhost:4173/views", { waitUntil:"networkidle" });
console.log(await p.evaluate(() => {
  const row = document.querySelector(".dh-views__row");
  const r = row.getBoundingClientRect();
  const probe = (dy) => {
    const el = document.elementFromPoint(r.left + r.width/2, r.top + dy);
    return el?.closest("a") ? "link" : (el?.className||el?.tagName||"?").toString().slice(0,30);
  };
  return { rowH: Math.round(r.height), top: probe(6), mid: probe(r.height/2), bottom: probe(r.height-6) };
}));
await b.close();
