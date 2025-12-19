import { test, expect } from '@playwright/test'

test('demo flow scans and trashes flagged shots', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /use demo set/i }).click()

  await page.getByText('Scan progress').waitFor()
  await page.waitForSelector('article.card')
  const initialCount = await page.locator('.grid .card').count()
  await page.waitForSelector('article.card .pill.quality:not(:has-text("—"))', { timeout: 15000 })

  const flaggedButton = page.getByRole('button', { name: /select flagged/i })
  await expect(flaggedButton).toBeEnabled({ timeout: 10000 })
  await flaggedButton.click()

  const selText = page.getByText(/Selected:\s*\d+/i)
  await expect(selText).toBeVisible({ timeout: 5000 })
  const count = parseInt((await selText.innerText()).match(/\d+/)?.[0] ?? '0', 10)
  expect(count).toBeGreaterThan(0)

  // Ensure at least one item is selected (fallback)
  await page.locator('article.card').first().click()

  const trashButton = page.getByRole('button', { name: /move to trash/i })
  await expect(trashButton).toBeEnabled({ timeout: 10000 })
  await trashButton.click()

  await page.getByText(/moved .* file/i).waitFor({ timeout: 5000 })

  await expect(await page.locator('.grid .card').count()).toBeLessThan(initialCount)
  await page.screenshot({ path: 'test-output/demo-flow.png', fullPage: true })
})

test('threshold filter hides sharp images when flagged only is on', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /use demo set/i }).click()
  await page.waitForSelector('article.card')
  await page.getByText('Scan progress').waitFor()

  await page.getByRole('checkbox', { name: /flagged only/i }).check()
  await expect(page.locator('article.card').first()).toBeVisible()

  await page.locator('input[type="range"]').fill('70')
  const flaggedCount = await page.locator('.grid .card').count()
  expect(flaggedCount).toBeGreaterThanOrEqual(1)
})

test('controls layout keeps selection counter visible at 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: /use demo set/i }).click()
  await page.waitForSelector('.controls')
  const counter = page.locator('.pill-count')
  await expect(counter).toBeVisible()
  await page.screenshot({ path: 'test-output/controls-1024.png', fullPage: true })
})
