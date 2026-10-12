import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Central de Mídia: download offline → progresso → RELOAD → persiste.
 *
 * Requisito offline-first permanente do produto: NADA pode se perder com
 * reload. O download marca a coletânea no manifesto `downloaded_albums`
 * (record do workspace). No browser E2E a bridge Electron é mockada e o
 * "workspace" é persistido em localStorage — exatamente o mesmo contrato
 * que `workspace:get-record` / `workspace:save-record` cumprem no Electron
 * (arquivo .bin em disco). Se o reload perder o estado, o teste falha.
 *
 * Sem isso os controles de download nem aparecem: AlbumsView só renderiza
 * `showDownloadControls` quando `isDesktopApp()` (bridge.isElectron).
 * A bridge também liga o router em hash (`isElectronShell`), então a rota
 * é `/#/albums`.
 *
 * Serial: o fluxo é stateful (download → reload → verificação).
 */

const HYMNAL_FILE = 'pt_hymnal'
const MANIFEST_KEY = 'downloaded_albums'
const EULA_KEY = 'eula_accepted_v1'
const WORKSPACE_MIRROR_KEY = '__e2e_workspace_records__'

/** Registros de catálogo servidos pelo mock da API Piano (…/json_db/<file>). */
const CATALOG: Record<string, unknown> = {
  [HYMNAL_FILE]: [{ id_music: 1 }, { id_music: 2 }],
  pt_hymnal_1996: [],
  pt_categories: [],
  pt_musics: [],
  config: {},
  music_1: {
    id_music: 1,
    name: 'Hino 1',
    url_music: 'https://files.e2e.test/musics/hino-1.mp3',
    url_instrumental_music: null,
    url_image: null,
    lyric: null,
  },
  music_2: {
    id_music: 2,
    name: 'Hino 2',
    url_music: 'https://files.e2e.test/musics/hino-2.mp3',
    url_instrumental_music: null,
    url_image: null,
    lyric: null,
  },
}

/** Mocka as APIs externas (primária + fallback + arquivos de mídia). */
async function mockExternalApis(page: Page): Promise<void> {
  await page.route('**://api.louvorja.com.br/**', (route) => {
    const url = route.request().url()
    const filename = url.split('/json_db/')[1]?.split('?')[0]
    if (filename && filename in CATALOG) {
      void route.fulfill({ json: CATALOG[filename] })
      return
    }
    void route.fulfill({ json: [] })
  })
  await page.route('**://api.pianolouvorja.com.br/**', (route) => {
    const url = route.request().url()
    const filename = url.split('/json_db/')[1]?.split('?')[0]
    if (filename && filename in CATALOG) {
      void route.fulfill({ json: CATALOG[filename] })
      return
    }
    void route.fulfill({ json: [] })
  })
  // Mídia remota (capas): sempre 404 — a capa do hinário é asset local.
  await page.route('**://files.e2e.test/**', (route) =>
    route.fulfill({ status: 200, body: 'mock-media' }),
  )
}

/**
 * Bridge Electron mockada (`window.louvorja`).
 * - workspace.getRecord/saveRecord: espelhado em localStorage → sobrevive a
 *   page.reload(), como o record .bin real sobrevive no Electron.
 * - media.check: sempre false (nada em disco) → download baixa de verdade.
 * - media.download: com atraso, para o progresso ficar VISÍVEL na UI.
 */
function installMockBridge(): void {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const readAll = (): Record<string, unknown> => {
    try {
      return JSON.parse(
        localStorage.getItem('__e2e_workspace_records__') ?? '{}',
      ) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  const writeAll = (records: Record<string, unknown>) => {
    localStorage.setItem('__e2e_workspace_records__', JSON.stringify(records))
  }

  Object.defineProperty(window, 'louvorja', {
    configurable: true,
    value: {
      isElectron: true,
      platform: 'linux',
      workspace: {
        getRecord: async (filename: string) =>
          (readAll()[filename] as unknown) ?? null,
        saveRecord: async (filename: string, data: unknown) => {
          const records = readAll()
          records[filename] = data
          writeAll(records)
          return true
        },
        clear: async () => {
          writeAll({})
          return true
        },
        readBinaryFile: async () => null,
      },
      media: {
        check: async () => false,
        checkMany: async (_type: string, filenames: string[]) =>
          Object.fromEntries(filenames.map((f) => [f, false])),
        // Atraso por arquivo: o card fica em "Baixando..." tempo suficiente
        // para o teste afirmar progresso visível antes do reload.
        download: async () => {
          await delay(400)
          return true
        },
        delete: async () => true,
      },
    },
  })
}

/**
 * Estado semeado antes de qualquer script do app:
 * EULA aceito + preferência pt + workspace limpo (sem downloads prévios).
 */
function seedBrowserState(): void {
  localStorage.setItem('eula_accepted_v1', 'true')
  localStorage.setItem(
    'user_data',
    JSON.stringify({ language: 'pt' }),
  )
  localStorage.removeItem('__e2e_workspace_records__')
}

test.describe.configure({ mode: 'serial' })

test.describe('Downloads offline — download → progresso → reload → persiste', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page)
    // Service worker pode interceptar requests e quebrar os mocks.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined })
    })
    await page.addInitScript(installMockBridge)
    await page.addInitScript(seedBrowserState)
  })

  test('hino baixa com progresso visível e o estado persiste após reload', async ({
    page,
  }) => {
    await page.goto('/#/albums')
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 })

    // Catálogo mockado: hinário aparece com botão "Baixar Offline".
    const downloadBtn = page
      .locator('.album-hymnal-card__action--download')
      .first()
    await expect(downloadBtn).toBeVisible({ timeout: 15000 })

    // Estado inicial: nada baixado no manifesto do workspace.
    const manifestBefore = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      WORKSPACE_MIRROR_KEY,
    )
    expect(manifestBefore[MANIFEST_KEY]).toBeUndefined()

    // Inicia o download do hinário.
    await downloadBtn.click()

    // Progresso aparece na UI (card entra em modo downloading).
    const progressMeta = page.locator('.album-hymnal-card__progress-meta').first()
    await expect(progressMeta).toBeVisible({ timeout: 15000 })

    // Download conclui: badge "Baixado" substitui o progresso.
    const downloadedBadge = page.locator('.album-hymnal-card__badge').first()
    await expect(downloadedBadge).toBeVisible({ timeout: 30000 })

    // Manifesto do workspace foi gravado com o hinário.
    const manifestAfter = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}'),
      WORKSPACE_MIRROR_KEY,
    )
    expect(manifestAfter[MANIFEST_KEY]).toContain('hymnal')

    // ─── RELOAD: requisito offline-first — nada pode se perder ───
    await page.reload()
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 })

    const persistedBadge = page.locator('.album-hymnal-card__badge').first()
    await expect(persistedBadge).toBeVisible({ timeout: 15000 })
    await expect(persistedBadge).toContainText('Baixado')

    // O card NÃO voltou para "Baixar Offline".
    await expect(
      page.locator('.album-hymnal-card__action--download'),
    ).toHaveCount(0)
  })

  test('sem download prévio, reload mantém coletânea disponível para baixar', async ({
    page,
  }) => {
    await page.goto('/#/albums')

    const downloadBtn = page
      .locator('.album-hymnal-card__action--download')
      .first()
    await expect(downloadBtn).toBeVisible({ timeout: 15000 })

    await page.reload()
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 })

    // Estado idle persiste: botão de download continua disponível.
    await expect(
      page.locator('.album-hymnal-card__action--download').first(),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.album-hymnal-card__badge')).toHaveCount(0)
  })
})

// Import mantido para o tipo Page ser usado no helper de mock.
export type { Page }
