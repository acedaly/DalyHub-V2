import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const OUT="/tmp/claude-0/-home-user-DalyHub-V2/32138413-4f8d-50fd-b539-a84ea21bcd94/scratchpad/dark";
mkdirSync(OUT,{recursive:true});
const RECORDS=[["project","/projects/pr-rc-kitchen"],["area","/areas/a-rc-home"],["goal","/goals/g-rc-move"],
  ["note","/notes/n-rc-brief"],["person","/person/p-rc-dan"],["asset","/asset/as-rc-ute?tab=history"],
  ["meeting","/meeting/m-rc-site?tab=meeting"],["review","/reviews/rv-rc-week"]];
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
for (const scheme of ["dark"]) {
  const ctx=await b.newContext({viewport:{width:1280,height:800},colorScheme:scheme});
  const p=await ctx.newPage();
  for (const [n,path] of RECORDS){
    await p.goto("http://localhost:4173"+path,{waitUntil:"networkidle"});
    await p.waitForTimeout(300);
    await p.screenshot({path:`${OUT}/${n}-${scheme}.png`});
  }
  await ctx.close();
}
await b.close();
console.log("captured");
