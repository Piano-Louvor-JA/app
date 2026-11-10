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
import { createAnnouncementsHandlers } from './announcements-handlers'
import { createPlaylistHandlers } from './playlist-handlers'
import { createSabbathHandlers } from './sabbath-handlers'
import { useSabbathSchoolStore } from '../../sabbath-school/stores/useSabbathSchoolStore'
import { useAnnouncementsStore } from '../../announcements/stores/useAnnouncementsStore'
import { useAnnouncementsCarousel } from '../../announcements/composables/useAnnouncementsCarousel'
import { projectAnnouncement } from '../../announcements/services/announcements-projection'
import type { Router } from 'vue-router'

import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { RemoteBridgeMessage } from '@shared/types/desktop-bridge'
import type { MediaPlaybackMode } from '../../media/types/media'

import { resolveMediaTarget } from './media-target'
import { createModuleHandlers } from './module-handlers'
import { palcoSession } from '../../settings/services/palco-session'
import {
  obsConnectionName,
  obsConnections,
  selectObsConnection,
} from '../../settings/services/obs-connections'
import { loadProjectionSettings } from '../../settings/services/projection-preferences'
import { reapplyProjectionTargets } from '@shared/composables/useProjectionWindow'
import { openMusicPlayer } from '../../media/services/open-music-player'
import {
  loadAlbumMusicIndex,
  filterAlbumMusicIndex,
} from '../../albums/services/album-music-search'

import { useLiturgyStore } from '../../liturgy/stores/useLiturgyStore'
import { makeSlideBackgroundThumb } from './slide-background'
import { LITURGY_DAY_TAB_ORDER, type LiturgyDayKey } from '../../liturgy/types/liturgy'
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
  'liturgy.open',
  'liturgy.selectDay',
  'liturgy.selectCustom',
  'liturgy.toggleDone',
  'liturgy.state',
])

/** Itens tocados na barra de vídeo, que tem botão próprio de projetar. */
// Abrem só o controle; quem projeta é a seta da barra do APK.
// Site também abre sem projetar: o celular navega e projeta pela seta.
const VIDEO_BAR_ITEM_TYPES = new Set(['video', 'online_video', 'images', 'pdf', 'presentation', 'site'])
/** Áudio toca pelo play da linha (player configurado); a projeção não toca áudio. */
const PLAY_ROW_ITEM_TYPES = new Set(['audio'])

const DEFAULT_INDEPENDENT_MODE: string = 'overlay'

const VIDEO_AUDIO_OUTPUTS = new Set(['player', 'connections', 'both'])

/** Traduz o comando remoto para a barra de vídeo; null = comando inválido. */
function videoControlCommand(msg: RemoteBridgeMessage): Record<string, unknown> | null {
  switch (msg.action) {
    case 'video.setAudioOutput':
      if (typeof msg.mode !== 'string' || !VIDEO_AUDIO_OUTPUTS.has(msg.mode)) return null
      return { type: 'audio-output', mode: msg.mode }
    case 'video.toggleProjection':
      return { type: 'project' }
    case 'video.toggleCaptions':
      return { type: 'captions' }
    case 'video.setTarget':
      if (typeof msg.targetId !== 'string' || typeof msg.enabled !== 'boolean') return null
      return { type: 'target', targetId: msg.targetId, enabled: msg.enabled }
    case 'video.setIndependentMode':
      if (msg.mode !== 'overlay' && msg.mode !== 'share') return null
      return { type: 'independent-mode', mode: msg.mode }
    case 'video.setIndependentTarget':
      if (typeof msg.targetId !== 'string' || typeof msg.enabled !== 'boolean') return null
      return { type: 'independent-target', targetId: msg.targetId, enabled: msg.enabled }
    default:
      return null
  }
}

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

type RemoteVideoSnapshot = {
  tvs?: Array<{ id: string; label?: string }>
  independent?: { remotes?: Array<{ id: string; label?: string; enabled?: boolean }> } | null
}

export function installRemoteLiturgyBridge({ router }: { router: Router }) {
  const liturgy = useLiturgyStore()
  const player = useMediaPlayer()
  const remoteApi = getDesktopBridge()?.remote
  const desktop = getDesktopBridge()
  const projection = desktop?.projection
  if (!remoteApi) return () => {}

  const sabbath = createSabbathHandlers(useSabbathSchoolStore())
  const playlists = createPlaylistHandlers(player, () => player.session.value?.musicId ?? null)
  const announcements = createAnnouncementsHandlers({
    store: useAnnouncementsStore(),
    carousel: useAnnouncementsCarousel(),
    project: item => projectAnnouncement(item, router),
  })

  // Módulos v2: bible/timer/countdown com stores reais do desktop.
  // Cast: pinia expõe UnwrapRef que não é atribuível aos tipos estruturais
  // (RefLike) sem cast — a superfície usada é exatamente a declarada.
  // bible.open valida contra o catálogo de livros — sem bootstrap o
  // comando falha (ok:false) até alguém abrir o módulo Bíblia no desktop.
  // Assina o estado do áudio mesmo quando o Sorteio só é aberto pelo APK.
  const randomStore = useRandomStore()
  randomStore?.hydrate?.()
  const bibleStore = useBibleStore()
  void bibleStore.bootstrap?.().catch(() => {})

  // Busca de hinos com os ids LOCAIS do desktop (a API pública tem ids
  // distintos — media.open com id da API dá trackMissing).
  let musicIndex: Awaited<ReturnType<typeof loadAlbumMusicIndex>> | null = null
  // Play remoto abre primeiro; a seta da barra decide quando projetar.
  const openMusicPlayerRemote: typeof openMusicPlayer = async (params) => {
    return openMusicPlayer({ ...params, project: false })
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
    random: randomStore as never,
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

  const pendingIndependent = {
    mode: DEFAULT_INDEPENDENT_MODE,
    targets: new Set<string>(),
  }

  /** Monitores para o "Telas" do APK quando não há barra de vídeo aberta. */
  const idleVideoTargets = async () => {
    const list = (await desktop?.displays?.list?.()) ?? []
    const slots = await palcoSession.slots().catch(() => [])
    // Conexão entra com o nome e a regra do cabeçalho "Selecionar telas".
    const connections = slots.flatMap((slot) => {
      const connection = obsConnections.value.find((item) => item.id === slot.id)
      return slot.running && connection ? [{ slot, connection }] : []
    })
    // Lido por último: quem acabou de mudar a seleção já gravou.
    const selected = loadProjectionSettings().targetDisplayIds
    return {
      monitors: list.flatMap((display, index) =>
        display.isPrimary
          ? []
          : [
              {
                id: `monitor:${display.id}`,
                label: `Monitor ${index + 1}`,
                detail: `${display.bounds.width} × ${display.bounds.height}`,
                selected: selected.includes(display.id),
              },
            ],
      ),
      tvs: connections.map(({ slot, connection }) => ({
        id: `tv:${slot.id}`,
        label: obsConnectionName(connection),
        detail: `Conexões ativas: ${slot.clients}`,
        selected: connection.selected,
      })),
      independent: {
        mode: pendingIndependent.mode,
        live: false,
        armed: pendingIndependent.targets.size > 0,
        monitors: list.flatMap((display, index) => {
          if (display.isPrimary) return []
          const id = `monitor:${display.id}`
          return [
            {
              id,
              label: `Monitor ${index + 1}`,
              detail: `${display.bounds.width} × ${display.bounds.height}`,
              selected: pendingIndependent.targets.has(id),
              onAir: false,
              enabled: selected.includes(display.id),
            },
          ]
        }),
        remotes: connections.map(({ slot, connection }) => {
          const id = `tv:${slot.id}`
          return {
            id,
            label: obsConnectionName(connection),
            detail: `Conexões ativas: ${slot.clients}`,
            selected: pendingIndependent.targets.has(id),
            onAir: false,
            enabled: connection.selected,
          }
        }),
      },
    }
  }

  /** Sem barra aberta, a escolha fica guardada até um vídeo abrir. */
  const storeIdleIndependent = async (command: Record<string, unknown>) => {
    if (command.type === 'independent-mode') {
      pendingIndependent.mode = String(command.mode)
      return true
    }
    if (command.type !== 'independent-target' || typeof command.targetId !== 'string') return false
    const [kind, rawId] = command.targetId.split(':')
    if (kind === 'monitor' && command.enabled === true) {
      if (!loadProjectionSettings().targetDisplayIds.includes(Number(rawId))) return false
    }
    if (blockedConnection(command)) return false
    if (command.enabled === true) pendingIndependent.targets.add(command.targetId)
    else pendingIndependent.targets.delete(command.targetId)
    return true
  }

  /** Entrega à barra recém-aberta o que foi escolhido sem vídeo. */
  const applyPendingIndependent = async () => {
    const { mode, targets } = pendingIndependent
    if (mode === DEFAULT_INDEPENDENT_MODE && targets.size === 0) return false
    pendingIndependent.mode = DEFAULT_INDEPENDENT_MODE
    pendingIndependent.targets = new Set()
    await projection?.runVideoControlCommand?.({ type: 'independent-mode', mode })
    for (const targetId of targets) {
      await projection?.runVideoControlCommand?.({
        type: 'independent-target',
        targetId,
        enabled: true,
      })
    }
    return true
  }

  const selectKnownConnection = (id: string, selected: boolean) => {
    if (!obsConnections.value.some((item) => item.id === id)) return false
    selectObsConnection(id, selected)
    return true
  }

  /** Sem barra aberta, grava como o cabeçalho "Selecionar telas" grava. */
  const setIdleTarget = async (command: Record<string, unknown>) => {
    if (command.type !== 'target' || typeof command.targetId !== 'string') return false
    const [kind, rawId] = command.targetId.split(':')
    if (kind === 'tv') return selectKnownConnection(rawId, command.enabled === true)
    const id = Number(rawId)
    if (kind !== 'monitor' || !Number.isFinite(id)) return false
    const current = loadProjectionSettings().targetDisplayIds
    const next = command.enabled === true
      ? [...new Set([...current, id])]
      : current.filter((item) => item !== id)
    await projection?.setSiteTargetMonitors?.(next)
    const saved = (await projection?.setVideoTargetMonitors?.(next)) === true
    await reapplyProjectionTargets(next)
    return saved
  }

  /** Mudança feita na barra do vídeo também aparece no cabeçalho do desktop. */
  const mirrorTargetToHeader = async (command: Record<string, unknown>) => {
    if (command.type !== 'target' || typeof command.targetId !== 'string') return
    const [kind, rawId] = command.targetId.split(':')
    if (kind === 'tv') {
      selectKnownConnection(rawId, command.enabled === true)
      return
    }
    const ids = await projection?.getVideoTargetMonitors?.()
    if (ids) await projection?.setSiteTargetMonitors?.(ids)
  }

  // Fundos dos slides do hino: uma miniatura por imagem, gerada uma vez.
  const backgroundThumbs = new Map<string, string>()
  const backgroundsPending = new Set<string>()
  let sentBackgroundKey = ''

  /**
   * Índice do fundo de cada slide e, quando o hino muda (ou um celular pede
   * tudo), as miniaturas de cada fundo diferente.
   */
  const hymnBackgrounds = (withGallery: boolean) => {
    const session = player.session.value
    const slides = Array.from(session?.slides ?? [])
    const paths = [...new Set(slides.map((item) => item?.imageUrl ?? '').filter(Boolean))]
    const key = `${session?.musicId ?? ''}:${session?.mode ?? ''}:${paths.join('|')}`
    for (const path of paths) {
      if (backgroundThumbs.has(path) || backgroundsPending.has(path)) continue
      backgroundsPending.add(path)
      void makeSlideBackgroundThumb(path)
        .catch(() => null)
        .then((thumb) => {
          backgroundThumbs.set(path, thumb ?? '')
          backgroundsPending.delete(path)
          // Miniatura nova: manda de novo para o celular que já tem o resto.
          sentBackgroundKey = ''
          void pushState()
        })
    }
    const out: { backgroundKey: string; backgroundIndex: number[]; backgroundSources?: string[] } = {
      backgroundKey: key,
      backgroundIndex: slides.map((item) => (item?.imageUrl ? paths.indexOf(item.imageUrl) : -1)),
    }
    const ready = paths.every((path) => backgroundThumbs.has(path))
    if (ready && (key !== sentBackgroundKey || withGallery)) {
      out.backgroundSources = paths.map((path) => backgroundThumbs.get(path) ?? '')
      sentBackgroundKey = key
    }
    return out
  }

  /** Letra de cada slide do hino aberto, em texto simples (a capa mostra o título). */
  const hymnLyrics = () => {
    const session = player.session.value
    const slides = session?.slides
    if (!slides?.length) return null
    return Array.from(slides, (item) =>
      item?.isCover
        ? (session?.title ?? '')
        : String(item?.lyric ?? '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .trim(),
    )
  }

  /** Imagem ou PDF aberto no desktop (com o estado de projeção). */
  const openDocumentState = async () =>
    (await projection?.getImageSlideState?.()) ?? (await projection?.getPdfPageState?.()) ?? null

  /** Site aberto no desktop (controle do navegador), com o estado de projeção. */
  const openSiteState = async () => (await projection?.getNavigationState?.()) ?? null

  /** Controles da barra para imagem aberta: só a projeção e as telas. */
  const imageControls = async (projecting: boolean) => {
    const idle = await idleVideoTargets()
    return {
      audioOutput: 'player',
      canProject: true,
      projecting,
      canControlCaptions: false,
      captionsHidden: false,
      monitors: idle.monitors,
      tvs: idle.tvs,
      independent: null,
    }
  }

  /** Conexão desmarcada em "Selecionar telas" não entra na projeção independente. */
  const blockedConnection = (command: Record<string, unknown>) => {
    if (command.type !== 'independent-target' || command.enabled !== true) return false
    const [kind, rawId] = String(command.targetId).split(':')
    if (kind !== 'tv') return false
    return obsConnections.value.find((item) => item.id === rawId)?.selected === false
  }

  let sentGalleryKey = ''

  // Prévia do slide para o celular: uma captura por imagem, refeita ao trocar.
  let previewKey = ''
  let previewData: string | null = null
  let previewRetries = 0
  const slidePreview = async (index: number, total: number) => {
    const key = `${index}/${total}`
    if (key === previewKey && previewData) return previewData
    if (key !== previewKey) previewRetries = 0
    previewKey = key
    previewData = (await projection?.captureSlidePreview?.()) ?? null
    // Imagem recém-aberta ainda carregando: tenta de novo algumas vezes.
    if (!previewData && projection?.captureSlidePreview && previewRetries < 5) {
      previewRetries += 1
      setTimeout(() => void pushState(), 700)
    }
    return previewData
  }

  /** A barra do vídeo só conhece o nome interno do slot; o operador vê o apelido. */
  const withConnectionNames = <T extends RemoteVideoSnapshot>(controls: T | undefined) => {
    if (!controls) return controls
    const rename = <R extends { id: string; label?: string }>(item: R): R => {
      const connection = obsConnections.value.find((entry) => `tv:${entry.id}` === item.id)
      return connection ? { ...item, label: obsConnectionName(connection) } : item
    }
    return {
      ...controls,
      tvs: controls.tvs?.map(rename),
      independent: controls.independent && {
        ...controls.independent,
        remotes: controls.independent.remotes?.map((item) => {
          const named = rename(item)
          const connection = obsConnections.value.find((entry) => `tv:${entry.id}` === item.id)
          return connection?.selected === false ? { ...named, enabled: false } : named
        }),
      },
    }
  }

  /** Todos os dias da semana e a avulsa, para o APK escolher qual abrir. */
  const liturgyDays = () => [
    ...LITURGY_DAY_TAB_ORDER.map((day) => ({
      key: day,
      count: liturgy.weekdays?.[day]?.length ?? 0,
      selected: liturgy.selectedDay === day,
    })),
    {
      key: 'custom',
      count: (liturgy.customLiturgies ?? []).reduce((sum, item) => sum + item.items.length, 0),
      selected: liturgy.selectedDay === 'custom',
    },
  ]

  /** Cada liturgia avulsa; o desktop pode ter várias. */
  const liturgyCustoms = () =>
    (liturgy.customLiturgies ?? []).map((custom, index) => ({
      index,
      name: custom.name,
      count: custom.items.length,
      selected: liturgy.selectedDay === 'custom' && liturgy.selectedCustomIndex === index,
    }))

  /** `withGallery`: celular pediu o estado completo e ainda não tem as miniaturas. */
  const buildState = async (withGallery = false) => {
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
    let slide: {
      index: number
      total: number
      preview?: string
      galleryKey?: string
      previews?: string[]
      lyrics?: string[]
      backgroundKey?: string
      backgroundIndex?: number[]
      backgroundSources?: string[]
    }
    const docSlide =
      (await projection?.getPdfPageState?.()) ??
      (await projection?.getPptSlideState?.()) ??
      (await projection?.getImageSlideState?.())
    const textOpen = await projection?.getTextScale?.()
    if (textOpen) {
      // Texto recebe quadros atuais pelo canal frame; uma foto de abertura
      // pode estar preta e não deve encobrir os quadros que chegam depois.
      slide = { index: 0, total: 1 }
    } else if (docSlide && docSlide.total > 0) {
      slide = { index: docSlide.index, total: docSlide.total }
      const preview = await slidePreview(docSlide.index, docSlide.total)
      if (preview) slide.preview = preview
      const gallery = await projection?.captureGalleryPreviews?.()
      if (gallery) {
        slide.galleryKey = gallery.key
        // Miniaturas só quando a galeria muda ou um celular pede tudo: são pesadas.
        if (gallery.key !== sentGalleryKey || withGallery) {
          slide.previews = gallery.previews
          sentGalleryKey = gallery.key
        }
      }
    } else {
      slide = {
        index: player.slideIndex.value,
        total: player.session.value?.slides?.length ?? 0,
      }
      const lyrics = hymnLyrics()
      if (lyrics) {
        slide.lyrics = lyrics
        Object.assign(slide, hymnBackgrounds(withGallery))
      }
      // Vídeo/YouTube: a prévia vai em quadros próprios (canal `frame`), não aqui.
    }

    let videoControls = (await projection?.getVideoControlSnapshot?.()) ?? undefined
    if (videoControls?.independent && (await applyPendingIndependent())) {
      videoControls = (await projection?.getVideoControlSnapshot?.()) ?? undefined
    }
    // Imagem ou PDF aberto: a barra do APK mostra a seta para projetar, como no vídeo.
    if (!videoControls) {
      const doc = await openDocumentState()
      if (doc) videoControls = await imageControls(doc.projecting === true)
    }
    // Site aberto: mesma barra (seta para projetar e X para fechar).
    if (!videoControls) {
      const site = await openSiteState()
      if (site) videoControls = await imageControls(site.projecting === true)
    }

    // Hinos usam a mesma seta da barra de vídeo, com o estado do renderer.
    if (!videoControls && target === 'player' && player.session.value?.slides?.length) {
      videoControls = await imageControls(player.isProjecting.value)
    }

    return {
      liturgy: {
        total: items.length,
        selectedIndex: liturgy.selectedItemIndex,
        // Anuncia liturgy.open: desktops antigos só entendem liturgy.select.
        canOpen: true,
        days: liturgyDays(),
        customs: liturgyCustoms(),
        items: items.map((item, index) => ({
          index,
          type: item.type,
          title: item.name || item.subtitle || null,
          subtitle: item.subtitle || null,
          isCategory: item.type === 'category',
          accentColor: item.accentColor || null,
          done: item.done === true,
          // Site: o celular abre o link no navegador embutido dele.
          url: item.type === 'site' ? item.url?.trim() || null : null,
        })),
      },
      slide,
      video: withConnectionNames(videoControls),
      videoTargets: videoControls ? undefined : await idleVideoTargets(),
      player: {
        ...media,
        canPrevious: target === 'player' && (player.queue?.value?.length ?? 0) > 0
          ? (player.queueIndex?.value ?? -1) > 0
          : (liturgy.selectedItemIndex ?? 0) > 0,
        canNext: target === 'player' && (player.queue?.value?.length ?? 0) > 0
          ? (player.queueIndex?.value ?? -1) + 1 < player.queue.value.length
          : (liturgy.selectedItemIndex ?? -1) + 1 <
          (liturgy.currentItems?.length ?? 0),
      },
      ...snapshotsV2(modules),
    }
  }

  // Estado COMPLETO (spec v1): player + liturgia espelhada no APK.
  const pushState = async (withGallery = false) =>
    send('remote:state', await buildState(withGallery))

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
      announcements: announcements.snapshot(),
      playlist: playlists.snapshot(),
      sabbath: sabbath.snapshot(),
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

    // Navegador do celular: o site projetado acompanha a página aberta nele.
    if (action === 'site.scroll') {
      if (typeof msg.ratio !== 'number' || !Number.isFinite(msg.ratio)) return false
      return (await projection?.remoteScroll?.(msg.ratio)) === true
    }

    if (action === 'site.navigate') {
      if (typeof msg.url !== 'string' || !msg.url.trim()) return false
      return (await projection?.remoteNavigate?.(msg.url.trim())) === true
    }

    if (action.startsWith('video.')) {
      const command = videoControlCommand(msg)
      if (!command) return false
      if (command.type === 'project' && player.session.value?.slides?.length &&
          (await resolveMediaTarget({ projection, player })) === 'player' && !(await openSiteState())) {
        await player.toggleProjection()
        return true
      }
      if (!projection?.runVideoControlCommand) return false
      if (blockedConnection(command)) return false
      const annotation = items[current]
      const annotationState = command.type === 'project' && annotation?.type === 'annotation'
        ? await projection.getVideoControlSnapshot?.()
        : null
      const done = await projection.runVideoControlCommand(command)
      if (done) {
        if (annotationState && !annotationState.projecting && !annotation.done) {
          liturgy.toggleItemDone(current)
        }
        await mirrorTargetToHeader(command)
        return true
      }
      // Seta com imagem ou PDF aberto: liga/desliga as telas do documento.
      if (command.type === 'project' && (await openDocumentState())) {
        return (await projection.toggleVideoScreens?.()) === true
      }
      // Seta com site aberto: liga/desliga as telas do site.
      if (command.type === 'project') {
        const site = await openSiteState()
        if (site) {
          const toggled = (await projection.toggleSiteScreens?.()) === true
          const item = items[current]
          if (toggled && !site.projecting && item?.type === 'site' && !item.done) {
            liturgy.toggleItemDone(current)
          }
          return toggled
        }
      }
      return (await setIdleTarget(command)) || (await storeIdleIndependent(command))
    }

    // 0) Namespaces v2 (bible/timer/countdown) — spec controle remoto total.
    if (action.startsWith('sabbath.')) return sabbath.execute(action, msg)
    if (action.startsWith('playlist.')) return playlists.execute(action, msg)
    if (action.startsWith('announcements.')) return announcements.execute(action, msg)
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
        case 'liturgy.selectDay': {
          // O dia vem em `mode`, campo que o servidor já repassa.
          const day = msg.mode
          if (day !== 'custom' && !LITURGY_DAY_TAB_ORDER.includes(day as never)) return false
          liturgy.selectDay(day as LiturgyDayKey)
          return true
        }
        case 'liturgy.selectCustom': {
          const index = value
          const total = liturgy.customLiturgies?.length ?? 0
          if (typeof index !== 'number' || index < 0 || index >= total) return false
          liturgy.selectDay('custom')
          liturgy.selectCustomLiturgy(index)
          return true
        }
        case 'liturgy.open': {
          const idx = value
          if (typeof idx !== 'number' || idx < 0 || idx >= items.length) {
            return false
          }
          if (items[idx].type === 'music') {
            return liturgy.playMusicMode(idx, items[idx].musicMode ?? 'audio', router, { project: false })
          }
          // Vídeo abre sem projetar: o operador projeta pelo botão da barra.
          if (VIDEO_BAR_ITEM_TYPES.has(items[idx].type) || PLAY_ROW_ITEM_TYPES.has(items[idx].type)) {
            await liturgy.selectItem(idx, router)
          } else {
            await liturgy.playItemOnScreens(idx)
          }
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
      // X da barra com site aberto (sem vídeo): fecha o site, desligando as telas antes.
      if (action === 'player.stop' && !(await projection?.getPlaybackState?.())) {
        const site = await openSiteState()
        if (site) {
          if (site.projecting) await projection?.toggleSiteScreens?.()
          await projection?.closeUrl?.()
          if (items[current]?.type === 'site' && !items[current].done) {
            liturgy.toggleItemDone(current)
          }
          return true
        }
      }
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
            // Desliga as telas só se estiverem ligadas: o comando é um
            // alternador e ligaria a projeção de um vídeo apenas aberto.
            if ((await projection?.getPlaybackState?.())?.projecting) {
              await projection?.toggleVideoScreens?.()
            }
            await projection?.closeUrl?.()
            if (items[current]?.type === 'annotation' && !items[current].done) {
              liturgy.toggleItemDone(current)
            }
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
          if ((player.queue?.value?.length ?? 0) > 0) {
            return playlists.execute(action === 'player.next' ? 'playlist.next' : 'playlist.previous', msg)
          }
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

  // Celular conectando agora ainda não tem as miniaturas da galeria.
  const onStateRequest = () => pushState(true)

  const onUn: Record<string, (() => void) | undefined> = {
    command: remoteApi.onCommand(onCommand),
    state: remoteApi.onStateRequest(onStateRequest),
    siteTargets: projection?.onSiteTargetsChanged?.(() => pushState()),
    videoTargets: projection?.onVideoTargetsChanged?.(() => pushState()),
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

  // Sincroniza participantes e áudio sem enviar cada quadro da animação do sorteio.
  function randomStateKey() {
    const random = modules.snapshot('random')
    return JSON.stringify([random?.mode, random?.available, random?.drawn, random?.numberMin, random?.numberMax, random?.isDrawing, random?.audioSource, random?.audioVolume, random?.audioMuted,
      random?.audioPlaying, random?.customAudioFile, random?.customAudioFiles])
  }

  // Push de estado quando seleção da liturgia muda (local ou remoto).
  const unwatch = watch(
    () => [
      JSON.stringify(announcements.snapshot()),
      JSON.stringify(playlists.snapshot()),
      randomStateKey(),
      JSON.stringify(sabbath.snapshot()),
      liturgy.selectedItemIndex,
      player.isProjecting?.value,
      liturgy.selectedDay,
      JSON.stringify(liturgyDays()),
      JSON.stringify(liturgyCustoms()),
      JSON.stringify(
        (liturgy.currentItems ?? []).map((i) => [i.name, i.subtitle, i.done]),
      ),
    ],
    () => pushState(),
    { deep: false },
  )

  // Marcar uma conexão no cabeçalho do desktop aparece na hora no APK.
  const unwatchConnections = watch(
    () => JSON.stringify(obsConnections.value.map((item) => [item.id, item.selected])),
    () => pushState(),
  )

  let lastSyncPush = 0

  // v2: progressão de timer/countdown — enquanto algum estiver rodando,
  // empurra estado a cada 1s (o APK mostra o tempo avançando). Sem isso o
  // operador vê o tempo congelado no instante do último comando.
  // O tempo da mídia também avança sem nenhum comando: sem este envio o APK
  // mostraria a posição congelada no último comando.
  const isMediaPlaying = async () => {
    if (player.isPlaying.value) return true
    try {
      const playback = await projection?.getPlaybackState?.()
      return playback != null && playback.paused === false
    } catch {
      return false
    }
  }

  let mediaWasPlaying = false

  let lastSabbathKey = JSON.stringify(sabbath.snapshot())
  let lastPlaylistKey = JSON.stringify(playlists.snapshot())
  const progressTicker = setInterval(async () => {
    // localStorage não emite storage na própria janela: acompanha edições locais.
    const sabbathKey = JSON.stringify(sabbath.snapshot())
    const sabbathChanged = sabbathKey !== lastSabbathKey
    lastSabbathKey = sabbathKey
    const playlistKey = JSON.stringify(playlists.snapshot())
    const playlistsChanged = playlistKey !== lastPlaylistKey
    lastPlaylistKey = playlistKey
    const timerRunning = modules.snapshot('timer')?.status === 'running'
    const countdownRunning =
      modules.snapshot('countdown')?.status === 'running' ||
      modules.snapshot('countdown')?.finished === true
    const mediaPlaying = await isMediaPlaying()
    // O envio extra ao parar avisa pausa e fim do vídeo feitos no desktop.
    const mediaStopped = mediaWasPlaying && !mediaPlaying
    mediaWasPlaying = mediaPlaying
    if (sabbathChanged || playlistsChanged || timerRunning || countdownRunning || mediaPlaying || mediaStopped) pushState()
  }, 1000)

  // Poll document navigation for the remote controller. PDF/PPT retain their
  // frame relay here; gallery outputs are managed only by their control bar.
  let lastDocSlide = -1
  // Site aberto/projetado/fechado no desktop: a barra do celular acompanha.
  let lastSiteKey = ''
  const docPoll = setInterval(() => {
    void (async () => {
      try {
        const site = await openSiteState()
        const siteKey = site ? `open:${site.projecting === true}` : ''
        if (siteKey !== lastSiteKey) {
          lastSiteKey = siteKey
          pushState()
        }
        const imageState = await projection?.getImageSlideState?.()
        const s =
          (await projection?.getPdfPageState?.()) ??
          (await projection?.getPptSlideState?.()) ?? imageState
        if (s && s.total > 0 && s.index !== lastDocSlide) {
          lastDocSlide = s.index
          pushState()
          // Output destinations belong to each document's own control bar.
          // Remote observation/navigation must never start a transmission.
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
    onUn.siteTargets?.()
    onUn.videoTargets?.()
    unwatch()
    unwatchConnections()
  }
}
