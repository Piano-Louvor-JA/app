import {
  listExtendedDisplays,
  listSystemDisplays,
} from '@modules/settings/services/display-service'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'
import {
  closeProjectionModule,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { PresentationEngine } from '@shared/types/desktop-bridge'
import { palcoSession } from '../../settings/services/palco-session'

import {
  parseLiturgyWebTarget,
  publishLiturgyWebRuntime,
} from './liturgy-web-runtime'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveTargetMonitorIds(): Promise<number[]> {
  const settings = loadProjectionSettings()
  const displays = await listSystemDisplays()
  const extendedIds = new Set(
    listExtendedDisplays(displays).map((display) => display.id),
  )
  return settings.targetDisplayIds.filter((id) => extendedIds.has(id))
}

/**
 * Abre URL nas telas configuradas, espelhada.
 * Electron: janelas nativas (YouTube com controles + áudio).
 */
export async function openLiturgyWebOnConfiguredScreens(
  rawUrl: string,
  title = '',
  withScreens = true,
): Promise<boolean> {
  const target = parseLiturgyWebTarget(rawUrl)
  if (!target) return false

  const label = title.trim() || rawUrl.trim()
  const mode = target.kind === 'site' ? 'site' : 'video'
  const bridge = getDesktopBridge()

  if (bridge?.projection?.openUrl) {
    closeProjectionModule()

    const monitorIds = await resolveTargetMonitorIds()

    return bridge.projection.openUrl({
      url: target.url,
      title: label,
      videoId: target.kind === 'youtube' ? target.videoId : undefined,
      monitorIds,
      mode,
      withScreens,
    })
  }

  publishLiturgyWebRuntime({
    active: true,
    url: target.url,
    title: label,
    kind: target.kind,
    videoId: target.videoId,
    startedAt: Date.now(),
  })
  return openProjectionModule('liturgy-web')
}

/** Popup de controle do site, sem projetar nas telas estendidas. */
export async function openLiturgySiteControl(
  rawUrl: string,
  title = '',
): Promise<boolean> {
  return openLiturgyWebOnConfiguredScreens(rawUrl, title, false)
}

/** Popup de controle do vídeo online, sem projetar nas telas estendidas. */
export async function openLiturgyVideoControl(
  rawUrl: string,
  title = '',
): Promise<boolean> {
  return openLiturgyWebOnConfiguredScreens(rawUrl, title, false)
}

/** Popup de controle do site + espelho nas telas estendidas (zoom normal). */
export async function openLiturgySiteOnScreens(
  rawUrl: string,
  title = '',
): Promise<boolean> {
  return openLiturgyWebOnConfiguredScreens(rawUrl, title, true)
}

/**
 * Garante o popup de controle aberto e dispara play
 * (telas estendidas abrem/tocam via sync).
 */
export async function playLiturgyWebOnConfiguredScreens(
  rawUrl: string,
  title = '',
): Promise<boolean> {
  const target = parseLiturgyWebTarget(rawUrl)
  if (!target) return false

  if (target.kind === 'site') {
    return openLiturgySiteOnScreens(rawUrl, title)
  }

  const opened = await openLiturgyWebOnConfiguredScreens(rawUrl, title, true)
  if (!opened) return false
  const bridge = getDesktopBridge()
  if (!bridge?.projection?.remotePlay) return opened

  // Dá tempo do YouTube montar o <video> no popup
  await sleep(600)
  const playing = await bridge.projection.remotePlay()
  if (playing) return true

  await sleep(800)
  return bridge.projection.remotePlay()
}

// internal (testable) — overload sem objectUrl para cobrir default-arg branch
export async function _openLiturgyLocalVideo(
  filePath: string,
  title: string,
  withScreens: boolean
): Promise<boolean>
export async function _openLiturgyLocalVideo(
  filePath: string,
  title: string,
  withScreens: boolean,
  objectUrl: string | undefined
): Promise<boolean>
export async function _openLiturgyLocalVideo(
  filePath: string,
  title = '',
  withScreens: boolean,
  objectUrl?: string | undefined,
): Promise<boolean> {
  const path = filePath.trim()
  const label = title.trim() || path.split(/[\\/]/).pop() || path
  const bridge = getDesktopBridge()

  // Browser: vídeo local vem de upload (blob URL) — projeta no popup web.
  if (!bridge?.projection?.openUrl) {
    if (!objectUrl) return false
    publishLiturgyWebRuntime({
      active: true,
      url: objectUrl,
      title: label,
      kind: 'local-video',
      videoId: '',
      startedAt: Date.now(),
    })
    return openProjectionModule('liturgy-web')
  }
  if (!path) return false

  closeProjectionModule()
  // Sempre envia os monitores das preferências — mesmo com withScreens:false —
  // para o popup refletir a seleção da liturgia (badge "2", etc.).
  const monitorIds = await resolveTargetMonitorIds()

  const opened = await bridge.projection.openUrl({
    filePath: path,
    title: label,
    monitorIds,
    mode: 'video',
    withScreens,
  })
  if (!opened) return false
  // Espelho no Palco (TVs conectadas): arquivo servido em /media/ pelo
  // sender (servePath) e enviado como {type:'video'} pro receiver —
  // rota mirror do módulo liturgy por padrão.
  void palcoSession.videoRouted({ url: path, title: label })
  if (!withScreens || !bridge.projection.remotePlay) return true

  await sleep(400)
  const playing = await bridge.projection.remotePlay()
  if (playing) return true
  await sleep(600)
  return bridge.projection.remotePlay()
}

/** Popup de controle de vídeo local, sem projetar nas telas estendidas. */
export async function openLiturgyLocalVideoControl(
  filePath: string,
  title = '',
  objectUrl?: string,
): Promise<boolean> {
  return _openLiturgyLocalVideo(filePath, title, false, objectUrl)
}

/** Popup de vídeo local + espelho nas telas estendidas. */
export async function playLiturgyLocalVideoOnScreens(
  filePath: string,
  title = '',
  objectUrl?: string,
): Promise<boolean> {
  return _openLiturgyLocalVideo(filePath, title, true, objectUrl)
}

async function openLiturgyLocalImages(
  filePaths: string[],
  title: string,
  withScreens: boolean,
): Promise<boolean> {
  const paths = filePaths.map((entry) => entry.trim()).filter(Boolean)
  if (paths.length === 0) return false

  const label = title.trim() || paths[0]?.split(/[\\/]/).pop() || 'Imagens'
  const bridge = getDesktopBridge()
  if (!bridge?.projection?.openUrl) return false

  closeProjectionModule()
  const monitorIds = await resolveTargetMonitorIds()

  return bridge.projection.openUrl({
    filePaths: paths,
    title: label,
    monitorIds,
    mode: 'image',
    withScreens,
  })
}

/** Popup de controle da galeria de imagens, sem projetar nas telas. */
export async function openLiturgyLocalImageControl(
  filePaths: string[],
  title = '',
): Promise<boolean> {
  return openLiturgyLocalImages(filePaths, title, false)
}

/** Popup de imagens + espelho nas telas estendidas. */
export async function playLiturgyLocalImageOnScreens(
  filePaths: string[],
  title = '',
): Promise<boolean> {
  return openLiturgyLocalImages(filePaths, title, true)
}

async function openLiturgyLocalPdf(
  filePath: string,
  title: string,
  withScreens: boolean,
): Promise<boolean> {
  const path = filePath.trim()
  if (!path) return false

  const label = title.trim() || path.split(/[\\/]/).pop() || 'PDF'
  const bridge = getDesktopBridge()
  if (!bridge?.projection?.openUrl) return false

  closeProjectionModule()
  const monitorIds = await resolveTargetMonitorIds()

  const opened = await bridge.projection.openUrl({
    filePath: path,
    title: label,
    monitorIds,
    mode: 'pdf',
    withScreens,
  })
  if (opened) {
    // Palco: título na TV enquanto o PDF roda no popup/projetor.
    void palcoSession.projectRouted('liturgy', 'liturgy', {
      text: label,
    })
  }
  return opened
}

/** Popup de controle do PDF, sem projetar nas telas. */
export async function openLiturgyLocalPdfControl(
  filePath: string,
  title = '',
): Promise<boolean> {
  return openLiturgyLocalPdf(filePath, title, false)
}

/** Popup de PDF + espelho nas telas estendidas. */
export async function playLiturgyLocalPdfOnScreens(
  filePath: string,
  title = '',
): Promise<boolean> {
  return openLiturgyLocalPdf(filePath, title, true)
}

async function openLiturgyLocalPresentation(
  filePath: string,
  title: string,
  withScreens: boolean,
  presentationEngine?: PresentationEngine,
): Promise<boolean> {
  const path = filePath.trim()
  if (!path) return false

  const label = title.trim() || path.split(/[\\/]/).pop() || 'Apresentação'
  const bridge = getDesktopBridge()
  if (!bridge?.projection?.openUrl) return false

  // Sem PowerPoint disponível, só LibreOffice/PDF atende — falha cedo
  // apenas se o usuário pediu engine explicitamente e não há nenhum Office.
  const hasOffice = await bridge.presentation?.detectOffice?.()
  if (
    hasOffice === false &&
    presentationEngine !== 'powerpoint' &&
    presentationEngine !== 'custom'
  ) {
    return false
  }

  closeProjectionModule()
  const monitorIds = await resolveTargetMonitorIds()

  const opened = await bridge.projection.openUrl({
    filePath: path,
    title: label,
    monitorIds,
    mode: 'presentation',
    withScreens,
    ...(presentationEngine ? { presentationEngine } : {}),
  })
  if (opened) {
    // Palco: título na TV enquanto a apresentação roda no popup/projetor.
    void palcoSession.projectRouted('liturgy', 'liturgy', {
      text: label,
    })
  }
  return opened
}

/** Popup de controle da apresentação, sem projetar nas telas. */
export async function openLiturgyLocalPresentationControl(
  filePath: string,
  title = '',
  presentationEngine?: PresentationEngine,
): Promise<boolean> {
  return openLiturgyLocalPresentation(filePath, title, false, presentationEngine)
}

/** Popup de apresentação + espelho nas telas estendidas. */
export async function playLiturgyLocalPresentationOnScreens(
  filePath: string,
  title = '',
  presentationEngine?: PresentationEngine,
): Promise<boolean> {
  return openLiturgyLocalPresentation(filePath, title, true, presentationEngine)
}