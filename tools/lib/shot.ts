// Render an HTML/SVG string to PNG with the pre-installed Chromium (used for build-time map previews).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
export async function renderHtmlToPng(html: string, out: string, width = 1600, height = 1200) {
  const exe = fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined;
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.screenshot({ path: out });
  await browser.close();
}
