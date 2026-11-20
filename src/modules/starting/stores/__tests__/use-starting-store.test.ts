// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStartingStore } from '../useStartingStore'

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

describe('useStartingStore', () => {
  it('inicializa o boot seguro', () => {
    const store = useStartingStore()
    expect(store.isVisible).toBe(true)
    expect(store.showContent).toBe(true)
    expect(store.isAppReady).toBe(false)
    expect(store.progress).toBe(0)
    expect(store.phase).toBe('idle')
    expect(store.hasError).toBe(false)
  })

  it('clampa e arredonda progresso', () => {
    const store = useStartingStore()
    store.setProgress(-0.6)
    expect(store.progress).toBe(0)
    store.setProgress(33.6)
    expect(store.progress).toBe(34)
    store.setProgress(100.4)
    expect(store.progress).toBe(100)
  })

  it('status e erro podem ser definidos/resetados', () => {
    const store = useStartingStore()
    store.setStatus('starting.status.loading')
    expect(store.statusKey).toBe('starting.status.loading')
    store.markError()
    expect(store.hasError).toBe(true)
    expect(store.phase).toBe('error')
    expect(store.statusKey).toBe('starting.status.error')
    store.resetError()
    expect(store.hasError).toBe(false)
    store.markError('custom.error')
    expect(store.statusKey).toBe('custom.error')
  })

  it('hide encerra boot e esconde splash estática quando presente', () => {
    document.body.innerHTML = '<div id="boot-splash"></div>'
    const store = useStartingStore()
    store.hide()
    expect(store.isVisible).toBe(false)
    expect(store.isAppReady).toBe(true)
    expect(store.phase).toBe('done')
    expect(document.getElementById('boot-splash')?.hidden).toBe(true)
  })

  it('hide tolera splash ausente', () => {
    const store = useStartingStore()
    store.hide()
    expect(store.phase).toBe('done')
  })

  it('revealOverlay restaura flags e esconde splash existente', () => {
    document.body.innerHTML = '<div id="boot-splash"></div>'
    const store = useStartingStore()
    store.hide()
    store.revealOverlay()
    expect(store.isVisible).toBe(true)
    expect(store.showContent).toBe(true)
    expect(store.isAppReady).toBe(false)
    expect(document.getElementById('boot-splash')?.hidden).toBe(true)
  })

  it('revealOverlay tolera splash ausente', () => {
    const store = useStartingStore()
    store.revealOverlay()
    expect(store.isVisible).toBe(true)
  })
})
