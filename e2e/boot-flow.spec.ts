import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Boot Flow: first boot vs warm boot vs bridge missing vs retry
 *
 * Contrato real (useAppBootstrap + bootstrap-service):
 * - Web puro (sem bridge e sem UA Electron): splash breve (400ms) e some.
 * - Shell Electron SEM bridge: `starting.status.bridgeMissing` — overlay
 *   fica VISÍVEL com botão de retry (não esconde, não trava o app).
 * - Bridge OK sem `bootstrap_complete`: first boot — sync dos índices via
 *   API `/json_db`, `markBootstrapComplete()`, `window.location.reload()`,
 *   e o reload cai no warm boot.
 * - Bridge OK com `bootstrap_complete`: warm boot (~1.7s + 300ms) e some.
 * - Retry: botão chama `retryBootstrap()` — revalida a bridge e roda
 *   `runFirstBoot()` de novo.
 *
 * Determinismo:
 * - Bridge `window.louvorja` mockada; workspace espelhado em localStorage
 *   (`__e2e_workspace_records__`) para sobreviver ao reload do first boot.
 * - APIs de catálogo mockadas (API Piano + API LouvorJA).
 * - Contexto do browser é FRESCO por teste (não limpar o espelho no seed —
 *   isso apagaria `bootstrap_complete` escrito no reload do first boot).
 * - Service Worker desabilitado.
 *
 * IMPORTANTE (pitfall de serialização): `page.addInitScript(fn)` serializa
 * apenas `fn.toString()` — referências a identificadores do módulo do spec
 * NÃO viajam junto e estouram ReferenceError silencioso dentro do browser.
 * Por isso os init scripts abaixo são strings auto-contidas; `page.evaluate`
 * aceita função normal porque roda com o closure do Node serializado com
 * argumentos explícitos.
 *
 * Serial: cada teste manipula estado global (localStorage/bridge).
 */

const WORKSPACE_MIRROR_KEY = '__e2e_workspace_records__'
const BOOTSTRAP_COMPLETE_KEY = 'bootstrap_complete'

/** Arquivos essenciais baixados no first boot (syncEssentialCatalogFromApi). */
const CATALOG: Record<string, unknown> = {
  pt_musics: [],
  pt_hymnal: [],
  pt_hymnal_1996: [],
  pt_categories: [],
  pt_bible_book: [],
  pt_bible_version: [],
  config: {},
}

/** Mocka as APIs externas (primária + fallback) com catálogo vazio. */
async function mockExternalApis(page: Page): Promise<void> {
  const fulfillCatalog = (route: {
    request: () => { url: () => string }
    fulfill: (opts: { json: unknown }) => Promise<unknown>
  }) => {
    const url = route.request().url()
    const filename = url.split('/json_db/')[1]?.split('?')[0]
    void route.fulfill({
      json: filename && filename in CATALOG ? CATALOG[filename] : [],
    })
  }
  await page.route('**://api.louvorja.com.br/**', fulfillCatalog)
  await page.route('**://api.pianolouvorja.com.br/**', fulfillCatalog)
}

type BridgeMode = 'full' | 'shell'

/**
 * Script AUTO-CONTIDO (string): instala a bridge Electron mockada
 * (`window.louvorja`).
 * - mode 'full': workspace espelhado em localStorage (sobrevive ao reload
 *   do first boot) + media mockada.
 * - mode 'shell': só isElectron/platform — startBootstrap cai em
 *   `bridgeMissing` (overlay com erro + botão de retry).
 */
function bridgeInitScript(mode: BridgeMode): string {
  const fullBridge = `{
    isElectron: true,
    platform: 'linux',
    workspace: {
      getRecord: async (filename) => readAll()[filename] ?? null,
      saveRecord: async (filename, data) => {
        const records = readAll()
        records[filename] = data
        writeAll(records)
        return true
      },
      clear: async () => { writeAll({}); return true },
      readBinaryFile: async () => null,
    },
    media: {
      check: async () => false,
      checkMany: async (_type, filenames) =>
        Object.fromEntries(filenames.map((f) => [f, false])),
      download: async () => true,
      delete: async () => true,
      probeDuration: async () => 0,
    },
  }`
  const shellBridge = `{
    // Shell Electron sem preload/bridge completa → bridgeMissing.
    isElectron: true,
    platform: 'linux',
  }`

  return `(() => {
    const MIRROR_KEY = '${WORKSPACE_MIRROR_KEY}'
    const readAll = () => {
      try { return JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '{}') } catch { return {} }
    }
    const writeAll = (records) => localStorage.setItem(MIRROR_KEY, JSON.stringify(records))
    const bridge = ${mode === 'full' ? fullBridge : shellBridge}
    Object.defineProperty(window, 'louvorja', { configurable: true, value: bridge })
  })()`
}

/**
 * Script AUTO-CONTIDO (string): EULA aceito + preferências pt.
 * NÃO limpa o espelho do workspace: o contexto é fresco por teste e o
 * reload do first boot precisa do `bootstrap_complete` persistido.
 */
const SEED_INIT_SCRIPT = `(() => {
  localStorage.setItem('eula_accepted_v1', 'true')
  if (!localStorage.getItem('user_data')) {
    localStorage.setItem('user_data', JSON.stringify({ language: 'pt' }))
  }
})()`

/** Aguarda a splash de boot desaparecer (overlay `.starting-overlay` removido). */
async function waitForBootComplete(page: Page): Promise<void> {
  await expect(page.locator('.starting-overlay')).toHaveCount(0, {
    timeout: 30000,
  })
}

/**
 * Lê a flag `bootstrap_complete` de QUALQUER fonte real do app:
 * 1. cache de sessão `db:bootstrap_complete` (readCatalogRecord prioriza
 *    sessionStorage após a primeira leitura/escrita);
 * 2. espelho do workspace `__e2e_workspace_records__` (bridge mockada).
 */
function readBootstrapFlag(page: Page) {
  return page.evaluate(
    ([mirrorKey, flagKey]) => {
      const fromSession = sessionStorage.getItem(`db:${flagKey}`)
      if (fromSession != null) {
        try {
          return (JSON.parse(fromSession) as { complete?: boolean }).complete === true
        } catch {
          /* segue pro espelho */
        }
      }
      const records = JSON.parse(
        localStorage.getItem(mirrorKey) ?? '{}',
      ) as Record<string, { complete?: boolean }>
      return records[flagKey]?.complete === true
    },
    [WORKSPACE_MIRROR_KEY, BOOTSTRAP_COMPLETE_KEY],
  )
}

test.describe.configure({ mode: 'serial' })

test.describe('Boot Flow — first boot / warm boot / bridge missing / retry', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page)
    // Service Worker pode interceptar requests e quebrar os mocks.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined })
    })
    await page.addInitScript(SEED_INIT_SCRIPT)
  })

  test('(1) First boot sem bootstrap_complete → splash sincroniza, marca flag e some', async ({
    page,
  }) => {
    await page.addInitScript(bridgeInitScript('full'))

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Splash aparece durante o first boot…
    await expect(page.locator('.starting-overlay')).toBeVisible({
      timeout: 15000,
    })

    // …e some após o sync + reload (reload cai no warm boot).
    await waitForBootComplete(page)

    // Flag de bootstrap gravada no workspace.
    expect(await readBootstrapFlag(page)).toBe(true)

    // App navegável após o boot.
    await expect(page.locator('body')).toBeVisible()
  })

  test('(2) Warm boot com bootstrap_complete → splash breve e some', async ({
    page,
  }) => {
    await page.addInitScript(bridgeInitScript('full'))
    await page.addInitScript(`(() => {
      localStorage.setItem('${WORKSPACE_MIRROR_KEY}', JSON.stringify({
        ${BOOTSTRAP_COMPLETE_KEY}: { complete: true },
      }))
    })()`)

    const startedAt = Date.now()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForBootComplete(page)
    const elapsedMs = Date.now() - startedAt

    // Warm boot é um intervalo de ~1.7s + 300ms no código — threshold
    // generoso para CI lento, mas bem abaixo do first boot.
    expect(elapsedMs).toBeLessThan(20000)

    // Flag intacta (nenhum re-sync disparado).
    expect(await readBootstrapFlag(page)).toBe(true)
  })

  test('(3) Shell Electron sem bridge → erro bridgeMissing tratado sem travar', async ({
    page,
  }) => {
    await page.addInitScript(bridgeInitScript('shell'))

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // O app NÃO some nem trava: overlay permanece visível com o estado
    // de erro e o botão de retry disponível (contrato do startBootstrap:
    // markError não esconde a splash).
    await expect(page.locator('.starting-overlay')).toBeVisible({
      timeout: 15000,
    })
    await expect(page.locator('.starting-overlay__retry')).toBeVisible()

    // Botão clicável = app não travou (sem freeze de renderer).
    await expect(page.locator('.starting-overlay__retry')).toBeEnabled()
  })

  test('(4) Retry após erro de bridge → fluxo reinicia e completa o bootstrap', async ({
    page,
  }) => {
    await page.addInitScript(bridgeInitScript('shell'))

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Estado inicial: overlay de erro com botão de retry.
    await expect(page.locator('.starting-overlay__retry')).toBeVisible({
      timeout: 15000,
    })

    // Bridge "volta" (ex.: preload atrasado) — o retry revalida em tempo
    // de chamada via getDesktopBridge(). Re-instala a bridge completa
    // IN-PAGE (init scripts só rodam em navegações futuras).
    await page.evaluate(bridgeInitScript('full'))

    // Retry → runFirstBoot → sync → reload → warm boot → overlay some.
    await page.click('.starting-overlay__retry')
    await waitForBootComplete(page)

    expect(await readBootstrapFlag(page)).toBe(true)
    await expect(page.locator('body')).toBeVisible()
  })
})
