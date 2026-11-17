import { computed } from 'vue'

import { useBlurSystem, useThemeManager } from '@design-system/composables'
import type { AccentKey, InteractionKey, ThemeKey } from '@design-system/themes'
import type { BlurToken } from '@design-system/tokens'

import type { ThemeMode } from '../types/settings'

const modeToTheme: Record<ThemeMode, ThemeKey> = {
  light: 'luminousClarity',
  dark: 'etherealLumens',
}

const themeToMode: Record<ThemeKey, ThemeMode> = {
  luminousClarity: 'light',
  etherealLumens: 'dark',
}

/** Preferências de aparência via design-system. */
export function useAppearanceSettings() {
  const {
    themeKey,
    currentTheme,
    setTheme,
    accentKey,
    customAccent,
    currentAccent,
    accents,
    setAccent,
    setCustomAccent,
    resetAccent,
    interactionKey,
    currentInteraction,
    interactions,
    setInteraction,
    autoBrightness,
    setAutoBrightness,
  } = useThemeManager()

  const {
    glassIntensity,
    blurLevel,
    currentBlur,
    currentGlassFill,
    backdropFilter,
    blurTokens,
    setBlurLevel,
    setGlassIntensity,
  } = useBlurSystem()

  const themeMode = computed<ThemeMode>(
    () => themeToMode[themeKey.value] ?? 'dark',
  )

  const isDark = computed(() => currentTheme.value.mode === 'dark')

  /** Slider contínuo 0–100 (Suave → Profundo). */
  const blurSlider = computed({
    get: () => glassIntensity.value,
    set: (value: number) => setGlassIntensity(value),
  })

  function setThemeMode(mode: ThemeMode) {
    setTheme(modeToTheme[mode])
  }

  function setAccentColor(key: AccentKey) {
    setAccent(key)
  }

  function setInteractionMode(key: InteractionKey) {
    setInteraction(key)
  }

  function setBlurToken(level: BlurToken) {
    setBlurLevel(level)
  }

  return {
    themeMode,
    themeKey,
    currentTheme,
    isDark,
    setThemeMode,
    glassIntensity,
    blurLevel,
    blurSlider,
    currentBlur,
    currentGlassFill,
    backdropFilter,
    blurTokens,
    setGlassIntensity,
    setBlurLevel: setBlurToken,
    accentKey,
    customAccent,
    currentAccent,
    accents,
    setAccentColor,
    setCustomAccent,
    resetAccent,
    interactionKey,
    currentInteraction,
    interactions,
    setInteractionMode,
    autoBrightness,
    setAutoBrightness,
  }
}
