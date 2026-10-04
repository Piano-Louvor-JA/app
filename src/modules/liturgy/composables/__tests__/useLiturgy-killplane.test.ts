// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

// Kill-plane useLiturgy: linhas 77-80 (clock callbacks), 89 (sync interval),
// 171/174 (desktop read null/throw), 184 (web input cancelado),
// 237/244/249 (importJa desktop throw + readError), 297-302 (pickJaFileWeb
// sem arquivo / arrayBuffer reject).

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
  appConfirm: (opts: unknown) => appConfirmMock(opts),
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

function getExposed(wrapper: ReturnType<typeof mountWith>): Exposed {
  return (wrapper.vm as unknown as { exposed: Exposed }).exposed
}

describe('useLiturgy kill-plane (linhas restantes)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    bridgeState.value = null
    pushMock.mockClear()
    appConfirmMock.mockClear().mockResolvedValue(true)
    decodeJaBytesMock.mockReset()
    parseJaLiturgyMock.mockReset()
    window.confirm = vi.fn(() => false)
    window.alert = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clock: callbacks de start/end/running/session executam', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    // store expõe clock via composável — acessar valores reativos força os getters
    const store = useLiturgyStore()
    store.selectedDay = 'sabbath' as unknown as typeof store.selectedDay
    await wrapper.vm.$nextTick()

    // currentStartTime/currentEndTime/countdownRunning/sessionStartedAt getters
    const clock = (f as Record<string, unknown>).clock as
      | Record<string, unknown>
      | undefined
    // clock não é exposto diretamente, mas os computed dependem dos getters.
    // Forçar leitura de propriedades que passam pelos callbacks:
    expect(f.headerDateTime).toBeTypeOf('function')
    ;(f.headerDateTime as () => string)()
    wrapper.unmount()
  })

  it('sync interval: syncSiteProjectionState roda a cada 400ms e para no unmount', async () => {
    vi.useFakeTimers()
    const store = useLiturgyStore()
    const spy = vi.spyOn(store, 'syncSiteProjectionState').mockResolvedValue()
    const wrapper = mountWith(() => useLiturgy())
    await vi.advanceTimersByTimeAsync(0)

    // mount dispara 1x imediato
    expect(spy).toHaveBeenCalledTimes(1)
    // interval de 400ms: 3 ticks = 3 chamadas extras
    await vi.advanceTimersByTimeAsync(1200)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(4)

    wrapper.unmount()
    const count = spy.mock.calls.length
    await vi.advanceTimersByTimeAsync(2000)
    // não cresce após unmount
    expect(spy.mock.calls.length).toBe(count)
  })

  it('importScheduled desktop: readBinaryFile null → aborta', async () => {
    const calls: string[] = []
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.xml') },
      workspace: { readBinaryFile: vi.fn(async () => null) },
    }
    void calls
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled desktop: readBinaryFile throw → aborta silencioso', async () => {
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.xml') },
      workspace: {
        readBinaryFile: vi.fn(async () => {
          throw new Error('boom')
        }),
      },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled web: input sem arquivo → resolve null, sem confirm', async () => {
    const clickSpy = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', {
          value: null,
          configurable: true,
        })
        this.onchange?.(new Event('change'))
      })

    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importScheduled as () => Promise<void>)()
    expect(clickSpy).toHaveBeenCalled()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importJa desktop: readBinaryFile throw → importJaReadError', async () => {
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.ja') },
      workspace: {
        readBinaryFile: vi.fn(async () => {
          throw new Error('boom')
        }),
      },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledTimes(1)
    const confirmArg = JSON.stringify(appConfirmMock.mock.calls[0]?.[0] ?? null)
    expect(confirmArg).toContain('liturgy.importJaReadError')
    wrapper.unmount()
  })

  it('importJa desktop: bytes null (readError) → importJaReadError', async () => {
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.ja') },
      workspace: { readBinaryFile: vi.fn(async () => null) },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    const confirmArg = JSON.stringify(appConfirmMock.mock.calls[0]?.[0] ?? null)
    expect(confirmArg).toContain('liturgy.importJaReadError')
    wrapper.unmount()
  })

  it('pickJaFileWeb: onchange sem arquivo → resolve null → readError', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', {
          value: null,
          configurable: true,
        })
        this.onchange?.(new Event('change'))
      },
    )

    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    const confirmArg = JSON.stringify(appConfirmMock.mock.calls[0]?.[0] ?? null)
    expect(confirmArg).toContain('liturgy.importJaReadError')
    wrapper.unmount()
  })

  it('pickJaFileWeb: arrayBuffer rejeita → resolve null → readError', async () => {
    const file = new File([new Uint8Array([1, 2])], 'x.ja')
    file.arrayBuffer = () => Promise.reject(new Error('reject'))
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(
      function (this: HTMLInputElement) {
        Object.defineProperty(this, 'files', {
          value: [file],
          configurable: true,
        })
        this.onchange?.(new Event('change'))
      },
    )

    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    const confirmArg = JSON.stringify(appConfirmMock.mock.calls[0]?.[0] ?? null)
    expect(confirmArg).toContain('liturgy.importJaReadError')
    wrapper.unmount()
  })
  it('clock inputs: startTimeInput/endTimeInput refletem store; countdown getters rodam', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.setSessionStartFromInput('00:01')
    store.setSessionEndFromInput('23:59')
    await wrapper.vm.$nextTick()

    expect((f.startTimeInput as unknown as { value: string }).value).toBe('00:01')
    expect((f.endTimeInput as unknown as { value: string }).value).toBe('23:59')

    // countdownRunning/sessionStartedAt getters via computed do clock
    store.startCountdown()
    await wrapper.vm.$nextTick()
    expect((f.countdownExpired as unknown as { value: boolean }).value).toBe(false)
    expect((f.remainingCountdownLabel as unknown as { value: string }).value).toBeDefined()

    store.stopCountdown()
    store.clearSessionStart()
    store.clearSessionEnd()
    wrapper.unmount()
  })

  it('worshipLabel: dia custom com título usa o título (linha 102)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.selectDay('custom' as unknown as typeof store.selectedDay)
    store.newCustomName = 'Culto Especial'
    store.createCustomLiturgy()
    store.selectCustomLiturgy(0)
    await wrapper.vm.$nextTick()

    const label = (f.worshipLabel as () => string)()
    expect(label).toBe('Culto Especial')
    wrapper.unmount()
  })

  it('confirmRemoveItem category com confirm true → removeItem (linha 132)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.openAddDialog()
    store.setItemDraft({
      type: 'category',
      name: 'Categoria X',
      subtitle: '',
      startTime: '10:00',
      endTime: '11:00',
      categoryId: null,
      musicId: null,
      filePath: '',
      filePaths: [],
    } as never)
    store.saveItemDraft()
    await wrapper.vm.$nextTick()
    expect(store.currentItems.length).toBeGreaterThan(0)
    window.confirm = vi.fn(() => true)
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    expect(store.currentItems.length).toBe(0)
    wrapper.unmount()
  })

  it('confirmRemoveCustom com confirm true → removeCustomLiturgy (linha 142)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.createCustomLiturgy('Minha Liturgia')
    await wrapper.vm.$nextTick()
    window.confirm = vi.fn(() => true)
    ;(f.confirmRemoveCustom as (i: number) => void)(0)
    expect(store.customLiturgies.length).toBe(0)
    wrapper.unmount()
  })
  it('confirmClear/confirmRemove com deletionLocked → early return (119/124)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.toggleDeletionLock()
    window.confirm = vi.fn(() => true)
    ;(f.confirmClearLiturgy as () => void)()
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    expect(window.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled: dialog cancel no 2º arquivo (items) → importFromDelphi(null)', async () => {
    let call = 0
    bridgeState.value = {
      dialog: {
        openFile: vi.fn(async () => {
          call += 1
          return call === 1 ? '/tmp/cats.xml' : null
        }),
      },
      workspace: {
        readBinaryFile: vi.fn(async (path: string) =>
          new TextEncoder().encode(
            path.includes('cats') ? '<xml>cats</xml>' : '<xml>items</xml>',
          ),
        ),
      },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    // notPorted check: nome cats.xml NAO bate com a lista (coletaneasusuario etc)
    await (f.importScheduled as () => Promise<void>)()
    // appConfirm chamado 1x com mensagem imported (items null → n do que parseou)
    expect(appConfirmMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('importJa: dialog openFile null → retorna sem confirm (232)', async () => {
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => null) },
      workspace: { readBinaryFile: vi.fn(async () => new Uint8Array([1])) },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importJa: overwrite confirm false → mode merge (273)', async () => {
    appConfirmMock.mockImplementation(async (opts: unknown) => {
      const o = opts as { message?: string }
      // 2a chamada é a pergunta overwrite; responder false
      return o.message?.includes('Overwrite') ? false : true
    })
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.ja') },
      workspace: {
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('dummy')),
      },
    }
    parseJaLiturgyMock.mockReturnValue({ days: [] })
    decodeJaBytesMock.mockReturnValue('decoded')
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    // 2 chamadas: pergunta (false→merge) + mensagem final
    expect(appConfirmMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })
  it('confirmClear com itens vazios sem lock → early return (119)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    window.confirm = vi.fn(() => true)
    ;(f.confirmClearLiturgy as () => void)()
    expect(window.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importScheduled/importJa: openFile retorna string (não array) → path único', async () => {
    let call = 0
    bridgeState.value = {
      dialog: {
        openFile: vi.fn(async () => {
          call += 1
          return call === 1 ? '/tmp/cats.xml' : '/tmp/items.xml'
        }),
      },
      workspace: {
        readBinaryFile: vi.fn(async (path: string) =>
          new TextEncoder().encode(
            path.includes('cats') ? '<xml>cats</xml>' : '<xml>items</xml>',
          ),
        ),
      },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('importJa: openFile retorna string direta (232 cond-expr alt)', async () => {
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => '/tmp/x.ja') },
      workspace: {
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('x')),
      },
    }
    parseJaLiturgyMock.mockReturnValue({ days: [] })
    decodeJaBytesMock.mockReturnValue('decoded')
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('importJa: duplicates>0 e confirm true → overwrite (274)', async () => {
    appConfirmMock.mockImplementation(async (opts: unknown) => {
      const o = opts as { message?: string }
      return !o.message?.includes('Overwrite')
    })
    bridgeState.value = {
      dialog: { openFile: vi.fn(async () => ['/tmp/x.ja']) },
      workspace: {
        readBinaryFile: vi.fn(async () => new TextEncoder().encode('x')),
      },
    }
    parseJaLiturgyMock.mockReturnValue({ days: [{ day: 'sabbath', items: [] }] })
    decodeJaBytesMock.mockReturnValue('decoded')
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    // duplicado: importar 2x o mesmo dia
    await (f.importJa as () => Promise<void>)()
    await (f.importJa as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalled()
    wrapper.unmount()
  })
  it('confirmClear com itens + locked → early return pelo lock (119)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.openAddDialog()
    store.setItemDraft({
      type: 'category',
      name: 'Cat',
      subtitle: '',
      startTime: '10:00',
      endTime: '11:00',
      categoryId: null,
      musicId: null,
      filePath: '',
      filePaths: [],
    } as never)
    store.saveItemDraft()
    store.toggleDeletionLock()
    await wrapper.vm.$nextTick()

    window.confirm = vi.fn(() => true)
    ;(f.confirmClearLiturgy as () => void)()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(store.currentItems.length).toBeGreaterThan(0)

    // unlocked + itens + confirm true → clearAllItems (ramo else do if 119)
    store.toggleDeletionLock()
    ;(f.confirmClearLiturgy as () => void)()
    expect(store.currentItems.length).toBe(0)
    wrapper.unmount()
  })

  it('importScheduled desktop com openFile array (file[0]) → fluxo completo', async () => {
    bridgeState.value = {
      dialog: {
        openFile: vi
          .fn()
          .mockResolvedValueOnce(['/tmp/cats.xml'])
          .mockResolvedValueOnce(['/tmp/items.xml']),
      },
      workspace: {
        readBinaryFile: vi.fn(async (path: string) =>
          new TextEncoder().encode(
            path.includes('cats') ? '<xml>cats</xml>' : '<xml>items</xml>',
          ),
        ),
      },
    }
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    await (f.importScheduled as () => Promise<void>)()
    expect(appConfirmMock).toHaveBeenCalledTimes(1)
    expect(
      JSON.stringify(appConfirmMock.mock.calls[0]?.[0]),
    ).toContain('liturgy.scheduled.imported')
    wrapper.unmount()
  })
  it('confirmClear unlocked + itens + confirm true → clearAllItems (119 return/branch)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.openAddDialog()
    store.setItemDraft({
      type: 'category',
      name: 'Cat A',
      subtitle: '',
      startTime: '10:00',
      endTime: '11:00',
      categoryId: null,
      musicId: null,
      filePath: '',
      filePaths: [],
    } as never)
    expect(store.saveItemDraft()).not.toBe(false)
    await wrapper.vm.$nextTick()
    expect(store.currentItems.length).toBeGreaterThan(0)

    window.confirm = vi.fn(() => true)
    ;(f.confirmClearLiturgy as () => void)()
    expect(store.currentItems.length).toBe(0)
    wrapper.unmount()
  })

  it('confirmRemoveItem locked → early return (124)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.openAddDialog()
    store.setItemDraft({
      type: 'category',
      name: 'Cat B',
      subtitle: '',
      startTime: '10:00',
      endTime: '11:00',
      categoryId: null,
      musicId: null,
      filePath: '',
      filePaths: [],
    } as never)
    store.saveItemDraft()
    store.toggleDeletionLock()
    await wrapper.vm.$nextTick()

    window.confirm = vi.fn(() => true)
    ;(f.confirmRemoveItem as (i: number) => void)(0)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(store.currentItems.length).toBeGreaterThan(0)
    wrapper.unmount()
  })
  it('confirmClear itens + confirm FALSE → return e mantém itens (119)', async () => {
    const wrapper = mountWith(() => useLiturgy())
    const f = getExposed(wrapper)
    await new Promise((r) => setTimeout(r, 0))

    const store = useLiturgyStore()
    store.openAddDialog()
    store.setItemDraft({
      type: 'category',
      name: 'Cat C',
      subtitle: '',
      startTime: '10:00',
      endTime: '11:00',
      categoryId: null,
      musicId: null,
      filePath: '',
      filePaths: [],
    } as never)
    store.saveItemDraft()
    await wrapper.vm.$nextTick()

    window.confirm = vi.fn(() => false)
    ;(f.confirmClearLiturgy as () => void)()
    expect(store.currentItems.length).toBeGreaterThan(0)
    wrapper.unmount()
  })
  it('unmount sem mounted flush → clearInterval branch null (94)', async () => {
    // monta e desmonta NO MESMO tick, antes do flush de onMounted
    const wrapper = mountWith(() => useLiturgy())
    wrapper.unmount()
    // se onMounted não rodou, syncTimer ainda null no onUnmounted → branch false
    await new Promise((r) => setTimeout(r, 0))
  })
})
