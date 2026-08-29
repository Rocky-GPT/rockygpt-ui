import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser with visible user interactions...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 600, // Slow down operations so you can watch mouse & clicks
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('Typing question into chat input...');
  const textarea = page.locator('textarea').first();
  await textarea.click();
  await textarea.fill('What shuttles are running today?');

  console.log('Clicking Send button like a user...');
  const sendButton = page.locator('button[type="submit"], button[aria-label*="Send"], button:has-text("Send")').first();
  if (await sendButton.isVisible()) {
    await sendButton.click();
  } else {
    await textarea.press('Enter');
  }

  console.log('Waiting for RockyGPT response...');
  await page.waitForTimeout(5000);

  console.log('Scrolling down to read response...');
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(3000);

  console.log('Demo completed! Closing browser in 3 seconds...');
  await page.waitForTimeout(3000);
  await browser.close();
}

run().catch(console.error);
