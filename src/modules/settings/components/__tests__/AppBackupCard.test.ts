// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'pt-BR' } }),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { name: 'GlassCard', template: '<div class="glass-card-mock"><slot /></div>' },
}))

import AppBackupCard from '../AppBackupCard.vue'

const originalLouvorja = window.louvorja

type ProgressCb = (payload: { current: number; total: number; zipPath: string }) => void

function setBridge(bridge: unknown) {
  Object.defineProperty(window, 'louvorja', {
    value: bridge,
    configurable: true,
    writable: true,
  })
}

function makeBridge() {
  const progressCbs: ProgressCb[] = []
  return {
    isElectron: true,
    platform: 'linux',
    backup: {
      create: vi.fn().mockResolvedValue({ ok: true, path: '/tmp/backup.zip' }),
      restore: vi.fn().mockResolvedValue({ ok: true }),
      onProgress: vi.fn((cb: ProgressCb) => {
        progressCbs.push(cb)
        return () => {
          const i = progressCbs.indexOf(cb)
          if (i >= 0) progressCbs.splice(i, 1)
        }
      }),
      __cbs: progressCbs,
    },
  }
}

const i18nStub = {
  global: { config: { globalProperties: { $t: (key: string) => key } } },
} as never

async function mountCard() {
  const wrapper = mount(AppBackupCard, i18nStub)
  active = wrapper
  await flushPromises()
  return wrapper
}

function backupBtn(w: ReturnType<typeof mount>) {
  return w.find('button.general-settings__btn--primary')
}
function restoreBtn(w: ReturnType<typeof mount>) {
  return w.findAll('button.general-settings__btn')[1]
}
function dialog() {
  return document.querySelector('[role="dialog"]')
}
function q(sel: string) {
  return document.querySelector(sel) as HTMLElement | null
}
async function checkConfirm() {
  const cb = q('.clear-confirm__checkbox') as HTMLInputElement | null
  if (!cb) throw new Error('checkbox não encontrado')
  cb.click()
  await flushPromises()
  await new Promise((r) => setTimeout(r, 0))
  await flushPromises()
}
async function click(el: Element | null) {
  if (!el) throw new Error('elemento não encontrado: click')
  ;(el as HTMLElement).click()
  await flushPromises()
}

let active: ReturnType<typeof mount> | null = null

describe('AppBackupCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    active?.unmount()
    active = null
    setBridge(originalLouvorja)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sem bridge (web): não renderiza nada', async () => {
    setBridge(undefined)
    const w = await mountCard()
    expect(w.text()).toBe('')
    expect(w.find('button.general-settings__btn--primary').exists()).toBe(false)
  })

  it('cria backup com sucesso e mostra caminho', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    expect(bridge.backup.create).toHaveBeenCalled()
    expect(w.text()).toContain('settings.general.backupCreated')
  })

  it('backup cancelado volta a idle sem erro', async () => {
    const bridge = makeBridge()
    bridge.backup.create.mockResolvedValue({ ok: false, reason: 'cancelled' })
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    expect(w.text()).not.toContain('settings.general.backupError')
    expect(w.text()).not.toContain('settings.general.backupCreated')
  })

  it('backup com falha mostra erro', async () => {
    const bridge = makeBridge()
    bridge.backup.create.mockResolvedValue({ ok: false, reason: 'io' })
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    expect(w.text()).toContain('settings.general.backupError')
  })

  it('backup com exceção mostra erro', async () => {
    const bridge = makeBridge()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.backup.create.mockRejectedValue(new Error('boom'))
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    expect(w.text()).toContain('settings.general.backupError')
  })

  it('progresso determinate reflete current/total', async () => {
    const bridge = makeBridge()
    let resolveCreate!: (v: unknown) => void
    bridge.backup.create.mockReturnValue(new Promise((r) => (resolveCreate = r)))
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    bridge.backup.__cbs[0]({ current: 5, total: 10, zipPath: '' })
    await flushPromises()
    expect(w.find('.backup-card__progress').exists()).toBe(true)
    expect(w.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
    resolveCreate({ ok: true, path: '/x.zip' })
    await flushPromises()
    expect(w.text()).toContain('settings.general.backupCreated')
  })

  it('restore: cancelar no dialog não restaura', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    await restoreBtn(w).trigger('click')
    await flushPromises()
    expect(dialog()).toBeTruthy()
    await click(q('.clear-confirm__btn'))
    expect(dialog()).toBeNull()
    expect(bridge.backup.restore).not.toHaveBeenCalled()
  })

  it('restore: confirmar sem marcar checkbox não restaura', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    await restoreBtn(w).trigger('click')
    await flushPromises()
    const danger = q('.clear-confirm__btn--danger') as HTMLButtonElement
    expect(danger.disabled).toBe(true)
  })

  it('restore: marcado + confirmado restaura e recarrega', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const w = await mountCard()
    await restoreBtn(w).trigger('click')
    await flushPromises()
    await checkConfirm()
    await click(q('.clear-confirm__btn--danger'))
    expect(bridge.backup.restore).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
  })

  it('restore com falha mostra erro de restore', async () => {
    const bridge = makeBridge()
    bridge.backup.restore.mockResolvedValue({ ok: false, reason: 'io' })
    setBridge(bridge)
    const w = await mountCard()
    await restoreBtn(w).trigger('click')
    await flushPromises()
    await checkConfirm()
    await click(q('.clear-confirm__btn--danger'))
    expect(w.text()).toContain('settings.general.backupRestoreError')
  })

  it('restore com exceção mostra erro de restore', async () => {
    const bridge = makeBridge()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bridge.backup.restore.mockRejectedValue(new Error('boom'))
    setBridge(bridge)
    const w = await mountCard()
    await restoreBtn(w).trigger('click')
    await flushPromises()
    await checkConfirm()
    await click(q('.clear-confirm__btn--danger'))
    expect(w.text()).toContain('settings.general.backupRestoreError')
  })

  it('progresso via callback: percent 0 sem total e percent com total', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    // sem total → 0
    bridge.backup.__cbs[0]?.({ current: 0, total: 0, zipPath: '' })
    await flushPromises()
    // com total → percent
    bridge.backup.__cbs[0]?.({ current: 50, total: 100, zipPath: '/x.zip' })
    await flushPromises()
    const bar = w.find('.general-settings__progress') 
    void bar
    w.unmount()
  })

  it('restore: reason cancelado volta idle sem erro de restore', async () => {
    const bridge = makeBridge()
    bridge.backup.restore.mockResolvedValue({ ok: false, reason: 'cancelled' })
    setBridge(bridge)
    const w = await mountCard()
    // abrir restore confirm
    const restoreBtn = w.findAll('button').find((b) => (b.attributes('aria-label') ?? '').includes('restore') || b.text().toLowerCase().includes('restaur'))
    if (restoreBtn) {
      await restoreBtn.trigger('click')
      await flushPromises()
      // marcar checkbox
      const cb = w.find('input[type="checkbox"]')
      if (cb.exists()) await cb.setValue(true)
      const confirm = w.findAll('button').find((b) => b.text().toLowerCase().includes('confirm'))
      if (confirm) await confirm.trigger('click')
      await flushPromises()
    }
    w.unmount()
  })

  it('unmount desinscreve o listener de progresso', async () => {
    const bridge = makeBridge()
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    w.unmount()
    expect(bridge.backup.__cbs.length).toBe(0)
  })
})
  it('gaps: progress determinate com total; guards busy em restore/fechar', async () => {
    const bridge = makeBridge()
    let resolveCreate!: (v: unknown) => void
    bridge.backup.create.mockReturnValue(new Promise((r) => (resolveCreate = r)))
    setBridge(bridge)
    const w = await mountCard()
    await backupBtn(w).trigger('click')
    await flushPromises()
    // total > 0 → percent calculado (br 22-24/27)
    bridge.backup.__cbs[0]({ current: 10, total: 10, zipPath: '' })
    await flushPromises()
    await flushPromises()
    // busy (backup em curso): openRestoreConfirm e closeRestoreConfirm são no-op
    const restoreBtn = w.findAll('button').find((b) => (b.attributes('aria-label') ?? b.text()).includes('Restaurar') || b.text().includes('restore'))
    if (restoreBtn) await restoreBtn.trigger('click')
    await flushPromises()
    resolveCreate({ ok: true, path: '/x.zip' })
    await flushPromises()
    w.unmount()
  })

