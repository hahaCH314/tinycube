// 秋フレームの「顔の穴」を測る（2026-08-25）
//
// ⚠️ **穴の色は絵によって違う**（緑・黒・マゼンタ…）。
//    色を決め打ちすると当たり外れが出るので、
//    **「同じ色がべったり広い面積を占めている、まとまったかたまり」**を探す。
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const dir = 'E:/syunp_data/Downloads/tinyCUBEframe秋';
const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await b.newPage();
for (const f of fs.readdirSync(dir)) {
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
  const r = await page.evaluate(async (d) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + d;
    await img.decode().catch(()=>{});
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img,0,0);
    const W=c.width, H=c.height;
    const px = g.getImageData(0,0,W,H).data;
    // ⚠️ **穴の色は緑・マゼンタ・黒の3つが使われている**（2026-08-25、
    //    伊波さん「マゼンダじゃない？」「黒だね」）。
    //    黒は夜景の暗い部分と紛れるので、**完全な真っ黒だけ**を見る。
    //    緑とマゼンタは絵に無い色なので、そのまま拾ってよい
    const 判定 = (R,G,B) => {
      if (G>140 && R<120 && B<120 && (G-Math.max(R,B))>70) return '緑';
      if (R>180 && B>140 && G<110 && (Math.min(R,B)-G)>70) return 'マゼンタ';
      if (R<10 && G<10 && B<10) return '黒';
      return null;
    };
    // どの色が使われているか数える
    const cnt = { 緑:0, マゼンタ:0, 黒:0 };
    for (let i=0;i<px.length;i+=4){
      if (px[i+3]<200) continue;
      const k = 判定(px[i],px[i+1],px[i+2]);
      if (k) cnt[k]++;
    }
    let 色='', n=0;
    for (const k of ['緑','マゼンタ','黒']) if (cnt[k]>n){n=cnt[k];色=k;}
    let pct = n/(W*H)*100;
    if (pct < 1.5) return { 穴:false, w:W, h:H, 最多:pct.toFixed(1) };
    // ⚠️ **黒は背景の暗い部分と紛れる。** 穴は「まん中にある大きなかたまり」
    //    なので、**中央から外へ塗りつぶして広げる**ことで、
    //    端に散らばった暗い部分を拾わないようにする
    const 印 = new Uint8Array(W*H);
    const 対象 = (x,y) => {
      const i=(y*W+x)*4;
      return px[i+3]>=200 && 判定(px[i],px[i+1],px[i+2])===色;
    };
    // 中央付近で対象になっている点を種にする
    const 種=[];
    for (let dy=-H/8; dy<H/8; dy+=H/40) for (let dx=-W/8; dx<W/8; dx+=W/40){
      const x=Math.round(W/2+dx), y=Math.round(H/2+dy);
      if (x>=0&&y>=0&&x<W&&y<H&&対象(x,y)) 種.push(y*W+x);
    }
    if (!種.length) return { 穴:false, w:W, h:H, 最多:pct.toFixed(1) };
    const stack=[...種];
    let n2=0;
    let x0=1e9,y0=1e9,x1=-1,y1=-1;
    while(stack.length){
      const p=stack.pop();
      if (印[p]) continue;
      const x=p%W, y=(p-x)/W;
      if (!対象(x,y)) continue;
      印[p]=1; n2++;
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
      if(x>0)stack.push(p-1); if(x<W-1)stack.push(p+1);
      if(y>0)stack.push(p-W); if(y<H-1)stack.push(p+W);
    }
    n = n2;
    const boxW=x1-x0+1, boxH=y1-y0+1;
    const 詰まり = n/(boxW*boxH)*100;
    return { 穴:true, w:W, h:H, 色, 面積:(n/(W*H)*100).toFixed(1), 詰まり:詰まり.toFixed(0),
      x:(x0/W*100).toFixed(1), y:(y0/H*100).toFixed(1),
      幅:(boxW/W*100).toFixed(1), 高:(boxH/H*100).toFixed(1) };
  }, b64);
  const tag = r.穴
    ? `色(${r.色}) 面積${r.面積}% 詰まり${r.詰まり}%  x:${r.x} y:${r.y} w:${r.幅} h:${r.高}`
    : `穴なし（最多の色でも ${r.最多}%）`;
  console.log(`  ${r.w>r.h?'横':'縦'}  ${f.replace('.png','').padEnd(24)} ${tag}`);
}
await b.close();
