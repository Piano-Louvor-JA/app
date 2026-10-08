// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
})

import { createPinia, setActivePinia } from 'pinia'
import { useCountdownStore } from '../useCountdownStore'
import { DEFAULT_ALERT_MARKERS } from '../../types/countdown'
import { TONE_LIBRARY_KEY } from '../../services/alert-tone-library'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'

async function seedLegacyConfig(config: unknown) {
  // user-preferences persista tudo dentro de BROWSER_STORAGE_KEYS.userPreferences ('user_data')
  const prefs = JSON.parse(values.get('user_data') ?? '{}')
  prefs[USER_PREFERENCE_KEYS.countdownConfig] = config
  values.set('user_data', JSON.stringify(prefs))
}

describe('store — marcos dinâmicos v2 (RF-1/RF-2/B3)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('config nova nasce com os 3 marcos padrão (paridade v1)', () => {
    const store = useCountdownStore()
    store.hydrate()
    expect(store.config.alertMarkers).toEqual(DEFAULT_ALERT_MARKERS)
  })

  it('addAlertMarker cria marco persistido (sobrevive a re-hydrate = reload)', () => {
    const store = useCountdownStore()
    store.hydrate()
    const marker = store.addAlertMarker(420_000, 'chime')
    expect(marker).not.toBeNull()

    const store2 = useCountdownStore()
    store2.hydrate()
    const reloaded = store2.config.alertMarkers?.find((m) => m.id === marker?.id)
    expect(reloaded?.offsetMs).toBe(420_000)
    expect(reloaded?.preset).toBe('chime')
  })

  it('offset duplicado é bloqueado (RF-1 colisão)', () => {
    const store = useCountdownStore()
    store.hydrate()
    expect(store.addAlertMarker(60_000)).toBeNull() // 1min já usa 60_000
  })

  it('updateAlertMarker muda offset/preset; removeAlertMarker exclui (B3)', () => {
    const store = useCountdownStore()
    store.hydrate()
    const marker = store.addAlertMarker(180_000, 'beep')
    expect(store.updateAlertMarker(marker!.id, { offsetMs: 120_000, preset: 'gong' })).toBe(true)
    expect(store.config.alertMarkers?.find((m) => m.id === marker!.id)).toEqual({
      id: marker!.id,
      offsetMs: 120_000,
      preset: 'gong',
    })
    expect(store.removeAlertMarker(marker!.id)).toBe(true)
    expect(store.config.alertMarkers?.some((m) => m.id === marker!.id)).toBe(false)
  })

  it('update com offset de outro marco é bloqueado; id inexistente retorna false', () => {
    const store = useCountdownStore()
    store.hydrate()
    expect(store.updateAlertMarker('nao-existe', { offsetMs: 5 })).toBe(false)
    expect(store.updateAlertMarker('start', { offsetMs: 300_000 })).toBe(false) // 5min usa
    expect(store.removeAlertMarker('nao-existe')).toBe(false)
  })

  it('migração v1 na hydrate: alertTonePresets vira markers com presets preservados (B5)', async () => {
    await seedLegacyConfig({
      timeFormat: 'hh:mm:ss',
      bgColor: '#000000',
      textColor: '#FFFFFF',
      alertTonePresets: { start: 'gong', '5min': 'chime' },
    })
    const store = useCountdownStore()
    store.hydrate()
    expect(store.config.configVersion).toBe(2)
    const start = store.config.alertMarkers?.find((m) => m.id === 'start')
    const five = store.config.alertMarkers?.find((m) => m.id === '5min')
    const one = store.config.alertMarkers?.find((m) => m.id === '1min')
    expect(start?.preset).toBe('gong')
    expect(five?.preset).toBe('chime')
    expect(one?.preset).toBe('1min_es') // não configurado → default
    // persistiu a v2 (reload não re-migra: idempotente)
    expect(store.config.alertTonePresets).toEqual({ start: 'gong', '5min': 'chime' })
  })

  it('remove TODOS os marcos → re-hydrate mantém zero alertas (crítico cego: bug do reload)', () => {
    const store = useCountdownStore()
    store.hydrate()
    for (const id of (store.config.alertMarkers ?? []).map((m) => m.id)) {
      store.removeAlertMarker(id)
    }
    expect(store.config.alertMarkers).toEqual([])

    // simula reload: nova instância do store lendo o storage
    const store2 = useCountdownStore()
    store2.hydrate()
    expect(store2.config.alertMarkers).toEqual([])
  })

  it("legado 'custom' + customTones no device: hydrate importa pra library e aponta o marker", () => {
    values.set('pianolouvorja:countdown:customTones', JSON.stringify({ start: 'data:audio/mpeg;base64,AAA' }))
    const store = useCountdownStore()
    // seed direto do storage ANTES do hydrate: config v1 com preset custom
    const prefs = JSON.parse(values.get('user_data') ?? '{}')
    prefs['countdown.config'] = {
      timeFormat: 'hh:mm:ss',
      bgColor: '#000',
      textColor: '#FFF',
      alertTonePresets: { start: 'custom' },
    }
    values.set('user_data', JSON.stringify(prefs))

    store.hydrate()
    const start = store.config.alertMarkers?.find((m) => m.id === 'start')
    expect(start?.preset).toMatch(/^custom:tone-/)
    // chave legada limpa (idempotente)
    expect(values.has('pianolouvorja:countdown:customTones')).toBe(false)
    // library tem o tom importado
    const library = JSON.parse(values.get('pianolouvorja:countdown:toneLibrary') ?? '[]')
    expect(library).toHaveLength(1)
    expect(library[0].dataUrl).toBe('data:audio/mpeg;base64,AAA')
  })

  it('minDurationMs soma presets habilitados dos markers no modo sabbath', () => {
    const store = useCountdownStore()
    store.hydrate()
    store.setMode('sabbath')
    // defaults: abertura_es 30_400 + 5min_es 18_000 + 1min_es 65_500
    expect(store.minDurationMs()).toBe(30_400 + 18_000 + 65_500)
    store.setAlertMarkers([
      { id: 'start', offsetMs: 0, preset: 'none' },
      { id: 'm1', offsetMs: 60_000, preset: 'beep' },
    ])
    expect(store.minDurationMs()).toBe(150) // beep = 0.15s
  })

  it('tons da biblioteca persistem e migrado do legado não duplica (B4/B5)', async () => {
    const store = useCountdownStore()
    store.hydrate()
    // simula toneLibrary já persistida com 1 tom
    values.set(
      TONE_LIBRARY_KEY,
      JSON.stringify([
        { id: 'tone-x', name: 'Sino', dataUrl: 'data:audio/mpeg;base64,AAA', createdAt: 1 },
      ]),
    )
    // importa legado apontando pro MESMO dataUrl → não duplica
    const { migrateLegacyCustomTones } = await import('../../services/alert-tone-library')
    const ids = migrateLegacyCustomTones({ start: 'data:audio/mpeg;base64,AAA' })
    expect(ids.start).toBe('tone-x')
    const raw = JSON.parse(values.get(TONE_LIBRARY_KEY) ?? '[]')
    expect(raw).toHaveLength(1)
  })
})
