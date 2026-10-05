import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'
import {
  type QueueItem,
  resolveNext,
  resolvePrevious,
} from '../services/media-queue'
import { getPalcoRoute, isPalcoTvOnlyRoute } from '@modules/settings/services/palco-routing'
import { palcoSession } from '@modules/settings/services/palco-session'
import { useLocalLibraryStore } from '@modules/sync/stores/useLocalLibraryStore'
import {
  closeProjectionModule,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { isDesktopApp } from '@shared/services/desktop-bridge'
import {
  downloadTrackMedia,
  isTrackMediaDownloaded,
} from '@shared/services/track-media'

import {
  attachMediaAudioListeners,
  detachMediaAudioListeners,
  fadeInMediaAudio,
  fadeOutMediaAudio,
  fadeVolumeMediaAudio,
  formatMediaClock,
  getMediaAudioElement,
  pauseMediaAudio,
  playMediaAudio,
  resolveMusicAudioUrl,
  resolveSlideImageUrl,
  stopAllMediaAudio,
  switchMediaAudioElement,
} from '../services/media-audio'
import {
  loadCustomMusicTrack,
  isCustomMusicId,
  fromCustomMusicId,
} from '../services/custom-catalog'
import {
  loadMediaTrack,
  resolveAlbumSubtitle,
} from '../services/media-catalog'
import {
  clearMediaRuntime,
  publishMediaRuntime,
} from '../services/media-runtime'
import {
  buildMediaSlides,
  buildSlideTimesSec,
  lyricPreviewSnippet,
  resolveSlideIndexForTime,
  stripHtmlBreaks,
} from '../services/media-slides'
import type {
  MediaOpenParams,
  MediaOpenResult,
  MediaPlaybackMode,
  MediaPlayerStatus,
  MediaProjectionRuntime,
  MediaSession,
} from '../types/media'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'

export const useMediaStore = defineStore('media', () => {
  const session = ref<MediaSession | null>(null)
  const status = ref<MediaPlayerStatus>('idle')
  const lastErrorKey = ref<string | null>(null)
  const minimized = ref(true)
  const isProjectingRaw = ref(false)
  // Fila de reprodução (spec playlist RF-03): vazia = comportamento atual.
  const queue = ref<QueueItem[]>([])
  const queueIndex = ref(-1)
  const isProjecting = computed({
    get: () => isProjectingRaw.value,
    set: (v: boolean) => {
      if (v !== isProjectingRaw.value) {
      }
      isProjectingRaw.value = v
    },
  })
  /** Projetando somente nas TVs (sem janela cabeada). */
  const projectingTvsOnly = ref(false)
  const showPlaylist = ref(true)
  const closeConfirmOpen = ref(false)

  const slideIndex = ref(0)
  const currentTimeSec = ref(0)
  const durationSec = ref(0)
  const volume = ref(1)
  const resolvedSlideImageUrl = ref<string | null>(null)
  /** Progresso do download sob demanda (null = barra inativa). */
  const ondemandDownloadPercent = ref<number | null>(null)
  /** Download PRÉ-play: player mostra 'baixando' e toca ao concluir. */
  const preplayDownloadMusicId = ref<number | null>(null)
  /** Mantém a mensagem visível até fechar o player. */
  const ondemandNoticeVisible = ref(false)
  /** Download sob demanda concluído com sucesso nesta sessão. */
  const ondemandDownloadDone = ref(false)

  let projectionWatchTimer: ReturnType<typeof setInterval> | null = null
  /** Avanço automático da fila: bloqueia close() e o watch que derruba isProjecting. */
  let queueAdvanceInProgress = 0
  let boundAudioElement: HTMLAudioElement | null = null
  let playPauseSeq = 0
  let ondemandGen = 0
  let ondemandAbort = false
  let ondemandNoticeMusicId: number | null = null
  let audioHandlers: {
    onTimeUpdate: () => void
    onLoadedMetadata: () => void
    onPlay: () => void
    onPause: () => void
    onEnded: () => void
    onError: () => void
  } | null = null

  const hasSession = computed(() => session.value != null)
  const isPlaying = computed(() => status.value === 'playing')
  const isPaused = computed(() => status.value === 'paused')
  const hasAudio = computed(() => Boolean(session.value?.audioUrl))

  const currentSlide = computed(() => {
    const slides = session.value?.slides ?? []
    return slides[slideIndex.value] ?? null
  })

  const previewSnippet = computed(() => {
    const lyric = currentSlide.value?.lyric ?? ''
    if (lyric.trim()) return lyricPreviewSnippet(lyric)
    return session.value?.title ?? ''
  })

  const previewReference = computed(() => {
    const track = session.value
    if (!track) return ''
    const parts = [track.title]
    if (track.subtitle) parts.push(track.subtitle)
    return parts.join(' · ')
  })

  const progressRatio = computed(() => {
    if (durationSec.value <= 0) return 0
    return Math.min(1, Math.max(0, currentTimeSec.value / durationSec.value))
  })

  /** Progresso da frase atual até o início da próxima frase. */
  const slideProgressRatio = computed(() => {
    if (!hasAudio.value || !session.value) return 0

    const times = session.value.slideTimesSec
    const start = times[slideIndex.value] ?? 0
    let end = durationSec.value

    // Ignora marcas repetidas (ex.: capa e primeira frase em 00:00).
    for (let index = slideIndex.value + 1; index < times.length; index += 1) {
      const candidate = times[index] ?? 0
      if (candidate > start) {
        end = candidate
        break
      }
    }

    if (end <= start) return 0
    return Math.min(
      1,
      Math.max(0, (currentTimeSec.value - start) / (end - start)),
    )
  })

  const currentTimeLabel = computed(() => formatMediaClock(currentTimeSec.value))
  const durationLabel = computed(() => formatMediaClock(durationSec.value))

  const slideCount = computed(() => session.value?.slides.length ?? 0)

  let lastRuntimePublishAt = 0
  const RUNTIME_PUBLISH_MIN_MS = 80

  function stopProjectionWatch() {
    // v8 ignore next 3 -- window sempre definido (store roda só no browser/app; SSR não existe)
    if (typeof window !== 'undefined') {
      window.removeEventListener('louvorja:projection-reapplied', onProjectionReapplied)
    }
    if (!projectionWatchTimer) return
    clearInterval(projectionWatchTimer)
    projectionWatchTimer = null
  }

  function onProjectionReapplied(event: Event) {
    const detail = (event as CustomEvent<{ moduleId?: string; open?: boolean }>).detail
    if (detail?.moduleId !== 'media') return
    if (detail.open) {
      isProjecting.value = true
      // v8 ignore next 1 -- listener e timer vivem/morrem juntos (stopProjectionWatch remove ambos): com listener ativo o timer sempre existe
      if (!projectionWatchTimer) startProjectionWatch()
      publishProjectionState()
      return
    }
    isProjecting.value = false
    stopProjectionWatch()
    publishProjectionState()
  }

  function startProjectionWatch() {
    stopProjectionWatch()
    // v8 ignore next 3 -- window sempre definido (store roda só no browser/app; SSR não existe)
    if (typeof window !== 'undefined') {
      window.addEventListener('louvorja:projection-reapplied', onProjectionReapplied)
    }
    projectionWatchTimer = setInterval(() => {
      if (queueAdvanceInProgress > 0) return
      if (projectingTvsOnly.value) return // só-TVs: sem janela pra vigiar
      if (!isProjectionModuleOpen('media')) {
        isProjecting.value = false
        projectingTvsOnly.value = false
        stopProjectionWatch()
      }
    }, 400)
  }

  function buildRuntime(): MediaProjectionRuntime {
    const active = session.value != null && isProjecting.value
    const slide = currentSlide.value
    if (!session.value || !slide) {
      return { ...DEFAULT_MEDIA_PROJECTION, active: false }
    }

    const nextSlide = session.value.slides[slideIndex.value + 1] ?? null

    return {
      active,
      title: session.value.title,
      subtitle: session.value.subtitle,
      lyric: stripHtmlBreaks(slide.lyric),
      imageUrl: resolvedSlideImageUrl.value ?? slide.imageUrl,
      imagePosition: slide.imagePosition,
      isCover: slide.isCover,
      slideIndex: slideIndex.value,
      slideCount: session.value.slides.length,
      nextLyric: nextSlide ? stripHtmlBreaks(nextSlide.lyric) : '',
      nextIsCover: nextSlide?.isCover === true,
      progressRatio: progressRatio.value,
      slideProgressRatio: slideProgressRatio.value,
    }
  }

  function publishProjectionState() {
    publishMediaRuntime(buildRuntime())
  }

  async function refreshResolvedSlideImage() {
    const slide = currentSlide.value
    if (!slide?.imageUrl) {
      resolvedSlideImageUrl.value = null
      publishProjectionState()
      return
    }
    resolvedSlideImageUrl.value = await resolveSlideImageUrl(slide.imageUrl)
    publishProjectionState()
  }

  function cancelOndemandDownload() {
    ondemandAbort = true
    ondemandGen += 1
    ondemandDownloadPercent.value = null
    ondemandNoticeVisible.value = false
    ondemandDownloadDone.value = false
    ondemandNoticeMusicId = null
  }

  async function startOndemandDownload(musicId: number) {
    /* v8 ignore next 1 -- única chamada é maybeStartOndemandDownload (já garante desktop) */
    if (!isDesktopApp()) return
    /* v8 ignore next 1 -- musicId já validado (>0) pelo open */
    if (!Number.isFinite(musicId) || musicId <= 0) return

    // Cancela qualquer download sob demanda anterior desta sessão do player.
    const gen = ++ondemandGen
    ondemandAbort = false

    try {
      if (await isTrackMediaDownloaded(musicId)) {
        if (gen !== ondemandGen) return
        // Mesma faixa que baixou sob demanda: mantém a mensagem até fechar o player.
        if (ondemandNoticeMusicId === musicId && ondemandNoticeVisible.value) {
          ondemandDownloadPercent.value = 100
          ondemandDownloadDone.value = true
          return
        }
        ondemandDownloadPercent.value = null
        ondemandNoticeVisible.value = false
        ondemandDownloadDone.value = false
        ondemandNoticeMusicId = null
        return
      }
    } catch {
      // segue com o download
    }

    if (gen !== ondemandGen) return
    ondemandNoticeMusicId = musicId
    ondemandNoticeVisible.value = true
    ondemandDownloadDone.value = false
    ondemandDownloadPercent.value = 0

    const result = await downloadTrackMedia(musicId, {
      onProgress: (percent) => {
        if (gen !== ondemandGen) return
        ondemandDownloadPercent.value = percent
      },
      shouldAbort: () => gen !== ondemandGen || ondemandAbort,
    })

    if (gen !== ondemandGen) return

    if (result.status === 'downloaded') {
      ondemandDownloadPercent.value = 100
      ondemandNoticeVisible.value = true
      ondemandDownloadDone.value = true
      void useLocalLibraryStore().reconcileAlbumsForMusic(musicId)
      return
    }

    ondemandDownloadPercent.value = null
    ondemandNoticeVisible.value = false
    ondemandDownloadDone.value = false
    ondemandNoticeMusicId = null
  }

  async function maybeStartOndemandDownload(musicId: number) {
    if (!isDesktopApp()) return
    void startOndemandDownload(musicId)
  }

  /**
   * Download PRÉ-play: se a faixa não está no disco e o modo tem áudio,
   * baixa ANTES de abrir o player. UI mostra progresso; ao concluir, o
   * caller abre a música normalmente (toca na hora, sem erro feio).
   */
  async function ensureTrackDownloaded(musicId: number): Promise<boolean> {
    if (!isDesktopApp()) return true // web: sempre stream remoto
    try {
      if (await isTrackMediaDownloaded(musicId)) return true
    } catch {
      return true // sem certeza: segue fluxo antigo (stream)
    }

    const gen = ++ondemandGen
    ondemandAbort = false
    preplayDownloadMusicId.value = musicId
    ondemandNoticeMusicId = musicId
    ondemandNoticeVisible.value = true
    ondemandDownloadDone.value = false
    ondemandDownloadPercent.value = 0

    const result = await downloadTrackMedia(musicId, {
      onProgress: (percent) => {
        if (gen !== ondemandGen) return
        ondemandDownloadPercent.value = percent
      },
      shouldAbort: () => gen !== ondemandGen || ondemandAbort,
    })

    if (gen !== ondemandGen) return false

    if (result.status === 'downloaded') {
      ondemandDownloadPercent.value = 100
      ondemandDownloadDone.value = true
      void useLocalLibraryStore().reconcileAlbumsForMusic(musicId)
      preplayDownloadMusicId.value = null
      // feedback some sozinho após um instante; caller já pode tocar
      return true
    }

    // falhou/abortado: limpa e segue fluxo antigo (stream remoto)
    preplayDownloadMusicId.value = null
    ondemandDownloadPercent.value = null
    ondemandNoticeVisible.value = false
    ondemandDownloadDone.value = false
    ondemandNoticeMusicId = null
    return true
  }

  function unbindAudio() {
    if (!audioHandlers || !boundAudioElement) {
      audioHandlers = null
      boundAudioElement = null
      return
    }
    try {
      detachMediaAudioListeners(boundAudioElement, audioHandlers)
    } catch {
      // Audio API pode não existir em SSR
    }
    audioHandlers = null
    boundAudioElement = null
  }

  function bindAudio() {
    unbindAudio()
    const audio = getMediaAudioElement()
    boundAudioElement = audio

    audioHandlers = {
      onTimeUpdate: () => {
        currentTimeSec.value = audio.currentTime
        const times = session.value?.slideTimesSec ?? []
        if (times.length > 0 && hasAudio.value) {
          const nextIndex = resolveSlideIndexForTime(times, audio.currentTime)
          if (nextIndex !== slideIndex.value) {
            slideIndex.value = nextIndex
            void refreshResolvedSlideImage()
            return
          }
        }
        if (!isProjecting.value) return
        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (now - lastRuntimePublishAt < RUNTIME_PUBLISH_MIN_MS) return
        lastRuntimePublishAt = now
        publishProjectionState()
      },
      onLoadedMetadata: () => {
        durationSec.value = Number.isFinite(audio.duration) ? audio.duration : 0
      },
      onPlay: () => {
        status.value = 'playing'
      },
      onPause: () => {
        if (status.value === 'loading') return
        status.value = session.value ? 'paused' : 'idle'
      },
      onEnded: () => {
        // Fila (spec playlist RF-03): acabou a faixa, vem a próxima.
        const nextItem = resolveNext({ items: queue.value, index: queueIndex.value })
        if (nextItem) {
          // Desanexa já: open() demora (loadMediaTrack) e antes zerava a fila
          // com o listener ainda ativo — 2º ended via stop/load chamava close().
          unbindAudio()
          void playQueueItem(nextItem)
          return
        }
        status.value = 'paused'
        currentTimeSec.value = durationSec.value
        close()
      },
      onError: () => {
        status.value = 'error'
        lastErrorKey.value = 'media.messages.playbackFailed'
      },
    }

    attachMediaAudioListeners(audio, audioHandlers)
  }

  function pickSourceUrl(
    mode: MediaPlaybackMode,
    audioUrl: string | null,
    instrumentalUrl: string | null,
  ): string | null {
    /* v8 ignore next 1 -- ambos os call sites (open e switchMode) retornam cedo para no_audio antes de chamar pickSourceUrl */
    if (mode === 'no_audio') return null
    if (mode === 'instrumental') return instrumentalUrl ?? audioUrl
    return audioUrl ?? instrumentalUrl
  }

  async function open(params: MediaOpenParams): Promise<MediaOpenResult> {
    const musicId = params.musicId
    if (!Number.isFinite(musicId) || musicId <= 0) {
      return { ok: false, messageKey: 'media.messages.trackMissing' }
    }

    const requestedMode: MediaPlaybackMode = params.mode ?? 'audio'

    // Música avulsa (fora da fila): zera a fila. Avanço automático mantém estado.
    if (!params.keepQueue) {
      queue.value = []
      queueIndex.value = -1
    }

    // Mesma faixa: troca de modo sem reset (legado Media.open + isSameSong).
    if (session.value?.musicId === musicId) {
      minimized.value = params.minimized ?? minimized.value
      if (session.value.mode === requestedMode) {
        // Reabrir o mesmo modo: garante volume audível e retomada.
        if (requestedMode !== 'no_audio' && session.value.audioUrl) {
          try {
            const audio = getMediaAudioElement()
            if (audio.volume <= 0) {
              audio.volume = volume.value
            }
            if (audio.paused) {
              const played = await playMediaAudio(audio)
              status.value = played ? 'playing' : 'paused'
            } else {
              status.value = 'playing'
            }
          } catch {
            // ignore
          }
        }
        if (params.project !== false) {
          await startProjection()
        }
        return { ok: true }
      }

      const result = await switchMode(requestedMode)
      if (params.project !== false) {
        await startProjection()
      }
      return result
    }

    status.value = 'loading'
    lastErrorKey.value = null

    // Dispatcher custom vs oficial (mesmo contrato do web): id >= 1M é
    // música custom de Minhas Coletâneas.
    const track = isCustomMusicId(musicId)
      ? await loadCustomMusicTrack(fromCustomMusicId(musicId))
      : await loadMediaTrack(musicId)
    if (!track) {
      status.value = 'error'
      lastErrorKey.value = 'media.messages.trackMissing'
      return { ok: false, messageKey: 'media.messages.trackMissing' }
    }

    let mode: MediaPlaybackMode = requestedMode
    let playbackUrl = ''
    let warningKey: string | undefined

    if (mode !== 'no_audio') {
      const catalogAudio = pickSourceUrl(mode, track.audioUrl, track.instrumentalUrl)
      // Sem cópia local: baixa PRIMEIRO (progresso no player) e toca ao fim.
      const ready = await ensureTrackDownloaded(musicId)
      if (!ready) return { ok: false, messageKey: 'media.messages.playbackFailed' }
      const resolved = await resolveMusicAudioUrl(catalogAudio)
      if (resolved.ok) {
        playbackUrl = resolved.url
      } else {
        // Sem path de áudio no catálogo: segue só com slides.
        mode = 'no_audio'
        warningKey = 'media.messages.slidesOnlyNoAudio'
      }
    }

    const slides = buildMediaSlides(track)
    const slideTimesSec = buildSlideTimesSec(slides, mode)
    const albumId = params.albumId ?? null
    const subtitle = resolveAlbumSubtitle(track, albumId)

    unbindAudio()
    try {
      stopAllMediaAudio()
    } catch {
      // ignore
    }

    session.value = {
      musicId,
      albumId,
      mode,
      title: track.name,
      subtitle,
      coverUrl: track.coverUrl,
      audioUrl: playbackUrl,
      hasInstrumental: Boolean(track.instrumentalUrl?.trim()),
      slides,
      slideTimesSec,
    }

    showPlaylist.value = true
    slideIndex.value = 0
    currentTimeSec.value = 0
    durationSec.value = 0
    minimized.value =
      params.minimized ?? loadProjectionSettings().autoMinimizePlayer === true

    if (playbackUrl) {
      bindAudio()
      const audio = getMediaAudioElement()
      audio.volume = volume.value
      audio.src = playbackUrl
      audio.load()
      const played = await playMediaAudio(audio)
      status.value = played ? 'playing' : 'paused'
      if (!played) {
        warningKey = warningKey ?? 'media.messages.playbackFailed'
      }
    } else {
      status.value = 'ready'
    }

    await refreshResolvedSlideImage()
    void maybeStartOndemandDownload(musicId)

    // Hino tocando = PROJETANDO, sempre (decisão Rafael 27/08): destino vem
    // do seletor na biblioteca (Espelhar/TV individual). Antes: minimizado
    // não projetava — operador tinha que clicar Projetar a cada hino.
    if (params.project !== false) {
      const retainProjection = params.keepQueue && isProjecting.value
      if (retainProjection) {
        // Fila: janela já está aberta — não chamar startProjection de novo
        // (window.open sem gesto do usuário falha e zera isProjecting).
        isProjecting.value = true
        publishProjectionState()
        if (!projectionWatchTimer) startProjectionWatch()
      } else {
        await startProjection()
      }
    }

    return { ok: true, warningKey }
  }

  async function play(): Promise<void> {
    if (!session.value?.audioUrl) return
    const seq = ++playPauseSeq
    const audio = getMediaAudioElement()

    // Modo TV: áudio local fica MUTED, mas toca como relógio da letra.
    // Sem esse clock, timeupdate não dispara e os slides atrasam/congelam.
    if (audioOnTv.value) {
      audio.volume = 0
      const played = await playMediaAudio(audio)
      if (seq !== playPauseSeq) return
      status.value = played ? 'playing' : 'paused'
      return
    }

    // Sem áudio: retoma o fluxo mudo, sem fade audível.
    if (session.value.mode === 'no_audio') {
      audio.volume = 0
      const played = await playMediaAudio(audio)
      if (seq !== playPauseSeq) return
      status.value = played ? 'playing' : 'paused'
      return
    }

    const played = await fadeInMediaAudio(audio, volume.value)
    if (seq !== playPauseSeq) return
    status.value = played ? 'playing' : 'paused'
  }

  async function pause(): Promise<void> {
    if (!session.value?.audioUrl) return
    const seq = ++playPauseSeq
    const audio = getMediaAudioElement()
    status.value = 'paused'

    // Modo TV: status acima sinaliza a TV; o elemento local também pausa
    // (pode estar tocando se o open() rodou antes da rota mudar, ex.:
    // localStorage 'tv' + abertura de faixa nova).
    if (audioOnTv.value) {
      pauseMediaAudio(audio)
      return
    }

    // Sem áudio / já mudo: pausa direta.
    if (session.value.mode === 'no_audio' || audio.volume <= 0) {
      pauseMediaAudio(audio)
      return
    }

    await fadeVolumeMediaAudio(audio, 0)
    if (seq !== playPauseSeq) return
    pauseMediaAudio(audio)
  }

  async function togglePlay(): Promise<void> {
    if (isPlaying.value) await pause()
    else await play()
  }

  /**
   * Rota de áudio PC ↔ TV ↔ Ambos (paridade APK routesToTv).
   * 'pc'   → espelho padrão: PC toca, TV sincronizada junto (ambos soam)
   * 'tv'   → player local pausa/silencia; a TV é a caixa
   * 'both' → idem 'pc' (alias explícito; a TV é 2ª caixa sincronizada)
   * O envio à TV é feito pela palco-bridge; projeção via cabo NÃO é afetada.
   */
  type AudioRoute = 'pc' | 'tv' | 'both'
  const savedRoute = localStorage.getItem('louvorja-audio-route')
  const audioRoute = ref<AudioRoute>(savedRoute === 'tv' || savedRoute === 'both' ? savedRoute : 'pc')

  function persistRoute() {
    try { localStorage.setItem('louvorja-audio-route', audioRoute.value) } catch { /* ignore */ }
  }

  /** Compat: consumers legados tratam como boolean (tv ou não). */
  const audioOnTv = computed(() => audioRoute.value === 'tv')

  async function setAudioRoute(route: AudioRoute): Promise<void> {
    if (audioRoute.value === route) return
    const wasTv = audioRoute.value === 'tv'
    audioRoute.value = route
    persistRoute()
    if (route === 'tv') {
      // TV recebe o som; local continua muted como clock de letras/slides.
      const audio = getMediaAudioElement()
      audio.volume = 0
      // Se já tocava no PC, preserva a timeline; a bridge espelha na TV.
      status.value = audio.paused ? 'paused' : 'playing'
    } else if (wasTv) {
      // saiu do modo TV → local retoma de onde parou
      await play()
    }
  }

  async function setAudioOnTv(on: boolean): Promise<void> {
    await setAudioRoute(on ? 'tv' : 'pc')
  }

  function seekTo(seconds: number): void {
    if (!session.value?.audioUrl) return
    const audio = getMediaAudioElement()
    const clamped = Math.min(
      Math.max(0, seconds),
      Number.isFinite(audio.duration) ? audio.duration : seconds,
    )
    audio.currentTime = clamped
    currentTimeSec.value = clamped
  }

  function seekRatio(ratio: number): void {
    if (durationSec.value <= 0) return
    seekTo(durationSec.value * Math.min(1, Math.max(0, ratio)))
  }

  async function goToSlide(index: number): Promise<void> {
    const slides = session.value?.slides ?? []
    if (slides.length === 0) return

    const next = Math.min(Math.max(0, index), slides.length - 1)
    slideIndex.value = next

    /* v8 ignore next 1 -- session null já retornou no guard de slides; slideTimesSec é sempre array quando session existe */
    const times = session.value?.slideTimesSec ?? []
    if (hasAudio.value && times.length > next) {
      seekTo(times[next] ?? 0)
    }

    await refreshResolvedSlideImage()
  }

  // ===== Fila (spec playlist RF-03) =====

  /** Toca um item da fila pelo fluxo completo (open → auto-projeção). */
  async function playQueueItem(item: QueueItem, mode?: MediaPlaybackMode): Promise<void> {
    const target = mode ?? session.value?.mode ?? 'audio'
    const keepProjecting = isProjecting.value
    if (keepProjecting) {
      queueAdvanceInProgress += 1
    }
    try {
      await open({
        musicId: item.musicId,
        mode: target,
        albumId: item.albumId,
        // undefined = contrato 27/08; keepQueue + isProjecting evita reabrir janela
        project: undefined,
        keepQueue: true,
      })
      queueIndex.value = queue.value.findIndex((q) => q.musicId === item.musicId)
      if (keepProjecting) {
        isProjecting.value = true
      }
      publishProjectionState()
    } finally {
      if (keepProjecting) {
        queueAdvanceInProgress = Math.max(0, queueAdvanceInProgress - 1)
      }
    }
  }

  /** Substitui a fila e toca a partir de startIndex. */
  async function playQueue(items: QueueItem[], startIndex = 0, mode?: MediaPlaybackMode): Promise<void> {
    queue.value = items
    const first = items[startIndex]
    if (!first) return
    await playQueueItem(first, mode)
  }

  /** Fila inteira de um álbum (ordenada por track — caller já ordena). */
  async function playAlbumQueue(
    items: Array<{ musicId: number; albumId: number | null; title: string }>,
    mode?: MediaPlaybackMode,
  ): Promise<void> {
    await playQueue(items, 0, mode)
  }

  function nextTrack(): void {
    const item = resolveNext({ items: queue.value, index: queueIndex.value })
    if (item) void playQueueItem(item)
  }

  function jumpToQueue(index: number): void {
    const item = queue.value[index]
    if (item) void playQueueItem(item)
  }

  function previousTrack(): void {
    const item = resolvePrevious({ items: queue.value, index: queueIndex.value })
    if (item) void playQueueItem(item)
  }

  function clearQueue(): void {
    queue.value = []
    queueIndex.value = -1
  }

  /** Há fila ativa? (UI: next/prev do player = faixa; sem fila = slides) */
  function hasQueue(): boolean {
    return queue.value.length > 1
  }

  async function nextSlide(): Promise<void> {
    await goToSlide(slideIndex.value + 1)
  }

  async function previousSlide(): Promise<void> {
    await goToSlide(slideIndex.value - 1)
  }

  function setVolume(value: number): void {
    volume.value = Math.min(1, Math.max(0, value))
    // Em Sem áudio o elemento permanece mudo; só guarda a preferência.
    if (session.value?.mode === 'no_audio') return
    try {
      getMediaAudioElement().volume = volume.value
    } catch {
      // ignore
    }
  }

  function minimize(): void {
    minimized.value = true
  }

  function maximize(): void {
    minimized.value = false
  }

  function togglePlaylist(): void {
    showPlaylist.value = !showPlaylist.value
  }

  function setPlaylistOpen(value: boolean): void {
    showPlaylist.value = value
  }

  function requestClose(): void {
    closeConfirmOpen.value = true
  }

  function cancelClose(): void {
    closeConfirmOpen.value = false
  }

  async function switchMode(mode: MediaPlaybackMode): Promise<MediaOpenResult> {
    if (!session.value) {
      return { ok: false, messageKey: 'media.messages.trackMissing' }
    }
    if (session.value.mode === mode) return { ok: true }

    const current = session.value
    const wasPlaying = status.value === 'playing'
    const savedSlide = slideIndex.value

    let savedTime = currentTimeSec.value
    if (current.audioUrl) {
      try {
        const live = getMediaAudioElement().currentTime
        if (Number.isFinite(live)) savedTime = live
      } catch {
        // ignore
      }
    } else {
      savedTime = current.slideTimesSec[savedSlide] ?? 0
    }

    status.value = 'loading'
    lastErrorKey.value = null

    const track = isCustomMusicId(current.musicId)
      ? await loadCustomMusicTrack(fromCustomMusicId(current.musicId))
      : await loadMediaTrack(current.musicId)
    if (!track) {
      status.value = 'error'
      lastErrorKey.value = 'media.messages.trackMissing'
      return { ok: false, messageKey: 'media.messages.trackMissing' }
    }

    const hasInstrumental = Boolean(track.instrumentalUrl?.trim())

    // Sem áudio: só silencia (fade) e mantém o fluxo de tempo/slides.
    if (mode === 'no_audio') {
      const slideTimesSec = buildSlideTimesSec(current.slides, 'no_audio')
      session.value = {
        ...current,
        mode: 'no_audio',
        audioUrl: current.audioUrl,
        hasInstrumental,
        slideTimesSec,
      }

      if (current.audioUrl) {
        try {
          const audio = getMediaAudioElement()
          if (audio.volume > 0) {
            await fadeVolumeMediaAudio(audio, 0)
          } else {
            audio.volume = 0
          }
          status.value = audio.paused ? 'paused' : 'playing'
        } catch {
          status.value = wasPlaying ? 'playing' : 'paused'
        }
      } else {
        currentTimeSec.value = savedTime
        durationSec.value = 0
        slideIndex.value = savedSlide
        status.value = 'ready'
      }

      await refreshResolvedSlideImage()
      publishProjectionState()
      return { ok: true }
    }

    let nextMode: MediaPlaybackMode = mode
    let playbackUrl = ''
    let warningKey: string | undefined

    const catalogAudio = pickSourceUrl(nextMode, track.audioUrl, track.instrumentalUrl)
    const resolved = await resolveMusicAudioUrl(catalogAudio)
    if (resolved.ok) {
      playbackUrl = resolved.url
    } else {
      nextMode = 'no_audio'
      warningKey = 'media.messages.slidesOnlyNoAudio'
    }

    const slideTimesSec = buildSlideTimesSec(current.slides, nextMode)

    // Mesma fonte já carregada (ex.: sair de Sem áudio): só restaura o volume.
    if (
      playbackUrl &&
      current.audioUrl === playbackUrl &&
      current.mode === 'no_audio'
    ) {
      session.value = {
        ...current,
        mode: nextMode,
        audioUrl: playbackUrl,
        hasInstrumental,
        slideTimesSec,
      }

      try {
        const audio = getMediaAudioElement()
        const shouldPlay = wasPlaying || !audio.paused
        if (shouldPlay) {
          if (audio.paused) {
            const played = await fadeInMediaAudio(audio, volume.value)
            status.value = played ? 'playing' : 'paused'
            if (!played) {
              warningKey = warningKey ?? 'media.messages.playbackFailed'
            }
          } else {
            await fadeVolumeMediaAudio(audio, volume.value)
            status.value = 'playing'
          }
        } else {
          audio.volume = volume.value
          status.value = 'paused'
        }
      } catch {
        status.value = wasPlaying ? 'playing' : 'paused'
      }

      await refreshResolvedSlideImage()
      publishProjectionState()
      return { ok: true, warningKey }
    }

    session.value = {
      ...current,
      mode: nextMode,
      audioUrl: playbackUrl,
      hasInstrumental,
      slideTimesSec,
    }

    if (playbackUrl) {
      if (current.audioUrl) {
        try {
          const outgoing = getMediaAudioElement()
          unbindAudio()
          if (wasPlaying && !outgoing.paused && outgoing.volume > 0) {
            // Crossfade legado: fade-out no elemento atual enquanto o outro carrega.
            void fadeOutMediaAudio(outgoing)
          } else if (!outgoing.paused && outgoing.volume <= 0) {
            // Já estava silenciado (Sem áudio): só pausa o elemento antigo.
            pauseMediaAudio(outgoing)
          } else {
            pauseMediaAudio(outgoing)
          }
          switchMediaAudioElement()
        } catch {
          // ignore
        }
      }

      bindAudio()
      const audio = getMediaAudioElement()
      audio.volume = wasPlaying ? 0 : volume.value
      audio.src = playbackUrl
      audio.load()

      await new Promise<void>((resolve) => {
        if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve()
          return
        }
        const done = () => resolve()
        audio.addEventListener('loadedmetadata', done, { once: true })
        audio.addEventListener('error', done, { once: true })
      })

      durationSec.value = Number.isFinite(audio.duration) ? audio.duration : 0
      const clamped = Math.min(
        Math.max(0, savedTime),
        durationSec.value > 0 ? durationSec.value : savedTime,
      )
      audio.currentTime = clamped
      currentTimeSec.value = clamped
      slideIndex.value = resolveSlideIndexForTime(slideTimesSec, clamped)

      if (wasPlaying) {
        const played = await fadeInMediaAudio(audio, volume.value)
        status.value = played ? 'playing' : 'paused'
        if (!played) {
          audio.volume = volume.value
          warningKey = warningKey ?? 'media.messages.playbackFailed'
        }
      } else {
        audio.volume = volume.value
        status.value = 'paused'
      }
    } else {
      unbindAudio()
      try {
        const audio = getMediaAudioElement()
        if (wasPlaying && !audio.paused && audio.volume > 0) {
          await fadeVolumeMediaAudio(audio, 0)
        }
        stopAllMediaAudio()
      } catch {
        // ignore
      }
      currentTimeSec.value = savedTime
      durationSec.value = 0
      slideIndex.value = savedSlide
      status.value = 'ready'
    }

    await refreshResolvedSlideImage()
    publishProjectionState()
    void maybeStartOndemandDownload(current.musicId)

    return { ok: true, warningKey }
  }

  /** TVs Palco vivas (receiver conectado) — contam como tela ativa. */
  async function hasLivePalcoTvs(): Promise<boolean> {
    try {
      const slots = await palcoSession.slots()
      return slots.some((s) => s.running && s.clients > 0)
    } catch {
      return false
    }
  }

  async function startProjection(): Promise<boolean> {
    if (!session.value) return false

    // Ocultar conteúdo deixa as janelas abertas com runtime inativo.
    // Reprojetar só republica o slide — reabrir chama closeUrl e fecha tudo.
    const windowsOpen = isProjectionModuleOpen('media')
    if (windowsOpen || projectingTvsOnly.value) {
      isProjecting.value = true
      if (windowsOpen) projectingTvsOnly.value = false
      startProjectionWatch()
      publishProjectionState()
      return true
    }

    // Sem NENHUM destino (sem monitor estendido e sem TV Palco conectada)
    // a projeção não liga — não há pra onde projetar. TV viva = tela ativa
    // (decisão Rafael/Elias 27/08: mecanismo ligava só com múltiplas telas
    // FÍSICAS; TVs WS agora entram na conta).
    const hasTvs = await hasLivePalcoTvs()
    // Rota individual de TV (spec multi-telas): só TV, sem janela no cabo
    // — paridade com Bíblia/Sorteio. Espelhar mantém cabo + TVs.
    if (isPalcoTvOnlyRoute('hymns')) {
      const settings = loadProjectionSettings()
      const returnOnly =
        settings.openReturnScreen && settings.returnDisplayId != null
          ? [settings.returnDisplayId]
          : []
      await openProjectionModule('media', returnOnly)
      isProjecting.value = true
      projectingTvsOnly.value = true
      startProjectionWatch()
      publishProjectionState()
      return true
    }
    const opened = await openProjectionModule('media')
    if (opened) {
      projectingTvsOnly.value = false
    } else if (hasTvs) {
      // Sem monitor cabeado mas COM TVs Palco vivas: a projeção segue nas
      // TVs (espelho da bridge). projectingTvsOnly segura o watch 400ms.
      projectingTvsOnly.value = true
    } else {
      // Nenhum destino: não liga.
      isProjecting.value = false
      stopProjectionWatch()
      publishProjectionState()
      return false
    }
    isProjecting.value = true
    startProjectionWatch()
    publishProjectionState()
    return true
  }

  function clearProjection(): void {
    isProjecting.value = false
    stopProjectionWatch()
    publishProjectionState()
  }

  async function toggleProjection(): Promise<void> {
    if (isProjecting.value) {
      clearProjection()
      return
    }
    await startProjection()
  }

  function close(): void {
    if (queueAdvanceInProgress > 0) return

    closeConfirmOpen.value = false
    cancelOndemandDownload()
    unbindAudio()
    try {
      stopAllMediaAudio()
    } catch {
      // ignore
    }

    const shouldCloseCableWindow = isProjectionModuleOpen('media')

    if (isProjecting.value) {
      clearProjection()
    } else {
      clearMediaRuntime()
    }

    // Fim da faixa / fechar player: clearProjection só limpa o runtime;
    // a janela cabeada precisa fechar de verdade (paridade clock/bíblia).
    if (shouldCloseCableWindow) {
      closeProjectionModule()
    }

    session.value = null
    status.value = 'idle'
    lastErrorKey.value = null
    slideIndex.value = 0
    currentTimeSec.value = 0
    durationSec.value = 0
    resolvedSlideImageUrl.value = null
    minimized.value = true
    showPlaylist.value = true
  }

  function clearError(): void {
    lastErrorKey.value = null
  }

  function syncProjectionFlag(): void {
    // Modo só-TVs NÃO tem janela cabeada — isProjectionModuleOpen é false
    // por definição e matava a projeção que o startProjection acabou de
    // ligar (bug real 27/08: hino ligava e syncProjectionFlag desligava
    // em seguida; stack do log apontou exatamente aqui).
    if (projectingTvsOnly.value) {
      publishProjectionState()
      return
    }
    isProjecting.value = isProjectionModuleOpen('media')
    if (isProjecting.value) startProjectionWatch()
    publishProjectionState()
  }

  const hasInstrumental = computed(
    () => Boolean(session.value?.hasInstrumental),
  )
  const playbackMode = computed(() => session.value?.mode ?? 'audio')

  return {
    session,
    status,
    lastErrorKey,
    minimized,
    isProjecting,
    showPlaylist,
    closeConfirmOpen,
    slideIndex,
    currentTimeSec,
    durationSec,
    volume,
    resolvedSlideImageUrl,
    ondemandDownloadPercent,
    preplayDownloadMusicId,
    ondemandNoticeVisible,
    ondemandDownloadDone,
    hasSession,
    isPlaying,
    isPaused,
    hasAudio,
    hasInstrumental,
    playbackMode,
    currentSlide,
    previewSnippet,
    previewReference,
    progressRatio,
    slideProgressRatio,
    currentTimeLabel,
    durationLabel,
    slideCount,
    open,
    play,
    pause,
    togglePlay,
    audioOnTv,
    audioRoute,
    setAudioRoute,
    setAudioOnTv,
    seekTo,
    seekRatio,
    goToSlide,
    nextSlide,
    previousSlide,
    queue,
    queueIndex,
    playQueue,
    playAlbumQueue,
    playQueueItem,
    nextTrack,
    jumpToQueue,
    previousTrack,
    clearQueue,
    hasQueue,
    setVolume,
    minimize,
    maximize,
    togglePlaylist,
    setPlaylistOpen,
    requestClose,
    cancelClose,
    switchMode,
    startProjection,
    clearProjection,
    toggleProjection,
    close,
    clearError,
    syncProjectionFlag,
    publishProjectionState,
  }
})
