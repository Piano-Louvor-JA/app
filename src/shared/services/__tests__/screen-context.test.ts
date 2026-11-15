import { beforeEach, describe, expect, it } from 'vitest'

import { OBS_CONNECTIONS_KEY, obsConnections } from '@modules/settings/services/obs-connections'
import { saveProjectionSettings, loadProjectionSettings } from '@modules/settings/services/projection-preferences'

import { installScreenContextBridge, screenContext } from '../screen-context'

type Bridge = Window & {
  __pianoScreenContext: () => ReturnType<typeof screenContext>
  __pianoSetRemoteSelected: (id: unknown, selected: unknown) => boolean
}

describe('contexto de telas para os players', () => {
  beforeEach(() => {
    localStorage.clear()
    obsConnections.value = [
      { id: '0', label: 'OBS 1', selected: true },
      { id: '2', label: 'OBS 2', selected: false, nickname: 'Telão lateral' },
    ]
  })

  it('leva a Tela retorno e as conexões com os nomes do app', () => {
    saveProjectionSettings({ ...loadProjectionSettings(), openReturnScreen: true, returnDisplayId: 44 })
    expect(screenContext()).toEqual({
      returnDisplayId: 44,
      remotes: [
        { id: '0', name: 'OBS', selected: true },
        { id: '2', name: 'Telão lateral', selected: false },
      ],
    })
    saveProjectionSettings({ ...loadProjectionSettings(), openReturnScreen: false, returnDisplayId: 44 })
    expect(screenContext().returnDisplayId).toBeNull()
  })

  it('a marca feita no player vale no app; pedidos inválidos são ignorados', () => {
    installScreenContextBridge()
    const win = window as unknown as Bridge
    expect(win.__pianoScreenContext().remotes[1].selected).toBe(false)
    expect(win.__pianoSetRemoteSelected('2', true)).toBe(true)
    expect(obsConnections.value[1].selected).toBe(true)
    expect(JSON.parse(localStorage.getItem(OBS_CONNECTIONS_KEY) ?? '[]')[1].selected).toBe(true)
    expect(win.__pianoSetRemoteSelected('9', true)).toBe(false)
    expect(win.__pianoSetRemoteSelected('0', 'sim')).toBe(false)
    expect(obsConnections.value[0].selected).toBe(true)
  })
})
