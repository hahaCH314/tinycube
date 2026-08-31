// 画面を歩いて「読めない・重なる・はみ出す・押しにくい」を探す道具。
//
//   npx vite &            # 5173 で起動しておく
//   node tools/_audit-pixels.mjs
//
// ⚠️ **_audit.mjs とは別物。** あちらは日英を通しでクリックして
//    ページのエラーを拾うもの。こちらは**静止した画面の見た目**を測る。
//    2026-08-31、Mac のシオンが追加。
//
// 画面を歩いて、読めない・重なる・はみ出す・押せないを探す。
// ⚠️ 文字の可読性は **実際の画素** を読む。-webkit-text-stroke は color に
//    現れないので、getComputedStyle だけ見ると「白なのに黒く潰れている」を見逃す。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });

const 見つけた = [];
const 記録 = (画面,幅,種類,内容) => 見つけた.push({画面,幅,種類,内容});

/** 要素を切り出して画素を読み、文字の実効色と地の色のコントラストを出す */
async function 画素で読む(page, sel) {
  const el = page.locator(sel).first();
  if (!await el.count()) return null;
  let buf; try { buf = await el.screenshot(); } catch { return null; }
  const b64 = buf.toString('base64');
  return await page.evaluate(async (d) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + d;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0,0,c.width,c.height).data;
    const 明 = [];
    for (let i=0;i<px.length;i+=4){
      if (px[i+3] < 128) continue;
      const [r,gg,bb]=[px[i],px[i+1],px[i+2]];
      const L=(x)=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)};
      明.push(0.2126*L(r)+0.7152*L(gg)+0.0722*L(bb));
    }
    if (!明.length) return null;
    明.sort((a,b)=>a-b);
    // ⚠️ **明るい側と暗い側の両端を取ること。**（2026-08-31、自分が踏んだ）
    //    はじめは「下位3%＝文字／上位75%＝地」としていたが、**白い文字が
    //    黒地に乗っているとき、文字の面積は2割ほどしかないので75%点も地を拾う。**
    //    その結果 paint-order で実際には直っているのに 1.33 のまま動かず、
    //    直っていないと誤読した。両端なら、どちらが文字でも拾える
    const l = 明[Math.floor(明.length*0.02)];
    const h = 明[Math.floor(明.length*0.98)];
    return { 比: +((h+0.05)/(l+0.05)).toFixed(2), 画素数: 明.length };
  }, b64);
}

async function 検査(page, 画面, 幅) {
  // ---- はみ出し
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) 記録(画面,幅,'横はみ出し',`${over}px`);
  // ---- 画面外・重なり・押せる大きさ・意図しない折り返し
  const r = await page.evaluate(() => {
    const 出 = { 画面外:[], 小さい:[], 折返し:[], 重なり:[] };
    const 見える = el => { const s=getComputedStyle(el);
      return s.display!=='none' && s.visibility!=='hidden' && +s.opacity>0; };
    document.querySelectorAll('button, a, input, [role=button]').forEach(el=>{
      if(!見える(el)) return;
      const b=el.getBoundingClientRect();
      if(b.width<1||b.height<1) return;
      const 名=(el.textContent||el.className||el.tagName).trim().slice(0,16);
      if(b.right>innerWidth+1||b.left<-1) 出.画面外.push(`${名}（左${Math.round(b.left)} 右${Math.round(b.right)}／幅${innerWidth}）`);
      if(b.bottom>innerHeight+1&&getComputedStyle(el).position==='fixed') 出.画面外.push(`${名}（下${Math.round(b.bottom)}／高${innerHeight}）`);
      if(b.width<44||b.height<44) 出.小さい.push(`${名}（${Math.round(b.width)}x${Math.round(b.height)}）`);
    });
    // 見出しと札の重なり
    document.querySelectorAll('.album-open-btn,.kind-btn').forEach(btn=>{
      const a=btn.querySelector('.album-open-label,.kind-title'), c=btn.querySelector('.album-open-count,.kind-note');
      if(!a||!c) return;
      const x=a.getBoundingClientRect(), y=c.getBoundingClientRect();
      const ow=Math.min(x.right,y.right)-Math.max(x.left,y.left), oh=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);
      if(ow>0&&oh>0) 出.重なり.push(`${a.textContent.trim().slice(0,10)} と ${c.textContent.trim().slice(0,10)}（${Math.round(ow)}x${Math.round(oh)}px）`);
    });
    // 1行のはずが折り返しているもの
    document.querySelectorAll('.album-open-label,.kind-title,.start-btn,.frame-decide,.setup-title').forEach(el=>{
      if(!見える(el)) return;
      const cs=getComputedStyle(el), fs=parseFloat(cs.fontSize), lh=parseFloat(cs.lineHeight)||fs*1.2;
      const 行=Math.round(el.getBoundingClientRect().height/lh);
      if(行>1 && !el.textContent.includes('\n')) 出.折返し.push(`${el.textContent.trim().slice(0,16)}（${行}行）`);
    });
    return 出;
  });
  for(const k of Object.keys(r)) for(const v of r[k]) 記録(画面,幅,k,v);
}

const 幅一覧 = [320, 390, 430];
for (const w of 幅一覧) {
  const ctx = await b.newContext({ viewport:{width:w,height:932}, permissions:['camera'] });
  const p = await ctx.newPage();
  await p.goto('http://localhost:5173/',{waitUntil:'networkidle'}); await p.waitForTimeout(600);

  await 検査(p,'はじめに',w);
  for (const [sel,名] of [['.manner-text','同意文'],['.manner-title','見出し']]) {
    const v = await 画素で読む(p,sel);
    if (v && v.比 < 4.5) 記録('はじめに',w,'読めない',`${名} コントラスト ${v.比}`);
  }

  await p.locator('.manner-agree, .manner-content button').last().click(); await p.waitForTimeout(700);
  await 検査(p,'なにを撮る？',w);
  for (const sel of ['.kind-title','.album-open-btn.is-album .album-open-label',
                     '.album-open-btn.is-sheet .album-open-label','.album-open-btn.is-buy .album-open-label']) {
    const v = await 画素で読む(p,sel);
    if (v && v.比 < 4.5) 記録('なにを撮る？',w,'読めない',`${sel} コントラスト ${v.比}`);
  }
  await ctx.close();
}
console.log(`検査した幅: ${幅一覧.join(' / ')}px\n`);
if(!見つけた.length) console.log('問題なし');
else {
  const 種類順 = ['読めない','横はみ出し','画面外','重なり','折返し','小さい'];
  for(const t of 種類順){
    const xs=見つけた.filter(x=>x.種類===t); if(!xs.length) continue;
    console.log(`■ ${t}（${xs.length}件）`);
    const 見た=new Set();
    for(const x of xs){ const k=x.画面+x.内容; if(見た.has(k))continue; 見た.add(k);
      const 幅s=xs.filter(y=>y.画面===x.画面&&y.内容===x.内容).map(y=>y.幅).join('/');
      console.log(`   [${x.画面}] ${x.内容}  … ${幅s}px`); }
    console.log('');
  }
}
await b.close();
