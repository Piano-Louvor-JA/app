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
  {
    id: 'transmission',
    routeName: 'settings-transmission',
    labelKey: 'settings.tabs.transmission',
  },
  {
    id: 'remote',
    routeName: 'settings-remote',
    labelKey: 'settings.tabs.remote',
  },
]

export const VISIBLE_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter(
  (section) => !section.hidden,
)
