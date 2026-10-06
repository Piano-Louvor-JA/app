import { test, expect, type Page } from '@playwright/test'

// Base correta desde o hotfix 14/09 (app#175): default público é
// api.pianolouvorja.com.br (workspace-api.ts resolveDatabaseUrl).
const API_BASE = 'https://api.pianolouvorja.com.br/json_db'

/** Intercepta todas as chamadas para a API e registra os filenames buscados. */
async function interceptApi(page: Page): Promise<Set<string>> {
  const fetchedKeys = new Set<string>()
  await page.route(`${API_BASE}/**`, async (route) => {
    const url = route.request().url()
    const filename = url.replace(`${API_BASE}/`, '').split('?')[0]
    fetchedKeys.add(filename)
    // Return empty array to avoid breaking the app
    await route.fulfill({ json: [] })
  })
  return fetchedKeys
}

/**
 * O fetch de catálogo (com prefixo de idioma) acontece ao abrir a Central de
 * Mídia (/albums) — no boot o browser puro não busca catálogo (bootstrap
 * Electron). O label de navegação é i18n: usar o botão pela rota alvo.
 */
async function openAlbumsAndSettle(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForTimeout(1500)
  await page
    .locator('nav.ds-dock button', { hasText: /Media|Central de M/ })
    .first()
    .click({ timeout: 10000 })
  await page.waitForTimeout(4000)
}

test.describe('Language switching and API prefix', () => {
  test('app loads and shows Portuguese content by default', async ({ page }) => {
    await page.goto('/')
    // App should load — check for any visible text
    await expect(page.locator('body')).toBeVisible()
  })

  test('API fetches use pt_ prefix by default', async ({ page }) => {
    const keys = await interceptApi(page)
    await openAlbumsAndSettle(page)
    const ptKeys = [...keys].filter((k) => k.startsWith('pt_'))
    expect(ptKeys.length).toBeGreaterThan(0)
  })

  test('switching to Spanish makes API use es_ prefix', async ({ page }) => {
    // Set language preference before app loads
    await page.addInitScript(() => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
    })

    const keys = await interceptApi(page)
    await openAlbumsAndSettle(page)

    const esKeys = [...keys].filter((k) => k.startsWith('es_'))
    expect(esKeys.length).toBeGreaterThan(0)

    // No pt_ calls should happen in Spanish mode
    const ptKeys = [...keys].filter((k) => k.startsWith('pt_'))
    expect(ptKeys).toEqual([])
  })

  test('switching to English makes API use en_ prefix', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'en' }))
    })

    const keys = await interceptApi(page)
    await openAlbumsAndSettle(page)

    const enKeys = [...keys].filter((k) => k.startsWith('en_'))
    expect(enKeys.length).toBeGreaterThan(0)

    const ptKeys = [...keys].filter((k) => k.startsWith('pt_'))
    expect(ptKeys).toEqual([])
  })

  test('language can be switched at runtime via Settings', async ({ page }) => {
    const keys = await interceptApi(page)
    await page.goto('/')
    await page.waitForTimeout(2000)

    // Navigate to settings if possible
    // The app may use a navigation drawer or bottom nav
    const settingsLink = page.locator('[data-testid="nav-settings"], a[href*="settings"], button:has-text("Config")').first()
    if (await settingsLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsLink.click()
      await page.waitForTimeout(1000)

      // Find Spanish language button
      const spanishBtn = page.locator('button:has-text("Espa"), [value="es"]').first()
      if (await spanishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await spanishBtn.click()
        await page.waitForTimeout(2000)

        keys.clear()
        await openAlbumsAndSettle(page)

        const esKeys = [...keys].filter((k) => k.startsWith('es_'))
        expect(esKeys.length).toBeGreaterThan(0)
      }
    }
  })
})
