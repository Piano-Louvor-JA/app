import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Só specs são do Playwright; *.test.ts em e2e/helpers/__tests__ é do vitest.
  testMatch: '**/*.spec.ts',
  // Guard de produção (G2): aborta a suíte antes de qualquer request se a
  // URL EFETIVA de alguma env de API (process.env > .env.local > .env —
  // VITE_URL_DATABASE/VITE_URL_FILES/VITE_PALCO_API_URL/PIANO_API_BASE_URL/
  // VITE_API_FALLBACK_URLS) apontar para api.pianolouvorja.com.br.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5273',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5273 --strictPort',
    url: 'http://localhost:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
