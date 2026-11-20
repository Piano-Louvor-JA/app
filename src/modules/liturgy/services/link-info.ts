import type { SiteInfoApi, YoutubeInfoApi } from '@shared/types/desktop-bridge'

import type { LiturgyItemDraft } from '../types/liturgy'
import { parseLiturgyWebTarget } from './liturgy-web-runtime'

/** Dados do link colado no item: `source` é o canal do vídeo ou o nome do site. */
export type LinkInfo = {
  title: string
  source: string
  description: string
  durationMs: number
}

export type LinkInfoDeps = {
  fetch?: typeof fetch
  ytInfo?: YoutubeInfoApi | null
  siteInfo?: SiteInfoApi | null
}

const NOTES_EXCERPT_MAX = 300
function isLinkOrTagsLine(line: string): boolean {
  if (/^https?:\/\/\S+$/i.test(line)) return true
  return line.split(/\s+/).every((token) => token.startsWith('#') && token.length > 1)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function readOembed(endpoint: string, fetchFn: typeof fetch): Promise<LinkInfo | null> {
  try {
    const res = await fetchFn(endpoint)
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    const title = text(data.title)
    if (!title) return null
    const seconds = Number(data.duration)
    return {
      title,
      source: text(data.author_name),
      description: text(data.description),
      durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0,
    }
  } catch {
    return null
  }
}

/**
 * Título, canal, duração e descrição do vídeo do link (YouTube ou Vimeo). No desktop o YouTube vem da
 * página do vídeo (com duração e descrição); se falhar, o oEmbed traz só título e canal.
 */
export async function fetchOnlineVideoInfo(url: string, deps: LinkInfoDeps = {}): Promise<LinkInfo | null> {
  const target = parseLiturgyWebTarget(url)
  const fetchFn = deps.fetch ?? globalThis.fetch
  if (target?.kind === 'youtube') {
    const desktop = await deps.ytInfo?.get(target.videoId).catch(() => null)
    if (desktop?.title) {
      return { title: desktop.title, source: desktop.channel, description: desktop.description, durationMs: desktop.durationMs }
    }
    return readOembed(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(target.url)}&format=json`,
      fetchFn,
    )
  }
  if (target?.kind === 'vimeo') {
    return readOembed(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target.url)}`, fetchFn)
  }
  return null
}

/** Título, nome do site e descrição da página. Só no desktop: o navegador não lê páginas de outros sites. */
export async function fetchSiteLinkInfo(url: string, deps: LinkInfoDeps = {}): Promise<LinkInfo | null> {
  const target = parseLiturgyWebTarget(url)
  if (!target || !deps.siteInfo) return null
  const page = await deps.siteInfo.get(target.url).catch(() => null)
  if (!page?.title) return null
  return { title: page.title, source: page.siteName, description: page.description, durationMs: 0 }
}

/** Primeiras linhas da descrição, sem linhas que são só link ou hashtags. */
export function descriptionExcerpt(description: string, max = NOTES_EXCERPT_MAX): string {
  const joined = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isLinkOrTagsLine(line))
    .join('\n')
  if (joined.length <= max) return joined
  const cut = joined.slice(0, max - 1)
  const lastSpace = cut.search(/\s\S*$/)
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export function linkInfoNotes(info: LinkInfo, sourceLabel: (name: string) => string): string {
  const excerpt = descriptionExcerpt(info.description)
  const source = info.source && excerpt !== info.source ? sourceLabel(info.source) : ''
  return [source, excerpt].filter(Boolean).join('\n\n')
}

export type LinkAutoFill = { name: string; subtitle: string }

/**
 * Campos a preencher com os dados do link. Título e anotações só entram quando estão vazios ou ainda
 * com o que o próprio preenchimento automático pôs (link trocado); a duração conhecida sempre vale.
 */
export function linkInfoDraftPatch(
  draft: Pick<LiturgyItemDraft, 'name' | 'subtitle'>,
  info: LinkInfo,
  sourceLabel: (name: string) => string,
  autoFilled: LinkAutoFill = { name: '', subtitle: '' },
): Partial<LiturgyItemDraft> {
  const replaceable = (current: string, filled: string) => !current.trim() || (filled !== '' && current === filled)
  const next: Partial<LiturgyItemDraft> = {}
  if (replaceable(draft.name, autoFilled.name)) next.name = info.title
  const notes = linkInfoNotes(info, sourceLabel)
  if (notes && replaceable(draft.subtitle, autoFilled.subtitle)) next.subtitle = notes
  if (info.durationMs > 0) next.durationMs = info.durationMs
  return next
}
