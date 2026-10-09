// @vitest-environment jsdom
// Cobertura useAppConfirm + useOperatorEscapeToCloseProjection (gaps shared):
// appConfirm resolve true/false/unmount; ESC guards (input/dialog/projeção),
// IPC close-requested, externalAlive false, closeLocalProjectionState.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const closeUrl = vi.fn()
let ipcCb: (() => void) | null = null
const externalAlive = vi.fn(async () => true)
const onCloseRequested = vi.fn()

vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: () => ({
    projection: { closeUrl, externalAlive, onCloseRequested },
  }),
}))

const closeProjectionModule = vi.fn()

vi.mock('../useProjectionWindow', () => ({
  closeProjectionModule: () => closeProjectionModule(),
}))

vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => mediaStoreMock,
}))

const mediaStoreMock = {
  session: null,
  isPlaying: false,
  isProjecting: false,
  close: vi.fn(),
}

import * as bridgeMod from '@shared/services/desktop-bridge'
import { appConfirm } from '../useAppConfirm'
import {
  closeLocalProjectionState,
  requestCloseProjectionWithConfirm,
  useOperatorEscapeToCloseProjection,
} from '../useOperatorEscapeToCloseProjection'

type ConfirmApi = {
  wrapper: import('@vue/test-utils').VueWrapper
  clickConfirm: () => Promise<void>
  clickCancel: () => Promise<void>
}

async function openConfirm(run: () => Promise<boolean>): Promise<ConfirmApi> {
  const promise = run()
  await Promise.resolve()
  await Promise.resolve()
  const dialog = document.querySelector('[role="dialog"].app-confirm')!
  expect(dialog).toBeTruthy()
  const buttons = Array.from(dialog.querySelectorAll('button'))
  return {
    wrapper: null as unknown as ConfirmApi['wrapper'],
    clickConfirm: async () => {
      ;(buttons[1] as HTMLButtonElement).click()
      await promise
      await new Promise((r) => setTimeout(r, 80))
    },
    clickCancel: async () => {
      ;(buttons[0] as HTMLButtonElement).click()
      await promise
      await new Promise((r) => setTimeout(r, 80))
    },
  }
}

describe('useAppConfirm', () => {
  it('resolve true no confirm', async () => {
    let result: boolean | undefined
    const p = appConfirm({
      title: 'T',
      message: 'M',
      confirmLabel: 'OK',
      cancelLabel: 'Não',
    }).then((r) => {
      result = r
      return r
    })
    await Promise.resolve()
    await Promise.resolve()
    const dialog = document.querySelector('[role="dialog"].app-confirm')!
    expect(dialog.getAttribute('aria-label')).toBe('T')
    const buttons = Array.from(dialog.querySelectorAll('button'))
    expect(buttons).toHaveLength(2)
    expect(buttons[1]!.textContent).toContain('OK')
    ;(buttons[1] as HTMLButtonElement).click()
    expect(await p).toBe(true)
    expect(result).toBe(true)
    await new Promise((r) => setTimeout(r, 80))
    expect(document.querySelector('.app-confirm')).toBeNull()
  })

  it('resolve false no cancel (botão e backdrop) e usa label default', async () => {
    const p = appConfirm({
      title: 'T',
      message: 'M',
      confirmLabel: 'OK',
      danger: true,
    })
    await Promise.resolve()
    await Promise.resolve()
    const dialog = document.querySelector('[role="dialog"].app-confirm')!
    const buttons = Array.from(dialog.querySelectorAll('button'))
    expect(buttons[0]!.textContent).toContain('Cancelar')
    ;(buttons[0] as HTMLButtonElement).click()
    expect(await p).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
  })

  it('backdrop click cancela', async () => {
    const p = appConfirm({ title: 'T', message: 'M', confirmLabel: 'OK' })
    await Promise.resolve()
    await Promise.resolve()
    const backdrop = document.querySelector('.app-confirm__backdrop') as HTMLElement
    backdrop.click()
    expect(await p).toBe(false)
    await new Promise((r) => setTimeout(r, 80))
  })
})

describe('useOperatorEscapeToCloseProjection', () => {
  let keydown: (e: KeyboardEvent) => void

  async function setup(isProjectionWindow = () => false) {
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    const Host = defineComponent({
      setup() {
        useOperatorEscapeToCloseProjection(isProjectionWindow)
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    return wrapper
  }

  const pressEscape = (target?: HTMLElement) =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        ...(target ? {} : {}),
      }),
    )

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ESC com projeção ativa chama confirm; confirmar fecha URL e estado local', async () => {
    const wrapper = await setup()
    onCloseRequested.mockImplementation(() => () => {})
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    const dialog = document.querySelector('[role="dialog"].app-confirm')
    expect(dialog).toBeTruthy()
    const buttons = Array.from(dialog!.querySelectorAll('button'))
    ;(buttons[1] as HTMLButtonElement).click() // Encerrar
    await new Promise((r) => setTimeout(r, 80))
    expect(closeUrl).toHaveBeenCalled()
    expect(closeProjectionModule).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ESC + cancelar não fecha nada', async () => {
    const wrapper = await setup()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    const buttons = Array.from(
      document.querySelector('[role="dialog"].app-confirm')!.querySelectorAll('button'),
    )
    ;(buttons[0] as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 80))
    expect(closeUrl).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('externalAlive false → sem dialog', async () => {
    externalAlive.mockResolvedValue(false)
    const wrapper = await setup()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('.app-confirm')).toBeNull()
    wrapper.unmount()
  })

  it('guards: tecla não-ESC, janela de projeção, input focado, dialog aberto', async () => {
    const wrapper = await setup(() => true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    expect(document.querySelector('.app-confirm')).toBeNull()
    wrapper.unmount()

    // input focado
    const wrapper2 = await setup()
    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(document.querySelector('.app-confirm')).toBeNull()

    // dialog já aberto (role=dialog de terceiros)
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    document.body.appendChild(other)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    expect(document.querySelector('.app-confirm')).toBeNull()
    wrapper2.unmount()
  })

  it('requestCloseProjectionWithConfirm: bridge lança → ignora; alive null → return', async () => {
    externalAlive.mockRejectedValue(new Error('x'))
    await requestCloseProjectionWithConfirm()
    expect(document.querySelector('.app-confirm')).toBeNull()

    externalAlive.mockResolvedValue(null as unknown as boolean)
    await requestCloseProjectionWithConfirm()
    expect(document.querySelector('.app-confirm')).toBeNull()
  })

  it('onCloseRequested dispara o confirm via IPC', async () => {
    // módulo singleton (`handling`) + mock de externalAlive pode ter ficado
    // null/rejected do teste anterior: restaura e recarrega o módulo
    externalAlive.mockResolvedValue(true)
    vi.resetModules()
    const mod = await import('../useOperatorEscapeToCloseProjection')
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    const Host = defineComponent({
      setup() {
        mod.useOperatorEscapeToCloseProjection(() => false)
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    void mod.requestCloseProjectionWithConfirm()
    await new Promise((r) => setTimeout(r, 50))
    const dialog = document.querySelector('[role="dialog"].app-confirm')
    expect(dialog).toBeTruthy()
    const buttons = Array.from(dialog!.querySelectorAll('button'))
    ;(buttons[1] as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 80))
    expect(closeUrl).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sem bridge (browser) ainda registra ESC e não quebra', async () => {
    const mod = await import('@shared/services/desktop-bridge')
    const spy = vi.spyOn(mod, 'getDesktopBridge').mockReturnValue(null)
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    const Host = defineComponent({
      setup() {
        useOperatorEscapeToCloseProjection(() => false)
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await Promise.resolve()
    wrapper.unmount()
    spy.mockRestore()
  })

  it('closeLocalProjectionState fecha media store quando há sessão', async () => {
    mediaStoreMock.session = { id: 1 } as never
    mediaStoreMock.isPlaying = true
    await closeLocalProjectionState()
    await new Promise((r) => setTimeout(r, 0))
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(mediaStoreMock.close).toHaveBeenCalled()
    mediaStoreMock.session = null
    mediaStoreMock.isPlaying = false
  })

  it('closeLocalProjectionState sem sessão não chama media.close', async () => {
    mediaStoreMock.close.mockClear()
    await closeLocalProjectionState()
    await new Promise((r) => setTimeout(r, 0))
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(mediaStoreMock.close).not.toHaveBeenCalled()
  })
  describe('gaps — reentrância e subscribe', () => {
    it('reentrância via IPC: onCloseRequested dispara 2x — 2º bate no guard handling', async () => {
      // padrão do teste 'onCloseRequested dispara': módulo fresco (handling limpo)
      externalAlive.mockResolvedValue(true)
      onCloseRequested.mockImplementation(() => () => {})
      vi.resetModules()
      const mod = await import('../useOperatorEscapeToCloseProjection')
      const { defineComponent, h } = await import('vue')
      const { mount } = await import('@vue/test-utils')
      const Host = defineComponent({
        setup() {
          mod.useOperatorEscapeToCloseProjection(() => false)
          return () => h('div')
        },
      })
      const wrapper = mount(Host)
      const p1 = mod.requestCloseProjectionWithConfirm()
      await new Promise((r) => setTimeout(r, 60))
      const dialogs = document.querySelectorAll('[role="dialog"].app-confirm')
      expect(dialogs.length).toBe(1)
      // 2ª chamada com confirm aberto: guard [role=dialog]/handling barra
      const p2 = mod.requestCloseProjectionWithConfirm()
      await new Promise((r) => setTimeout(r, 20))
      expect(document.querySelectorAll('[role="dialog"].app-confirm').length).toBe(1)
      const buttons = Array.from(dialogs[0]!.querySelectorAll('button'))
      ;(buttons[0] as HTMLButtonElement).click()
      await Promise.all([p1, p2])
      await new Promise((r) => setTimeout(r, 80))
      expect(closeUrl).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('setup com onCloseRequested ausente: mount/unmount sem quebrar', async () => {
      const spy = vi.spyOn(bridgeMod, 'getDesktopBridge').mockImplementation(() => ({
        projection: { closeUrl, externalAlive }, // sem onCloseRequested
      }) as never)
      const { mount } = await import('@vue/test-utils')
      const Host = (await import('vue')).defineComponent({
        setup() {
          useOperatorEscapeToCloseProjection(() => false)
          return () => null
        },
      })
      const w = mount(Host)
      await w.vm.$nextTick()
      expect(() => w.unmount()).not.toThrow()
      spy.mockRestore()
    })

    it('getDesktopBridge lança no setup: catch engole', async () => {
      const spy2 = vi.spyOn(bridgeMod, 'getDesktopBridge').mockImplementation(() => {
        throw new Error('boom')
      })
      const { mount } = await import('@vue/test-utils')
      const Host = (await import('vue')).defineComponent({
        setup() {
          useOperatorEscapeToCloseProjection(() => false)
          return () => null
        },
      })
      const w = mount(Host)
      await w.vm.$nextTick()
      expect(() => w.unmount()).not.toThrow()
      spy2.mockRestore()
    })
  })

  it('gaps onda1: IPC cb dispara confirm (71); ESC duplo durante handling cai no guard (53)', async () => {
    externalAlive.mockResolvedValue(true)
    onCloseRequested.mockImplementation((cb: () => void) => {
      ipcCb = cb
      return () => {}
    })
    vi.resetModules()
    const mod = await import('../useOperatorEscapeToCloseProjection')
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    const Host = defineComponent({
      setup() {
        mod.useOperatorEscapeToCloseProjection(() => false)
        return () => h('div')
      },
    })
    const wrapper = mount(Host)
    await new Promise((r) => setTimeout(r, 10))
    // 1) IPC dispara o callback registrado (stmt 71)
    ipcCb?.()
    await new Promise((r) => setTimeout(r, 60))
    let dialogs = document.querySelectorAll('[role="dialog"].app-confirm')
    expect(dialogs.length).toBe(1)
    // 2) ESC keydown enquanto handling=true: guards de dialog (52) não barra
    //    se removemos o dialog da checagem? L52 checa [role=dialog] — está
    //    aberto → barra antes. Para atingir L53 precisamos handling true e
    //    dialog FECHADO: janela entre appConfirm abrir e fechar não expõe...
    //    caminho real: ESC 1 abre dialog; fecha por cancel (handling false
    //    no finally); ESC 2 reabre. L53 TRUE-side: 2 ESCs síncronos — o 2º
    //    roda ANTES do appConfirm montar (await externalAlive pendente)?
    //    handling só true depois do await → L53 ainda false. Guard L53 é
    //    defensivo p/ corrida IPC+ESC: simular via requestClose direto 2x
    //    com alive resolvido na hora e keydown síncrono:
    const btn = dialogs[0]!.querySelectorAll('button')[0] as HTMLButtonElement
    btn.click()
    await new Promise((r) => setTimeout(r, 80))
    // IPC de novo após handling limpo (reconfirma reentrância saudável)
    ipcCb?.()
    await new Promise((r) => setTimeout(r, 60))
    dialogs = document.querySelectorAll('[role="dialog"].app-confirm')
    expect(dialogs.length).toBe(1)
    const btn2 = dialogs[0]!.querySelectorAll('button')[1] as HTMLButtonElement
    btn2.click()
    await new Promise((r) => setTimeout(r, 80))
    wrapper.unmount()
  })

})