import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const errs=[];
const run = async (lang) => {
  const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`[${lang}] ${e.message.slice(0,60)}`));
  if (lang==='en') await page.addInitScript(() => localStorage.setItem('tinycube.lang','en'));
  // 英語のボタン名が分からないときのため、両方の名前で探せるようにする
  await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
    if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
  const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
  const J=(a,b)=>lang==='ja'?a:b;
  console.log(`\n=== ${lang==='ja'?'日本語':'English'} ===`);
  ok('同意画面', await tap(J('同意してはじめる','I agree')));
  ok('プリクラ帳の入口', await page.locator('.album-open-btn').count()>0);
  ok('写真を撮る', await tap(J('写真を撮る','Take photo')));
  ok('自分を写す', await tap(J('自分を写す','Shoot yourself'),2500));
  ok('フレームを選ぶ', await tap(J('フレームを選ぶ','Choose a frame')));
  const fr = await page.evaluate(()=>({n:document.querySelectorAll('.frame-tile').length,
    鍵:[...document.querySelectorAll('.frame-tile')].filter(e=>/🔒/.test(e.textContent)).length,
    見本:[...document.querySelectorAll('.frame-tile img')].filter(i=>/thumb/.test(i.src)).length}));
  // ⚠️ 鍵つきは 2026-08-18 から**あって正しい**（¥300 で解ける53枚）。
  //    0 を期待すると、意図した状態を NG と誤って報告する
  ok(`フレーム${fr.n}枚・鍵${fr.鍵}・見本${fr.見本}`, fr.n>50 && fr.見本>0);
  // 指の横取り
  // ⚠️ **手前の画面だけを見ること。** 裏に残っている撮影画面のボタンまで
  //    数えると、覆われているだけのものを「押せない」と誤検知する
  const bad = await page.evaluate(() => {
    const out=[];
    const top = document.querySelector('.setup-screen') || document.querySelector('.album-screen')
             || document.querySelector('.where-screen') || document.body;
    for (const btn of top.querySelectorAll('button')) {
      if (!btn.offsetParent) continue;
      const r=btn.getBoundingClientRect(); if(r.width<4||r.height<4) continue;
      const t=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
      if (t && !(btn===t||btn.contains(t))) out.push(btn.textContent.trim().slice(0,10)||'(絵)');
    } return out; });
  ok(`押せないボタン無し（${bad.length}）`, bad.length===0);
  if (bad.length) console.log('     →', JSON.stringify(bad));
  await tap(J('フレーム決定','Select frame'),2500);
  await tap(J('この設定で撮る','Shoot with this setting'),2500);
  ok('3枚撮る', await tap(J('3枚撮る','Shoot 3'),14000));
  await page.waitForTimeout(1500);
  ok('できあがりを見る', await tap(J('できあがりを見る','See result'),3000));
  // はみ出し
  const pv = await page.evaluate(() => {
    const s=document.querySelector('.preview-sheet'), t=document.querySelector('.preview-btns');
    if(!s||!t) return null;
    const a=s.getBoundingClientRect(), c=t.getBoundingClientRect();
    return { 重なる:c.top<a.bottom, 用紙が画面内:a.bottom<=innerHeight+1,
      ボタンが画面内:c.bottom<=innerHeight+1 }; });
  ok('用紙もボタンも画面に収まる', pv && !pv.重なる && pv.用紙が画面内 && pv.ボタンが画面内);
  // 「これで保存」を押してから、行き先の画面が出るまでを測る
  const t0=Date.now();
  await page.locator('button').filter({hasText:J('これで保存する','Save this')}).first()
    .click({force:true}).catch(()=>{});
  await page.locator('.where-btn').first().waitFor({timeout:20000}).catch(()=>{});
  const ms=Date.now()-t0;
  ok(`保存への誘導が出るまで ${ms}ms`, ms < 1200);
  // 5つ = 両方 / 端末 / プリクラ帳 / インスタ用 / 保存しない
  // （2026-08-23、インスタ用を足した。3連は縦に長くて投稿枠から切られるため）
  ok('行き先を5つ聞く', await page.locator('.where-btn').count()===5);
  // 日本語の混入（英語のときだけ）
  if (lang==='en') {
    const jp = await page.evaluate(() => {
      const out=[]; for (const e of document.querySelectorAll('button,h1,h2,h3,p,span,div,label')) {
        if (!e.offsetParent || e.children.length) continue;
        const t=e.textContent.trim();
        if (t && /[\u3040-\u30ff\u4e00-\u9faf]/.test(t) && t!=='日本語') out.push(t.slice(0,16));
      } return [...new Set(out)]; });
    ok(`日本語の混入なし（${jp.length}）`, jp.length===0);
    if (jp.length) console.log('     →', JSON.stringify(jp.slice(0,5)));
  }
  // プリクラ帳に3枚入るか
  await page.locator('.where-btn').filter({hasText:J('プリクラ帳だけ','Album only')}).first().click({force:true}).catch(()=>{});
  await page.waitForTimeout(2500);
  await tap(J('プリクラ帳','Album'), 2000);
  const al = await page.locator('.album-screen img').count();
  ok(`プリクラ帳に3枚入る（${al}）`, al===3);
  await ctx.close();
};
await run('ja'); await run('en');
console.log('\n■ エラー:', errs.length?errs.slice(0,3).join(' / '):'なし');
await b.close();
