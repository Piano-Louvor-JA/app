import { resolveMediaUrl } from '@shared/services/workspace-api'

import { readCarouselRuntime } from './carousel-runtime'

/** O que as conexões remotas (OBS) recebem: texto HTML simples ou a imagem como frame. */
export type CarouselObsInput = { text: string; frameDataUrl?: string }

/** O OBS é redesenhado a cada segundo: a mesma imagem não é lida de novo. */
const FRAME_CACHE_LIMIT = 24
const frameCache = new Map<string, string>()

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Título e texto do slide, uma linha por `<br>`, sem formatação (o palco aplica a aparência da Liturgia). */
export function carouselTextHtml(title: string, text: string): string {
  return [title, ...text.split('\n')]
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>')
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Imagem do workspace como data URL (o palco serve o frame para a OBS). Null se não abrir. */
export async function carouselFrameDataUrl(relativePath: string): Promise<string | null> {
  const cached = frameCache.get(relativePath)
  if (cached) return cached
  try {
    const response = await fetch(resolveMediaUrl(relativePath))
    if (!response.ok) return null
    const dataUrl = await readAsDataUrl(await response.blob())
    if (!dataUrl.startsWith('data:image/')) return null
    if (frameCache.size >= FRAME_CACHE_LIMIT) frameCache.delete(frameCache.keys().next().value!)
    frameCache.set(relativePath, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

/** Slide atual do carrossel para uma conexão remota; parado ou imagem ilegível = tela vazia. */
export async function carouselObsInput(): Promise<CarouselObsInput> {
  const runtime = readCarouselRuntime()
  if (!runtime.active) return { text: '' }
  if (runtime.kind === 'text') return { text: carouselTextHtml(runtime.title, runtime.text) }
  const frame = await carouselFrameDataUrl(runtime.relativePath)
  return frame ? { text: '', frameDataUrl: frame } : { text: '' }
}

/** Só para testes. */
export function clearCarouselFrameCache(): void {
  frameCache.clear()
}
