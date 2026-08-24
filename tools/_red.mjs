// 赤い塗りが残っているフレームを探す（穴を抜いた跡の目印）
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const b = await chromium.launch({ executablePath: chrome });
const page = await b.newPage();
const s = fs.readFileSync('src/frames.ts','utf8');
const blocks = [...s.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']*)',\s*file:\s*'([^']+)'/g)];
const hits = [];
for (const m of blocks) {
  const file = m[3].replace('./frames/','');
  const p = path.resolve('public/frames', file);
  if (!fs.existsSync(p)) continue;
  const b64 = fs.readFileSync(p).toString('base64');
  const r = await page.evaluate(async (d) => {
    const img = new Image();
    img.src = 'data:image/webp;base64,' + d;
    await img.decode().catch(()=>{});
    if (!img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img,0,0);
    const px = g.getImageData(0,0,c.width,c.height).data;
    // ⚠️ **絵に元々ある赤（バラ・飾り）と区別すること。**
    //    目印の赤は「まったく同じ色でべったり」塗られている。
    //    色ごとに数えて、1色が大きな面積を占めていたらそれが目印
    const bin = new Map();
    let total = 0;
    for (let i=0;i<px.length;i+=4){
      const a=px[i+3]; if(a<200) continue;
      total++;
      const R=px[i],G=px[i+1],B=px[i+2];
      if (R>170 && G>60 && G<150 && B>60 && B<150 && (R-Math.max(G,B))>60) {
        const k = (R>>3)+','+(G>>3)+','+(B>>3);
        bin.set(k,(bin.get(k)||0)+1);
      }
    }
    let red = 0, hue = '';
    for (const [k,v] of bin) if (v>red) { red=v; hue=k; }
    return { red, total, hue, pct: total? red/total*100 : 0 };
  }, b64);
  if (r && r.pct > 1.5) hits.push({ name: m[2], id: m[1], file, pct: r.pct.toFixed(1), hue: r.hue });
}
hits.sort((a,b)=>b.pct-a.pct);
console.log('=== 赤い塗りが多いフレーム ' + hits.length + '枚 ===');
hits.forEach(h=>console.log(`  ${String(h.pct).padStart(5)}%  色${h.hue.padEnd(12)}  ${h.name}  (${h.file})`));
await b.close();
