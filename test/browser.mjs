/* Shared Playwright bootstrap.

   The vendored test files were written against a default `chromium.launch()`,
   which resolves the browser out of PLAYWRIGHT_BROWSERS_PATH. In this sandbox
   the full Chromium build is present but not the headless shell, so we pin the
   executable and let the caller decide the launch args. */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

export function launch(extraArgs = []) {
  const executablePath = CANDIDATES.find(p => existsSync(p));
  return chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', ...extraArgs],
  });
}
