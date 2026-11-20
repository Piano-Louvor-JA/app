import { test, expect, type Page } from '@playwright/test'

/**
 * E2E — Navegador de histórico (setas voltar/avançar + pontos acima do dock).
 *
 * Roda no modo web puro (sem bridge Electron): o router usa history web e o
 * histórico é o mesmo registro da sessão usado no desktop.
 * APIs mockadas (localhost:3100 + fallback LouvorJA) com catálogo vazio.
 */

test.beforeEach(async ({ page }) => {
  await page.route('**/api.louvorja.com.br/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/localhost:3100/**', (route) => route.fulfill({ json: [] }))
})

function dock(page: Page) {
  return page.getByRole('navigation', { name: 'Navegação principal' })
}

function history(page: Page) {
  return page.getByRole('navigation', { name: 'Histórico de navegação' })
}

async function openApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(dock(page).getByRole('button', { name: 'Bíblia' })).toBeVisible({ timeout: 20000 })
  await expect(history(page)).toBeVisible()
}

async function goByDock(page: Page, label: string, path: string) {
  await dock(page).getByRole('button', { name: label }).click()
  await expect(page).toHaveURL(new RegExp(`${path}$`))
}

test.describe('Navegador de histórico', () => {
  test('na abertura: um ponto (atual) e as duas setas desabilitadas', async ({ page }) => {
    await openApp(page)
    const nav = history(page)
    await expect(nav.getByRole('button', { name: 'Voltar' })).toBeDisabled()
    await expect(nav.getByRole('button', { name: 'Avançar' })).toBeDisabled()
    const dots = nav.getByRole('listitem')
    await expect(dots).toHaveCount(1)
    await expect(nav.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
  })

  test('setas voltam e avançam; clicar num ponto salta para a tela', async ({ page }) => {
    await openApp(page)
    await goByDock(page, 'Bíblia', '/bible')
    await goByDock(page, 'Liturgia', '/liturgy')

    const nav = history(page)
    await expect(nav.getByRole('listitem')).toHaveCount(3)

    await nav.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/bible$/)
    await nav.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(nav.getByRole('button', { name: 'Voltar' })).toBeDisabled()

    await nav.getByRole('button', { name: 'Avançar' }).click()
    await expect(page).toHaveURL(/\/bible$/)
    await expect(nav.getByRole('button', { name: 'Bíblia' })).toHaveAttribute('aria-current', 'page')

    await nav.getByRole('button', { name: 'Liturgia' }).click()
    await expect(page).toHaveURL(/\/liturgy$/)
    await expect(nav.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  })

  test('voltar e navegar para outra tela descarta o que estava à frente', async ({ page }) => {
    await openApp(page)
    await goByDock(page, 'Bíblia', '/bible')
    await goByDock(page, 'Liturgia', '/liturgy')

    const nav = history(page)
    await nav.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/bible$/)
    await goByDock(page, 'Utilitários', '/utilities')

    await expect(nav.getByRole('listitem')).toHaveCount(3)
    await expect(nav.getByRole('button', { name: 'Liturgia' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name: 'Avançar' })).toBeDisabled()
  })

  test('Alt+← e Alt+→ navegam pelo histórico', async ({ page }) => {
    await openApp(page)
    await goByDock(page, 'Bíblia', '/bible')
    await goByDock(page, 'Liturgia', '/liturgy')

    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(page).toHaveURL(/\/bible$/)
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(page).toHaveURL(/\/$/)
    await page.keyboard.press('Alt+ArrowRight')
    await expect(page).toHaveURL(/\/bible$/)
  })

  test('sub-rota aparece com o detalhe no nome do ponto', async ({ page }) => {
    await openApp(page)
    await goByDock(page, 'Configurações', '/settings/appearance')
    await expect(history(page).getByRole('button', { name: 'Configurações · Aparência' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
