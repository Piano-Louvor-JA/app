import { getDesktopBridge, isDesktopApp } from '@shared/services/desktop-bridge'

export type MediaUrlResolveResult =
  | { ok: true; url: string; source: 'local' | 'remote' }
  | { ok: false; reason: 'missing' }

function toRelativeMediaPath(urlPath: string): string {
  return urlPath.replace(/^\/(musics|images|covers)\//, '')
}

/**
 * app#331: URLs autocontidas (data: do áudio local base64, blob: de mídia
 * local) são usadas NA ÍNTEGRA — prefixar base da API produz src inválido
 * (`https://api.../file/data:audio/...`) com NotSupportedError silencioso.
 */
function isSelfContainedUrl(urlPath: string): boolean {
  return /^(data|blob):/i.test(urlPath)
}

export function resolveRemoteFileUrl(urlPath: string): string {
  // API oficial (14/09/2026): URLs absolutas (host Mayco ou R2) usadas na íntegra.
  if (/^https?:\/\//i.test(urlPath)) return urlPath
  const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
  const base = import.meta.env.VITE_URL_FILES ?? 'https://api.pianolouvorja.com.br/file'
  return `${base}/${cleanPath}`
}

/** Resolve URL de áudio (local no desktop; remoto no browser ou sob demanda). */
export async function resolveMusicAudioUrl(
  catalogPath: string | null,
): Promise<MediaUrlResolveResult> {
  if (!catalogPath?.trim()) {
    return { ok: false, reason: 'missing' }
  }

  // app#331: data:/blob: passam ANTES de qualquer branch (web e desktop).
  if (isSelfContainedUrl(catalogPath)) {
    return { ok: true, url: catalogPath, source: 'local' }
  }

  if (isDesktopApp()) {
    const bridge = getDesktopBridge()
    if (!bridge) return { ok: false, reason: 'missing' }

    const relative = toRelativeMediaPath(catalogPath)
    const local = await bridge.media.check('music', relative)
    if (local) return { ok: true, url: local, source: 'local' }
    // Ainda não baixada: stream da API (como na web) enquanto baixa em background.
    return { ok: true, url: resolveRemoteFileUrl(catalogPath), source: 'remote' }
  }

  return { ok: true, url: resolveRemoteFileUrl(catalogPath), source: 'remote' }
}

/** Resolve URL de imagem de slide/capa (local, ou remoto sob demanda). */
export async function resolveSlideImageUrl(
  catalogPath: string | null,
): Promise<string | null> {
  if (!catalogPath?.trim()) return null

  if (isDesktopApp()) {
    const bridge = getDesktopBridge()
    if (!bridge) return null

    const relative = toRelativeMediaPath(catalogPath)
    const local = await bridge.media.check('slides', relative)
    if (local) return local

    const cover = await bridge.media.check('covers', relative)
    if (cover) return cover

    return resolveRemoteFileUrl(catalogPath)
  }

  return resolveRemoteFileUrl(catalogPath)
}

/** Dual pool A/B como no legado — permite fade-out no ativo enquanto o outro carrega. */
type MediaAudioSlot = 'a' | 'b'

const MEDIA_FADE_MS = 1000
const MEDIA_FADE_STEP_MS = 50

let activeSlot: MediaAudioSlot = 'a'
let audioA: HTMLAudioElement | null = null
let audioB: HTMLAudioElement | null = null
const fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>()
const fadeResolvers = new WeakMap<HTMLAudioElement, () => void>()

function ensureSlotAudio(slot: MediaAudioSlot): HTMLAudioElement {
  if (typeof Audio === 'undefined') {
    throw new Error('Audio API unavailable')
  }
  if (slot === 'a') {
    if (!audioA) {
      audioA = new Audio()
      audioA.preload = 'auto'
    }
    return audioA
  }
  if (!audioB) {
    audioB = new Audio()
    audioB.preload = 'auto'
  }
  return audioB
}

export function getMediaAudioElement(): HTMLAudioElement {
  return ensureSlotAudio(activeSlot)
}

/** Alterna o elemento ativo (legado `switchActiveElement`). */
export function switchMediaAudioElement(): HTMLAudioElement {
  activeSlot = activeSlot === 'a' ? 'b' : 'a'
  return ensureSlotAudio(activeSlot)
}

function clearMediaAudioFade(audio: HTMLAudioElement): void {
  const timer = fadeTimers.get(audio)
  if (timer != null) {
    clearInterval(timer)
    fadeTimers.delete(audio)
  }
  const resolve = fadeResolvers.get(audio)
  if (resolve) {
    fadeResolvers.delete(audio)
    resolve()
  }
}

/** Interpola o volume sem pausar a reprodução. */
export async function fadeVolumeMediaAudio(
  audio: HTMLAudioElement,
  targetVolume: number,
  durationMs = MEDIA_FADE_MS,
): Promise<void> {
  clearMediaAudioFade(audio)
  const goal = Math.min(1, Math.max(0, targetVolume))
  const startVolume = audio.volume
  if (Math.abs(startVolume - goal) < 0.001) {
    audio.volume = goal
    return
  }

  return new Promise((resolve) => {
    const steps = Math.max(1, durationMs / MEDIA_FADE_STEP_MS)
    const step = (goal - startVolume) / steps
    const finish = () => {
      const timer = fadeTimers.get(audio)
      if (timer != null) {
        clearInterval(timer)
        fadeTimers.delete(audio)
      }
      fadeResolvers.delete(audio)
      resolve()
    }
    fadeResolvers.set(audio, finish)
    const interval = setInterval(() => {
      const next = audio.volume + step
      const reached =
        (step >= 0 && next >= goal) || (step < 0 && next <= goal)
      if (!reached) {
        audio.volume = next
        return
      }
      audio.volume = goal
      finish()
    }, MEDIA_FADE_STEP_MS)
    fadeTimers.set(audio, interval)
  })
}

/** Fade-out suave (~1s) e pausa, como no legado. */
export async function fadeOutMediaAudio(
  audio: HTMLAudioElement,
  durationMs = MEDIA_FADE_MS,
): Promise<void> {
  if (audio.paused || audio.volume <= 0) {
    audio.volume = 0
    audio.pause()
    return
  }
  await fadeVolumeMediaAudio(audio, 0, durationMs)
  // Se outro fade/play cancelou o mute, não pausar.
  if (audio.volume > 0.01) return
  audio.pause()
}

/** Fade-in suave (~1s) a partir do silêncio, como no legado. */
export async function fadeInMediaAudio(
  audio: HTMLAudioElement,
  targetVolume: number,
  durationMs = MEDIA_FADE_MS,
): Promise<boolean> {
  clearMediaAudioFade(audio)
  const goal = Math.min(1, Math.max(0, targetVolume))
  audio.volume = 0
  const played = await playMediaAudio(audio)
  if (!played || goal <= 0) {
    audio.volume = goal
    return played
  }
  await fadeVolumeMediaAudio(audio, goal, durationMs)
  return true
}

export function stopAllMediaAudio(): void {
  for (const slot of ['a', 'b'] as const) {
    const el = slot === 'a' ? audioA : audioB
    if (!el) continue
    clearMediaAudioFade(el)
    stopMediaAudio(el)
  }
  activeSlot = 'a'
}

export function detachMediaAudioListeners(
  audio: HTMLAudioElement,
  handlers: {
    onTimeUpdate?: () => void
    onLoadedMetadata?: () => void
    onPlay?: () => void
    onPause?: () => void
    onEnded?: () => void
    onError?: () => void
  },
) {
  if (handlers.onTimeUpdate) {
    audio.removeEventListener('timeupdate', handlers.onTimeUpdate)
  }
  if (handlers.onLoadedMetadata) {
    audio.removeEventListener('loadedmetadata', handlers.onLoadedMetadata)
  }
  if (handlers.onPlay) {
    audio.removeEventListener('play', handlers.onPlay)
  }
  if (handlers.onPause) {
    audio.removeEventListener('pause', handlers.onPause)
  }
  if (handlers.onEnded) {
    audio.removeEventListener('ended', handlers.onEnded)
  }
  if (handlers.onError) {
    audio.removeEventListener('error', handlers.onError)
  }
}

export function attachMediaAudioListeners(
  audio: HTMLAudioElement,
  handlers: {
    onTimeUpdate?: () => void
    onLoadedMetadata?: () => void
    onPlay?: () => void
    onPause?: () => void
    onEnded?: () => void
    onError?: () => void
  },
) {
  if (handlers.onTimeUpdate) {
    audio.addEventListener('timeupdate', handlers.onTimeUpdate)
  }
  if (handlers.onLoadedMetadata) {
    audio.addEventListener('loadedmetadata', handlers.onLoadedMetadata)
  }
  if (handlers.onPlay) {
    audio.addEventListener('play', handlers.onPlay)
  }
  if (handlers.onPause) {
    audio.addEventListener('pause', handlers.onPause)
  }
  if (handlers.onEnded) {
    audio.addEventListener('ended', handlers.onEnded)
  }
  if (handlers.onError) {
    audio.addEventListener('error', handlers.onError)
  }
}

export async function playMediaAudio(audio: HTMLAudioElement): Promise<boolean> {
  try {
    await audio.play()
    return true
  } catch {
    return false
  }
}

export function pauseMediaAudio(audio: HTMLAudioElement): void {
  audio.pause()
}

export function stopMediaAudio(audio: HTMLAudioElement): void {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

export function formatMediaClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
