import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Liturgia: criar → adicionar itens (tipos variados) → salvar →
 * RELOAD → reabrir → integridade total (offline-first).
 *
 * Requisito permanente do produto: NADA da liturgia pode se perder com
 * reload. O estado persiste em `user_data.liturgy.state` (localStorage,
 * via USER_PREFERENCE_KEYS.liturgyState) — o mesmo contrato cumprido
 * pelo Electron em disco.
 *
 * Determinismo:
 * - Catálogo de músicas mockado via page.route (API Piano + API LouvorJA).
 * - Bridge Electron mockada (`window.louvorja`) para o file picker
 *   (vídeo local) devolver um caminho fixo.
 * - EULA + idioma pt semeados antes de qualquer script do app.
 * - window.confirm auto-aceito (fluxo não usa remoção, mas evita travar).
 *
 * Serial: o fluxo é stateful (criar → adicionar → reload → verificar).
 */

const EULA_KEY = 'eula_accepted_v1'
const LITURGY_STATE_KEY = 'liturgy.state'

/** Categoria criada no teste — os sub-itens vinculam a ela. */
const CATEGORY_NAME = 'E2E Abertura'
const CATEGORY_START = '09:00'
const CATEGORY_END = '10:00'

const MUSIC_ID = 4242
const MUSIC_NAME = 'E2E Hinário Crudo'
const MUSIC_SUBTITLE = 'Hinário Adventista'
const MUSIC_COMPLEMENTARY = 'Momento musical E2E'
const MUSIC_DURATION_MS = 4 * 60 * 1000 // 4 min vindo do catálogo

const VIDEO_NAME = 'E2E Video Local'
const VIDEO_PATH = '/tmp/e2e/liturgy-video.mp4'

const SITE_NAME = 'E2E Site Oficial'
const SITE_URL = 'https://www.adventista.e2e.example.org/pagina'

/** Registros de catálogo servidos pelo mock das APIs (…/json_db/<file>). */
const CATALOG: Record<string, unknown> = {
  pt_musics: [
    {
      id_music: MUSIC_ID,
      name: MUSIC_NAME,
      albums_names: MUSIC_SUBTITLE,
      duration: 240, // segundos → parseCatalogDurationMs = 240_000 ms
      has_instrumental_music: 0,
    },
  ],
  pt_hymnal: [],
  pt_hymnal_1996: [],
  pt_categories: [],
  pt_bible_book: [],
  config: {},
}

/** Mocka as APIs externas (primária + fallback) com o catálogo acima. */
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

/**
 * Bridge Electron mockada — o file picker do item de vídeo devolve um
 * caminho fixo (browser puro não tem diálogo nativo).
 */
function installMockBridge(): void {
  Object.defineProperty(window, 'louvorja', {
    configurable: true,
    value: {
      isElectron: true,
      platform: 'linux',
      dialog: {
        openFile: async () => ['/tmp/e2e/liturgy-video.mp4'],
      },
      workspace: {
        getRecord: async (filename: string) =>
          filename === 'bootstrap_complete' ? { complete: true } : null,
        saveRecord: async () => true,
        clear: async () => true,
        readBinaryFile: async () => null,
      },
      media: {
        check: async () => true,
        checkMany: async (_t: string, filenames: string[]) =>
          Object.fromEntries(filenames.map((f) => [f, true])),
        download: async () => true,
        delete: async () => true,
        probeDuration: async () => 0,
      },
    },
  })
}

/**
 * Estado semeado antes de qualquer script do app:
 * EULA aceito + preferências pt + liturgia limpa + window.confirm ok.
 */
function seedBrowserState(): void {
  localStorage.setItem('eula_accepted_v1', 'true')
  // NÃO sobrescrever user_data se já existe: no reload isso apagaria
  // liturgy.state (o seed roda antes de qualquer script em TODA navegação).
  if (!localStorage.getItem('user_data')) {
    localStorage.setItem('user_data', JSON.stringify({ language: 'pt' }))
  }
  window.confirm = () => true
}

test.describe.configure({ mode: 'serial' })

test.describe('Liturgia — CRUD com integridade offline-first', () => {
  test.beforeEach(async ({ page }) => {
    await mockExternalApis(page)
    // Service worker pode interceptar requests e quebrar os mocks.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined })
    })
    await page.addInitScript(installMockBridge)
    await page.addInitScript(seedBrowserState)
  })

  /** Lê o estado persistido da liturgia direto do localStorage. */
  async function readPersistedState(page: Page): Promise<{
    weekdays: Record<string, Array<Record<string, unknown>>>
    customLiturgies: Array<Record<string, unknown>>
  }> {
    return page.evaluate((key) => {
      const prefs = JSON.parse(localStorage.getItem('user_data') ?? '{}')
      return prefs[key] ?? {}
    }, LITURGY_STATE_KEY)
  }

  test('cria liturgia avulsa, adiciona itens variados e tudo sobrevive ao reload', async ({
    page,
  }) => {
    test.setTimeout(120000)
    await page.goto('/liturgy', { waitUntil: 'domcontentloaded' })

    // First boot pode abrir na tela Início (distrito/igreja) — navega pelo dock.
    const navLiturgy = page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('button', { name: 'Liturgia' })
    await navLiturgy.click({ timeout: 20000 })
    await expect(
      page.locator('.liturgy-view__title'),
    ).toContainText('Liturgia', { timeout: 20000 })

    // ── 1. Cria liturgia avulsa pela UI ──
    await page.locator('.liturgy-view__toolbar .liturgy-day-tabs__chip', {
      hasText: 'Avulsa',
    }).click()
    await page.locator('.liturgy-custom-bar__new').click()
    const nameInput = page.locator('.liturgy-dialog input[type="text"]')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('E2E Culto Avulso')
    await page.locator('.liturgy-dialog__btn', { hasText: 'Criar' }).click()
    await expect(
      page.locator('.liturgy-custom-bar__chip', { hasText: 'E2E Culto Avulso' }),
    ).toBeVisible({ timeout: 10000 })

    // ── 2. Categoria/Separador (toolbar: diálogo já vem com type=category) ──
    await page.locator('.liturgy-view__add').click()
    await page.locator('#moment-name').fill(CATEGORY_NAME)
    await page.locator('#moment-start-time').fill(CATEGORY_START)
    await page.locator('#moment-end-time').fill(CATEGORY_END)
    await page
      .locator('#moment-details')
      .fill('Separador de abertura E2E')
    await page
      .locator('.moment-dialog__submit', { hasText: 'Adicionar' })
      .click()
    await expect(
      page.locator('.liturgy-item__name', { hasText: CATEGORY_NAME }),
    ).toBeVisible({ timeout: 10000 })

    // ID da categoria criada (para os sub-itens vincularem).
    const stateAfterCategory = await readPersistedState(page)
    const customs = stateAfterCategory.customLiturgies ?? []
    expect(customs).toHaveLength(1)
    const categoryId = (customs[0]?.items as Array<Record<string, unknown>>)[0]
      ?.id as string
    expect(categoryId).toBeTruthy()

    // ── 3. Sub-item: Música do catálogo (mockada via page.route) ──
    await page
      .locator('.liturgy-item__add-sub', { hasText: 'Adicionar sub item' })
      .first()
      .click()
    await page
      .locator('.moment-dialog__chip', { hasText: 'Música' })
      .click()
    await page.locator('#moment-music-search').fill(MUSIC_NAME)
    await page
      .locator('.moment-dialog__music-option', { hasText: MUSIC_NAME })
      .first()
      .click()
    await page.locator('#moment-name').fill(MUSIC_COMPLEMENTARY)
    await page
      .locator('#moment-details')
      .fill('Observações da música E2E')
    await page
      .locator('.moment-dialog__submit', { hasText: 'Adicionar' })
      .click()
    await expect(
      page.locator('.liturgy-item__name', { hasText: MUSIC_NAME }),
    ).toBeVisible({ timeout: 10000 })

    // ── 4. Sub-item: Vídeo local (file picker mockado) ──
    await page
      .locator('.liturgy-item__add-sub', { hasText: 'Adicionar sub item' })
      .first()
      .click()
    await page
      .locator('.moment-dialog__chip', { hasText: 'Videos' })
      .click()
    await page
      .locator('.moment-dialog__file-btn')
      .click() // bridge mockada devolve VIDEO_PATH
    await page.locator('#moment-name').fill(VIDEO_NAME)
    await page
      .locator('.moment-dialog__submit', { hasText: 'Adicionar' })
      .click()
    await expect(
      page.locator('.liturgy-item__name', { hasText: VIDEO_NAME }),
    ).toBeVisible({ timeout: 10000 })

    // ── 5. Sub-item: Site (URL externa) ──
    await page
      .locator('.liturgy-item__add-sub', { hasText: 'Adicionar sub item' })
      .first()
      .click()
    await page
      .locator('.moment-dialog__chip', { hasText: 'Sites/Redes Sociais' })
      .click()
    await page.locator('#moment-url').fill(SITE_URL)
    await page.locator('#moment-name').fill(SITE_NAME)
    await page
      .locator('.moment-dialog__submit', { hasText: 'Adicionar' })
      .click()
    await expect(
      page.locator('.liturgy-item__name', { hasText: SITE_NAME }),
    ).toBeVisible({ timeout: 10000 })

    // ── Snapshot ANTES do reload: 4 itens no estado persistido ──
    const stateBefore = await readPersistedState(page)
    const itemsBefore = (stateBefore.customLiturgies?.[0]?.items ??
      []) as Array<Record<string, unknown>>
    expect(itemsBefore).toHaveLength(4)

    // ── RELOAD: requisito offline-first — nada pode se perder ──
    await page.reload()

    const navLiturgy2 = page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('button', { name: 'Liturgia' })
    await navLiturgy2.click({ timeout: 20000 })
    await expect(
      page.locator('.liturgy-view__title'),
    ).toContainText('Liturgia', { timeout: 20000 })

    // A liturgia avulsa criada continua selecionável com os 4 itens na UI.
    await page
      .locator('.liturgy-view__toolbar .liturgy-day-tabs__chip', {
        hasText: 'Avulsa',
      })
      .click()
    await expect(
      page.locator('.liturgy-custom-bar__chip', { hasText: 'E2E Culto Avulso' }),
    ).toBeVisible({ timeout: 10000 })
    await page
      .locator('.liturgy-custom-bar__chip', { hasText: 'E2E Culto Avulso' })
      .click()

    await expect(
      page.locator('.liturgy-item__name', { hasText: CATEGORY_NAME }),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      page.locator('.liturgy-item__name', { hasText: MUSIC_NAME }),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      page.locator('.liturgy-item__name', { hasText: VIDEO_NAME }),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      page.locator('.liturgy-item__name', { hasText: SITE_NAME }),
    ).toBeVisible({ timeout: 15000 })

    // ── Integridade TOTAL: mesmos campos, item a item ──
    const stateAfter = await readPersistedState(page)
    const itemsAfter = (stateAfter.customLiturgies?.[0]?.items ??
      []) as Array<Record<string, unknown>>
    expect(itemsAfter).toHaveLength(4)

    const byName = (items: Array<Record<string, unknown>>, needle: string) =>
      items.find((entry) => String(entry.name ?? '').includes(needle))

    // Categoria: tipo, horários e notas intactos.
    const categoryBefore = byName(itemsBefore, CATEGORY_NAME)
    const categoryAfter = byName(itemsAfter, CATEGORY_NAME)
    expect(categoryAfter).toMatchObject({
      type: 'category',
      name: CATEGORY_NAME,
      startTime: CATEGORY_START,
      endTime: CATEGORY_END,
      subtitle: 'Separador de abertura E2E',
    })
    expect(categoryAfter?.id).toBe(categoryBefore?.id)

    // Música: musicId, duração do catálogo e complementary title intactos.
    expect(byName(itemsAfter, MUSIC_NAME)).toMatchObject({
      type: 'music',
      musicId: MUSIC_ID,
      durationMs: MUSIC_DURATION_MS,
      complementaryTitle: MUSIC_COMPLEMENTARY,
      subtitle: MUSIC_SUBTITLE,
      notes: 'Observações da música E2E',
    })

    // Vídeo: filePath da bridge mockada intacto.
    expect(byName(itemsAfter, VIDEO_NAME)).toMatchObject({
      type: 'video',
      filePath: VIDEO_PATH,
      name: VIDEO_NAME,
    })

    // Site: URL intacta.
    expect(byName(itemsAfter, SITE_NAME)).toMatchObject({
      type: 'site',
      url: SITE_URL,
      name: SITE_NAME,
    })

    // Ordem preservada (categoria → música → vídeo → site).
    expect(itemsAfter.map((entry) => entry.type)).toEqual([
      'category',
      'music',
      'video',
      'site',
    ])
  })
})
