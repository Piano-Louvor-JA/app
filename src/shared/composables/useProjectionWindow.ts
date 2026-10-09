import {
  listExtendedDisplays,
  listSystemDisplays,
} from '@modules/settings/services/display-service'
import {
  loadProjectionSettings,
  pruneReturnDisplay,
  reconcileTargetDisplays,
  resolveSelectedReturnMonitorId,
  saveProjectionSettings,
} from '@modules/settings/services/projection-preferences'
import { getDesktopBridge } from '@shared/services/desktop-bridge'

type ProjectionLayout = 'audience' | 'return'

type ProjectionWindow = Window & {
  monitorId?: number
  layout?: ProjectionLayout
}

type MonitorTargets = {
  monitorIds: number[]
  fullscreen: boolean
  returnId: number | null
}

let openWindows: ProjectionWindow[] = []
let activeModule: string | null = null
/** Último módulo projetado — permite reabrir após close acidental no reapply. */
let lastProjectedModule: string | null = null
/** Evita que o watch trate o fechamento temporário do reapply como “parou de projetar”. */
let reapplyingTargets = false
/** Nome único a cada open — reusar o mesmo nome após close falha no Chromium/Electron. */
let projectionWindowSeq = 0

function pruneWindows() {
  openWindows = openWindows.filter((win) => win && !win.closed)
  if (openWindows.length === 0 && !reapplyingTargets) {
    activeModule = null
    lastProjectedModule = null
  }
}

function closeWebUrlProjection() {
  void getDesktopBridge()?.projection?.closeUrl?.()
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildPopupUrl(
  moduleId: string,
  options?: {
    monitorId?: number | null
    fullscreen?: boolean
    layout?: ProjectionLayout
  },
): string {
  const params = new URLSearchParams()
  params.set('module', moduleId)
  /* v8 ignore next 3 -- openOnMonitor só é chamado com monitorId != null */
  if (options?.monitorId != null) {
    params.set('monitorId', String(options.monitorId))
  }
  /* v8 ignore next 3 -- fullscreen=true em todos os callers */
  if (options?.fullscreen) {
    // Canal confiável para o main process (além do features do window.open)
    params.set('fs', '1')
  }
  if (options?.layout === 'return') {
    params.set('layout', 'return')
  }
  const query = params.toString()
  const useHash =
    window.location.protocol === 'file:' ||
    window.location.href.includes('#/') ||
    Boolean(window.louvorja?.isElectron) ||
    /Electron/i.test(navigator.userAgent)

  if (useHash) {
    const base = window.location.href.split('#')[0]
    return `${base}#/popup?${query}`
  }

  return `${window.location.origin}/popup?${query}`
}

async function resolveMonitorTargets(
  moduleId: string | null,
  preferredIds?: number[] | null,
): Promise<MonitorTargets> {
  const displays = await listSystemDisplays()
  const extended = listExtendedDisplays(displays)
  const extendedIds = new Set(extended.map((display) => display.id))
  const primary = displays.find((display) => display.isPrimary) ?? null
  const settings = loadProjectionSettings()
  const displayIds = displays.map((display) => display.id)
  const selectedIds =
    preferredIds != null ? preferredIds : settings.targetDisplayIds
  const returnId =
    moduleId === 'media'
      ? resolveSelectedReturnMonitorId(settings, displayIds, selectedIds)
      : null

  const excludeReturn = (id: number) => returnId == null || id !== returnId

  // null/undefined = ler settings; array (mesmo vazio) = seleção explícita (como YouTube/site).
  if (preferredIds != null) {
    const selected = preferredIds.filter(
      (id) => extendedIds.has(id) && excludeReturn(id),
    )
    if (selected.length > 0) {
      return { monitorIds: selected, fullscreen: true, returnId }
    }
    return { monitorIds: [], fullscreen: false, returnId }
  }

  const selected = settings.targetDisplayIds.filter(
    (id) => extendedIds.has(id) && excludeReturn(id),
  )

  if (selected.length > 0) {
    return { monitorIds: selected, fullscreen: true, returnId }
  }

  // Sem alvos estendidos: só abre no primário se a setting permitir e
  // (não há estendidos) OU (disablePrimaryWhenExtended está desligado).
  const hasExtended = extended.length > 0
  const openOnPrimary = settings.openFullscreenOnPrimary !== false
  const primaryBlockedByExtended =
    hasExtended && settings.disablePrimaryWhenExtended !== false

  if (
    openOnPrimary &&
    !primaryBlockedByExtended &&
    primary &&
    excludeReturn(primary.id)
  ) {
    return { monitorIds: [primary.id], fullscreen: true, returnId }
  }

  return { monitorIds: [], fullscreen: false, returnId }
}

function openOnMonitor(
  moduleId: string,
  monitorId: number | null,
  fullscreen: boolean,
  layout: ProjectionLayout = 'audience',
): ProjectionWindow | null {
  projectionWindowSeq += 1
  const url = buildPopupUrl(moduleId, { monitorId, fullscreen, layout })
  // frame=no é opção reconhecida pelo Electron; fullscreen/monitor também na URL
  const features = [
    'width=800',
    'height=600',
    'frame=no',
    'autoHideMenuBar=yes',
    /* v8 ignore start -- openOnMonitor só recebe monitorId != null e fullscreen true */
    monitorId != null ? `monitor=${monitorId}` : null,
    fullscreen ? 'fullscreen=yes' : null,
    /* v8 ignore stop */
  ]
    .filter(Boolean)
    .join(',')

  // Sequência no nome evita falha ao reabrir após close (mesmo targetName).
  /* v8 ignore start -- monitorId != null em todos os callers */
  const name =
    monitorId != null
      ? `Projection_${moduleId}_${layout}_${monitorId}_${projectionWindowSeq}`
      : `Projection_${moduleId}_${layout}_${projectionWindowSeq}`
  /* v8 ignore stop */

  const win = window.open(url, name, features) as ProjectionWindow | null
  if (!win || win.closed) return null

  /* v8 ignore next 3 -- monitorId != null em todos os callers */
  if (monitorId != null) {
    win.monitorId = monitorId
  }
  win.layout = layout

  return win
}

function notifyProjectionReapplied(moduleId: string, open: boolean) {
  try {
    window.dispatchEvent(
      new CustomEvent('louvorja:projection-reapplied', {
        detail: { moduleId, open },
      }),
    )
  } catch {
    // ignore
  }
}

function isReturnWindow(win: ProjectionWindow) {
  return win.layout === 'return'
}

export function isProjectionModuleOpen(moduleId?: string): boolean {
  if (reapplyingTargets && activeModule) {
    if (!moduleId) return true
    return activeModule === moduleId
  }

  pruneWindows()
  if (openWindows.length === 0) return false
  if (!moduleId) return true
  return activeModule === moduleId
}

export function closeProjectionModule(): void {
  reapplyingTargets = false
  pruneWindows()
  for (const win of openWindows) {
    try {
      win.close()
    } catch {
      // janela já fechada
    }
  }
  openWindows = []
  activeModule = null
  lastProjectedModule = null
  closeWebUrlProjection()
}

export async function openProjectionModule(
  moduleId: string,
  preferredIds?: number[] | null,
): Promise<boolean> {
  pruneWindows()

  // Conteúdo oculto: janelas já existem — não chama closeUrl (senão o main
  // fecha as popups de hinos/bíblia) e não reabre.
  if (activeModule === moduleId && openWindows.length > 0) {
    openWindows[0]?.focus()
    return true
  }

  closeWebUrlProjection()

  // fecha só as janelas de módulo (não chamar closeProjectionModule: reentraria no closeUrl)
  for (const win of openWindows) {
    try {
      win.close()
    } catch {
      // janela já fechada
    }
  }
  openWindows = []
  activeModule = null

  const targets = await resolveMonitorTargets(moduleId, preferredIds)
  const nextWindows: ProjectionWindow[] = []

  if (targets.monitorIds.length > 0) {
    for (const monitorId of targets.monitorIds) {
      const win = openOnMonitor(moduleId, monitorId, true, 'audience')
      if (win) nextWindows.push(win)
    }
  }

  if (targets.returnId != null) {
    const win = openOnMonitor(moduleId, targets.returnId, true, 'return')
    if (win) nextWindows.push(win)
  }

  openWindows = nextWindows
  activeModule = nextWindows.length > 0 ? moduleId : null
  lastProjectedModule = activeModule
  // Projeção (window.open) rouba o teclado — devolve ao operador.
  try {
    window.focus()
  } catch {
    /* ignore */
  }
  return nextWindows.length > 0
}

/**
 * Reabre/ajusta as janelas do módulo ativo nas telas selecionadas.
 * Espelha setVideoTargetMonitors / setSiteTargetMonitors: troca as telas
 * sem “desligar” a projeção.
 */
export async function reapplyProjectionTargets(
  preferredIds?: number[] | null,
): Promise<boolean> {
  pruneWindows()
  const moduleId = activeModule ?? lastProjectedModule
  if (!moduleId) return false

  // Garante que o watch continue vendo a projeção como ativa durante a troca.
  activeModule = moduleId
  lastProjectedModule = moduleId
  reapplyingTargets = true
  try {
    const targets = await resolveMonitorTargets(moduleId, preferredIds)
    const desiredIds = targets.monitorIds
    const desiredSet = new Set(desiredIds)
    const returnId = targets.returnId

    // Mantém janelas das telas que continuam selecionadas (como o espelho do YouTube).
    const kept: ProjectionWindow[] = []
    const alreadyOpenAudience = new Set<number>()
    let keptReturn = false

    for (const win of openWindows) {
      const id = win.monitorId
      if (isReturnWindow(win)) {
        if (returnId != null && id === returnId && !win.closed) {
          kept.push(win)
          keptReturn = true
        } else {
          try {
            win.close()
          } catch {
            // janela já fechada
          }
        }
        continue
      }

      if (id != null && desiredSet.has(id) && !win.closed) {
        kept.push(win)
        alreadyOpenAudience.add(id)
      } else {
        try {
          win.close()
        } catch {
          // janela já fechada
        }
      }
    }

    // Pequena pausa após closes para o Chromium liberar o slot da janela.
    await delay(50)

    for (const monitorId of desiredIds) {
      if (alreadyOpenAudience.has(monitorId)) continue
      const win = openOnMonitor(moduleId, monitorId, true, 'audience')
      if (win) kept.push(win)
    }

    if (returnId != null && !keptReturn) {
      const win = openOnMonitor(moduleId, returnId, true, 'return')
      if (win) kept.push(win)
    }

    openWindows = kept.filter((win) => win && !win.closed)

    const audienceOpen = openWindows.filter((win) => !isReturnWindow(win)).length
    const hasReturn = openWindows.some((win) => isReturnWindow(win))

    if (desiredIds.length === 0 && !hasReturn) {
      activeModule = null
      lastProjectedModule = null
      notifyProjectionReapplied(moduleId, false)
      return false
    }

    // Se alguma abertura de audiência falhou, tenta recriar só as de audiência.
    if (audienceOpen < desiredIds.length) {
      const returnWins = openWindows.filter((win) => isReturnWindow(win))
      for (const win of openWindows) {
        if (isReturnWindow(win)) continue
        try {
          win.close()
        } catch {
          // ignore
        }
      }
      openWindows = [...returnWins]
      await delay(50)
      for (const monitorId of desiredIds) {
        const win = openOnMonitor(moduleId, monitorId, true, 'audience')
        if (win) openWindows.push(win)
      }
    }

    const opened = openWindows.length > 0
    activeModule = opened ? moduleId : null
    if (opened) lastProjectedModule = moduleId
    notifyProjectionReapplied(moduleId, opened)
    return opened
  } finally {
    reapplyingTargets = false
  }
}

export async function toggleProjectionModule(moduleId: string): Promise<boolean> {
  if (isProjectionModuleOpen(moduleId)) {
    closeProjectionModule()
    return false
  }

  return openProjectionModule(moduleId)
}

/**
 * Reage a hotplug de monitores (legado App.vue onDisplaysChanged):
 * - 0 telas estendidas e sem retorno → fecha projeção Vue + web
 * - senão reconcilia settings e reaplica janelas abertas
 */
export async function syncProjectionAfterDisplayChange(): Promise<void> {
  const displays = await listSystemDisplays()
  const extended = listExtendedDisplays(displays)
  const extendedIds = extended.map((display) => display.id)
  const displayIds = displays.map((display) => display.id)

  let settings = loadProjectionSettings()
  settings = reconcileTargetDisplays(settings, extendedIds)
  settings = pruneReturnDisplay(settings, displayIds)
  settings = {
    ...settings,
    targetDisplayIds: settings.targetDisplayIds.filter((id) =>
      extendedIds.includes(id),
    ),
  }
  saveProjectionSettings(settings)

  const returnId = resolveSelectedReturnMonitorId(
    settings,
    displayIds,
    settings.targetDisplayIds,
  )

  // Legado: se sobrou só a tela principal, encerra popups — salvo retorno ativo.
  if (extendedIds.length === 0 && returnId == null) {
    closeProjectionModule()
    return
  }

  if (!isProjectionModuleOpen()) return

  await reapplyProjectionTargets(settings.targetDisplayIds)
}

/**
 * Há monitores estendidos marcados para projeção cabeada?
 * Sem isso (1 tela ou nada selecionado), a Bíblia usa preview in-app.
 */
export async function hasSelectedExtendedProjectionTargets(): Promise<boolean> {
  const displays = await listSystemDisplays()
  const extended = listExtendedDisplays(displays)
  if (extended.length === 0) return false
  const settings = loadProjectionSettings()
  const extendedIds = new Set(extended.map((d) => d.id))
  return settings.targetDisplayIds.some((id) => extendedIds.has(id))
}

export function useProjectionWindow() {
  return {
    open: openProjectionModule,
    closeAll: closeProjectionModule,
    isOpen: isProjectionModuleOpen,
    toggle: toggleProjectionModule,
    reapplyTargets: reapplyProjectionTargets,
    syncAfterDisplayChange: syncProjectionAfterDisplayChange,
    hasSelectedExtendedProjectionTargets,
  }
}
