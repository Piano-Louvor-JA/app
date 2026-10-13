import {
  DEFAULT_STAGE_SETTINGS,
  STAGE_MODULE_SCOPES,
  parseStageSettings,
  type StageSettings,
} from '../types/stage-settings'

/**
 * Runtime de StageSettings para VIEWS DE PROJEÇÃO (popups), que rodam fora
 * da app principal e não têm pinia ativo: lê direto do user_data
 * (localStorage) + BroadcastChannel para aplicar mudanças em tempo real.
 */

const STAGE_CHANNEL = 'louvorja-stage-settings'

type Scope = string

/**
 * Migração one-shot (05/10): o default ANTIGO (#0A0E1A) foi persistido pelo
 * código velho — default gravado não é escolha do usuário. Na 1ª leitura
 * pós-update, bg de fábrica sai do storage (vira null = imagem vence).
 * Quem QUER Azul-noite, clica no swatch de novo (escolha explícita).
 */
const LEGACY_FACTORY_BG = '#0A0E1A'
const STAGE_BG_MIGRATED_KEY = 'stage.bg-migrated-0510'

function migrateFactoryBg(prefs: Record<string, unknown>): boolean {
  try {
    if (localStorage.getItem(STAGE_BG_MIGRATED_KEY) === '1') return false
    let changed = false
    for (const key of Object.keys(prefs)) {
      if (!key.startsWith('stage.settings.')) continue
      const stored = prefs[key]
      if (!stored || typeof stored !== 'object') continue
      const rec = stored as Record<string, unknown>
      if (rec['bg'] === LEGACY_FACTORY_BG) {
        delete rec['bg']
        changed = true
      }
    }
    if (changed) {
      localStorage.setItem('user_data', JSON.stringify(prefs))
    }
    localStorage.setItem(STAGE_BG_MIGRATED_KEY, '1')
    return changed
  } catch {
    return false
  }
}

function readScope(scope: Scope): StageSettings | null {
  try {
    const raw = localStorage.getItem('user_data')
    if (!raw) return null
    const prefs = JSON.parse(raw) as Record<string, unknown>
    migrateFactoryBg(prefs)
    const stored = prefs[`stage.settings.${scope}`]
    if (!stored || typeof stored !== 'object') return null
    return parseStageSettings(stored)
  } catch {
    return null
  }
}

/** Settings efetivas do módulo (override > global > default). */
export function readEffectiveStageSettings(scope: string): StageSettings {
  if (!STAGE_MODULE_SCOPES.includes(scope)) {
    // escopo desconhecido → defaults (defensive)
    return { ...DEFAULT_STAGE_SETTINGS }
  }
  return readScope(scope) ?? readScope('global') ?? { ...DEFAULT_STAGE_SETTINGS }
}

/** Assina mudanças de settings (mesma origem). Retorna unsubscribe. */
export function subscribeStageSettings(callback: () => void): () => void {
  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(STAGE_CHANNEL)
    channel.addEventListener('message', callback)
  } catch {
    channel = null
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === 'user_data') callback()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', callback)
    channel?.close()
  }
}

/** Notifica popups que as settings mudaram (chamado pelo store na app). */
export function notifyStageSettingsChanged(): void {
  try {
    const channel = new BroadcastChannel(STAGE_CHANNEL)
    channel.postMessage('changed')
    channel.close()
  } catch {
    // popups caem no listener de storage
  }
}
