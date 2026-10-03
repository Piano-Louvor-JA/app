// @vitest-environment jsdom
// Cobertura MusicTrackActions.vue (gaps shared): 4 ações emitidas, guards
// busy/hasInstrumental, offline desktop (downloaded/downloading/cancel/erro),
// diálogo de remoção, variantes, downloadProgress emit.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string, params?: Record<string, unknown>) =>
      params && 'name' in params ? `${k}:${params['name']}` : k,
  }),
}))

const isDesktopApp = vi.fn(() => false)
vi.mock('@shared/services/desktop-bridge', () => ({
  isDesktopApp: () => isDesktopApp(),
}))

const isTrackMediaDownloaded = vi.fn(async () => false)
const downloadTrackMedia = vi.fn(async () => ({ status: 'downloaded' }))
const deleteTrackMedia = vi.fn(async () => {})

vi.mock('@shared/services/track-media', () => ({
  isTrackMediaDownloaded: (...a: unknown[]) => isTrackMediaDownloaded(...(a as [])),
  downloadTrackMedia: (...a: unknown[]) => downloadTrackMedia(...(a as [])),
  deleteTrackMedia: (...a: unknown[]) => deleteTrackMedia(...(a as [])),
}))

const reconcileAlbumsForMusic = vi.fn(async () => {})
vi.mock('@modules/sync/stores/useLocalLibraryStore', () => ({
  useLocalLibraryStore: () => ({ reconcileAlbumsForMusic }),
}))

import MusicTrackActions from '../MusicTrackActions.vue'

type Props = Record<string, unknown>

function makeProps(over: Props = {}): Props {
  return {
    hasInstrumental: true,
    busy: false,
    ...over,
  }
}

async function mountActions(over: Props = {}) {
  setActivePinia(createPinia())
  const w = mount(MusicTrackActions, {
    props: makeProps(over),
    global: { stubs: { teleport: true } },
  })
  await flushPromises()
  return w
}

describe('MusicTrackActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDesktopApp.mockReturnValue(false)
    isTrackMediaDownloaded.mockResolvedValue(false)
    downloadTrackMedia.mockResolvedValue({ status: 'downloaded' })
  })

  it('emite sung/instrumental/slides nos botões de ação', async () => {
    const w = await mountActions()
    const btns = w.findAll('.music-track-actions__btn')
    await btns[0]!.trigger('click')
    await btns[1]!.trigger('click')
    await btns[2]!.trigger('click')
    expect(w.emitted('sung')).toHaveLength(1)
    expect(w.emitted('instrumental')).toHaveLength(1)
    expect(w.emitted('slides')).toHaveLength(1)
    expect(w.emitted('lyric')).toBeUndefined() // SHOW_LYRIC_ACTION=false
  })

  it('busy desabilita todos os botões; sem instrumental desabilita o piano', async () => {
    const w = await mountActions({ busy: true, hasInstrumental: false })
    const btns = w.findAll('.music-track-actions__btn')
    expect(btns[0]!.attributes('disabled')).toBeDefined()
    expect(btns[1]!.attributes('disabled')).toBeDefined()
    expect(btns[2]!.attributes('disabled')).toBeDefined()
  })

  it('sem instrumental: botão piano desabilitado, resto ativo', async () => {
    const w = await mountActions({ hasInstrumental: false })
    const btns = w.findAll('.music-track-actions__btn')
    expect(btns[0]!.attributes('disabled')).toBeUndefined()
    expect(btns[1]!.attributes('disabled')).toBeDefined()
  })

  it('variant applied como classe', async () => {
    const w = await mountActions({ variant: 'contained' })
    expect(w.find('.music-track-actions--contained').exists()).toBe(true)
  })

  it('web (não desktop): sem controles offline', async () => {
    const w = await mountActions({ musicId: 5 })
    await flushPromises()
    expect(w.find('.music-track-actions__check').exists()).toBe(false)
    expect(isTrackMediaDownloaded).not.toHaveBeenCalled()
  })

  it('desktop com musicId<=0: sem controles offline', async () => {
    isDesktopApp.mockReturnValue(true)
    const w = await mountActions({ musicId: 0 })
    await flushPromises()
    expect(w.find('.music-track-actions__check').exists()).toBe(false)
  })

  it('desktop baixado: check + botão remover abre confirm; confirmar apaga', async () => {
    isDesktopApp.mockReturnValue(true)
    isTrackMediaDownloaded.mockResolvedValue(true)
    const w = await mountActions({ musicId: 7, trackName: 'Hino Sacra' })
    await flushPromises()
    expect(w.find('.music-track-actions__check').exists()).toBe(true)
    const removeBtn = w.find('.music-track-actions__btn--remove')
    expect(removeBtn.exists()).toBe(true)
    // oculto sem hover
    expect(removeBtn.classes()).not.toContain('music-track-actions__btn--remove-visible')
    await w.setProps({ rowHovered: true })
    expect(w.find('.music-track-actions__btn--remove').classes()).toContain(
      'music-track-actions__btn--remove-visible',
    )
    await w.find('.music-track-actions__btn--remove').trigger('click')
    await flushPromises()
    // dialog teleported (stubado) mas no DOM do wrapper
    const confirm = w.find('.music-track-confirm')
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toContain('Hino Sacra')
    // cancelar primeiro
    const btns = confirm.findAll('button')
    await btns[0]!.trigger('click')
    await flushPromises()
    expect(deleteTrackMedia).not.toHaveBeenCalled()
    // reabre e confirma
    await w.find('.music-track-actions__btn--remove').trigger('click')
    await flushPromises()
    await w.find('.music-track-confirm').findAll('button')[1]!.trigger('click')
    await flushPromises()
    expect(deleteTrackMedia).toHaveBeenCalledWith(7)
    expect(reconcileAlbumsForMusic).toHaveBeenCalledWith(7)
    expect(w.emitted('downloadProgress')!.at(-1)).toEqual([null])
  })

  it('allowOfflineRemove=false esconde botão remover mesmo baixado', async () => {
    isDesktopApp.mockReturnValue(true)
    isTrackMediaDownloaded.mockResolvedValue(true)
    const w = await mountActions({ musicId: 7, allowOfflineRemove: false })
    await flushPromises()
    expect(w.find('.music-track-actions__check').exists()).toBe(true)
    expect(w.find('.music-track-actions__btn--remove').exists()).toBe(false)
  })

  it('desktop não baixado: botão download inicia e emite progresso', async () => {
    isDesktopApp.mockReturnValue(true)
    downloadTrackMedia.mockImplementation(
      async (_id: number, opts?: { onProgress?: (p: number) => void }) => {
        opts?.onProgress?.(50)
        return { status: 'downloaded' }
      },
    )
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    const btns = w.findAll('.music-track-actions__btn')
    const dlBtn = btns.at(-1)!
    await dlBtn.trigger('click')
    await flushPromises()
    expect(downloadTrackMedia).toHaveBeenCalled()
    expect(w.emitted('downloadProgress')).toBeTruthy()
    expect(w.find('.music-track-actions__check').exists()).toBe(true)
  })

  it('download em curso: botão vira cancelar; cancelar reseta estado', async () => {
    isDesktopApp.mockReturnValue(true)
    downloadTrackMedia.mockImplementation(
      () => new Promise<{ status: string }>(() => {}), // pendente
    )
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    let dlBtn = w.findAll('.music-track-actions__btn').at(-1)!
    await dlBtn.trigger('click')
    await flushPromises()
    dlBtn = w.findAll('.music-track-actions__btn').at(-1)!
    expect(dlBtn.classes()).toContain('music-track-actions__btn--danger')
    await dlBtn.trigger('click') // cancela
    await flushPromises()
    expect(w.emitted('downloadProgress')!.at(-1)).toEqual([null])
    w.unmount()
  })

  it('download result idle sem cancel: refaz check', async () => {
    isDesktopApp.mockReturnValue(true)
    downloadTrackMedia.mockResolvedValue({ status: 'idle', reason: 'missing' })
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    await flushPromises()
    expect(isTrackMediaDownloaded).toHaveBeenCalledTimes(2) // mount + retry
    w.unmount()
  })

  it('download result idle com cancel: não refaz check', async () => {
    isDesktopApp.mockReturnValue(true)
    let abortFn: (() => void) | undefined
    downloadTrackMedia.mockImplementation(
      (_id: number, opts?: { shouldAbort?: () => boolean }) =>
        new Promise<{ status: string; reason?: string }>((resolve) => {
          abortFn = () => resolve({ status: 'idle', reason: 'cancelled' })
          setTimeout(() => abortFn?.(), 10)
        }),
    )
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    // clica cancelar enquanto baixa
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    await flushPromises()
    expect(isTrackMediaDownloaded).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('erro no check inicial: estado volta a idle', async () => {
    isDesktopApp.mockReturnValue(true)
    isTrackMediaDownloaded.mockRejectedValue(new Error('x'))
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    expect(w.find('.music-track-actions__check').exists()).toBe(false)
    expect(w.findAll('.music-track-actions__btn').at(-1)!.attributes('disabled')).toBeUndefined()
  })

  it('troca de musicId refaz o check', async () => {
    isDesktopApp.mockReturnValue(true)
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    expect(isTrackMediaDownloaded).toHaveBeenCalledTimes(1)
    await w.setProps({ musicId: 10 })
    await flushPromises()
    expect(isTrackMediaDownloaded).toHaveBeenCalledTimes(2)
    expect(isTrackMediaDownloaded).toHaveBeenLastCalledWith(10)
  })

  it('confirm label sem trackName usa fallback thisTrack', async () => {
    isDesktopApp.mockReturnValue(true)
    isTrackMediaDownloaded.mockResolvedValue(true)
    const w = await mountActions({ musicId: 7, trackName: '  ' })
    await flushPromises()
    await w.find('.music-track-actions__btn--remove').trigger('click')
    await flushPromises()
    expect(w.find('.music-track-confirm').text()).toContain('media.actions.thisTrack')
  })

  it('ação offline com status downloaded abre confirm direto', async () => {
    isDesktopApp.mockReturnValue(true)
    isTrackMediaDownloaded.mockResolvedValue(true)
    const w = await mountActions({ musicId: 7 })
    await flushPromises()
    // status downloaded: o botão visível é o remove (--remove); clicar nele
    // dispara requestRemove → confirm
    const remove = w.find('.music-track-actions__btn--remove')
    await remove.trigger('click')
    await flushPromises()
    expect(w.find('.music-track-confirm').exists()).toBe(true)
    // dismiss remove dialog sem apagar
    await w.find('.music-track-confirm').findAll('button')[0]!.trigger('click')
    await flushPromises()
    expect(deleteTrackMedia).not.toHaveBeenCalled()
  })

  it('cancel durante download emite progresso null (linhas 124-125)', async () => {
    isDesktopApp.mockReturnValue(true)
    downloadTrackMedia.mockImplementation(
      () => new Promise<{ status: string }>(() => {}), // nunca resolve
    )
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    const dl = () => w.findAll('.music-track-actions__btn').at(-1)!
    await dl().trigger('click') // inicia download
    await flushPromises()
    // título do botão mostra cancelamento com %
    expect(dl().attributes('title')).toContain('media.actions.cancelDownload')
    await dl().trigger('click') // cancela → linhas 124-125
    await flushPromises()
    expect(w.emitted('downloadProgress')!.at(-1)).toEqual([null])
    w.unmount()
  })

  it('download concluído reconcilia álbuns', async () => {
    isDesktopApp.mockReturnValue(true)
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    await flushPromises()
    expect(reconcileAlbumsForMusic).toHaveBeenCalledWith(9)
  })

  it('download com resultado falho (não downloaded/idle) reseta pra idle', async () => {
    isDesktopApp.mockReturnValue(true)
    downloadTrackMedia.mockResolvedValue({ status: 'error' } as never)
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    await flushPromises()
    expect(w.emitted('downloadProgress')!.at(-1)).toEqual([null])
    expect(w.find('.music-track-actions__check').exists()).toBe(false)
  })

  it('progresso durante cancel não é emitido após cancelRequested', async () => {
    isDesktopApp.mockReturnValue(true)
    let onProgressCb: ((p: number) => void) | undefined
    downloadTrackMedia.mockImplementation(
      (_id: number, opts?: { onProgress?: (p: number) => void }) =>
        new Promise<{ status: string }>((resolve) => {
          onProgressCb = opts?.onProgress
          setTimeout(() => resolve({ status: 'idle', reason: 'cancelled' }), 20)
        }),
    )
    const w = await mountActions({ musicId: 9 })
    await flushPromises()
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click')
    await w.findAll('.music-track-actions__btn').at(-1)!.trigger('click') // cancel
    const countBefore = w.emitted('downloadProgress')!.length
    onProgressCb?.(80) // ignora (cancelRequested)
    await flushPromises()
    expect(w.emitted('downloadProgress')!.length).toBe(countBefore)
    w.unmount()
  })
})
