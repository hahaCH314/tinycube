// 4:5 に収めるとどう見えるか、実物で作って並べる（2026-08-30）
import fs from 'fs';
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await (await b.newContext({ viewport:{width:900,height:900} })).newPage();
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1000);
const url = await page.evaluate(() => {
  const CELL_W = 1080, GAP = 24, PAD = 24, CELL_H = 1920;
  const 色 = ['#e8a0b8', '#a0c8e8', '#c8e8a0'];
  const sheet = document.createElement('canvas');
  sheet.width = PAD*2 + CELL_W;
  sheet.height = PAD*2 + CELL_H*3 + GAP*2;
  const g = sheet.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0,0,sheet.width,sheet.height);
  for (let i=0;i<3;i++){
    const dy = PAD + i*(CELL_H+GAP);
    g.fillStyle = 色[i]; g.fillRect(PAD, dy, CELL_W, CELL_H);
    g.fillStyle = '#fff'; g.font = 'bold 300px sans-serif';
    g.textAlign='center'; g.textBaseline='middle';
    g.fillText(String(i+1), PAD+CELL_W/2, dy+CELL_H/2);
  }
  const RATIO = 5/4;
  const out = document.createElement('canvas');
  out.width = sheet.width;
  out.height = Math.round(sheet.width * RATIO);
  const og = out.getContext('2d');
  og.fillStyle = '#fff'; og.fillRect(0,0,out.width,out.height);
  const s = Math.min(out.width/sheet.width, out.height/sheet.height);
  const w = sheet.width*s, h = sheet.height*s;
  og.drawImage(sheet, (out.width-w)/2, (out.height-h)/2, w, h);
  const 見本 = document.createElement('canvas');
  見本.width = 900; 見本.height = 620;
  const mg = 見本.getContext('2d');
  mg.fillStyle = '#eef'; mg.fillRect(0,0,900,620);
  mg.fillStyle = '#333'; mg.font = 'bold 20px sans-serif'; mg.textAlign='center';
  mg.fillText('いまの保存（シールシートの形）', 225, 30);
  mg.fillText('4:5 にした場合（インスタに載る）', 675, 30);
  const s1 = 540 / sheet.height;
  mg.drawImage(sheet, 225 - sheet.width*s1/2, 50, sheet.width*s1, sheet.height*s1);
  const s2 = 540 / out.height;
  mg.drawImage(out, 675 - out.width*s2/2, 50, out.width*s2, out.height*s2);
  mg.strokeStyle = '#aaa'; mg.strokeRect(675 - out.width*s2/2, 50, out.width*s2, out.height*s2);
  return 見本.toDataURL('image/png');
});
fs.writeFileSync('tools/_look.png', Buffer.from(url.split(',')[1], 'base64'));
console.log('作った');
await b.close();
