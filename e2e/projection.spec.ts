// @ts-check
import { test, expect } from '@playwright/test'

const MEDIA_CHANNEL = 'louvorja-media-runtime'
const MEDIA_STORAGE_KEY = 'louvorja-media-runtime-state'

const EULA_INIT = `localStorage.setItem('eula_accepted_v1', 'true');
  // Popup no browser puro: sem bootstrap (early-return), dispensa o splash estático aqui.
  const removeSplash = () => document.getElementById('boot-splash')?.remove();
  removeSplash();
  document.addEventListener('DOMContentLoaded', removeSplash);`

function runtimePayload(overrides = {}) {
  return {
    active: true,
    title: 'Hino E2E',
    subtitle: 'Coletânea Teste',
    lyric: '',
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

test.describe('Projeção de mídia cross-window', () => {
  test('runtime semeado no storage renderiza na janela /popup?module=media', async ({ page }) => {
    await page.addInitScript(EULA_INIT)
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.addInitScript(
      `localStorage.setItem('${MEDIA_STORAGE_KEY}', JSON.stringify(${JSON.stringify(runtimePayload({ lyric: 'Letra E2E Cross-Window' }))}))`,
    )
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Letra E2E Cross-Window', { timeout: 20000 })
  })

  test('BroadcastChannel atualiza a projeção em tempo real', async ({ page }) => {
    await page.addInitScript(EULA_INIT)
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.addInitScript(
      `localStorage.setItem('${MEDIA_STORAGE_KEY}', JSON.stringify(${JSON.stringify(runtimePayload({ lyric: 'Inicial' }))}))`,
    )
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('body')).toContainText('Inicial', { timeout: 20000 })

    // postar atualização via canal (como o operador faz)
    await page.evaluate(
      ([channel, payload]) => {
        const ch = new BroadcastChannel(channel)
        ch.postMessage(payload)
        ch.close()
      },
      [MEDIA_CHANNEL, runtimePayload({ lyric: 'Atualização em Tempo Real' })],
    )
    await expect(page.locator('body')).toContainText('Atualização em Tempo Real', { timeout: 20000 })
  })

  test('runtime inativo: projeção sem conteúdo, sem quebrar', async ({ page }) => {
    await page.addInitScript(EULA_INIT)
    await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/api.pianolouvorja.com.br/**', (route) => route.fulfill({ json: [] }))
    await page.addInitScript(
      `localStorage.setItem('${MEDIA_STORAGE_KEY}', JSON.stringify(${JSON.stringify(runtimePayload({ active: false, lyric: '' }))}))`,
    )
    await page.goto('/popup?module=media&layout=return', { waitUntil: 'commit' })
    await expect(page.locator('.media-return')).toBeVisible({ timeout: 20000 })
  })
})
