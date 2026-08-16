import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const ids = JSON.parse(readFileSync('C:/Users/syunp/AppData/Local/Temp/paid.json','utf8'));
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await (await b.newContext({ viewport:{width:1400,height:1400} })).newPage();
await page.goto('http://localhost:4620/', { waitUntil:'domcontentloaded' });
const cells = ids.map(id => `<div><div class="w">
  <img src="/frames/${id}.webp"></div><div class="n">${id}</div></div>`).join('');
await page.setContent(`<style>
 body{background:#101018;color:#ccc;font:9px sans-serif;margin:0;padding:6px}
 .g{display:grid;grid-template-columns:repeat(8,1fr);gap:6px}
 .w{background-image:linear-gradient(45deg,#777 25%,transparent 25%),linear-gradient(-45deg,#777 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#777 75%),linear-gradient(-45deg,transparent 75%,#777 75%);
    background-size:12px 12px;background-position:0 0,0 6px,6px -6px,-6px 0;
    aspect-ratio:1;display:flex;align-items:center;justify-content:center}
 img{max-width:100%;max-height:100%} .n{text-align:center;color:#8cf;padding:2px}
</style><div class="g">${cells}</div>`);
await page.waitForTimeout(4000);
const ng = await page.evaluate(() => [...document.images].filter(i=>!i.naturalWidth)
  .map(i=>i.src.split('/').pop()));
console.log('読めない絵:', ng.length ? ng.join(', ') : 'なし');
await page.screenshot({ path:'C:/Users/syunp/AppData/Local/Temp/paid.png', fullPage:true });
await b.close();
