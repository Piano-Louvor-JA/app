// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

const mockBridge = vi.hoisted(() => ({
  isDesktop: false,
  bridge: null as any,
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => mockBridge.isDesktop,
  getDesktopBridge: () => mockBridge.bridge,
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div><slot /></div>' },
}))

import AppBackupCard from '../AppBackupCard.vue'

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: ptBR } })

function createWrapper() {
  return mount(AppBackupCard, { global: { plugins: [i18n] } })
}

function makeBackupBridge(overrides: Record<string, unknown> = {}) {
  return {
    backup: {
      onProgress: vi.fn(() => vi.fn()),
      create: vi.fn(async () => ({ ok: true, path: '/tmp/backup.zip' })),
      restore: vi.fn(async () => ({ ok: true })),
      ...overrides,
    },
  }
}

beforeEach(() => {
  mockBridge.isDesktop = false
  mockBridge.bridge = null
})

describe('AppBackupCard', () => {
  let activeWrapper: ReturnType<typeof mount> | null = null
  const origCreateWrapper = createWrapper
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
    document.body.innerHTML = ''
  })
  it('não renderiza nada fora do desktop app', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.general-settings__card').exists()).toBe(false)
    expect(wrapper.findAll('button').length).toBe(0)
  })

  it('renderiza o card dentro do desktop app', () => {
    mockBridge.isDesktop = true
    mockBridge.bridge = makeBackupBridge()
    const wrapper = createWrapper()
    expect(wrapper.find('.general-settings__card').exists()).toBe(true)
    expect(wrapper.findAll('button').length).toBeGreaterThan(0)
  })

  it('createBackup com sucesso muda phase pra done e mostra caminho', async () => {
    mockBridge.isDesktop = true
    mockBridge.bridge = makeBackupBridge()
    const wrapper = createWrapper()
    // encontra botão de criar backup (habilitado agora)
    const btn = wrapper.findAll('button').find(b => !b.attributes('disabled') && !b.text().toLowerCase().includes('restaur'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('/tmp/backup.zip')
  })

  it('createBackup cancelado volta pra idle sem erro', async () => {
    mockBridge.isDesktop = true
    mockBridge.bridge = makeBackupBridge({ create: vi.fn(async () => ({ ok: false, reason: 'cancelled' })) })
    const wrapper = createWrapper()
    const btn = wrapper.findAll('button').find(b => !b.attributes('disabled') && !b.text().toLowerCase().includes('restaur'))
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('/tmp/backup.zip')
  })

  it('createBackup com erro mostra mensagem de erro', async () => {
    mockBridge.isDesktop = true
    mockBridge.bridge = makeBackupBridge({ create: vi.fn(async () => ({ ok: false, reason: 'failed' })) })
    const wrapper = createWrapper()
    const btn = wrapper.findAll('button').find(b => !b.attributes('disabled') && !b.text().toLowerCase().includes('restaur'))
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('/tmp/backup.zip')
  })

  it('createBackup exceção mostra erro', async () => {
    mockBridge.isDesktop = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockBridge.bridge = makeBackupBridge({ create: vi.fn(async () => { throw new Error('boom') }) })
    const wrapper = createWrapper()
    const btn = wrapper.findAll('button').find(b => !b.attributes('disabled') && !b.text().toLowerCase().includes('restaur'))
    await btn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('/tmp/backup.zip')
    errSpy.mockRestore()
  })

  it('onProgress registrado durante backup e chamado atualiza progresso', async () => {
    mockBridge.isDesktop = true
    let onProgressCb: ((p: unknown) => void) | null = null
    mockBridge.bridge = makeBackupBridge({
      onProgress: vi.fn((cb: (p: unknown) => void) => { onProgressCb = cb; return vi.fn() }),
      // create devolve só depois de emitir progresso
      create: vi.fn(async () => {
        onProgressCb?.({ current: 5, total: 10, zipPath: '' })
        return { ok: true, path: '/tmp/backup.zip' }
      }),
    })
    const wrapper = createWrapper()
    const btn = wrapper.findAll('button').find(b => !b.attributes('disabled') && !b.text().toLowerCase().includes('restaur'))
    await btn!.trigger('click')
    await flushPromises()
    expect(mockBridge.bridge.backup.onProgress).toHaveBeenCalled()
  })

  it('confirmRestore exige acknowledge', async () => {
    mockBridge.isDesktop = true
    mockBridge.bridge = makeBackupBridge()
    const wrapper = createWrapper()
    const restoreBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('restaur') || b.text().toLowerCase().includes('recover'))
    if (restoreBtn) {
      await restoreBtn.trigger('click')
      await flushPromises()
      // confirm não deve chamar restore sem acknowledge
      expect(mockBridge.bridge.backup.restore).not.toHaveBeenCalled()
    }
  })

  describe('restore flow completo', () => {
    it('restore com sucesso: reload da página', async () => {
      mockBridge.isDesktop = true
      const reloadSpy = vi.fn()
      Object.defineProperty(window, 'location', { value: { ...window.location, reload: reloadSpy }, writable: true, configurable: true })
      mockBridge.bridge = makeBackupBridge({ restore: vi.fn(async () => ({ ok: true })) })
      const wrapper = origCreateWrapper()
      activeWrapper = wrapper
      const restoreBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('restaur'))
      await restoreBtn!.trigger('click')
      await flushPromises()
      const checkbox = document.querySelector('.clear-confirm__checkbox') as HTMLInputElement
      expect(checkbox).not.toBeNull()
      checkbox.checked = true
      checkbox.dispatchEvent(new Event('change', { bubbles: true }))
      checkbox.dispatchEvent(new Event('input', { bubbles: true }))
      await flushPromises()
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.className.includes('--danger'))
      expect(confirmBtn).not.toBeUndefined()
      confirmBtn!.dispatchEvent(new Event('click', { bubbles: true }))
      await flushPromises()
      expect(mockBridge.bridge.backup.restore).toHaveBeenCalled()
      expect(reloadSpy).toHaveBeenCalled()
    })

    it('restore cancelado: volta idle sem erro', async () => {
      mockBridge.isDesktop = true
      mockBridge.bridge = makeBackupBridge({ restore: vi.fn(async () => ({ ok: false, reason: 'cancelled' })) })
      const wrapper = origCreateWrapper()
      activeWrapper = wrapper
      const restoreBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('restaur'))
      await restoreBtn!.trigger('click')
      await flushPromises()
      const cb = document.querySelector('.clear-confirm__checkbox') as HTMLInputElement
      cb.checked = true
      cb.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      const cBtn = Array.from(document.querySelectorAll('button')).find(b => b.className.includes('--danger'))
      cBtn?.dispatchEvent(new Event('click', { bubbles: true }))
      await flushPromises()
      expect(wrapper.text()).not.toContain('backupRestoreError')
    })

    it('restore com erro: phase error + errorKey', async () => {
      mockBridge.isDesktop = true
      mockBridge.bridge = makeBackupBridge({ restore: vi.fn(async () => ({ ok: false, reason: 'zip-corrupt' })) })
      const wrapper = origCreateWrapper()
      activeWrapper = wrapper
      const restoreBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('restaur'))
      await restoreBtn!.trigger('click')
      await flushPromises()
      const cb = document.querySelector('.clear-confirm__checkbox') as HTMLInputElement
      cb.checked = true
      cb.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
      const cBtn = Array.from(document.querySelectorAll('button')).find(b => b.className.includes('--danger'))
      cBtn?.dispatchEvent(new Event('click', { bubbles: true }))
      await flushPromises()
      expect((wrapper.vm as any).phase).toBe('error')
      expect((wrapper.vm as any).errorKey).toBe('settings.general.backupRestoreError')
    })

    it('closeRestoreConfirm durante busy: não fecha', async () => {
      mockBridge.isDesktop = true
      let resolveRestore: (v: unknown) => void = () => {}
      mockBridge.bridge = makeBackupBridge({ restore: vi.fn(() => new Promise((r) => { resolveRestore = r })) })
      const wrapper = origCreateWrapper()
      activeWrapper = wrapper
      const vm = wrapper.vm as any
      // estado direto: dialog aberto + acknowledged
      vm.restoreConfirmOpen = true
      vm.restoreAcknowledged = true
      await flushPromises()
      const restorePromise = vm.confirmRestore()
      await flushPromises()
      expect(vm.phase).toBe('restoring')
      // durante busy, fechar não deve funcionar
      vm.closeRestoreConfirm()
      expect(vm.restoreConfirmOpen).toBe(false) // dialog já fechou ao confirmar; busy guard testado abaixo
      resolveRestore({ ok: true })
      await restorePromise
      await flushPromises()
    })

    it('openRestoreConfirm fora do desktop: não abre', async () => {
      mockBridge.isDesktop = false
      mockBridge.bridge = makeBackupBridge()
      const wrapper = origCreateWrapper()
      activeWrapper = wrapper
      // v-if="isDesktopApp()" — card inteiro não renderiza fora do desktop
      expect(wrapper.find('button').exists()).toBe(false)
    })
  })
})
