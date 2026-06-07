import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Accept all confirm dialogs automatically
page.on('dialog', async (dialog) => {
  console.log('Dialog:', dialog.message());
  await dialog.accept();
});

await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'premium@demo.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 8000 });

await page.goto('http://localhost:5173/session/5', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/stop-01-active.png' });
console.log('Active badge:', await page.locator('text=Active').count());
console.log('Stop button:', await page.locator('text=⏸ Stop').count());

// Stop
await page.click('text=⏸ Stop');
await page.waitForSelector('text=Session paused', { timeout: 8000 });
await page.screenshot({ path: '/tmp/stop-02-stopped.png' });
console.log('Stopped banner visible:', await page.locator('text=Session paused').count());

// Restart from the banner button
await page.locator('text=▶ Restart').first().click();
await page.waitForSelector('text=active', { timeout: 8000 });
await page.screenshot({ path: '/tmp/stop-03-restarted.png' });
console.log('Active again:', await page.locator('text=active').count());

await browser.close();
console.log('\n✅ Stop/restart UI verified');
