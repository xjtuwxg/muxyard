import { test, expect } from '@playwright/test'
test('landing page supports theme previews, downloads, keyboard navigation and narrow screens', async ({
  page
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveTitle(/Muxyard.*tmux/)
  await expect(page.getByRole('heading', { name: 'Your tmux. A better view.' })).toBeVisible()
  for (const name of ['Daylight', 'Paper', 'Graphite', 'Dusk', 'Grove']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.locator('#workspace-image')).toHaveAttribute(
      'src',
      `assets/screenshots/overview-${name.toLowerCase()}.png`
    )
    await expect
      .poll(() =>
        page
          .locator('#workspace-image')
          .evaluate((image) => image.complete && image.naturalWidth > 0)
      )
      .toBe(true)
  }
  await page.getByRole('link', { name: 'Download preview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
  await expect(page.locator('[data-platform]')).toHaveCount(4)
  await page.getByText('Does Muxyard replace tmux?', { exact: true }).click()
  await expect(page.getByText('It attaches to real tmux sessions', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    await page
      .locator('img')
      .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))
  ).toBe(true)
  expect(errors).toEqual([])
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main$/)
  await page.screenshot({ path: test.info().outputPath('website.png'), fullPage: true })
})
test('missing release metadata keeps honest source and releases links', async ({ page }) => {
  await page.route('**/release.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: null, platforms: {} })
    })
  )
  await page.goto('/#downloads')
  await expect(page.getByRole('link', { name: 'View releases', exact: true })).toHaveCount(4)
  await expect(page.getByText('Check GitHub for the latest public preview.')).toBeVisible()
})

test('public release metadata exposes only the matching platform downloads', async ({ page }) => {
  const base = 'https://github.com/xjtuwxg/muxyard/releases/'
  const platforms = {
    'mac-arm64': [
      ['DMG', 'mac-arm64.dmg'],
      ['ZIP', 'mac-arm64.zip']
    ],
    'mac-x64': [
      ['DMG', 'mac-x64.dmg'],
      ['ZIP', 'mac-x64.zip']
    ],
    'win-x64': [['EXE', 'win-x64.exe']],
    'linux-x64': [
      ['DEB', 'linux-amd64.deb'],
      ['AppImage', 'linux-x86_64.AppImage']
    ]
  }
  const manifest = {
    version: 'v0.1.0',
    prerelease: true,
    url: base + 'tag/v0.1.0',
    platforms: Object.fromEntries(
      Object.entries(platforms).map(([platform, files]) => [
        platform,
        files.map(([label, file]) => ({
          label,
          url: base + 'download/v0.1.0/Muxyard-0.1.0-' + file
        }))
      ])
    )
  }
  await page.route('**/release.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) })
  )
  await page.goto('/#downloads')
  await expect(page.locator('#release-label')).toHaveText('v0.1.0 preview')
  await expect(page.locator('.download-actions a')).toHaveCount(7)
  for (const [platform, files] of Object.entries(platforms)) {
    const links = page.locator(`[data-platform="${platform}"] .download-actions a`)
    await expect(links).toHaveCount(files.length)
    for (let index = 0; index < files.length; index++)
      await expect(links.nth(index)).toHaveAttribute(
        'href',
        base + 'download/v0.1.0/Muxyard-0.1.0-' + files[index][1]
      )
  }
})
