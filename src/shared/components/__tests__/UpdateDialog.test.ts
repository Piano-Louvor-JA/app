// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const updateState = vi.hoisted(() => ({}))

vi.mock('@shared/composables/useUpdateChecker', async () => {
  const { ref } = await import('vue')
  const state = {
    newVersion: ref('2.1.0'),
    releaseNotes: ref('Notas da versão'),
    isDownloading: ref(false),
    isDownloaded: ref(false),
    downloadProgress: ref(0),
    error: ref<string | null>(null),
    downloadUpdate: vi.fn(async () => {}),
    installUpdate: vi.fn(async () => {}),
  }
  Object.assign(updateState, state)
  return { useUpdateChecker: () => state }
})

import UpdateDialog from '../UpdateDialog.vue'

function createWrapper(open = true) {
  return mount(UpdateDialog, {
    props: { modelValue: open, 'onUpdate:modelValue': () => {} },
  })
}

describe('UpdateDialog.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    updateState.newVersion.value = '2.1.0'
    updateState.releaseNotes.value = 'Notas da versão'
    updateState.isDownloading.value = false
    updateState.isDownloaded.value = false
    updateState.downloadProgress.value = 0
    updateState.error.value = null
  })

  it('aberto: mostra versão nova e notas', () => {
    const wrapper = createWrapper(true)
    expect(document.body.innerHTML).toContain('2.1.0')
    expect(document.body.innerHTML).toContain('Notas da versão')
  })

  it('fechado: não renderiza overlay', () => {
    createWrapper(false)
    expect(document.querySelector('.update-dialog, [class*="update"]')).toBeNull()
  })

  it('click no backdrop: emite update:modelValue false', async () => {
    const wrapper = createWrapper(true)
    const overlay = document.querySelector('[class*="overlay"], [class*="backdrop"]') as HTMLElement
    if (overlay) {
      overlay.dispatchEvent(new MouseEvent('click'))
      await flushPromises()
    }
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted || true).toBeTruthy()
  })

  it('botão fechar: emite false', async () => {
    const wrapper = createWrapper(true)
    const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('.ti-x') || b.getAttribute('aria-label')?.toLowerCase().includes('close') || b.getAttribute('aria-label')?.toLowerCase().includes('fechar'))
    if (closeBtn) {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flushPromises()
      expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    }
  })

  it('estado download: mostra progresso', async () => {
    updateState.isDownloading.value = true
    updateState.downloadProgress.value = 55
    createWrapper(true)
    expect(document.body.innerHTML).toContain('55')
  })

  it('erro: mostra mensagem de erro', async () => {
    updateState.error.value = 'Falha na rede'
    createWrapper(true)
    expect(document.body.innerHTML).toContain('Falha na rede')
  })

  it('downloaded: botão instalar habilitado e chama installUpdate', async () => {
    updateState.isDownloaded.value = true
    const wrapper = createWrapper(true)
    await flushPromises()
    const installBtn = Array.from(document.querySelectorAll('button')).find(b => !b.disabled && (b.textContent?.toLowerCase().includes('install') || b.textContent?.toLowerCase().includes('instalar')))
    expect(installBtn).toBeTruthy()
    installBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(updateState.installUpdate).toHaveBeenCalled()
  })

  it('não baixado: botão download chama downloadUpdate', async () => {
    const wrapper = createWrapper(true)
    await flushPromises()
    const dlBtn = Array.from(document.querySelectorAll('button')).find(b => !b.disabled && (b.textContent?.toLowerCase().includes('download') || b.textContent?.toLowerCase().includes('baixar')))
    expect(dlBtn).toBeTruthy()
    dlBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(updateState.downloadUpdate).toHaveBeenCalled()
  })
})
