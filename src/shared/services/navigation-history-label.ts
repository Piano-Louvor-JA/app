import { mainNavRoutes } from '@shared/constants/navigation'

import type { HistoryEntry } from './navigation-history'

/** Textos da faixa de histórico (aria-labels). */
export const HISTORY_NAV_KEYS = {
  label: 'nav.history.label',
  back: 'nav.history.back',
  forward: 'nav.history.forward',
  goTo: 'nav.history.goTo',
} as const

/**
 * Detalhe por nome de rota, mostrado depois do label do dock
 * ("Configurações · Projeção & Telas"). Reaproveita as chaves que os
 * módulos já usam para a mesma tela; só "Player" e "Editor" são novas.
 */
export const HISTORY_DETAIL_KEYS: Readonly<Record<string, string>> = {
  'albums-collection': 'albums.collectionFallback',
  'community-ranking': 'ranking.title',
  media: 'nav.historyDetail.player',
  'media-editor': 'nav.historyDetail.editor',
  'settings-appearance': 'settings.tabs.appearance',
  'settings-general': 'settings.tabs.general',
  'settings-media': 'settings.tabs.media',
  'settings-projection': 'settings.tabs.projection',
  'settings-remote': 'settings.tabs.remote',
  'utilities-clock': 'utilities.clock',
  'utilities-countdown': 'utilities.countdown',
  'utilities-obs': 'utilities.obs',
  'utilities-random': 'utilities.random',
  'utilities-temporizador': 'utilities.temporizador',
  'utilities-timer': 'utilities.timer',
}

/** Nome legível de uma entrada do histórico (tooltip e leitor de tela). */
export function describeHistoryEntry(entry: HistoryEntry, t: (key: string) => string): string {
  const nav = mainNavRoutes.find((item) => item.key === entry.navKey) ?? mainNavRoutes[0]
  const base = t(nav.labelKey)
  const detailKey = entry.name ? HISTORY_DETAIL_KEYS[entry.name] : undefined
  return detailKey ? `${base} · ${t(detailKey)}` : base
}
