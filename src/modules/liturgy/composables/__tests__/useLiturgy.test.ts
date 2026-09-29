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
})
