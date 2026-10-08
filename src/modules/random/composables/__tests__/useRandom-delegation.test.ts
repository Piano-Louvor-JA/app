// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useRandomFeature } from '../useRandom'
import { useRandomStore } from '../../stores/useRandomStore'

describe('useRandom: ações surtem efeito no store (wrappedAction)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('sessão: mode, draft, nomes e histórico', () => {
    const f = useRandomFeature()
    const s = useRandomStore()

    f.setMode('numbers')
    expect(s.session.mode).toBe('numbers')
    f.setMode('names')
    expect(s.session.mode).toBe('names')

    f.setDraftName('Rafa')
    expect(s.draftName).toBe('Rafa')
    expect(f.draftName.value).toBe('Rafa')

    f.addName('Rafa')
    expect(s.available).toContain('Rafa')
    expect(f.available.value).toContain('Rafa')
    expect(f.isProjecting.value).toBe(false)
    expect(f.configOpen.value).toBe(false)

    f.removeAvailable('Rafa')
    expect(s.available).not.toContain('Rafa')

    f.addName('Bia')
    f.startDraw()
    f.clearHistory()
    expect(s.drawn).toEqual([])

    f.removeDrawn('x')
    f.importNamesFromText('a\nb')
    f.clearAvailable()
    expect(s.available).toEqual([])

    f.resetAll()
  })

  it('números: min/max e range', () => {
    const f = useRandomFeature()
    const s = useRandomStore()

    f.setMode('numbers')
    f.setNumberMin(1)
    f.setNumberMax(5)
    f.generateNumberRange()
    expect(s.available.length).toBe(5)
    f.setNumberMin(10)
    f.setNumberMax(2) // inverte → rangeError
    f.generateNumberRange()
    expect(f.rangeError.value).not.toBeNull()
  })

  it('display: cor, texto, fonte, animação, reset', () => {
    const f = useRandomFeature()
    const s = useRandomStore()

    f.setBgColor('#112233')
    expect(s.config.bgColor).toBe('#112233')
    f.setTextColor('#445566')
    expect(s.config.textColor).toBe('#445566')
    f.setFontSizePc(120)
    f.setFontSizePc(2) // clamp no mínimo
    expect(s.config.fontSizePc).toBe(4)
    f.setFontSizePc(500)
    expect(s.config.fontSizePc).toBe(14)
    f.setAnimationSpeed('slow')
    expect(s.config.animationSpeed).toBe('slow')
    f.resetDisplayToDefault()
  })

  it('áudio: fonte custom, volume, mute, preview', async () => {
    const f = useRandomFeature()

    await f.chooseCustomDrawAudio()
    f.removeCustomDrawAudio('a.mp3')
    f.useCustomDrawAudio()
    f.useDefaultDrawAudio()
    f.setAudioVolume(30)
    f.toggleAudioMuted()
    f.togglePreviewDrawAudio()
  })

  it('config e projeção: open/close/sync/clear', async () => {
    const f = useRandomFeature()
    const s = useRandomStore()

    f.openConfig()
    expect(s.configOpen).toBe(true)
    f.closeConfig()
    expect(s.configOpen).toBe(false)

    await f.toggleProjection()
    await f.syncProjection()
    await f.clearProjection()
  })
})
