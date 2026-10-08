import { useBibleStore } from '@modules/bible/stores/useBibleStore'
import { openMusicPlayer } from '@modules/media/services/open-music-player'
import type { MediaPlaybackMode } from '@modules/media/types/media'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { ExternalPlayerPreference } from '@shared/types/desktop-bridge'
import type { Router } from 'vue-router'

import type { LiturgyItem, LiturgyMusicMode } from '../types/liturgy'
import { INTERNAL_FILE_TYPES } from '../types/liturgy'
import { isExecutableItem } from './liturgy-item-helpers'
import { useScheduledStore } from '../stores/useScheduledStore'
import { activeDateISO } from './liturgy-preferences'
import { getLiturgyVideoObjectUrl } from './liturgy-local-video'
import {
  openLiturgyLocalImageControl,
  openLiturgyLocalPdfControl,
  openLiturgyLocalPresentationControl,
  openLiturgyLocalVideoControl,
  openLiturgySiteControl,
  openLiturgySiteOnScreens,
  openLiturgyVideoControl,
  playLiturgyLocalImageOnScreens,
  playLiturgyLocalPdfOnScreens,
  playLiturgyLocalPresentationOnScreens,
  playLiturgyLocalVideoOnScreens,
  playLiturgyWebOnConfiguredScreens,
} from './liturgy-web-projection'
export type LiturgyScheduledContent =
  | { kind: 'music'; musicId: number; musicMode?: LiturgyMusicMode }
  | { kind: 'file'; filePath: string }
  | { kind: 'verse'; verseBookId: number; verseChapter: number; verseNumbers?: string }
  | { kind: 'annotation'; text: string }
  | { kind: 'online_video'; url: string; name?: string }

export type LiturgyActionResult =
  | { ok: true; messageKey?: string; resolved?: LiturgyScheduledContent }
  | { ok: false; messageKey: string; resolved?: LiturgyScheduledContent }

/** ISO yyyy-mm-dd de hoje no fuso local (a data do culto é local, nunca UTC). */
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * app#331: id de música do item → namespace único de mídia.
 * - >= 1.000.000: música custom da API (Minhas Coletâneas / importações .slja logadas)
 * - negativo: música LOCAL (import .slja sem login — localStorage)
 * - positivo pequeno: hino oficial do catálogo
 * 0/NaN/null (sem música) → null.
 * scheduled também resolve (placeholder delega pro tipo música — PR #416).
 */
export function resolveMusicId(item: LiturgyItem): number | null {
  if (item.type !== 'music' && item.type !== 'scheduled') return null
  const musicId = Number(item.musicId)
  if (!Number.isFinite(musicId) || musicId === 0) return null
  return musicId
}

function resolveImagePaths(item: LiturgyItem): string[] {
  if (item.type !== 'images') return []
  if (item.filePaths && item.filePaths.length > 0) {
    return item.filePaths.map((entry) => entry.trim()).filter(Boolean)
  }
  const single = item.filePath?.trim()
  return single ? [single] : []
}

/**
 * Abre a música no player padrão — exatamente o mesmo contrato dos Álbuns.
 */
export async function openLiturgyMusicPlayer(
  item: LiturgyItem,
  mode: MediaPlaybackMode,
  options?: { project?: boolean },
): Promise<LiturgyActionResult> {
  const musicId = resolveMusicId(item)
  if (musicId == null) {
    return { ok: false, messageKey: 'liturgy.messages.catalogEmpty' }
  }

  const result = await openMusicPlayer({
    musicId,
    mode,
    project: options?.project,
  })

  if (!result.ok) {
    return { ok: false, messageKey: result.messageKey }
  }

  return { ok: true, messageKey: result.warningKey }
}

/** Abre música no player e projeta nas telas (fluxo legado do clique único). */
export async function openLiturgyMusicOnScreens(
  item: LiturgyItem,
): Promise<LiturgyActionResult> {
  return openLiturgyMusicPlayer(item, item.musicMode ?? 'audio', {
    project: true,
  })
}

/**
 * Placeholder `scheduled`: encontra a entrada da categoria cuja `date` == dataISO
 * e delega a execução ao tipo do conteúdo. Sem entrada → alerta claro, culto segue.
 */
async function executeScheduledRef(
  item: LiturgyItem,
  router: Router,
  dateISO: string,
): Promise<LiturgyActionResult> {
  // Rotação mora em scheduledRotationId (campo próprio). Fallback categoryId =
  // itens criados antes do campo existir (compat com estado já salvo).
  const categoryId =
    item.scheduledRotationId?.trim() || item.categoryId?.trim()
  if (!categoryId) {
    return { ok: false, messageKey: 'liturgy.messages.scheduledEmpty' }
  }

  const store = useScheduledStore()
  const entry = store.findOn(categoryId, dateISO)
  const content: LiturgyScheduledContent | null =
    (entry?.content as LiturgyScheduledContent | undefined) ??
    legacyContentFromFile(entry)

  if (!content) {
    return { ok: false, messageKey: 'liturgy.messages.scheduledEmpty' }
  }

  switch (content.kind) {
    case 'music': {
      const asMusic: LiturgyItem = {
        ...item,
        type: 'music',
        musicId: content.musicId,
        musicMode: content.musicMode ?? 'audio',
      }
      const result = await openLiturgyMusicOnScreens(asMusic)
      if (result.ok) {
        await router.push({ name: 'media' })
      }
      return { ...result, resolved: content }
    }
    case 'file': {
      // Assinaturas de projeção: (filePath, title) — retornam boolean, não ActionResult.
      if (!content.filePath) {
        return { ok: false, messageKey: 'liturgy.messages.scheduledEmpty' }
      }
      const filePath: string = content.filePath
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const title = entry?.name || item.name
      let opened: boolean
      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) {
        opened = await playLiturgyLocalImageOnScreens([filePath], title)
      } else if (ext === 'pdf') {
        opened = await playLiturgyLocalPdfOnScreens(filePath, title)
      } else if (['ppt', 'pptx'].includes(ext)) {
        opened = await playLiturgyLocalPresentationOnScreens(filePath, title)
      } else {
        // Arquivo agendado herda o player escolhido no placeholder.
        // Assim vídeo/áudio agendado segue a mesma cascata externo → interno.
        const mediaType = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)
          ? 'audio'
          : 'video'
        const result = await executeLiturgyItem(
          { ...item, type: mediaType, filePath, name: title },
          router,
        )
        return { ...result, resolved: content }
      }
      return opened
        ? { ok: true, resolved: content }
        : { ok: false, messageKey: 'liturgy.messages.projectionFailed', resolved: content }
    }
    case 'verse': {
      const bibleStore = useBibleStore()
      if (bibleStore.books.length === 0) {
        await bibleStore.bootstrap()
      }
      await bibleStore.selectBook(content.verseBookId)
      await bibleStore.selectChapter(content.verseChapter)
      if (content.verseNumbers?.trim()) {
        bibleStore.verseSearchQuery = content.verseNumbers.trim()
        bibleStore.applyVerseSearch()
      }
      await router.push({ name: 'bible' })
      return { ok: true, resolved: content }
    }
    case 'online_video': {
      const opened = await openLiturgyVideoControl(
        content.url,
        content.name?.trim() || content.url,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed', resolved: content }
      }
      return { ok: true, resolved: content }
    }
    case 'annotation': {
      return { ok: true, resolved: content }
    }
  }
}

/** Item legado (import Delphi): sem `content`, o filePath É o conteúdo. */
function legacyContentFromFile(
  entry: ReturnType<ReturnType<typeof useScheduledStore>['findOn']> | undefined,
): Extract<LiturgyScheduledContent, { kind: 'file' }> | null {
  if (!entry) return null
  const filePath = entry.filePath?.trim()
  if (!filePath) return null
  return { kind: 'file', filePath }
}

/** Abre o item (música já projeta nas telas configuradas). */
export async function executeLiturgyItem(
  item: LiturgyItem,
  router: Router,
  options?: { dateISO?: string; day?: import('../types/liturgy').LiturgyDayKey },
): Promise<LiturgyActionResult> {
  // scheduled = placeholder: resolve a entrada da data e EXECUTA como o tipo dela.
  // A liturgia inteira de um dia pode ser agendada (Rafael: "a programação toda
  // com itens agendados") — cada posição resolve contra a data do dia ATIVO da
  // liturgia (sábado selecionado = sábado da semana corrente; avulsa = hoje).
  if (item.type === 'scheduled') {
    const dateISO = options?.dateISO ?? activeDateISO(options?.day ?? 'custom')
    return executeScheduledRef(item, router, dateISO)
  }

  if (!isExecutableItem(item)) {
    return { ok: true }
  }

  switch (item.type) {
    case 'music': {
      const result = await openLiturgyMusicOnScreens(item)
      if (result.ok) {
        await router.push({ name: 'media' })
      }
      return result
    }

    case 'verse': {
      if (item.verseBookId == null || item.verseChapter == null) {
        return { ok: true }
      }

      const bibleStore = useBibleStore()
      if (bibleStore.books.length === 0) {
        await bibleStore.bootstrap()
      }
      await bibleStore.selectBook(item.verseBookId)
      await bibleStore.selectChapter(item.verseChapter)

      const verseQuery = item.verseNumbers?.trim()
      if (verseQuery) {
        bibleStore.verseSearchQuery = verseQuery
        bibleStore.applyVerseSearch()
      }

      await router.push({ name: 'bible' })
      return { ok: true }
    }

    case 'online_video': {
      const rawUrl = item.url?.trim()
      if (!rawUrl) {
        return { ok: false, messageKey: 'liturgy.messages.urlMissing' }
      }

      const opened = await openLiturgyVideoControl(
        rawUrl,
        item.name?.trim() || rawUrl,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    case 'audio':
    case 'video': {
      const filePath = item.filePath?.trim()
      // Browser: mídia local é upload (blob URL) — filePath do desktop não existe lá.
      const objectUrl = getLiturgyVideoObjectUrl(item.id)
      if (!filePath && !objectUrl) {
        return { ok: false, messageKey: 'liturgy.messages.videoSelectFile' }
      }

      // Player externo: áudio E vídeo (Rafael 03/10: "essa funcionalidade é
      // pra reproduzir vídeos externos" — vídeo ia sempre pro interno,
      // ignorando a preferência do usuário). Cascata: playerId do item →
      // preferência global → 'associated' (interno). Player não encontrado
      // etc → cai no interno com snackbar padrão.
      // NOTA: com player externo o vídeo não projeta nas telas (o VLC/mpv
      // não alimenta a projeção) — quem quer projeção usa 'associated'.
      const bridge = getDesktopBridge()
      if (filePath && !objectUrl && (item.type === 'audio' || item.type === 'video')) {
        let pref: string | undefined = item.playerId
        if (!pref || pref === 'default') {
          pref = await bridge?.externalPlayer?.get?.()
        }
        if (pref && pref !== 'associated') {
          const result = await bridge?.externalPlayer?.play?.(
            filePath,
            pref as ExternalPlayerPreference,
          )
          if (result?.ok) {
            return { ok: true }
          }
          // file-missing = path de OUTRA máquina (liturgia sincronizada do
          // Windows da igreja etc): cair no interno aqui engana o usuário
          // ("abriu no player errado") — o interno também não tem o arquivo.
          // Retorna erro claro; playwright/web revisam mensagem no i18n.
          if (result && 'error' in result && result.error === 'file-missing') {
            return { ok: false, messageKey: 'liturgy.messages.fileMissingOnMachine' }
          }
          // player não encontrado etc → cai no interno com snackbar padrão
        }
      }

      const fallbackLabel = item.type === 'audio' ? 'Áudio' : 'Vídeo'
      const opened = await openLiturgyLocalVideoControl(
        filePath || item.name?.trim() || fallbackLabel,
        item.name?.trim() || filePath || fallbackLabel,
        objectUrl,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    case 'images': {
      const paths = resolveImagePaths(item)
      if (paths.length === 0) {
        return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
      }

      const opened = await openLiturgyLocalImageControl(
        paths,
        item.name?.trim() || paths[0] || 'Imagens',
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    case 'pdf': {
      const filePath = item.filePath?.trim()
      if (!filePath) {
        return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
      }

      const opened = await openLiturgyLocalPdfControl(
        filePath,
        item.name?.trim() || filePath,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    case 'presentation': {
      const filePath = item.filePath?.trim()
      if (!filePath) {
        return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
      }

      const bridge = getDesktopBridge()

      // Engine efetivo: override explícito do item > global das Configurações.
      // Explícito (powerpoint/libreoffice/custom) = APLICATIVO externo em
      // modo slideshow (fidelidade total). 'auto' = conversão interna do app
      // (projeção multi-tela).
      let engine = item.presentationEngine
      if (!engine) {
        engine = (await bridge?.presentation?.getEngine?.()) ?? 'auto'
      }
      if (engine && engine !== 'auto') {
        const result = await bridge?.presentation?.openExternal?.(
          filePath,
          engine,
        )
        if (!result?.ok) {
          return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
        }
        return { ok: true }
      }

      const hasOffice = await bridge?.presentation?.detectOffice?.()
      if (hasOffice === false) {
        return {
          ok: false,
          messageKey: 'liturgy.messages.presentationOfficeMissing',
        }
      }

      const opened = await openLiturgyLocalPresentationControl(
        filePath,
        item.name?.trim() || filePath,
        item.presentationEngine,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    case 'site': {
      const rawUrl = item.url?.trim()
      if (!rawUrl) {
        return { ok: false, messageKey: 'liturgy.messages.urlMissing' }
      }

      const opened = await openLiturgySiteControl(
        rawUrl,
        item.name?.trim() || rawUrl,
      )
      if (!opened) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    default: {
      if (INTERNAL_FILE_TYPES.includes(item.type)) {
        if (!item.filePath?.trim()) {
          return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
        }
        return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
      }
      return { ok: true }
    }
  }
}

/** Abre o controle (se preciso) e dá play — telas estendidas seguem. */
export async function playLiturgyItemOnScreens(
  item: LiturgyItem,
): Promise<LiturgyActionResult> {
  if (item.type === 'music') {
    return openLiturgyMusicOnScreens(item)
  }

  if (item.type === 'video') {
    const filePath = item.filePath?.trim()
    if (!filePath) {
      return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
    }
    const ok = await playLiturgyLocalVideoOnScreens(
      filePath,
      item.name?.trim() || filePath,
    )
    if (!ok) {
      return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
    }
    return { ok: true }
  }

  if (item.type === 'images') {
    const paths = resolveImagePaths(item)
    if (paths.length === 0) {
      return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
    }
    const ok = await playLiturgyLocalImageOnScreens(
      paths,
      item.name?.trim() || paths[0] || 'Imagens',
    )
    if (!ok) {
      return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
    }
    return { ok: true }
  }

  if (item.type === 'pdf') {
    const filePath = item.filePath?.trim()
    if (!filePath) {
      return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
    }
    const ok = await playLiturgyLocalPdfOnScreens(
      filePath,
      item.name?.trim() || filePath,
    )
    if (!ok) {
      return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
    }
    return { ok: true }
  }

  if (item.type === 'presentation') {
    const filePath = item.filePath?.trim()
    if (!filePath) {
      return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
    }
    const bridge = getDesktopBridge()

    // Engine efetivo: override do item > global (ver executeLiturgyItem).
    let engine = item.presentationEngine
    if (!engine) {
      engine = (await bridge?.presentation?.getEngine?.()) ?? 'auto'
    }
    if (engine && engine !== 'auto') {
      const result = await bridge?.presentation?.openExternal?.(
        filePath,
        engine,
      )
      if (!result?.ok) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    const hasOffice = await bridge?.presentation?.detectOffice?.()
    if (hasOffice === false) {
      return {
        ok: false,
        messageKey: 'liturgy.messages.presentationOfficeMissing',
      }
    }
    // Chegou aqui com engine 'auto' (interno): converte e projeta multi-tela.
    const ok = await playLiturgyLocalPresentationOnScreens(
      filePath,
      item.name?.trim() || filePath,
      'auto',
    )
    if (!ok) {
      return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
    }
    return { ok: true }
  }

  if (item.type !== 'online_video' && item.type !== 'site') {
    return { ok: true }
  }

  const rawUrl = item.url?.trim()
  if (!rawUrl) {
    return { ok: false, messageKey: 'liturgy.messages.urlMissing' }
  }

  const label = item.name?.trim() || rawUrl
  const ok =
    item.type === 'site'
      ? await openLiturgySiteOnScreens(rawUrl, label)
      : await playLiturgyWebOnConfiguredScreens(rawUrl, label)
  if (!ok) {
    return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
  }
  return { ok: true }
}
