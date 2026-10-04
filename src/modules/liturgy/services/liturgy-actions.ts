import { useBibleStore } from '@modules/bible/stores/useBibleStore'
import { openMusicPlayer } from '@modules/media/services/open-music-player'
import type { MediaPlaybackMode } from '@modules/media/types/media'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { ExternalPlayerPreference } from '@shared/types/desktop-bridge'
import type { Router } from 'vue-router'

import type { LiturgyItem } from '../types/liturgy'
import { isExecutableItem } from './liturgy-item-helpers'
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
export type LiturgyActionResult =
  | { ok: true; messageKey?: string }
  | { ok: false; messageKey: string }

function resolveMusicId(item: LiturgyItem): number | null {
  if (item.type !== 'music') return null
  const musicId = Number(item.musicId)
  if (!Number.isFinite(musicId) || musicId <= 0) return null
  return musicId
}

function resolveImagePaths(item: LiturgyItem): string[] {
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

/** Abre o item (música já projeta nas telas configuradas). */
export async function executeLiturgyItem(
  item: LiturgyItem,
  router: Router,
): Promise<LiturgyActionResult> {
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

      // Player externo SÓ para áudio (Ezequias 13/09: "mp3 blz, não é preciso
      // projetar"). Vídeo PRECISA do player interno: é ele que projeta nas
      // telas — VLC/mpv não comandam a projeção.
      const bridge = getDesktopBridge()
      if (item.type === 'audio' && filePath && !objectUrl) {
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
        item.name?.trim() || paths[0],
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
      if (!engine && bridge && bridge.presentation && bridge.presentation.getEngine) {
        engine = await bridge.presentation.getEngine()
      }
      engine ||= 'auto'
      if (engine !== 'auto') {
        const result =
          bridge && bridge.presentation && bridge.presentation.openExternal
            ? await bridge.presentation.openExternal(filePath, engine)
            : undefined
        if (!result?.ok) {
          return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
        }
        return { ok: true }
      }

      const hasOffice =
        bridge && bridge.presentation && bridge.presentation.detectOffice
          ? await bridge.presentation.detectOffice()
          : undefined
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
      // Único tipo executável que chega aqui é other_files (interno, desktop-only).
      return { ok: false, messageKey: 'liturgy.messages.mediaDesktopOnly' }
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
      item.name?.trim() || paths[0],
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
    if (!engine && bridge && bridge.presentation && bridge.presentation.getEngine) {
      engine = await bridge.presentation.getEngine()
    }
    engine ||= 'auto'
    if (engine !== 'auto') {
      const result =
        bridge && bridge.presentation && bridge.presentation.openExternal
          ? await bridge.presentation.openExternal(filePath, engine)
          : undefined
      if (!result?.ok) {
        return { ok: false, messageKey: 'liturgy.messages.projectionFailed' }
      }
      return { ok: true }
    }

    const hasOffice =
      bridge && bridge.presentation && bridge.presentation.detectOffice
        ? await bridge.presentation.detectOffice()
        : undefined
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
