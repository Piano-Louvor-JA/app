import { obsConnectionName, obsConnections, selectObsConnection } from '@modules/settings/services/obs-connections'
import { loadProjectionSettings } from '@modules/settings/services/projection-preferences'

/**
 * O que os players (janelas à parte) precisam para mostrar o seletor de telas
 * igual ao do app: qual monitor é a Tela retorno e as Conexões Remotas com o
 * nome e a marca que o app usa.
 */
export interface ScreenContext {
  returnDisplayId: number | null
  remotes: Array<{ id: string; name: string; selected: boolean }>
}

export function screenContext(): ScreenContext {
  const settings = loadProjectionSettings()
  return {
    returnDisplayId: settings.openReturnScreen && settings.returnDisplayId != null ? settings.returnDisplayId : null,
    remotes: obsConnections.value.map((connection) => ({
      id: connection.id,
      name: obsConnectionName(connection),
      selected: connection.selected,
    })),
  }
}

type ScreenContextWindow = Window & {
  __pianoScreenContext?: () => ScreenContext
  __pianoSetRemoteSelected?: (id: unknown, selected: unknown) => boolean
}

/** Só na janela principal: o processo main pergunta por aqui (players não leem o storage do app). */
export function installScreenContextBridge(target: Window = window): void {
  const win = target as ScreenContextWindow
  win.__pianoScreenContext = screenContext
  win.__pianoSetRemoteSelected = (id, selected) => {
    if (typeof id !== 'string' || typeof selected !== 'boolean') return false
    if (!obsConnections.value.some((connection) => connection.id === id)) return false
    selectObsConnection(id, selected)
    return true
  }
}
