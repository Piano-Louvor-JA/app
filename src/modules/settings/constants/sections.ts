import type { SettingsSection } from '../types/settings'

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'appearance',
    routeName: 'settings-appearance',
    labelKey: 'settings.tabs.appearance',
  },
  {
    id: 'general',
    routeName: 'settings-general',
    labelKey: 'settings.tabs.general',
  },
  {
    id: 'media',
    routeName: 'settings-media',
    labelKey: 'settings.tabs.media',
  },
  {
    id: 'projection',
    routeName: 'settings-projection',
    labelKey: 'settings.tabs.projection',
  },
  // Conexões remotas: agregador (como Utilitários) de Transmissão, Controle
  // Remoto e Palco. A aba fica ativa no agregador e nos três módulos.
  {
    id: 'connections',
    routeName: 'settings-connections',
    labelKey: 'settings.tabs.connections',
    routeNames: ['settings-connections', 'settings-transmission', 'settings-remote', 'settings-palco'],
  },
  {
    id: 'transmission',
    routeName: 'settings-transmission',
    labelKey: 'settings.tabs.transmission',
    hidden: true,
  },
  {
    id: 'remote',
    routeName: 'settings-remote',
    labelKey: 'settings.tabs.remote',
    hidden: true,
  },
  {
    id: 'palco',
    routeName: 'settings-palco',
    labelKey: 'settings.tabs.palco',
    hidden: true,
  },
]

export const VISIBLE_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter(
  (section) => !section.hidden,
)
