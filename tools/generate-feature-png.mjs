import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function capture() {
  // Try to find chrome on system
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 800 }
  });

  const htmlPath = 'file:///' + path.resolve(__dirname, 'feature-graphic-generator.html').replace(/\\/g, '/');
  await page.goto(htmlPath);
  await page.waitForTimeout(1000);

  const banner = await page.$('#feature-banner');
  const outputPath = path.resolve(__dirname, '../public/feature-graphic.png');
  await banner.screenshot({ path: outputPath });

  console.log('Successfully generated:', outputPath);
  await browser.close();
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
