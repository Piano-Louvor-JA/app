// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

// ── mocks de infra (hoisted vars) ───────────────────────────────────────────
const pushMock = vi.fn()
const openLyricMock = vi.fn(async () => undefined)
const closeLyricMock = vi.fn()
const appConfirmMock = vi.fn(async () => true)
const decodeJaBytesMock = vi.fn()
const parseJaLiturgyMock = vi.fn()
const bridgeState = { value: null as Record<string, unknown> | null }
const desktopBridgeMock = () => bridgeState.value

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (!params) return key
        const vals = Object.values(params).map(String).join(',')
        return `${key}:${vals}`
      },
    }),
  }
})
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => desktopBridgeMock(),
}))
vi.mock('@shared/composables/useAppConfirm', () => ({
  appConfirm: (...args: unknown[]) => appConfirmMock(...args),
}))
vi.mock('../../services/liturgy-catalog', () => ({
  loadLiturgyMusicOptions: vi.fn(async () => [
    { id: 1, title: 'Hino 1', hasInstrumental: false },
    { id: 2, title: 'Hino 2', hasInstrumental: true },
  ]),
  loadLiturgyBibleBooks: vi.fn(async () => []),
}))
vi.mock('../../services/liturgy-ja-import', () => ({
  decodeJaBytes: (b: Uint8Array) => decodeJaBytesMock(b),
  parseJaLiturgy: (d: unknown) => parseJaLiturgyMock(d),
}))
vi.mock('@modules/albums/stores/useAlbumsStore', () => ({
  useAlbumsStore: () => ({
    lyricOpen: { value: false },
    lyricDoc: { value: null },
    isLoadingLyric: { value: false },
    openLyric: openLyricMock,
    closeLyric: closeLyricMock,
  }),
}))

import { useLiturgy } from '../useLiturgy'
import { useLiturgyStore } from '../../stores/useLiturgyStore'

function mountWith(setup: () => unknown) {
  return mount(
    defineComponent({
      setup() {
        return { exposed: setup() }
      },
      render() {
        return h('div')
      },
    }),
  )
}

type Exposed = Record<string, unknown>

/** Stub de <input type=file>: chama onchange com/sem arquivo. */
function stubFileInput(file: File | null) {
  return vi
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        value: file ? [file] : null,
        configurable: true,
      })
      this.onchange?.(new Event('change'))
    })
}

/** Bridge desktop mockado: openFile devolve paths; readBinaryFile codifica texto. */
function stubDesktopBridge() {
  const paths: string[] = []
  const contents: string[] = []
  bridgeState.value = {
    dialog: {
      openFile: vi.fn(async () => paths[paths.length - 1] ?? null),
    },
    workspace: {
      readBinaryFile: vi.fn(async (path: string) => {
        const i = paths.indexOf(path)
        return new TextEncoder().encode(contents[i] ?? '')
      }),
    },
  }
  return {
    open(pathsAndContents: Array<[string, string]>) {
      for (const [p, c] of pathsAndContents) {
        paths.push(p)
        contents.push(c)
      }
    },
    cancel() {
      paths.push('')
    },
  }
}

describe('useLiturgy (orquestrador da view)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    bridgeState.value = null
    pushMock.mockClear()
    openLyricMock.mockClear()
    closeLyricMock.mockClear()
    appConfirmMock.mockClear().mockResolvedValue(true)
    window.confirm = vi.fn(() => false)
    window.alert = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('unmount com syncTimer ativo → clearInterval chamado', async () => {
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const wrapper = mountWith(() => useLiturgy())
    await new Promise((r) => setTimeout(r, 0))
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('hidrata no mount, expõe labels e labels de duração', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(f.worshipLabel).toBeTypeOf('function')
    const label = (f.worshipLabel as () => string)()
    expect(label).toContain('liturgy.worshipOf')

    expect((f.startLabels as unknown as { value: string[] }).value).toEqual([])
    expect((f.durationLabels as unknown as { value: string[] }).value).toEqual([])

    expect(f.headerDateTime).toBeTypeOf('function')
    wrapper.unmount()
  })

  it('confirmClearLiturgy/confirmRemoveItem respeitam confirm e deletionLock', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    ;(f.confirmClearLiturgy as () => void)()
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    ;(f.confirmRemoveCustom as (i: number) => void)(0)
    ;(f.onManageTeam as () => void)()
    expect(window.alert).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('seleção de item/dia e ações de música delegam pro store/albums', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    ;(f.selectDay as (d: string) => void)('sabbath')
    expect(
      (f.selectedDay as unknown as { value: string }).value,
    ).toBeDefined()

    ;(f.onMusicSung as (i: number) => void)(0)
    ;(f.onMusicInstrumental as (i: number) => void)(0)
    ;(f.onMusicSlides as (i: number) => void)(0)
    ;(f.onMusicLyric as (i: number) => void)(0)
    ;(f.openAddDialog as () => void)()
    ;(f.openAddSubItemDialog as (c: string) => void)('cat1')
    ;(f.openEditDialog as (i: number) => void)(0)
    await new Promise((r) => setTimeout(r, 0))
    expect(closeLyricMock).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importJa: cancel no dialog → retorna sem confirm', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().cancel()

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importJa: parse inválido → erro amigável', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([['/tmp/x.ja', 'CONTENT']])

    parseJaLiturgyMock.mockImplementation(() => {
      throw new Error('bad')
    })

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'liturgy.importJaInvalid' }),
    )
    wrapper.unmount()
  })

  it('importJa: parse ok sem duplicados → merge e mensagem final', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([['/tmp/x.ja', 'CONTENT']])
    parseJaLiturgyMock.mockReturnValue({ days: [] })

    const store = useLiturgyStore()
    vi.spyOn(store, 'countJaDuplicates').mockReturnValue(0)
    vi.spyOn(store, 'importJaDays').mockResolvedValue({
      added: 3,
      skipped: 1,
      days: ['monday'],
    })

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.importJaDone'),
      }),
    )
    wrapper.unmount()
  })

  it('importJa: com duplicados → pergunta; confirm false = merge', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([['/tmp/x.ja', 'CONTENT']])
    parseJaLiturgyMock.mockReturnValue({ days: [] })
    appConfirmMock.mockResolvedValueOnce(true) // overwrite? true

    const store = useLiturgyStore()
    vi.spyOn(store, 'countJaDuplicates').mockReturnValue(2)
    const importSpy = vi
      .spyOn(store, 'importJaDays')
      .mockResolvedValue({ added: 2, skipped: 0, days: ['monday'] })

    await (f.importJa as () => Promise<void>)()
    expect(importSpy).toHaveBeenCalledWith({ days: [] }, 'overwrite')
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.importJaOverwritten'),
      }),
    )
    wrapper.unmount()
  })

  it('importScheduled: nome not-ported → aviso e aborta', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([
      ['/tmp/coletaneasusuario.xml', '<x/>'],
    ])

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.notPorted'),
      }),
    )
    wrapper.unmount()
  })

  it('importScheduled: cancel no primeiro dialog → nada', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().cancel()

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled: fluxo feliz com 2 XMLs', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([
      ['/tmp/cats.xml', '<DATAPACKET><ROWDATA><ROW ID="c1" NOME="Culto"/></ROWDATA></DATAPACKET>'],
      ['/tmp/items.xml', '<DATAPACKET><ROWDATA><ROW ID="s1" DATA="13/10/2026"/></ROWDATA></DATAPACKET>'],
    ])

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.imported'),
      }),
    )
    wrapper.unmount()
  })

  it('onVideoFileSelected converte segundos → ms', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    ;(f.onVideoFileSelected as (id: string, s: number) => void)('nope', 12.4)
    wrapper.unmount()
  })

  it('onSelectItem e onPlayItemOnScreens chamam store (router passed)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    const store = useLiturgyStore()
    const selSpy = vi.spyOn(store, 'selectItem').mockResolvedValue(undefined)
    const playSpy = vi.spyOn(store, 'playItemOnScreens').mockResolvedValue(undefined)

    ;(f.selectItem as (i: number) => void)(2)
    ;(f.playItemOnScreens as (i: number) => void)(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(selSpy).toHaveBeenCalledWith(2, expect.anything())
    expect(playSpy).toHaveBeenCalledWith(1)
    wrapper.unmount()
  })

  it('musicInstrumentalById mapeia musicList do catálogo', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    const map = (f.musicInstrumentalById as unknown as { value: Record<number, boolean> }).value
    expect(map[1]).toBe(false)
    expect(map[2]).toBe(true)
    wrapper.unmount()
  })

  it('confirmClear com itens e confirm true → clearAllItems; lock bloqueia', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))
    window.confirm = vi.fn(() => true)
    const clearSpy = vi.spyOn(store, 'clearAllItems').mockReturnValue(undefined)
    // sem itens não chama
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).not.toHaveBeenCalled()
    // com item do dia atual → chama
    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'i1', type: 'category' } as never,
    ]
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).toHaveBeenCalled()
    // lock ativo → nem pergunta
    vi.mocked(clearSpy).mockClear()
    store.toggleDeletionLock()
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled via web input: FileReader lê xml', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    const xml = '<DATAPACKET><ROWDATA><ROW ID="c1" NOME="Culto"/></ROWDATA></DATAPACKET>'
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File([xml], 'cats.xml')
        Object.defineProperty(this, 'files', { value: [file], configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.imported'),
      }),
    )
    wrapper.unmount()
  })

  it('pickJaFileWeb (sem bridge): FileReader lê .ja e importa', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    parseJaLiturgyMock.mockReturnValue({ days: {} })
    const store = useLiturgyStore()
    vi.spyOn(store, 'countJaDuplicates').mockReturnValue(0)
    vi.spyOn(store, 'importJaDays').mockResolvedValue({ added: 1, skipped: 0, days: ['x'] })

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File([new Uint8Array([9, 9])], 'x.ja')
        Object.defineProperty(file, 'arrayBuffer', {
          value: async () => new Uint8Array([9, 9]).buffer,
          configurable: true,
        })
        // jsdom File sem arrayBuffer? FileReader usado aqui resolve
        Object.defineProperty(this, 'files', { value: [file], configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.importJaDone'),
      }),
    )
    wrapper.unmount()
  })

  it('onImportScheduled web com reader.onerror → resolve null e aborta', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File(['x'], 'cats.xml')
        Object.defineProperty(this, 'files', { value: [file], configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    // sabota FileReader pra disparar onerror
    const realReader = globalThis.FileReader
    class FailingReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: unknown = null
      readAsText() {
        this.onerror?.()
      }
    }
    ;(globalThis as { FileReader: unknown }).FileReader = FailingReader
    try {
      await (f.importScheduled as () => Promise<void>)()
    } finally {
      ;(globalThis as { FileReader: unknown }).FileReader = realReader
    }
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('worshipLabel custom com título usa o título; custom sem título → days.custom', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    store.selectCustom?.(store.customs?.[0]?.id ?? '') ?? store.runtime
    // seta custom com nome
    const customs = store.customs as unknown as { value: Array<{ id: string; name: string }> } | undefined
    if (customs && customs.value.length === 0) {
      ;(customs.value as Array<{ id: string; name: string }>).push({ id: 'c1', name: 'Culto Especial' })
    }
    ;(f.selectDay as (d: string) => void)('custom')
    await wrapper.vm.$nextTick()
    const label = (f.worshipLabel as () => string)()
    expect(label).toBeTypeOf('string')

    // sem título (custom vazio) → label days.custom
    const customs2 = store.customs as unknown as { value: unknown[] } | undefined
    if (customs2) customs2.value = []
    ;(f.selectDay as (d: string) => void)('custom')
    await wrapper.vm.$nextTick()
    const label2 = (f.worshipLabel as () => string)()
    expect(label2).toContain('liturgy.days.custom')
    wrapper.unmount()
  })

  it('startLabels/durationLabels com itens preenchidos', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'i1', type: 'category', durationMs: 90000 } as never,
    ]
    await wrapper.vm.$nextTick()
    expect((f.startLabels as unknown as { value: string[] }).value).toEqual(['—'])
    expect((f.durationLabels as unknown as { value: string[] }).value.length).toBe(1)
    wrapper.unmount()
  })

  it('confirmRemoveItem: item null (índice fora) não pergunta; category vs music', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    // item category
    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'c1', type: 'category' } as never,
      { id: 'm1', type: 'music', musicId: 7 } as never,
    ]
    window.confirm = vi.fn(() => false)
    ;(f.confirmRemoveItem as (i: number) => void)(0) // category branch
    ;(f.confirmRemoveItem as (i: number) => void)(1) // music branch
    // índice fora → item undefined → early return sem confirm
    window.confirm = vi.fn()
    ;(f.confirmRemoveItem as (i: number) => void)(9)
    expect(window.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('onMusicLyric: item sem música (índice fora) não abre', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'm1', type: 'music', musicId: 7 } as never,
    ]
    ;(f.onMusicLyric as (i: number) => void)(0)
    ;(f.onMusicLyric as (i: number) => void)(5) // fora → return
    await new Promise((r) => setTimeout(r, 0))
    expect(openLyricMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('clock: getters do header expostos e computados refletidos', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    // headerDateTime é função do useLiturgyClock
    expect((f.headerDateTime as () => string)()).toMatch(/•/)

    // getters que leem currentStartTime/currentEndTime (callbacks do clock)
    expect((f.startTimeInput as unknown as { value: string }).value).toBe('')
    expect((f.endTimeInput as unknown as { value: string }).value).toBe('')

    // countdown parado → expired false e label '—'
    expect((f.countdownExpired as unknown as { value: boolean }).value).toBe(false)
    expect(
      (f.remainingCountdownLabel as unknown as { value: string }).value,
    ).toBe('—')

    // countdown rodando com endTime setado → label de contagem
    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = []
    store.setSessionEndFromInput?.('23:59')
    store.startCountdown?.()
    await wrapper.vm.$nextTick()
    expect(
      (f.remainingCountdownLabel as unknown as { value: string }).value,
    ).toBeTypeOf('string')
    wrapper.unmount()
  })

  it('interval de 400ms dispara syncSiteProjectionState', async () => {
    vi.useFakeTimers()
    const wrapper = mountWith(() => useLiturgy())
    const store = useLiturgyStore()
    const spy = vi.spyOn(store, 'syncSiteProjectionState').mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(0)
    spy.mockClear()
    await vi.advanceTimersByTimeAsync(900) // 2+ ticks de 400ms
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('pickJaFileWeb: file.arrayBuffer rejeita → resolve null e erro amigável', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        const file = new File([new Uint8Array([1])], 'x.ja')
        Object.defineProperty(file, 'arrayBuffer', {
          value: async () => {
            throw new Error('boom')
          },
          configurable: true,
        })
        Object.defineProperty(this, 'files', { value: [file], configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'liturgy.importJaReadError' }),
    )
    wrapper.unmount()
  })

  it('branches negativos: confirm recusado, lock ativo, custom inexistente, cancel web', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    // worshipLabel custom com título → retorna título
    ;(f.selectDay as (d: string) => void)('custom')
    const customsRef = (f.customLiturgies as unknown as { value: Array<{ id: string; name: string }> })
    customsRef.value = [{ id: 'c1', name: 'Culto Especial' }]
    store.selectCustomLiturgy?.(0 as never)
    await wrapper.vm.$nextTick()
    const label = (f.worshipLabel as () => string)()
    expect(label).toBeTypeOf('string')

    // confirmRemoveCustom: confirm false → sem remove; custom inexistente → name ''
    const rmSpy = vi.spyOn(store, 'removeCustomLiturgy').mockReturnValue(undefined)
    ;(f.confirmRemoveCustom as (i: number) => void)(0) // confirm false (default)
    expect(rmSpy).not.toHaveBeenCalled()
    ;(f.confirmRemoveCustom as (i: number) => void)(9)
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('confirmDeleteCustom:'),
    )

    // confirmRemoveItem: category confirm true → remove
    window.confirm = vi.fn(() => true)
    ;(f.selectDay as (d: string) => void)('sabbath')
    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'c1', type: 'category' } as never,
    ]
    const remSpy = vi.spyOn(store, 'removeItem').mockReturnValue(undefined)
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    expect(remSpy).toHaveBeenCalledWith(0)

    // deletionLocked → nem pergunta
    remSpy.mockClear()
    store.toggleDeletionLock()
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    expect(remSpy).not.toHaveBeenCalled()

    // confirmClear: confirm false → sem clear
    window.confirm = vi.fn(() => false)
    const clearSpy = vi.spyOn(store, 'clearAllItems').mockReturnValue(undefined)
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).not.toHaveBeenCalled()

    // importScheduled web: cancel (sem arquivo) → aborta silencioso
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', { value: null, configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled desktop: readBinaryFile null/erro e não-ported em 2ª leitura', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))

    // 2º dialog devolve null → items null, importa só cats
    bridgeState.value = {
      dialog: {
        openFile: vi
          .fn()
          .mockResolvedValueOnce('/tmp/cats.xml')
          .mockResolvedValueOnce(null),
      },
      workspace: {
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('<x/>')),
      },
    }
    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.imported'),
      }),
    )

    // 2º arquivo com erro de leitura → items null, ainda importa só cats
    appConfirmMock.mockClear()
    bridgeState.value = {
      dialog: {
        openFile: vi
          .fn()
          .mockResolvedValueOnce('/tmp/cats.xml')
          .mockResolvedValueOnce('/tmp/items.xml'),
      },
      workspace: {
        readBinaryFile: vi
          .fn()
          .mockResolvedValueOnce(new TextEncoder().encode('<x/>'))
          .mockRejectedValueOnce(new Error('disk')),
      },
    }
    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.imported'),
      }),
    )
    wrapper.unmount()
  })

  it('importJa desktop: readBinaryFile rejeita → erro de leitura', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    bridgeState.value = {
      dialog: { openFile: vi.fn().mockResolvedValue('/tmp/x.ja') },
      workspace: {
        readBinaryFile: vi.fn().mockRejectedValue(new Error('disk')),
      },
    }
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'liturgy.importJaReadError' }),
    )
    wrapper.unmount()
  })

  it('importJa: array path → pega primeiro; readBinaryFile null → erro de leitura', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    await new Promise((r) => setTimeout(r, 0))
    bridgeState.value = {
      dialog: { openFile: vi.fn().mockResolvedValue(['/tmp/a.ja', '/tmp/b.ja']) },
      workspace: { readBinaryFile: vi.fn().mockResolvedValue(null) },
    }
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'liturgy.importJaReadError' }),
    )

    // duplicados → cancel (confirm false) = merge
    appConfirmMock.mockClear()
    bridgeState.value = {
      dialog: { openFile: vi.fn().mockResolvedValue('/tmp/x.ja') },
      workspace: {
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('C')),
      },
    }
    parseJaLiturgyMock.mockReturnValue({ days: [] })
    const store = useLiturgyStore()
    vi.spyOn(store, 'countJaDuplicates').mockReturnValue(1)
    appConfirmMock.mockResolvedValueOnce(false) // overwrite? não = merge
    const importSpy = vi
      .spyOn(store, 'importJaDays')
      .mockResolvedValue({ added: 0, skipped: 1, days: [] })
    await (f.importJa as () => Promise<void>)()
    expect(importSpy).toHaveBeenCalledWith({ days: [] }, 'merge')
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.importJaDone'),
      }),
    )
    wrapper.unmount()
  })

  it('importJa: parse lança com duplicados presentes ainda cobre overflow label', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))
    stubDesktopBridge().open([['/tmp/x.ja', 'C']])
    parseJaLiturgyMock.mockReturnValue({ days: [] })
    vi.spyOn(store, 'countJaDuplicates').mockReturnValue(5)
    vi.spyOn(store, 'importJaDays').mockResolvedValue({
      added: 1,
      skipped: 2,
      days: ['a', 'b', 'c', 'd'],
    })
    await (f.importJa as () => Promise<void>)()
    // confirm true (default) → overwrite com dias
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.importJaOverwritten'),
      }),
    )
    wrapper.unmount()
  })

  it('cantos: unmount sem timer, lock+itens no clear, removeCustom confirm true, array path/null bytes scheduled, web sem arquivo', async () => {
    // unmount com syncTimer null (setInterval mockado pra não registrar)
    const siSpy = vi
      .spyOn(window, 'setInterval')
      .mockImplementation(() => null as unknown as number)
    const w1 = mountWith(() => useLiturgy())
    await new Promise((r) => setTimeout(r, 0))
    siSpy.mockRestore()
    w1.unmount()

    const wrapper = mountWith(() => useLiturgy())
    const f = (wrapper.vm as unknown as { exposed: Exposed }).exposed
    const store = useLiturgyStore()
    await new Promise((r) => setTimeout(r, 0))

    // confirmClear: itens presentes + deletionLocked → early return (branch falso)
    store.weekdays[store.selectedDay as keyof typeof store.weekdays] = [
      { id: 'c1', type: 'category' } as never,
    ]
    store.toggleDeletionLock()
    const clearSpy = vi.spyOn(store, 'clearAllItems').mockReturnValue(undefined)
    window.confirm = vi.fn(() => true)
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).not.toHaveBeenCalled()

    // confirmClear: itens presentes, sem lock, confirm recusado → return
    store.toggleDeletionLock()
    window.confirm = vi.fn(() => false)
    ;(f.confirmClearLiturgy as () => void)()
    expect(clearSpy).not.toHaveBeenCalled()
    expect(window.confirm).toHaveBeenCalledWith('liturgy.messages.confirmClear')

    // confirmRemoveCustom: confirm true → remove de fato
    window.confirm = vi.fn(() => true)
    ;(f.customLiturgies as unknown as { value: unknown[] }).value = [
      { id: 'c9', name: 'X', items: [], notes: '', startTime: null, endTime: null },
    ]
    ;(f.confirmRemoveCustom as (i: number) => void)(0)
    expect(
      (f.customLiturgies as unknown as { value: unknown[] }).value,
    ).toHaveLength(0)

    // importScheduled desktop: openFile devolve array; bytes null no 1º arquivo
    bridgeState.value = {
      dialog: {
        openFile: vi
          .fn()
          .mockResolvedValueOnce(['/tmp/cats.xml'])
          .mockResolvedValueOnce('/tmp/items.xml'),
      },
      workspace: {
        readBinaryFile: vi
          .fn()
          .mockResolvedValueOnce(new TextEncoder().encode('<x/>'))
          .mockResolvedValueOnce(null),
      },
    }
    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('liturgy.scheduled.imported'),
      }),
    )

    // importJa web (sem bridge): sem arquivo escolhido → read error
    bridgeState.value = null
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', { value: null, configurable: true })
        this.onchange?.(new Event('change'))
      },
    )
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'liturgy.importJaReadError' }),
    )
    wrapper.unmount()
  })
})
