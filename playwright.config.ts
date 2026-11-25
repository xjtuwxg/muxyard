import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  workers: 1,
  use: { viewport: { width: 1480, height: 940 } }
})
