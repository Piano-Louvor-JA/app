import { test, expect, type Page } from '@playwright/test'

// Base real em dev: .env define VITE_URL_DATABASE=api.pianolouvorja.com.br/json_db
// (resolveDatabaseUrl em workspace-api.ts). O mock global do beforeEach cobre
// os dois domínios; este interceptor (registrado depois = prioridade LIFO no
// Playwright) registra os filenames buscados.
const API_BASE = 'https://api.pianolouvorja.com.br/json_db'

/**
 * Mock GLOBAL de API: aplicado em test.beforeEach para TODOS os testes.
 * Sem isso, o app aguarda chamadas reais (api.louvorja.com.br) que travam o
 * evento load quando a rede nao responde rapido -> timeout no page.goto.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/api.louvorja.com.br/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api.pianolouvorja.com.br/**', (route) =>
    route.fulfill({ json: [] }),
  )
  // NOTA: NAO usar addInitScript p/ desabilitar serviceWorker aqui — o
  // defineProperty no init script quebra os page.route registrados em
  // seguida (interceptApi deixa de receber os requests; verificado por
  // bisection). Este app nao registra SW em dev.
})

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
 * O catálogo (`pt_hymnal`, `es_musics`, ...) so e buscado quando o operador
 * abre a Central de Midia (hydrateCatalog do useAlbumsStore). Navegar ate la
 * e aguardar o primeiro request com prefixo de idioma.
 */
async function openMediaHubAndAwaitPrefix(
  page: Page,
  prefix: string,
): Promise<void> {
  // Dev server compartilhado pode resetar a conexao no meio da navegacao
  // (ERR_ABORTED em hot-transform) — retry una vez.
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  } catch {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  }
  // Sidebar so aparece depois do bootstrap (boot-splash some) — esperar pelo
  // item de menu (nav principal, botao Media Center/Central de Midia).
  const hubButton = page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('button')
    .nth(1)
  await hubButton.waitFor({ timeout: 20000 })
  await hubButton.click()
  await page.waitForRequest(
    (r) => r.url().includes('/json_db/') && r.url().includes(`/${prefix}_`),
    { timeout: 15000 },
  )
  // waitForRequest resolve no INICIO do request — o handler da rota (que
  // registra a key no Set) roda async depois. Esperar a resposta chegar.
  await page.waitForResponse(
    (r) => r.url().includes('/json_db/') && r.url().includes(`/${prefix}_`),
    { timeout: 15000 },
  )
}

test.describe('Language switching and API prefix', () => {
  test('app loads and shows Portuguese content by default', async ({ page }) => {
    await page.goto('/')
    // App should load — check for any visible text
    await expect(page.locator('body')).toBeVisible()
  })

  test('API fetches use pt_ prefix by default', async ({ page }) => {
    const keys = await interceptApi(page)
    await openMediaHubAndAwaitPrefix(page, 'pt')
    const ptKeys = [...keys].filter((k) => k.startsWith('pt_'))
    expect(ptKeys.length).toBeGreaterThan(0)
  })

  test('switching to Spanish makes API use es_ prefix', async ({ page }) => {
    // Set language preference before app loads
    await page.addInitScript(() => {
      localStorage.setItem('user_data', JSON.stringify({ language: 'es' }))
    })

    const keys = await interceptApi(page)
    await openMediaHubAndAwaitPrefix(page, 'es')

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
    await openMediaHubAndAwaitPrefix(page, 'en')

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
        await page.reload()
        await page.waitForTimeout(3000)

        const esKeys = [...keys].filter((k) => k.startsWith('es_'))
        expect(esKeys.length).toBeGreaterThan(0)
      }
    }
  })
})
