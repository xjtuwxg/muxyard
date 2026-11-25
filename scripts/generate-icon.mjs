import { _electron as electron } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined)
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({
  args: [fileURLToPath(new URL('./render-icon.cjs', import.meta.url))],
  env
})
try {
  const page = await app.firstWindow()
  await page.locator('svg').waitFor()
  await mkdir(new URL('../build/', import.meta.url), { recursive: true })
  await page.screenshot({ path: 'build/icon.png', omitBackground: true, scale: 'css' })
} finally {
  await app.close()
}
