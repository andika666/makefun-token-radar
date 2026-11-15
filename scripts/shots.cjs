// Render the built dashboard at 1440x900 and take the three screenshots the kit asks for:
// 1-board.png (the board), 2-detail.png (the detail drawer on rank 1), 3-filtered.png (the
// Early finds tab). Also smoke-checks the sandbox: moving the growth-weight slider must move the
// ranking. Needs Playwright: NODE_PATH=<path to playwright's node_modules> node scripts/shots.js
// Usage: node scripts/shots.js [--out <dir>] [--root <built-output-dir>]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/tmp/radar-shots';
  const root = args.includes('--root') ? args[args.indexOf('--root') + 1] : '/tmp/radar-gate-a';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + path.join(root, 'dashboard', 'index.html'), { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const rows = await page.locator('tbody tr').count();
  const firstName = await page.locator('tbody tr').first().locator('b').first().textContent();
  console.log('board rows rendered:', rows, '| first row:', firstName);
  await page.screenshot({ path: path.join(out, '1-board.png'), type: 'png' });
  await page.locator('tbody tr').first().click();
  await page.waitForTimeout(400);
  const drawerOpen = await page.locator('#detail').evaluate((d) => d.open);
  const drawerTitle = await page.locator('#detail-title').textContent().catch(() => '(none)');
  console.log('detail drawer open:', drawerOpen, '| title:', drawerTitle);
  await page.screenshot({ path: path.join(out, '2-detail.png'), type: 'png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Early finds' }).click();
  await page.waitForTimeout(400);
  const earlyRows = await page.locator('tbody tr').count();
  const earlyFirst = await page.locator('tbody tr').first().locator('b').first().textContent();
  console.log('early rows rendered:', earlyRows, '| first:', earlyFirst);
  await page.screenshot({ path: path.join(out, '3-filtered.png'), type: 'png' });
  // Sandbox smoke check: growth weight 0.5 -> 1.0 must move the ranking.
  await page.getByRole('button', { name: 'Model & method' }).click();
  await page.waitForTimeout(300);
  const before = await page.locator('.sandbox-results p').first().textContent();
  await page.locator('.slider-row input[type="range"]').nth(1).fill('1');
  await page.waitForTimeout(300);
  const after = await page.locator('.sandbox-results p').first().textContent();
  const sandboxTop = await page.locator('.sandbox-results tbody tr').first().locator('b').textContent();
  console.log('sandbox before:', before, '| after growth weight 1.0:', after, '| sandbox top 1:', sandboxTop);
  console.log('console errors:', errors.length ? errors : 'none');
  await browser.close();
  for (const n of ['1-board.png', '2-detail.png', '3-filtered.png']) {
    console.log(n, fs.statSync(path.join(out, n)).size, 'bytes');
  }
})();
