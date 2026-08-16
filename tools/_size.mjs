import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await (await b.newContext()).newPage();
await page.goto('http://localhost:4620/', { waitUntil:'domcontentloaded' });
const r = await page.evaluate(async () => {
  const out=[];
  for (const id of ['oshi_red_w','oshi_black_w','goya','tc_fun']) {
    const i=new Image(); i.src='/frames/'+id+'.webp';
    await new Promise(r=>{i.onload=r;i.onerror=r;});
    out.push(id+': '+i.naturalWidth+'x'+i.naturalHeight);
  }
  return out;
});
console.log(r.join('\n'));
await b.close();
