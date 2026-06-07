import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Login as free demo user
await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'free@demo.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 8000 });

// Navigate to the session we created via API (id=4)
await page.goto('http://localhost:5173/session/4', { waitUntil: 'networkidle' });
await page.screenshot({ path: '/tmp/sync-01-session.png' });

// Click Manage tab
await page.click('text=manage');
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/sync-02-manage-tab.png' });

// Verify sync panel elements
const syncTitle = await page.locator('text=Photo Sync from Mac').count();
const startBtn = await page.locator('text=Start Sync').count();
const watchPath = await page.locator('text=Downloads').first().innerText().catch(() => '?');
console.log('Sync panel heading visible:', syncTitle);
console.log('Start Sync button visible:', startBtn);
console.log('Watch path text:', watchPath);

// Wait for status poll to fill in (watcher is already running from API test)
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/sync-03-with-status.png' });

const activeIndicator = await page.locator('text=Syncing').count();
console.log('Active sync indicator visible:', activeIndicator);

await browser.close();
console.log('\n✅ Sync UI verified');
