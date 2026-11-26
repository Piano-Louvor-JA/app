import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_LITURGY_APPEARANCE } from '../../services/liturgy-appearance'
import { useLiturgyAppearanceStore } from '../useLiturgyAppearanceStore'

describe('useLiturgyAppearanceStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('muda a categoria e a cor do tipo, e tudo sobrevive a reabrir o app', () => {
    const store = useLiturgyAppearanceStore()
    store.updateCategory({ titleAlign: 'center', titleSize: 'lg', background: '#112233' })
    store.setTypeColor('music', '#ff0000')

    setActivePinia(createPinia())
    const reopened = useLiturgyAppearanceStore()
    expect(reopened.appearance.category).toMatchObject({
      titleAlign: 'center',
      titleSize: 'lg',
      background: '#112233',
      bold: true,
    })
    expect(reopened.appearance.typeColors).toEqual({ music: '#ff0000' })
  })

  it('cor vazia volta o tipo para a cor original; restaurar volta tudo ao padrão', () => {
    const store = useLiturgyAppearanceStore()
    store.setTypeColor('video', '#00ff00')
    store.setTypeColor('video', '')
    expect(store.appearance.typeColors).toEqual({})

    store.updateCategory({ uppercase: true })
    store.reset()
    expect(store.appearance).toEqual(DEFAULT_LITURGY_APPEARANCE)
    setActivePinia(createPinia())
    expect(useLiturgyAppearanceStore().appearance).toEqual(DEFAULT_LITURGY_APPEARANCE)
  })
})
