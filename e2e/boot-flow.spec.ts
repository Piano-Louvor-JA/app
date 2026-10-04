import { test, expect, type Page } from '@playwright/test'

/**
 * Boot flow E2E — first boot vs warm boot vs bridge ausente vs retry.
 *
 * Como o app decide (useAppBootstrap + bootstrap-service):
 * - Browser puro (sem Electron): splash breve e libera o app (sem consultar flag).
 * - Shell Electron sem bridge (`window.louvorja`): overlay com erro
 *   `starting.status.bridgeMissing` + botão retry (nunca esconde o overlay).
 * - Flag de bootstrap completo: sessionStorage `db:bootstrap_complete`
 *   (WORKSPACE_RECORD_KEYS.bootstrapComplete via catalogSessionPrefix `db:`).
 *
 * Nota EULA: o gate de EULA do desktop é apresentado pelo shell/link nas
 * Configurações — no contexto web puro do Playwright não há interceptação de
 * boot, então nada precisa ser injetado (verificado em src: nenhum código
 * consulta EULA no fluxo de bootstrap).
 */

const OVERLAY = '.starting-overlay'
const STATUS = '[data-test="starting-status"]'
const RETRY = '.starting-overlay__retry'
const BOOT_FLAG_KEY = 'db:bootstrap_complete'

/** Spoofa shell Electron sem preload — `isElectronShell()` true, bridge ausente. */
async function spoofElectronWithoutBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) piano-app/1.0.0 Chrome/130.0.0.0 Electron/33.0.0 Safari/537.36',
    })
  })
}

test.describe('Boot flow', () => {
  test('first boot sem flag de bootstrap: splash aparece e some', async ({ page }) => {
    // Garante contexto limpo (sem flag em sessionStorage/localStorage).
    await page.addInitScript(() => {
      sessionStorage.clear()
      localStorage.clear()
    })

    await page.goto('/')
    // Static splash do index.html é dispensado pelo composable.
    await expect(page.locator('#boot-splash')).toBeHidden()

    // Overlay Vue aparece durante o boot...
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 10_000 })

    // ...e some (branch browser puro: splash breve e libera o app).
    await expect(page.locator(OVERLAY)).toBeHidden({ timeout: 15_000 })

    // App liberado: conteúdo montado no #app.
    await expect(page.locator('#app *').first()).toBeVisible()
  })

  test('warm boot com isBootstrapComplete: splash breve e app liberado', async ({ page }) => {
    await page.addInitScript((key: string) => {
      sessionStorage.setItem(key, JSON.stringify({ complete: true }))
    }, BOOT_FLAG_KEY)

    await page.goto('/')
    await expect(page.locator('#boot-splash')).toBeHidden()
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(OVERLAY)).toBeHidden({ timeout: 15_000 })
    await expect(page.locator('#app *').first()).toBeVisible()
  })

  test('bridge ausente (shell Electron sem preload): bridgeMissing tratado sem travar', async ({
    page,
  }) => {
    await spoofElectronWithoutBridge(page)

    await page.goto('/')
    await expect(page.locator('#boot-splash')).toBeHidden()

    // Overlay permanece visível com o erro de bridge (não esconde).
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(OVERLAY)).toContainText(/tentar|retry|novamente/i, {
      timeout: 10_000,
    })
    await expect(page.locator(RETRY)).toBeVisible()
  })

  test('retry após erro de bridge: fluxo reinicia e erro é re-tratado sem crash', async ({
    page,
  }) => {
    await spoofElectronWithoutBridge(page)

    await page.goto('/')
    await expect(page.locator(RETRY)).toBeVisible({ timeout: 10_000 })

    // Retry reinicia o fluxo: sem bridge de novo → erro re-tratado, app não trava.
    await page.locator(RETRY).click()
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(RETRY)).toBeVisible({ timeout: 10_000 })

    // Página viva: sem uncaught exception derrubando o app.
    await expect(page.locator('#app')).toBeAttached()
  })
})
