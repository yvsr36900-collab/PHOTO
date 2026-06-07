import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function shot(name) {
  await page.screenshot({ path: `/tmp/sg-${name}.png`, fullPage: false });
  console.log(`📸 screenshot: /tmp/sg-${name}.png`);
}

// ── HOME PAGE ──────────────────────────────────────────────
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await shot('01-home');
console.log('Home title:', await page.title());

// ── PRICING ───────────────────────────────────────────────
await page.click('text=Pricing');
await page.waitForLoadState('networkidle');
await shot('02-pricing');
console.log('Pricing loaded, plans visible:', await page.locator('.card').count());

// ── REGISTER ──────────────────────────────────────────────
await page.goto('http://localhost:5173/register');
await page.fill('input[type="text"]', 'Test User');
await page.fill('input[type="email"]', `test_${Date.now()}@example.com`);
await page.fill('input[type="password"]', 'secret123');
await shot('03-register-filled');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 8000 });
await shot('04-dashboard-fresh');
console.log('Dashboard reached:', page.url());

// ── CREATE SESSION ─────────────────────────────────────────
await page.click('text=+ New Session');
await page.waitForSelector('input[placeholder*="Birthday"]');
await page.fill('input[placeholder*="Birthday"]', 'Smoke Test Party');
await page.selectOption('select', 'Birthday');
await page.fill('input[type="number"]', '120');
await shot('05-new-session-form');
await page.click('button[type="submit"]');
await page.waitForURL('**/session/**', { timeout: 8000 });
await page.waitForLoadState('networkidle');
await shot('06-session-page');

const url = page.url();
const sessionId = url.split('/session/')[1];
console.log('Session created, id:', sessionId);

// get join code from page
const codeEl = await page.locator('text=/[A-Z0-9]{6}/').first();
const joinCode = await codeEl.innerText().catch(() => 'unknown');
console.log('Join code on page:', joinCode);

// ── SHARE TAB ──────────────────────────────────────────────
await page.click('text=share');
await page.waitForTimeout(500);
await shot('07-share-tab');

// ── JOIN FLOW (guest) ──────────────────────────────────────
const context2 = await browser.newContext();
const guestPage = await context2.newPage();
// extract code from the share tab input
const shareInput = await page.inputValue('input[readonly]');
const code = shareInput.split('/join/')[1];
console.log('Joining as guest with code:', code);

await guestPage.goto(`http://localhost:5173/join/${code}`, { waitUntil: 'networkidle' });
await shot('08-guest-join-landing');
await guestPage.fill('input[placeholder*="display name"]', 'Guest Alice');
await guestPage.click('button[type="submit"]');
await guestPage.waitForLoadState('networkidle');
await shot('09-guest-session');
console.log('Guest in session, photos count:', await guestPage.locator('[class*="grid"] > div').count());

// ── LOGOUT + LOGIN WITH DEMO ───────────────────────────────
await page.click('text=Logout');
await page.waitForURL('http://localhost:5173/', { timeout: 5000 });
await page.goto('http://localhost:5173/login');
await page.fill('input[type="email"]', 'premium@demo.com');
await page.fill('input[type="password"]', 'password123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 8000 });
await shot('10-premium-dashboard');
console.log('Premium user logged in:', await page.locator('text=Premium ✦').count(), 'badge(s)');

await browser.close();
console.log('\n✅ All smoke tests passed.');
