import type { MediaProjectionRuntime } from '../types/media'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'

export const MEDIA_RUNTIME_CHANNEL = 'louvorja-media-runtime'
export const MEDIA_RUNTIME_STORAGE_KEY = 'louvorja-media-runtime-state'

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asRatio(value: unknown, fallback: number): number {
  const n = asNumber(value, fallback)
  return Math.min(1, Math.max(0, n))
}

export function normalizeMediaRuntime(raw: unknown): MediaProjectionRuntime {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MEDIA_PROJECTION }
  }

  const source = raw as Record<string, unknown>
  return {
    active: source.active === true,
    title: asString(source.title, ''),
    subtitle: asString(source.subtitle, ''),
    lyric: asString(source.lyric, ''),
    imageUrl: asNullableString(source.imageUrl),
    imagePosition: asNullableString(source.imagePosition),
    frameDataUrl: asNullableString(source.frameDataUrl),
    isCover: source.isCover === true,
    slideIndex: asNumber(source.slideIndex, 0),
    slideCount: asNumber(source.slideCount, 0),
    nextLyric: asString(source.nextLyric, ''),
    nextIsCover: source.nextIsCover === true,
    progressRatio: asRatio(source.progressRatio, 0),
    slideProgressRatio: asRatio(source.slideProgressRatio, 0),
  }
}

export function readMediaRuntimeFromStorage(): MediaProjectionRuntime {
  try {
    const raw = localStorage.getItem(MEDIA_RUNTIME_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MEDIA_PROJECTION }
    return normalizeMediaRuntime(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_MEDIA_PROJECTION }
  }
}

export function writeMediaRuntimeToStorage(state: MediaProjectionRuntime): void {
  try {
    localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pode falhar em contextos restritos
  }
}

export function publishMediaRuntime(state: MediaProjectionRuntime): void {
  writeMediaRuntimeToStorage(state)

  try {
    const channel = new BroadcastChannel(MEDIA_RUNTIME_CHANNEL)
    channel.postMessage(state)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }
}

export function clearMediaRuntime(): void {
  publishMediaRuntime({ ...DEFAULT_MEDIA_PROJECTION })
}
