import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { createPinia, setActivePinia } from 'pinia'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost' })
globalThis.window = dom.window as unknown as Window & typeof globalThis
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

vi.mock('@shared/composables/useProjectionWindow', () => ({
  isProjectionModuleOpen: vi.fn(() => false),
  openProjectionModule: vi.fn(async () => true),
  closeProjectionModule: vi.fn(),
  hasSelectedExtendedProjectionTargets: vi.fn(async () => true),
}))
vi.mock('../../settings/services/palco-routing', () => ({
  isPalcoTvOnlyRoute: vi.fn(() => false),
}))
vi.mock('../services/random-audio', () => ({
  applyRandomAudioOutput: vi.fn(),
  deleteRandomCustomAudio: vi.fn(async () => ({ ok: true })),
  ensureRandomDefaultAudioInstalled: vi.fn(async () => true),
  isRandomDrawAudioPlaying: vi.fn(() => false),
  pickAndImportRandomAudio: vi.fn(async () => ({ ok: true, fileName: 'a.mp3' })),
  playRandomDrawAudio: vi.fn(),
  playRandomWinnerEffect: vi.fn(),
  stopRandomDrawAudio: vi.fn(),
  subscribeRandomAudioPlaying: vi.fn((cb: (p: boolean) => void) => {
    cb(false)
    return () => {}
  }),
  toggleRandomDrawAudio: vi.fn(),
}))
vi.mock('../services/random-runtime', () => ({
  publishRandomRuntime: vi.fn(),
}))
vi.mock('../services/random-draw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/random-draw')>()
  let onFinishPending: ((winner: string) => void) | null = null
  let onTickPending: ((candidate: string) => void) | null = null
  return {
    ...actual,
    // animação determinística: guarda callbacks pra teste disparar manualmente
    runDrawAnimation: vi.fn(
      (
        _pool: readonly string[],
        _speed: string,
        callbacks: { onTick: (c: string) => void; onFinish: (w: string) => void },
      ) => {
        onTickPending = callbacks.onTick
        onFinishPending = callbacks.onFinish
        return () => {
          onTickPending = null
          onFinishPending = null
        }
      },
    ),
    __flushDraw: () => {
      onFinishPending?.(poolFirstUndrawn())
    },
    __fireTick: (candidate: string) => {
      onTickPending?.(candidate)
    },
  }
})

function poolFirstUndrawn(): string {
  // viewSession expõe available/drawn achatados — pega o 1º não sorteado
  return storeRef.undrawn[0] ?? ''
}
let storeRef: ReturnType<typeof useRandomStore>

import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isPalcoTvOnlyRoute } from '../../settings/services/palco-routing'
import {
  deleteRandomCustomAudio,
  isRandomDrawAudioPlaying,
  pickAndImportRandomAudio,
  playRandomDrawAudio,
  playRandomWinnerEffect,
  stopRandomDrawAudio,
} from '../services/random-audio'
import { useRandomStore } from '../stores/useRandomStore'
// @ts-expect-error helpers de teste injetados pelo mock
import { __fireTick, __flushDraw } from '../services/random-draw'
import { publishRandomRuntime } from '../services/random-runtime'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { DEFAULT_RANDOM_DISPLAY_CONFIG } from '../types/random'

function seedPref(key: string, value: unknown) {
  localStorage.setItem('user_data', JSON.stringify({ [key]: value }))
}

describe('useRandomStore', () => {
  let store: ReturnType<typeof useRandomStore>

  function freshStore() {
    setActivePinia(createPinia())
    store = useRandomStore()
    storeRef = store
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.mocked(openProjectionModule).mockResolvedValue(true)
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(true)
    vi.useFakeTimers()
    freshStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('estado inicial: defaults', () => {
    expect(store.config).toEqual({ ...DEFAULT_RANDOM_DISPLAY_CONFIG })
    expect(store.session.mode).toBe('names')
    expect(store.available).toEqual([])
    expect(store.drawn).toEqual([])
    expect(store.undrawn).toEqual([])
    expect(store.canDraw).toBe(false)
    expect(store.hydrated).toBe(false)
    expect(store.rangeError).toBeNull()
    expect(store.draftName).toBe('')
  })

  it('hydrate idempotente e reconstrói runtime preservando projecting', () => {
    seedPref(USER_PREFERENCE_KEYS.randomSession, {
      mode: 'names',
      names: { available: ['Ana'], drawn: ['Bia'], currentDisplay: 'Bia' },
      numbers: { available: [], drawn: [], currentDisplay: '' },
      numberMin: 1,
      numberMax: 10,
    })
    store.hydrate()
    expect(store.hydrated).toBe(true)
    expect(store.available).toEqual(['Ana'])
    expect(store.drawn).toEqual(['Bia'])
    expect(store.undrawn).toEqual(['Ana'])
    expect(store.canDraw).toBe(true)

    store.hydrate() // no-op
    expect(store.available).toEqual(['Ana'])
  })

  it('addName: trim/NFC/duplicata; setDraftName limpa ao adicionar', () => {
    store.hydrate()
    store.setDraftName('  José ')
    expect(store.addName()).toBe(true) // via draft
    expect(store.available).toEqual(['José'])
    expect(store.draftName).toBe('')

    // duplicata NFC
    store.setDraftName('José')
    expect(store.addName()).toBe(false)
    expect(store.draftName).toBe('')

    // string explícita vazia
    expect(store.addName('   ')).toBe(false)

    // duplicata com NFD normalize pra NFC
    expect(store.addName('Jose\u0301')).toBe(false)
  })

  it('removeAvailable/clearAvailable/removeDrawn com índices inválidos são no-op', () => {
    store.hydrate()
    store.addName('A')
    store.addName('B')
    store.removeAvailable(-1)
    store.removeAvailable(5)
    expect(store.available).toEqual(['A', 'B'])
    store.removeAvailable(0)
    expect(store.available).toEqual(['B'])

    store.removeDrawn(-1)
    store.removeDrawn(3)
    expect(store.drawn).toEqual([])

    store.clearAvailable()
    expect(store.available).toEqual([])
  })

  it('setMode preserva display do modo anterior e limpa draft', () => {
    store.hydrate()
    store.addName('A')
    store.setDraftName('x')
    store.setMode('numbers')
    expect(store.session.mode).toBe('numbers')
    expect(store.draftName).toBe('')
    // volta: nome A ainda está lá
    store.setMode('names')
    expect(store.available).toEqual(['A'])

    store.setMode('names') // mesmo modo: no-op
    expect(store.session.mode).toBe('names')
  })

  it('setNumberMin/Max e generateNumberRange ok', () => {
    store.hydrate()
    store.setNumberMin(1)
    store.setNumberMax(5)
    store.setMode('numbers')
    expect(store.generateNumberRange()).toBe(true)
    expect(store.available).toEqual(['1', '2', '3', '4', '5'])
    expect(store.rangeError).toBeNull()
  })

  it('generateNumberRange inválido seta rangeError', () => {
    store.hydrate()
    store.setMode('numbers')
    store.setNumberMin(10)
    store.setNumberMax(1)
    expect(store.generateNumberRange()).toBe(false)
    expect(store.rangeError).toBe('invalid')
    store.setNumberMax(999_999_999)
    expect(store.generateNumberRange()).toBe(false)
    expect(store.rangeError).toBe('tooLarge')
  })

  it('startDraw: isDrawing true, áudio toca, onTick/finish marcam vencedor', () => {
    store.hydrate()
    store.addName('Ana')
    store.addName('Bia')
    store.startDraw()
    expect(store.runtime.isDrawing).toBe(true)
    expect(playRandomDrawAudio).toHaveBeenCalled()
    // finish determinístico (mock guarda onFinish)
    __flushDraw()
    expect(store.runtime.isDrawing).toBe(false)
    expect(store.drawn).toEqual(['Ana'])
    expect(store.runtime.currentDisplay).toBe('Ana')
    expect(playRandomWinnerEffect).toHaveBeenCalled()
    expect(store.canDraw).toBe(true) // ainda tem 'Bia'
  })

  it('startDraw sem candidatos é no-op', () => {
    store.hydrate()
    store.startDraw()
    expect(store.runtime.isDrawing).toBe(false)
    expect(playRandomDrawAudio).not.toHaveBeenCalled()
  })

  it('cancelDrawAnimation para áudio; startDraw com áudio tocando não reinicia', () => {
    store.hydrate()
    store.addName('A')
    vi.mocked(isRandomDrawAudioPlaying).mockReturnValue(true)
    store.startDraw()
    expect(playRandomDrawAudio).not.toHaveBeenCalled()
    expect(store.runtime.isDrawing).toBe(true)
    // cancel para o áudio; isDrawing é zerado apenas pelo onFinish/reset
    store.cancelDrawAnimation()
    expect(stopRandomDrawAudio).toHaveBeenCalled()
  })

  it('clearHistory limpa drawn e display do modo ativo', () => {
    store.hydrate()
    store.addName('A')
    // simula histórico
    store.clearHistory()
    expect(store.drawn).toEqual([])
    expect(store.runtime.currentDisplay).toBe('')
  })

  it('resetAll zera os dois modos', () => {
    store.hydrate()
    store.addName('A')
    store.setMode('numbers')
    store.generateNumberRange()
    store.resetAll()
    store.setMode('names')
    expect(store.available).toEqual([])
    store.setMode('numbers')
    expect(store.available).toEqual([])
    expect(store.draftName).toBe('')
    expect(store.rangeError).toBeNull()
  })

  it('importNamesFromText dedup e persiste', () => {
    store.hydrate()
    expect(store.importNamesFromText('A\nB\nA')).toBe(2)
    expect(store.available).toEqual(['A', 'B'])
    expect(store.importNamesFromText('C')).toBe(1)
    expect(store.importNamesFromText('')).toBe(0)
  })

  it('setters de display persistem (roundtrip)', () => {
    store.hydrate()
    store.setBgColor('#111213')
    store.setTextColor('#141516')
    store.setFontSizePc(999)
    store.setFontSizePc(0)
    store.setFontSizePc(7.6)
    store.setTextTransform('uppercase')
    store.setAnimationSpeed('fast')
    freshStore()
    store.hydrate()
    expect(store.config.bgColor).toBe('#111213')
    expect(store.config.textColor).toBe('#141516')
    expect(store.config.fontSizePc).toBe(8) // clamp min
    expect(store.config.textTransform).toBe('uppercase')
    expect(store.config.animationSpeed).toBe('fast')
  })

  it('resetDisplayToDefault preserva áudio', () => {
    store.hydrate()
    store.setAudioVolume(0.5)
    store.setAudioMuted(true)
    store.setBgColor('#222')
    store.resetDisplayToDefault()
    expect(store.config.bgColor).toBe('#000000')
    expect(store.config.audioVolume).toBe(0.5)
    expect(store.config.audioMuted).toBe(true)
  })

  it('áudio: volume clamp, mute toggle, fonte custom, preview', async () => {
    store.hydrate()
    store.setAudioVolume(2)
    expect(store.config.audioVolume).toBe(1)
    store.setAudioVolume(-1)
    expect(store.config.audioVolume).toBe(0)
    store.toggleAudioMuted()
    expect(store.config.audioMuted).toBe(true)

    await expect(store.chooseCustomDrawAudio()).resolves.toBe(true)
    store.useCustomDrawAudio('a.mp3')
    expect(store.config.audioSource).toBe('custom')
    expect(store.config.customAudioFile).toBe('a.mp3')
    store.useCustomDrawAudio('inexistente.mp3') // no-op
    expect(store.config.customAudioFile).toBe('a.mp3')

    await store.useDefaultDrawAudio()
    expect(store.config.audioSource).toBe('default')

    store.togglePreviewDrawAudio()
  })

  it('chooseCustomDrawAudio/removeCustomDrawAudio', async () => {
    store.hydrate()
    await expect(store.chooseCustomDrawAudio()).resolves.toBe(true)
    expect(store.config.customAudioFiles).toEqual(['a.mp3'])
    // remove o selecionado → fonte volta pra default
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFiles).toEqual([])
    expect(store.config.audioSource).toBe('default')
  })

  it('clearProjection zera runtime.projecting e republica runtime', async () => {
    store.hydrate()
    await store.syncProjection()
    expect(store.runtime.projecting).toBe(true)
    store.clearProjection()
    expect(store.isProjecting).toBe(false)
    expect(store.runtime.projecting).toBe(false)
    const last = vi
      .mocked(publishRandomRuntime)
      .mock.calls.at(-1)?.[0] as { projecting: boolean }
    expect(last.projecting).toBe(false)
  })

  it('syncProjection espelho com monitor externo abre janela', async () => {
    store.hydrate()
    await store.syncProjection()
    expect(openProjectionModule).toHaveBeenCalledWith('random')
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(false)
  })

  it('syncProjection sem monitor externo: preview in-app', async () => {
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.syncProjection()
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
    expect(store.inAppPreview).toBe(true)
  })

  it('syncProjection TV-only', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(store.isProjecting).toBe(true)
  })

  it('syncProjection falha ao abrir: isProjecting false', async () => {
    vi.mocked(openProjectionModule).mockResolvedValue(false)
    await store.syncProjection()
    expect(store.isProjecting).toBe(false)
  })

  it('watch TV-only: tick NÃO derruba projeção', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)
  })

  it('watch derruba janela fechada; reabre depois', async () => {
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)

    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.syncProjection()
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(true)
  })

  it('toggleProjection liga e desliga (espelho e preview)', async () => {
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()

    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
  })

  it('hydrate com janela de projeção aberta inicia watch', () => {
    vi.mocked(isProjectionModuleOpen).mockReturnValue(true)
    store.hydrate()
    expect(store.isProjecting).toBe(true)
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    vi.advanceTimersByTime(500)
    expect(store.isProjecting).toBe(false)
  })

  it('onTick da animação atualiza display sem derrubar projecting', () => {
    store.hydrate()
    store.addName('A')
    store.addName('B')
    store.startDraw()
    __fireTick('B')
    expect(store.runtime.currentDisplay).toBe('B')
    expect(store.runtime.isDrawing).toBe(true)
    store.cancelDrawAnimation()
  })

  it('runtime publicado espelha drawn e mode', () => {
    store.hydrate()
    store.addName('A')
    store.addName('B')
    store.startDraw()
    __flushDraw()
    expect(store.runtime.drawn).toEqual(['A'])
    expect(store.runtime.mode).toBe('names')
    // drawnReversed: histórico mais recente primeiro
    store.startDraw()
    __flushDraw()
    expect(store.drawnReversed).toEqual(['B', 'A'])
  })

  it('setAudioSource direto persiste', () => {
    store.hydrate()
    store.setAudioSource('custom')
    expect(store.config.audioSource).toBe('custom')
  })

  it('removeDrawn remove do histórico e sincroniza runtime', async () => {
    store.hydrate()
    store.addName('A')
    store.startDraw()
    __flushDraw()
    expect(store.drawn).toEqual(['A'])
    store.removeDrawn(0)
    expect(store.drawn).toEqual([])
    store.removeDrawn(0) // já vazio: no-op
  })

  it('useCustomDrawAudio sem arquivo selecionado é no-op', () => {
    store.hydrate()
    store.useCustomDrawAudio() // customAudioFile null
    expect(store.config.audioSource).toBe('default')
  })

  it('removeCustomDrawAudio: não selecionado mantém seleção; selecionado último → default', async () => {
    store.hydrate()
    await store.chooseCustomDrawAudio() // a.mp3 selecionado
    // adiciona um segundo arquivo direto no config pra exercitar branchs
    store.config.customAudioFiles = [...store.config.customAudioFiles, 'b.mp3']
    // remove NÃO selecionado: seleção 'a.mp3' permanece
    await expect(store.removeCustomDrawAudio('b.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFile).toBe('a.mp3')
    expect(store.config.audioSource).toBe('custom')
    // agora remove selecionado mas existe outro → seleciona primeiro restante
    store.config.customAudioFiles = [...store.config.customAudioFiles, 'b.mp3']
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFile).toBe('b.mp3')
    expect(store.config.audioSource).toBe('custom')
    // remove selecionado e único → default
    await expect(store.removeCustomDrawAudio('b.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFile).toBeNull()
    expect(store.config.audioSource).toBe('default')
  })

  it('chooseCustomDrawAudio com arquivo duplicado não duplica lista', async () => {
    store.hydrate()
    await store.chooseCustomDrawAudio()
    store.config.customAudioFiles = ['a.mp3', 'old.mp3']
    store.config.customAudioFile = 'old.mp3'
    vi.mocked(pickAndImportRandomAudio).mockResolvedValueOnce({
      ok: true,
      fileName: 'a.mp3',
    })
    await expect(store.chooseCustomDrawAudio()).resolves.toBe(true)
    expect(store.config.customAudioFiles).toEqual(['a.mp3', 'old.mp3'])
    expect(store.config.customAudioFile).toBe('a.mp3')
    expect(store.config.audioSource).toBe('custom')
  })

  it('chooseCustomDrawAudio falha (dialog cancelado) e sem fileName → false', async () => {
    store.hydrate()
    vi.mocked(pickAndImportRandomAudio).mockResolvedValueOnce({ ok: false })
    await expect(store.chooseCustomDrawAudio()).resolves.toBe(false)
    vi.mocked(pickAndImportRandomAudio).mockResolvedValueOnce({
      ok: true,
      fileName: null,
    })
    await expect(store.chooseCustomDrawAudio()).resolves.toBe(false)
  })

  it('removeCustomDrawAudio com falha do serviço → false', async () => {
    store.hydrate()
    vi.mocked(deleteRandomCustomAudio).mockResolvedValueOnce({ ok: false })
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(false)
  })

  it('removeCustomDrawAudio: seleção inexistente na lista cai pro primeiro restante', async () => {
    store.hydrate()
    await store.chooseCustomDrawAudio() // a.mp3
    store.config.customAudioFiles = ['a.mp3', 'b.mp3']
    store.config.customAudioFile = 'zumbi.mp3' // não existe mais na lista
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(true)
    // não selecionado, customAudioFile não está em nextFiles → cai pro primeiro
    expect(store.config.customAudioFile).toBe('b.mp3')
    expect(store.config.audioSource).toBe('custom')
  })

  it('removeCustomDrawAudio: seleção null com resto na lista cai pro primeiro', async () => {
    store.hydrate()
    store.config.customAudioFiles = ['a.mp3', 'b.mp3']
    store.config.customAudioFile = null // sem seleção — cobre short-circuit &&
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFile).toBe('b.mp3')
  })

  it('removeCustomDrawAudio: seleção null e último arquivo → nextFiles vazio → null', async () => {
    store.hydrate()
    store.config.customAudioFiles = ['a.mp3']
    store.config.customAudioFile = null
    await expect(store.removeCustomDrawAudio('a.mp3')).resolves.toBe(true)
    expect(store.config.customAudioFile).toBeNull()
  })

  it('toggleProjection via projectingTvsOnly e inAppPreview desliga', async () => {
    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(true)
    await store.syncProjection()
    vi.mocked(isProjectionModuleOpen).mockReturnValue(false)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)

    vi.mocked(isPalcoTvOnlyRoute).mockReturnValue(false)
    vi.mocked(hasSelectedExtendedProjectionTargets).mockResolvedValue(false)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(true)
    await store.toggleProjection()
    expect(store.isProjecting).toBe(false)
  })

  it('configOpen abre/fecha', () => {
    store.openConfig()
    expect(store.configOpen).toBe(true)
    store.closeConfig()
    expect(store.configOpen).toBe(false)
  })
})
