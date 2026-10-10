import { computed, ref, watchEffect } from 'vue'

import {
  blur as blurTokens,
  blurPxFromIntensity,
  blurTokenFromIntensity,
  glassFillFromIntensity,
  intensityFromBlurToken,
  resolveGlassIntensity,
  type BlurToken,
} from '@design-system/tokens'
import {
  accents,
  defaultAccent,
  defaultInteraction,
  defaultTheme,
  interactions,
  themes,
  type AccentKey,
  type InteractionKey,
  type ThemeKey,
} from '@design-system/themes'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import {
  getUserPreference,
  setUserPreference,
} from '@shared/services/user-preferences'

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && value in themes
}

function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === 'string' && value in accents
}

function isInteractionKey(value: unknown): value is InteractionKey {
  return typeof value === 'string' && value in interactions
}

function readStoredTheme(): ThemeKey {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.theme)
  return isThemeKey(stored) ? stored : defaultTheme
}

function readStoredGlassIntensity(): number {
  return resolveGlassIntensity(
    getUserPreference<unknown>(USER_PREFERENCE_KEYS.blur),
  )
}

function readStoredAccent(): AccentKey {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.accent)
  return isAccentKey(stored) ? stored : defaultAccent
}

function readStoredInteraction(): InteractionKey {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.interaction)
  return isInteractionKey(stored) ? stored : defaultInteraction
}

function readStoredAutoBrightness(): boolean {
  const stored = getUserPreference<unknown>(USER_PREFERENCE_KEYS.autoBrightness)
  return typeof stored === 'boolean' ? stored : false
}

const themeKey = ref<ThemeKey>(readStoredTheme())
const glassIntensity = ref(readStoredGlassIntensity())
const accentKey = ref<AccentKey>(readStoredAccent())
const interactionKey = ref<InteractionKey>(readStoredInteraction())
const autoBrightness = ref(readStoredAutoBrightness())

let isWatching = false
let isPersisting = false
let mediaQueryCleanup: (() => void) | null = null

function persistAppearance() {
  if (typeof localStorage === 'undefined') return
  setUserPreference(USER_PREFERENCE_KEYS.theme, themeKey.value)
  setUserPreference(USER_PREFERENCE_KEYS.blur, glassIntensity.value)
  setUserPreference(USER_PREFERENCE_KEYS.accent, accentKey.value)
  setUserPreference(USER_PREFERENCE_KEYS.interaction, interactionKey.value)
  setUserPreference(USER_PREFERENCE_KEYS.autoBrightness, autoBrightness.value)
}

function applyCssVars(target: HTMLElement = document.documentElement) {
  const theme = themes[themeKey.value]
  const accent = accents[accentKey.value]
  const interaction = interactions[interactionKey.value]
  const intensity = glassIntensity.value

  Object.entries(theme.cssVars).forEach(([key, value]) => {
    target.style.setProperty(key, value)
  })

  // Densidade ≤1280 fica no CSS (base.css); evita inline do tema sobrescrever.
  target.style.removeProperty('--ds-spacing-page')
  target.style.removeProperty('--ds-dock-height')
  target.style.removeProperty('--ds-header-height')

  target.style.setProperty('--ds-color-primary', accent.primary)
  target.style.setProperty(
    '--ds-color-primary-soft',
    theme.mode === 'light' ? accent.primary : accent.soft,
  )
  target.style.setProperty('--ds-blur-active', blurPxFromIntensity(intensity))
  target.style.setProperty('--ds-glass-fill', glassFillFromIntensity(intensity))
  target.style.setProperty('--ds-motion-duration', interaction.duration)
  target.style.setProperty('--ds-motion-easing', interaction.easing)

  target.dataset.theme = theme.id
  target.dataset.mode = theme.mode
  target.dataset.accent = accent.id
  target.dataset.motion = interaction.id
  target.dataset.glass = String(intensity)
}

function syncThemeFromSystem() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  themeKey.value = prefersDark ? 'etherealLumens' : 'luminousClarity'
}

function stopAutoBrightnessListener() {
  mediaQueryCleanup?.()
  mediaQueryCleanup = null
}

function startAutoBrightnessListener() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  stopAutoBrightnessListener()

  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (!autoBrightness.value) return
    syncThemeFromSystem()
    persistAppearance()
  }

  query.addEventListener('change', onChange)
  mediaQueryCleanup = () => query.removeEventListener('change', onChange)
}

function ensureWatch() {
  if (isWatching || typeof document === 'undefined') return
  isWatching = true
  watchEffect(() => {
    applyCssVars()
    if (!isPersisting) return
    persistAppearance()
  })
  isPersisting = true

  if (autoBrightness.value) {
    syncThemeFromSystem()
    startAutoBrightnessListener()
    persistAppearance()
  }
}

export function useThemeManager() {
  ensureWatch()

  const currentTheme = computed(() => themes[themeKey.value])
  const blurLevel = computed(() => blurTokenFromIntensity(glassIntensity.value))
  const currentBlur = computed(() => blurPxFromIntensity(glassIntensity.value))
  const currentGlassFill = computed(() =>
    glassFillFromIntensity(glassIntensity.value),
  )
  const currentAccent = computed(() => accents[accentKey.value])
  const currentInteraction = computed(() => interactions[interactionKey.value])

  function setTheme(key: ThemeKey) {
    if (autoBrightness.value) {
      autoBrightness.value = false
      stopAutoBrightnessListener()
    }
    themeKey.value = key
    persistAppearance()
  }

  function toggleTheme() {
    setTheme(
      themeKey.value === 'etherealLumens' ? 'luminousClarity' : 'etherealLumens',
    )
  }

  function setGlassIntensity(value: number) {
    glassIntensity.value = resolveGlassIntensity(value)
    persistAppearance()
  }

  /** Compat: API discreta (BlurToken) → intensidade contínua. */
  function setBlur(level: BlurToken) {
    setGlassIntensity(intensityFromBlurToken(level))
  }

  function setAccent(key: AccentKey) {
    if (!isAccentKey(key)) return
    accentKey.value = key
    persistAppearance()
  }

  function setInteraction(key: InteractionKey) {
    if (!isInteractionKey(key)) return
    interactionKey.value = key
    persistAppearance()
  }

  function setAutoBrightness(enabled: boolean) {
    autoBrightness.value = enabled
    if (enabled) {
      syncThemeFromSystem()
      startAutoBrightnessListener()
    } else {
      stopAutoBrightnessListener()
    }
    persistAppearance()
  }

  return {
    themeKey,
    glassIntensity,
    blurLevel,
    accentKey,
    interactionKey,
    autoBrightness,
    currentTheme,
    currentBlur,
    currentGlassFill,
    currentAccent,
    currentInteraction,
    themes,
    accents,
    interactions,
    setTheme,
    toggleTheme,
    setGlassIntensity,
    setBlur,
    setAccent,
    setInteraction,
    setAutoBrightness,
    applyCssVars,
  }
}
