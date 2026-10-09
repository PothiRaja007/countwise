// P12 — Playwright config. Each journey runs on 4 combinations: phone/desktop x light/dark.
//
// First time on a machine:   npm install   then   npx playwright install chromium     (one download, about 150 MB)
// Run everything:            npm run e2e
// Run one journey / one combination:   npm run e2e -- j01 --project=phone-dark
// Use a Chromium you already have:     set PW_CHROMIUM_PATH to its executable
// Another port (if 5199 is busy):      set E2E_PORT
// Nothing here talks to a real Supabase project: the app is served by vite.e2e.config.js with stand-ins.
import { defineConfig } from '@playwright/test'

// Optional: use an already-installed Chromium instead of the one `npx playwright install chromium` downloads.
const PORT = Number(process.env.E2E_PORT || 5199)
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const combo = (name, viewport, theme) => ({ name, use: { viewport, theme, hasTouch: viewport === PHONE, isMobile: false } })

export default defineConfig({
  testDir: './journeys',
  outputDir: '../test-results',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  retries: 0,
  fullyParallel: true,
  reporter: [['list']],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --config e2e/vite.e2e.config.js',
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    combo('phone-light', PHONE, 'light'),
    combo('phone-dark', PHONE, 'dark'),
    combo('desktop-light', DESKTOP, 'light'),
    combo('desktop-dark', DESKTOP, 'dark'),
  ],
})
