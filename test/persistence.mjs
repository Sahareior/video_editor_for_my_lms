import { launch } from './browser.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. Check title input
  const ttlInput = page.locator('.ttl');
  const initialTitle = await ttlInput.inputValue();
  console.log('Initial title:', initialTitle);

  // 2. Change project title
  console.log('Changing title to "My Preserved Video"...');
  await ttlInput.fill('My Preserved Video');
  await page.locator('.hdr').click(); // blur input

  // 3. Change aspect ratio to 1:1
  console.log('Switching aspect ratio to 1:1...');
  await page.locator('.aspBtn', { hasText: '1:1' }).click();

  // 4. Wait for auto-save badge to say Auto-saved
  console.log('Waiting for auto-save to finish...');
  await page.waitForFunction(() => {
    const badge = document.querySelector('.saveBadge');
    return badge && badge.textContent.includes('Auto-saved');
  }, { timeout: 3000 });

  console.log('Auto-save confirmed. Reloading page...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 5. Verify restored state
  const restoredTitle = await page.locator('.ttl').inputValue();
  console.log('Restored title:', restoredTitle);
  if (restoredTitle !== 'My Preserved Video') {
    throw new Error(`Expected title "My Preserved Video", got "${restoredTitle}"`);
  }

  const isSquareActive = await page.locator('.aspBtn.on', { hasText: '1:1' }).count();
  if (isSquareActive !== 1) {
    throw new Error('Expected 1:1 aspect ratio to remain active after refresh');
  }

  // 6. Test File menu
  console.log('Testing File menu...');
  await page.locator('.projMenuWrap button').click();
  const dropdownVisible = await page.locator('.projDropdown').isVisible();
  if (!dropdownVisible) {
    throw new Error('File menu dropdown should be visible when clicked');
  }

  console.log('\n\x1b[32m✓ SUCCESS: Project progress successfully preserved and restored across refresh!\x1b[0m\n');
} finally {
  await browser.close();
}
