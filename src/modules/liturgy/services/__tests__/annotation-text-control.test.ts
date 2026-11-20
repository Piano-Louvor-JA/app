// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openText: vi.fn(async () => true),
  stage: {} as Record<string, unknown>,
  bridge: null as unknown,
}))
vi.mock('../liturgy-web-projection', () => ({ openLocalTextControl: mocks.openText }))
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: (scope: string) => (scope === 'bible' ? { footerRefColor: '#00ff00' } : mocks.stage),
}))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: () => mocks.bridge }))

import { canOpenAnnotationTextControl, openAnnotationTextControl } from '../annotation-text-control'
import { stageTextPayload } from '../text-control-payload'

describe('stageTextPayload', () => {
  beforeEach(() => {
    mocks.stage = { titleTextColor: '#123456', textColor: '#eeeeee', backgroundColor: '#111111' }
  })

  it('cor própria do título vence; sem ela usa o Palco da Liturgia, depois a referência da Bíblia', () => {
    expect(stageTextPayload({ title: ' Batismo ', html: '<p>x</p>', titleColor: '#fff000' })).toEqual({
      title: 'Batismo', html: '<p>x</p>', titleColor: '#fff000', textColor: '#eeeeee', backgroundColor: '#111111',
    })
    expect(stageTextPayload({ title: 'a', html: '', titleColor: '' }).titleColor).toBe('#123456')
    mocks.stage = { titleTextColor: null, textColor: null, backgroundColor: null }
    expect(stageTextPayload({ title: 'a', html: '' })).toMatchObject({
      titleColor: '#00ff00', textColor: '#ffffff', backgroundColor: '#000000',
    })
  })
})

describe('anotação no player de texto', () => {
  beforeEach(() => {
    mocks.openText.mockClear()
    mocks.stage = {}
    mocks.bridge = { projection: { openUrl: vi.fn() } }
  })

  it('só existe no desktop (bridge com openUrl)', () => {
    expect(canOpenAnnotationTextControl()).toBe(true)
    mocks.bridge = null
    expect(canOpenAnnotationTextControl()).toBe(false)
    mocks.bridge = { projection: {} }
    expect(canOpenAnnotationTextControl()).toBe(false)
  })

  it('abre o player com título, notas formatadas e cor do título', async () => {
    const ok = await openAnnotationTextControl({
      name: 'Avisos', subtitle: 'Reunião', notesHtml: '<b>Reunião</b>', titleColor: '#ffee58',
    })
    expect(ok).toBe(true)
    expect(mocks.openText).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Avisos', html: '<b>Reunião</b>', titleColor: '#ffee58' }),
      'Avisos',
    )
  })

  it('sem notas formatadas usa o subtítulo como texto', async () => {
    await openAnnotationTextControl({ name: 'Almoço', subtitle: 'Sábado às 12h', notesHtml: '' })
    const [payload] = mocks.openText.mock.calls[0] as unknown as [{ html: string }]
    expect(payload.html).toContain('Sábado às 12h')
  })
})
