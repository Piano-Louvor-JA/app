// @ts-check
import { test, expect } from '@playwright/test'

const MEDIA_CHANNEL = 'louvorja-media-runtime'
const MEDIA_STORAGE_KEY = 'louvorja-media-runtime-state'

const EULA_AND_RUNTIME = (payload) => `localStorage.setItem('eula_accepted_v1', 'true');
  // Só semeia o runtime na primeira carga. No reload o valor gravado pelo
  // BroadcastChannel precisa permanecer.
  if (!localStorage.getItem('${MEDIA_STORAGE_KEY}')) {
    localStorage.setItem('${MEDIA_STORAGE_KEY}', JSON.stringify(${JSON.stringify(payload)}));
  }
  const rs = () => document.getElementById('boot-splash')?.remove();
  rs();
  document.addEventListener('DOMContentLoaded', rs);`

function runtimePayload(overrides = {}) {
  return {
    active: true,
    title: 'Hino E2E',
    subtitle: 'Coletânea',
    lyric: 'Primeira frase do hino',
    imageUrl: null,
    imagePosition: null,
    isCover: false,
    slideIndex: 0,
    slideCount: 0,
    nextLyric: '',
    nextIsCover: false,
    progressRatio: 0,
    slideProgressRatio: 0,
    ...overrides,
  }
}

test.describe('Media player — persistência e retomada', () => {
  test('runtime persiste após reload da janela de projeção (offline-first)', async ({ page }) => {
    await page.addInitScript(EULA_AND_RUNTIME(runtimePayload({ lyric: 'Frase pós-reload' })))
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Frase pós-reload', { timeout: 20000 })

    // RELOAD: o conteúdo deve continuar (nada se perde)
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Frase pós-reload', { timeout: 20000 })
  })

  test('atualização via BroadcastChannel sobrevive ao reload', async ({ page }) => {
    await page.addInitScript(EULA_AND_RUNTIME(runtimePayload({ lyric: 'Inicial' })))
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Inicial', { timeout: 20000 })

    // operador publica atualização
    await page.evaluate(
      ([channel, payload]) => {
        const ch = new BroadcastChannel(channel)
        ch.postMessage(payload)
        ch.close()
      },
      [MEDIA_CHANNEL, runtimePayload({ lyric: 'Frase Atualizada' })],
    )
    await expect(page.locator('body')).toContainText('Frase Atualizada', { timeout: 20000 })

    // reload → a atualização persistiu no storage
    await page.reload({ waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Frase Atualizada', { timeout: 20000 })
  })

  test('isCover: projeção mostra a capa e não a letra', async ({ page }) => {
    await page.addInitScript(EULA_AND_RUNTIME(runtimePayload({ isCover: true, lyric: '', title: 'Título da Capa' })))
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('.media-return')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('body')).toContainText('Título da Capa', { timeout: 20000 })
  })
})
