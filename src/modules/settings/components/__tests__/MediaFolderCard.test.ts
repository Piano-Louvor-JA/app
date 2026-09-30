// @vitest-environment jsdom
// MediaFolderCard — windows-only, status, migrate/restore, erros por reason
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createI18n } from 'vue-i18n'

const mocks = vi.hoisted(() => ({
  getDesktopBridge: vi.fn(),
}))

vi.mock('@design-system/index', () => ({
  GlassCard: { template: '<div class="glass-card"><slot /></div>' },
}))

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}))

import MediaFolderCard from '../MediaFolderCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      settings: {
        general: {
          mediaFolderTitle: 'Pasta de mídia',
          mediaFolderHint: 'dica',
          mediaFolderCurrent: 'Atual:',
          mediaFolderCustomBadge: 'Personalizada',
          mediaFolderMove: 'Mover',
          mediaFolderMoving: 'Movendo...',
          mediaFolderRestore: 'Restaurar',
          mediaFolderMoveHint: 'subdica',
          mediaFolderDestInside: 'destino dentro da origem',
          mediaFolderPersistError: 'persist falhou',
          mediaFolderError: 'erro',
        },
      },
    },
  },
})

function makeBridge(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'win32',
    mediaFolder: {
      status: vi.fn(async () => ({
        currentPath: 'C:\\Media',
        defaultPath: 'C:\\Media',
        isCustom: false,
      })),
      pick: vi.fn(async () => null),
      migrate: vi.fn(async () => ({ ok: true, path: 'C:\\Media' })),
      ...overrides,
    },
  }
}

function createWrapper() {
  return mount(MediaFolderCard, { global: { plugins: [i18n] } })
}

describe('MediaFolderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('não-windows: não renderiza', () => {
    mocks.getDesktopBridge.mockReturnValue({ platform: 'linux' })
    const wrapper = createWrapper()
    expect(wrapper.find('[data-test="media-folder-card"]').exists()).toBe(false)
  })

  it('windows: card visível, status carregado no mount', async () => {
    const bridge = makeBridge()
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('[data-test="media-folder-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="media-folder-current-path"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('C:\\Media')
  })

  it('isCustom: badge e botão restore aparecem', async () => {
    const bridge = makeBridge({
      status: vi.fn(async () => ({ currentPath: 'D:\\Midia', defaultPath: 'C:\\Media', isCustom: true })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.media-folder__badge').exists()).toBe(true)
    expect(wrapper.find('[data-test="media-folder-restore-button"]').exists()).toBe(true)
  })

  it('sem bridge.mediaFolder: botões desabilitados e sem status', () => {
    mocks.getDesktopBridge.mockReturnValue({ platform: 'win32' })
    const wrapper = createWrapper()
    expect((wrapper.find('[data-test="media-folder-move-button"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="media-folder-current-path"]').exists()).toBe(false)
  })

  it('chooseAndMove: pick + migrate ok, done com path', async () => {
    const bridge = makeBridge({
      pick: vi.fn(async () => 'D:\\Nova'),
      migrate: vi.fn(async () => ({ ok: true, path: 'D:\\Nova' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.migrate).toHaveBeenCalledWith('D:\\Nova')
    expect((wrapper.vm as any).phase).toBe('done')
    expect((wrapper.vm as any).lastMovedPath).toBe('D:\\Nova')
  })

  it('pick cancelado: não migra', async () => {
    const bridge = makeBridge()
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.migrate).not.toHaveBeenCalled()
  })

  it('migrate dest-inside-source: erro específico', async () => {
    const bridge = makeBridge({
      pick: vi.fn(async () => 'D:\\Nova'),
      migrate: vi.fn(async () => ({ ok: false, reason: 'dest-inside-source' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).errorKey).toBe('settings.general.mediaFolderDestInside')
  })

  it('migrate persist-failed: erro específico', async () => {
    const bridge = makeBridge({
      pick: vi.fn(async () => 'D:\\Nova'),
      migrate: vi.fn(async () => ({ ok: false, reason: 'persist-failed' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).errorKey).toBe('settings.general.mediaFolderPersistError')
  })

  it('migrate erro genérico: mediaFolderError', async () => {
    const bridge = makeBridge({
      pick: vi.fn(async () => 'D:\\Nova'),
      migrate: vi.fn(async () => ({ ok: false, reason: 'other' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).errorKey).toBe('settings.general.mediaFolderError')
  })

  it('migrate throw: mediaFolderError', async () => {
    const bridge = makeBridge({
      pick: vi.fn(async () => 'D:\\Nova'),
      migrate: vi.fn(async () => { throw new Error('boom') }),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-move-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).phase).toBe('error')
  })

  it('restoreDefault: migra pra defaultPath', async () => {
    const bridge = makeBridge({
      status: vi.fn(async () => ({ currentPath: 'D:\\Midia', defaultPath: 'C:\\Media', isCustom: true })),
      migrate: vi.fn(async () => ({ ok: true, path: 'C:\\Media' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-restore-button"]').trigger('click')
    await flushPromises()
    expect(bridge.mediaFolder.migrate).toHaveBeenCalledWith('C:\\Media')
    expect((wrapper.vm as any).phase).toBe('done')
  })

  it('restore falha: mediaFolderError', async () => {
    const bridge = makeBridge({
      status: vi.fn(async () => ({ currentPath: 'D:\\Midia', defaultPath: 'C:\\Media', isCustom: true })),
      migrate: vi.fn(async () => ({ ok: false, reason: 'io' })),
    })
    mocks.getDesktopBridge.mockReturnValue(bridge)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="media-folder-restore-button"]').trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).errorKey).toBe('settings.general.mediaFolderError')
  })
})
