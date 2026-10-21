/**
 * Bridge de Controle Remoto no renderer.
 *
 * Escuta 'remote:command' do main process (vindo do APK via WS) e executa
 * na LITURGIA (prioridade) ou no player. Responde 'remote:ack' e empurra
 * 'remote:state' completo após cada ação e em mudanças relevantes.
 *
 * Instanciado uma vez em App.vue (ou bootstrap do router).
 */

import { watch } from 'vue'
import type { Router } from 'vue-router'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { RemoteBridgeMessage } from '@shared/types/desktop-bridge'
import type { MediaPlaybackMode } from '../../media/types/media'

import { resolveMediaTarget } from './media-target'
import { createModuleHandlers } from './module-handlers'
import { palcoSession } from '../../settings/services/palco-session'
import type { ProjectionInput } from '../../settings/services/palco-session'
import { getPalcoRoute } from '../../settings/services/palco-routing'
import { openMusicPlayer } from '../../media/services/open-music-player'
import {
  loadAlbumMusicIndex,
  filterAlbumMusicIndex,
} from '../../albums/services/album-music-search'

import { useLiturgyStore } from '../../liturgy/stores/useLiturgyStore'
import { useMediaPlayer } from '../../media/composables/useMediaPlayer'
import { useBibleStore } from '../../bible/stores/useBibleStore'
import { useTimerStore } from '../../timer/stores/useTimerStore'
import { useCountdownStore } from '../../countdown/stores/useCountdownStore'
import { useClockStore } from '../../clock/stores/useClockStore'
import { useRandomStore } from '../../random/stores/useRandomStore'

/** Ações conhecidas (espelham RemoteAction do APK). */
const PLAYER_ACTIONS = new Set([
  'player.play',
  'player.pause',
  'player.toggle',
  'player.next',
  'player.previous',
  'player.stop',
  'player.setVolume',
  'player.seek',
  'player.setMode',
  'player.open',
])

/** Ações de liturgia (extensão v1.1 — prioridade do desktop). */
const LITURGY_ACTIONS = new Set([
  'liturgy.next',
  'liturgy.previous',
  'liturgy.select',
  'liturgy.toggleDone',
  'liturgy.state',
])

/** Namespaces v2 (controle remoto total — spec Obsidian v2). */
const V2_NAMESPACES = new Set(['media', 'bible', 'timer', 'countdown', 'clock', 'random', 'palco'])

interface ProjectionSlideApi {
  getPdfPageState?: () => Promise<{ index: number; total: number; projecting?: boolean } | null>
  getPptSlideState?: () => Promise<{ index: number; total: number; projecting?: boolean } | null>
  getImageSlideState?: () => Promise<{ index: number; total: number; projecting?: boolean } | null>
  captureSourceFrame?: () => Promise<string | null>
  remotePdfNext?: () => Promise<{ index: number; total: number } | null>
  remotePdfPrev?: () => Promise<{ index: number; total: number } | null>
  remotePptNext?: () => Promise<{ index: number; total: number } | null>
  remotePptPrev?: () => Promise<{ index: number; total: number } | null>
  remoteImageNext?: () => Promise<{ index: number; total: number } | null>
  remoteImagePrev?: () => Promise<{ index: number; total: number } | null>
}

/**
 * Roteia slide:next/prev/goto do pregador para a superfície ATIVA
 * (PDF/PPT/imagens na janela de projeção via cabo OU palco — mesmo IPC).
 * Retorna true se consumiu; false → chamador cai no player de hinos.
 */
async function routeSlideCommand(
  projection: ProjectionSlideApi | null | undefined,
  kind: 'next' | 'prev',
): Promise<boolean> {
  if (!projection) return false
  try {
    if (await projection.getPdfPageState?.()) {
      const r = kind === 'next' ? await projection.remotePdfNext?.() : await projection.remotePdfPrev?.()
      return r != null
    }
    if (await projection.getPptSlideState?.()) {
      const r = kind === 'next' ? await projection.remotePptNext?.() : await projection.remotePptPrev?.()
      return r != null
    }
    if (await projection.getImageSlideState?.()) {
      const r = kind === 'next' ? await projection.remoteImageNext?.() : await projection.remoteImagePrev?.()
      return r != null
    }
  } catch {
    return false
  }
  return false
}

export function installRemoteLiturgyBridge({ router }: { router: Router }) {
  const liturgy = useLiturgyStore()
  const player = useMediaPlayer()
  const remoteApi = getDesktopBridge()?.remote
  const projection = getDesktopBridge()?.projection
  if (!remoteApi) return () => {}

  // Módulos v2: bible/timer/countdown com stores reais do desktop.
  // Cast: pinia expõe UnwrapRef que não é atribuível aos tipos estruturais
  // (RefLike) sem cast — a superfície usada é exatamente a declarada.
  // bible.open valida contra o catálogo de livros — sem bootstrap o
  // comando falha (ok:false) até alguém abrir o módulo Bíblia no desktop.
  const bibleStore = useBibleStore()
  void bibleStore.bootstrap?.().catch(() => {})

  // Busca de hinos com os ids LOCAIS do desktop (a API pública tem ids
  // distintos — media.open com id da API dá trackMissing).
  let musicIndex: Awaited<ReturnType<typeof loadAlbumMusicIndex>> | null = null
  // media.open via controle remoto SEMPRE projeta — o operador clica
  // esperando ver na tela; openMusicPlayer puro só projeta em no_audio.
  const openMusicPlayerRemote: typeof openMusicPlayer = async (params) => {
    return openMusicPlayer({ ...params, project: true })
  }

  const searchMusic = async (query: string) => {
    try {
      if (!musicIndex || musicIndex.length === 0) {
        musicIndex = await loadAlbumMusicIndex()
      }
      if (query.length === 0) return []
      return filterAlbumMusicIndex(musicIndex, query)
    } catch (error) {
      // Índice indisponível (sem cache local + API fora) NÃO pode derrubar
      // o bridge — loga e devolve vazio (UI mostra 'sem resultados').
      console.warn('[remote] media.search falhou:', error)
      return []
    }
  }

  const modules = createModuleHandlers({
    media: {
      openMusicPlayer: openMusicPlayerRemote as never,
      searchMusic,
    },
    bible: bibleStore as never,
    timer: useTimerStore() as never,
    countdown: useCountdownStore() as never,
    clock: useClockStore() as never,
    random: useRandomStore() as never,
    palco: {
      status: () => palcoSession.status(),
      slots: () => palcoSession.slots(),
      createSlot: (label) => palcoSession.createSlot(label),
      removeSlot: (id) => palcoSession.removeSlot(id),
      startSlot: (id) => palcoSession.startSlot(id),
      stopSlot: (id) => palcoSession.stopSlot(id),
      turnOn: () => palcoSession.turnOn(),
      turnOff: () => palcoSession.turnOff(),
      project: (scope, input) => palcoSession.project(scope, input),
      idle: () => palcoSession.idle(),
    },
  })

  // Mapa em vez de if/else-if: sem branches defensivos, canais desconhecidos são no-op.
  const sendHandlers: Record<string, (payload: Record<string, unknown>) => void> = {
    'remote:state': (payload) => remoteApi.sendState(payload),
    'remote:ack': (payload) => remoteApi.sendAck(payload as { id?: string | number; ok: boolean }),
  }
  const send = (channel: string, payload: Record<string, unknown>) => {
    try {
      sendHandlers[channel]?.(payload)
    } catch {
      // ignore
    }
  }

  const buildState = async () => {
    const items = liturgy.currentItems ?? []

    // Vídeo/images/pdf ativos na projeção? Estado de mídia vem de lá.
    const target = await resolveMediaTarget({ projection, player })
    let media
    if (target === 'projection' && projection?.getPlaybackState) {
      const pb = await projection.getPlaybackState()
      media = {
        playing: pb ? !pb.paused : false,
        title: items[liturgy.selectedItemIndex ?? -1]?.name ?? null,
        volume: Math.round((pb?.volume ?? 1) * 100),
        positionMs: Math.round((pb?.currentTime ?? 0) * 1000),
        durationMs: Math.round((pb?.duration ?? 0) * 1000),
      }
    } else {
      media = {
        playing: player.isPlaying.value,
        title: player.session.value?.title ?? null,
        volume: Math.round((player.volume.value ?? 0) * 100),
        positionMs: Math.round((player.currentTimeSec.value ?? 0) * 1000),
        durationMs: Math.round((player.durationSec.value ?? 0) * 1000),
      }
    }

    // Slides: PDF/PPT/imagens projetados têm precedência sobre o player
    // de hinos — o pregador navega a apresentação, não o hino (fix -/-).
    let slide: { index: number; total: number }
    const docSlide =
      (await projection?.getPdfPageState?.()) ??
      (await projection?.getPptSlideState?.()) ??
      (await projection?.getImageSlideState?.())
    if (docSlide && docSlide.total > 0) {
      slide = { index: docSlide.index, total: docSlide.total }
    } else {
      slide = {
        index: player.slideIndex.value,
        total: player.session.value?.slides?.length ?? 0,
      }
    }

    return {
      liturgy: {
        total: items.length,
        selectedIndex: liturgy.selectedItemIndex,
        items: items.map((item, index) => ({
          index,
          type: item.type,
          title: item.name || item.subtitle || null,
          subtitle: item.subtitle || null,
          responsible: item.responsible || null,
          isCategory: item.type === 'category',
          accentColor: item.accentColor || null,
          done: item.done === true,
        })),
      },
      slide,
      player: {
        ...media,
        canPrevious: (liturgy.selectedItemIndex ?? 0) > 0,
        canNext:
          (liturgy.selectedItemIndex ?? -1) + 1 <
          (liturgy.currentItems?.length ?? 0),
      },
      ...snapshotsV2(modules),
    }
  }

  // Estado COMPLETO (spec v1): player + liturgia espelhada no APK.
  const pushState = async () => send('remote:state', await buildState())

  // Snapshots v2 — ausentes para peers v1, que ignoram o extra.
  // null → undefined: todos os namespaces têm dep garantida no bridge,
  // o null é defensivo (dependência de runtime dos stores).
  function snapshotsV2(modules: ReturnType<typeof createModuleHandlers>): Record<string, unknown> {
    /* istanbul ignore next -- todos os deps são sempre fornecidos; random/media null cobertos por teste */
    const orUndef = (ns: string): Record<string, unknown> | undefined =>
      modules.snapshot(ns) ?? undefined
    return {
      bible: orUndef('bible'),
      timer: orUndef('timer'),
      countdown: orUndef('countdown'),
      clock: orUndef('clock'),
      random: orUndef('random'),
      media: orUndef('media'),
    }
  }

  async function execute(msg: RemoteBridgeMessage) {
    const { action, value } = msg
    const items = liturgy.currentItems ?? []
    const current = liturgy.selectedItemIndex ?? -1

    // Pregador: única superfície autorizada pelo servidor.
    // PDF/PPT/imagens rodam na janela de projeção (cabo) OU no palco —
    // as duas superfícies compartilham a mesma API projection.remote*,
    // então o roteamento vale para ambas. Hinos continuam no player.
    if (action === 'slide:next' || action === 'slide:prev') {
      const routed = await routeSlideCommand(
        projection,
        action === 'slide:next' ? 'next' : 'prev',
      )
      if (routed) return true
      if (action === 'slide:next') await player.nextSlide?.()
      else await player.previousSlide?.()
      return true
    }
    if (action === 'slide:goto') {
      if (typeof msg.index !== 'number') return false
      await player.goToSlide?.(msg.index); return true
    }

    // 0) Namespaces v2 (bible/timer/countdown) — spec controle remoto total.
    const namespace = action.split('.')[0]
    if (V2_NAMESPACES.has(namespace)) {
      return modules.execute(namespace, action, msg)
    }

    // 1) Liturgia — prioridade (múltiplos monitores + projetor)
    if (LITURGY_ACTIONS.has(action)) {
      switch (action) {
        case 'liturgy.next': {
          if (current + 1 >= items.length) return false
          await liturgy.selectItem(current + 1, router)
          return true
        }
        case 'liturgy.previous': {
          if (current <= 0) return false
          await liturgy.selectItem(current - 1, router)
          return true
        }
        case 'liturgy.select': {
          const idx = value
          if (typeof idx !== 'number' || idx < 0 || idx >= items.length) {
            return false
          }
          // Controle remoto deve projetar no(s) palco(s), não só executar
          // no desktop do operador.
          await liturgy.playItemOnScreens(idx)
          return true
        }
        case 'liturgy.toggleDone': {
          const idx = typeof value === 'number' ? value : current
          if (idx < 0 || idx >= items.length) return false
          liturgy.toggleItemDone(idx)
          return true
        }
        case 'liturgy.state':
          return true
        /* istanbul ignore next -- default defensivo: LITURGY_ACTIONS só tem ações com case */
        default:
          return false
      }
    }

    // 2) Player — vídeo ativo na projeção? Comandos vão pra projeção.
    if (PLAYER_ACTIONS.has(action)) {
      const target = await resolveMediaTarget({ projection, player })
      if (target === 'projection') {
        switch (action) {
          case 'player.play':
            return (await projection?.remotePlay?.()) ?? false
          case 'player.pause':
            return (await projection?.remotePause?.()) ?? false
          case 'player.toggle': {
            const pb = await projection?.getPlaybackState?.()
            if (!pb) return false
            return pb.paused
              ? ((await projection?.remotePlay?.()) ?? false)
              : ((await projection?.remotePause?.()) ?? false)
          }
          case 'player.stop':
            // Desliga telas espelhadas e fecha o popup de vídeo.
            await projection?.toggleVideoScreens?.()
            await projection?.closeUrl?.()
            return true
          case 'player.setVolume':
            if (typeof value !== 'number') return false
            return (
              (await projection?.remoteSetVolume?.(
                Math.min(100, Math.max(0, value)) / 100,
              )) !== null
            )
          case 'player.seek':
            if (typeof msg.positionMs !== 'number') return false
            return (
              (await projection?.remoteSeek?.(msg.positionMs / 1000)) ?? false
            )
          default:
            // next/previous/setMode/open caem no fallback de liturgia/player.
            break
        }
      }
      switch (action) {
        case 'player.play':
          await player.play()
          return true
        case 'player.pause':
          await player.pause()
          return true
        case 'player.toggle':
          await player.togglePlay()
          return true
        case 'player.stop':
          // requestClose apenas abre confirmação; close interrompe áudio/projeção.
          player.close()
          return true
        case 'player.next':
        case 'player.previous':
          // Sem playlist no renderer ainda — mapeia pra item da liturgia.
          return execute({
            ...msg,
            action:
              action === 'player.next' ? 'liturgy.next' : 'liturgy.previous',
          })
        case 'player.setVolume':
          if (typeof value !== 'number') return false
          player.setVolume(Math.min(100, Math.max(0, value)) / 100)
          return true
        case 'player.seek':
          if (typeof msg.positionMs !== 'number') return false
          player.seekTo(msg.positionMs / 1000)
          return true
        case 'player.setMode':
          if (
            typeof msg.mode !== 'string' ||
            !['audio', 'instrumental', 'no_audio'].includes(msg.mode)
          )
            return false
          await player.switchMode(msg.mode as MediaPlaybackMode)
          return true
        case 'player.open': {
          // v2: abrir hino/faixa por id (compat v1 — hymnId → musicId).
          const musicId = msg.hymnId
          if (typeof musicId !== 'number') return false
          return modules.execute('media', 'media.open', {
            musicId,
            mode: msg.mode,
          })
        }
        /* istanbul ignore next -- default defensivo: todos os PLAYER_ACTIONS têm case no fallback */
        default:
          return false
      }
    }
    return false
  }

  const onCommand = async (msg: RemoteBridgeMessage) => {
    let ack: { id?: string | number; ok: boolean; data?: unknown } = {
      id: msg.id,
      ok: false,
    }
    try {
      const result = await execute(msg)
      if (typeof result === 'object' && result !== null && 'ok' in result) {
        ack = { id: msg.id, ok: result.ok, data: result.data }
      } else {
        ack = { id: msg.id, ok: result }
      }
    } catch {
      ack = { id: msg.id, ok: false }
    }
    send('remote:ack', ack)
    pushState()
  }

  const onStateRequest = () => pushState()

  const onUn: Record<string, (() => void) | undefined> = {
    command: remoteApi.onCommand(onCommand),
    state: remoteApi.onStateRequest(onStateRequest),
    // Posição do vídeo avança continuamente — sincroniza o APK (throttle 1s).
    sync: projection?.onPlaybackSync
      ? projection.onPlaybackSync(() => {
          const now = Date.now()
          if (now - lastSyncPush > 1000) {
            lastSyncPush = now
            pushState()
          }
        })
      : undefined,
  }

  // Push de estado quando seleção da liturgia muda (local ou remoto).
  const unwatch = watch(
    () => [
      liturgy.selectedItemIndex,
      JSON.stringify(
        (liturgy.currentItems ?? []).map((i) => [i.name, i.subtitle, i.done]),
      ),
    ],
    () => pushState(),
    { deep: false },
  )

  let lastSyncPush = 0

  // v2: progressão de timer/countdown — enquanto algum estiver rodando,
  // empurra estado a cada 1s (o APK mostra o tempo avançando). Sem isso o
  // operador vê o tempo congelado no instante do último comando.
  const progressTicker = setInterval(() => {
    const timerRunning = modules.snapshot('timer')?.status === 'running'
    const countdownRunning =
      modules.snapshot('countdown')?.status === 'running' ||
      modules.snapshot('countdown')?.finished === true
    if (timerRunning || countdownRunning) pushState()
  }, 1000)

  // Documento projetado (PDF/PPT/imagens): sem evento de mudança de página —
  // opera detects mudança por polling (2s), empurra ao pregador/APK e
  // BOMBEIA o frame do slide ao Palco (TVs) — paridade com a tela por cabo.
  let lastDocSlide = -1
  const docPoll = setInterval(() => {
    void (async () => {
      try {
        const s =
          (await projection?.getPdfPageState?.()) ??
          (await projection?.getPptSlideState?.()) ??
          (await projection?.getImageSlideState?.())
        if (s && s.total > 0 && s.index !== lastDocSlide) {
          lastDocSlide = s.index
          pushState()
          // Frame → TV: capturePng (canvas) tem cor fiel; capturePage dava
          // frame cinza de loading. dataURL vai como background da projeção.
          const png = await projection?.captureSourceFrame?.()
          if (png) {
            const input: ProjectionInput = {
              text: '',
              frameDataUrl: `data:image/png;base64,${png}`,
            }
            await palcoSession.projectRouted('liturgy', 'liturgy', input)
            // Preview do pregador assiste ao slot Principal (7081) — se a
            // rota do módulo é outra TV, espelha no 0 também, senão o
            // celular fica no splash (frame nunca chega lá).
            if (getPalcoRoute('liturgy') !== 'mirror') {
              await palcoSession.projectTo('0', 'liturgy', input)
            }
          }
        } else if (!s && lastDocSlide !== -1) {
          lastDocSlide = -1
          pushState()
        }
      } catch {
        /* projeção encerrada no meio do poll — ignora */
      }
    })()
  }, 2000)

  pushState()

  return () => {
    clearInterval(progressTicker)
    clearInterval(docPoll)
    onUn.command?.()
    onUn.state?.()
    unwatch()
  }
}
