<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import { useStageSettings } from '../composables/useStageSettings'
import {
  COUNTDOWN_TIME_FORMAT_OPTIONS,
  DEFAULT_CLOCK_MODULE_SETTINGS,
  DEFAULT_COUNTDOWN_MODULE_SETTINGS,
  DEFAULT_RANDOM_MODULE_SETTINGS,
  DEFAULT_TIMER_MODULE_SETTINGS,
  OFFICIAL_BG_PREFIX,
  RANDOM_ANIMATION_SPEED_OPTIONS,
  RANDOM_TEXT_TRANSFORM_OPTIONS,
  STAGE_BG_PRESETS,
  STAGE_FG_PRESETS,
  STAGE_MODULE_SCOPES,
  STAGE_OFFICIAL_BACKGROUNDS,
  STAGE_REF_PRESETS,
  TIMER_TIME_FORMAT_OPTIONS,
  officialBgUrl,
  resolveBackgroundImage,
  type StageFontWeight,
  type StageModuleScope,
  type StageSettings,
} from '../types/stage-settings'

import SettingsToggle from './SettingsToggle.vue'
import StagePreview from './StagePreview.vue'

const { t } = useI18n()

const props = defineProps<{
  /** Escopo inicial selecionado (atalho contextual: paleta do módulo abre na sua tab). */
  initialScope?: string
  /** Quando definido, mostra APENAS este escopo (paleta do módulo personaliza só ele). */
  onlyScope?: string
}>()

const {
  settings,
  activeScope,
  isInheritingGlobal,
  setActiveScope,
  patch,
  setBackgroundImage,
  resetScope,
} = useStageSettings()

// Atalho contextual: ao montar com escopo definido, seleciona a tab daquele módulo.
if (props.initialScope) {
  const valid = ['global', ...STAGE_MODULE_SCOPES].includes(props.initialScope)
  if (valid) setActiveScope(props.initialScope as Parameters<typeof setActiveScope>[0])
}
if (props.onlyScope) {
  const valid = ['global', ...STAGE_MODULE_SCOPES].includes(props.onlyScope)
  if (valid) setActiveScope(props.onlyScope as Parameters<typeof setActiveScope>[0])
}

const fileInput = ref<HTMLInputElement | null>(null)

const scopeTabs = [
  { id: 'global' as const, labelKey: 'settings.stage.scopeGlobal' },
  ...STAGE_MODULE_SCOPES.map((id) => ({
    id: id as StageModuleScope,
    labelKey: `settings.stage.scope.${id}`,
  })),
]

// No modo onlyScope as tabs somem (só o módulo sendo personalizado).
const visibleScopeTabs = props.onlyScope
  ? scopeTabs.filter((tab) => tab.id === props.onlyScope)
  : scopeTabs

const weightOptions: { value: StageFontWeight; label: string }[] = [
  { value: 400, label: t('settings.stage.weightNormal') },
  { value: 600, label: t('settings.stage.weightMedium') },
  { value: 800, label: t('settings.stage.weightStrong') },
]

// --- Características próprias por módulo (aditivas) ---

const clockStyleOptions = [
  { value: 'digital' as const, label: t('clock.digital') },
  { value: 'analog' as const, label: t('clock.analog') },
]

const timerFormatOptions = TIMER_TIME_FORMAT_OPTIONS.map((value) => ({
  value,
  label: value,
}))

const countdownFormatOptions = COUNTDOWN_TIME_FORMAT_OPTIONS.map((value) => ({
  value,
  label: value,
}))

function patchClock(partial: Partial<NonNullable<StageSettings['clock']>>) {
  const current = settings.value.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS
  patch({ clock: { ...current, ...partial } })
}

function patchModuleTimeFormat(value: string) {
  if (activeScope.value === 'timer') {
    const current = settings.value.timer ?? DEFAULT_TIMER_MODULE_SETTINGS
    patch({ timer: { ...current, timeFormat: value as NonNullable<StageSettings['timer']>['timeFormat'] } })
  } else if (activeScope.value === 'countdown') {
    const current = settings.value.countdown ?? DEFAULT_COUNTDOWN_MODULE_SETTINGS
    patch({ countdown: { ...current, timeFormat: value as NonNullable<StageSettings['countdown']>['timeFormat'] } })
  }
}

const moduleTimeFormat = computed(() => {
  if (activeScope.value === 'timer') {
    return settings.value.timer?.timeFormat ?? DEFAULT_TIMER_MODULE_SETTINGS.timeFormat
  }
  if (activeScope.value === 'countdown') {
    return settings.value.countdown?.timeFormat ?? DEFAULT_COUNTDOWN_MODULE_SETTINGS.timeFormat
  }
  return null
})

const randomTransformOptions = [
  { value: 'none' as const, label: t('settings.stage.transformNone') },
  { value: 'uppercase' as const, label: 'AA' },
  { value: 'lowercase' as const, label: 'aa' },
]

const randomSpeedOptions = [
  { value: 'slow' as const, label: t('settings.stage.speedSlow') },
  { value: 'normal' as const, label: t('settings.stage.speedNormal') },
  { value: 'fast' as const, label: t('settings.stage.speedFast') },
]

function patchRandom(partial: Partial<NonNullable<StageSettings['random']>>) {
  const current = settings.value.random ?? DEFAULT_RANDOM_MODULE_SETTINGS
  patch({ random: { ...current, ...partial } })
}

const titleWeightOptions: { value: NonNullable<StageSettings['titleFontWeight']>; label: string }[] = [
  { value: 400, label: t('settings.stage.weightNormal') },
  { value: 600, label: t('settings.stage.weightLightPlus') },
  { value: 800, label: t('settings.stage.weightStrong') },
]

function clearTitleOverrides() {
  patch({ titleFontSize: null, titleFontWeight: null, titleTextColor: null, titleTextShadow: null, titleUpperCase: false })
}

function clearLyricOverrides() {
  patch({ lyricFontSize: null, lyricFontWeight: null, lyricTextColor: null, lyricTextShadow: null, lyricUpperCase: false })
}

const lyricWeightOptions: { value: StageFontWeight | null; label: string }[] = [
  { value: null, label: t('settings.stage.weightNormal') },
  { value: 400, label: t('settings.stage.weightLightPlus') },
  { value: 600, label: t('settings.stage.weightMedium') },
]
const bibleWeightOptions: { value: StageSettings['bibleFontWeight']; label: string }[] = [
  { value: 400, label: t('settings.stage.weightNormal') },
  { value: 500, label: t('settings.stage.weightLightPlus') },
  { value: 700, label: t('settings.stage.weightStrong') },
]

const alignOptions = [
  { value: 'left', label: t('settings.stage.alignLeft') },
  { value: 'center', label: t('settings.stage.alignCenter') },
  { value: 'right', label: t('settings.stage.alignRight') },
] as const

const vAlignOptions = [
  { value: 'top', label: t('settings.stage.alignTop') },
  { value: 'middle', label: t('settings.stage.alignMiddle') },
  { value: 'bottom', label: t('settings.stage.alignBottom') },
] as const

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string') setBackgroundImage(reader.result)
  }
  reader.readAsDataURL(file)
  input.value = ''
}

const confirmReset = ref(false)
</script>

<template>
  <GlassCard class="stage-custom">
    <div class="stage-custom__header">
      <i class="ti ti-palette stage-custom__icon" aria-hidden="true" />
      <h3 class="stage-custom__title">{{ t('settings.stage.title') }}</h3>
    </div>

    <!-- Escopos: global (padrão herdado) + um por módulo -->
    <div
      v-if="visibleScopeTabs.length > 1"
      class="stage-custom__scopes"
      role="tablist"
    >
      <button
        v-for="tab in visibleScopeTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeScope === tab.id"
        class="stage-custom__scope-btn"
        :class="{ 'stage-custom__scope-btn--active': activeScope === tab.id }"
        @click="setActiveScope(tab.id)"
      >
        {{ t(tab.labelKey) }}
      </button>
    </div>
    <p
      v-if="isInheritingGlobal"
      class="stage-custom__hint"
    >
      {{ t('settings.stage.inheritingHint') }}
    </p>

    <StagePreview
      class="stage-custom__preview"
      :settings="settings"
      :module="activeScope === 'global' ? 'hymns' : activeScope"
    />

    <div class="stage-custom__section">
      <p class="stage-custom__label">{{ t('settings.stage.backgroundColor') }}</p>
      <div class="stage-custom__swatches">
        <button
          v-for="preset in STAGE_BG_PRESETS"
          :key="preset.color"
          type="button"
          class="stage-custom__swatch"
          :class="{ 'stage-custom__swatch--active': settings.backgroundColor === preset.color }"
          :style="{ '--swatch': preset.color }"
          :aria-label="preset.label"
          @click="patch({ backgroundColor: preset.color })"
        />
        <label class="stage-custom__picker">
          <i class="ti ti-color-picker" aria-hidden="true" />
          <input
            type="color"
            :value="settings.backgroundColor"
            :aria-label="t('settings.stage.backgroundColor')"
            @input="patch({ backgroundColor: ($event.target as HTMLInputElement).value })"
          >
        </label>
      </div>
    </div>

    <div class="stage-custom__section">
      <p class="stage-custom__label">
        {{ t('settings.stage.backgroundImage') }}
      </p>
      <div
        v-if="settings.backgroundImage"
        class="stage-custom__bg-preview"
      >
        <img
          :src="resolveBackgroundImage(settings.backgroundImage) ?? undefined"
          alt=""
          class="stage-custom__bg-img"
        >
        <div class="stage-custom__bg-actions">
          <button
            type="button"
            class="stage-custom__bg-btn stage-custom__bg-btn--danger"
            :aria-label="t('settings.stage.removeImage')"
            @click="setBackgroundImage(null)"
          >
            <i class="ti ti-trash" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="stage-custom__bg-btn"
            :aria-label="t('settings.stage.changeImage')"
            @click="fileInput?.click()"
          >
            <i class="ti ti-pencil" aria-hidden="true" />
          </button>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="stage-custom__dropzone"
        @click="fileInput?.click()"
      >
        <i class="ti ti-cloud-upload" aria-hidden="true" />
        <span>{{ t('settings.stage.selectImage') }}</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="sr-only"
        :aria-label="t('settings.stage.selectImage')"
        @change="onFileSelected"
      >
      <!-- Galeria de backgrounds oficiais (mesmos do casting DLNA do APK) -->
      <div class="stage-custom__official-grid">
        <button
          v-for="bgId in STAGE_OFFICIAL_BACKGROUNDS"
          :key="bgId"
          type="button"
          class="stage-custom__official-tile"
          :class="{ 'stage-custom__official-tile--active':
            settings.backgroundImage === `${OFFICIAL_BG_PREFIX}${bgId}` }"
          :aria-label="`${t('settings.stage.officialBackground')} ${bgId}`"
          @click="setBackgroundImage(settings.backgroundImage === `${OFFICIAL_BG_PREFIX}${bgId}` ? null : `${OFFICIAL_BG_PREFIX}${bgId}`)"
        >
          <img
            :src="officialBgUrl(bgId)"
            alt=""
            loading="lazy"
          >
          <i
            v-if="settings.backgroundImage === `${OFFICIAL_BG_PREFIX}${bgId}`"
            class="ti ti-check stage-custom__official-check"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <!-- Tipografia geral não vale na Bíblia (usa aparência própria abaixo). -->
    <template v-if="activeScope !== 'bible'">
      <div class="stage-custom__section">
        <p class="stage-custom__label">{{ t('settings.stage.textColor') }}</p>
        <div class="stage-custom__swatches">
          <button
            v-for="preset in STAGE_FG_PRESETS"
            :key="preset.color"
            type="button"
            class="stage-custom__swatch"
            :class="{ 'stage-custom__swatch--active': settings.textColor === preset.color }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.label"
            @click="patch({ textColor: preset.color })"
          />
          <label class="stage-custom__picker">
            <i class="ti ti-color-picker" aria-hidden="true" />
            <input
              type="color"
              :value="settings.textColor"
              :aria-label="t('settings.stage.textColor')"
              @input="patch({ textColor: ($event.target as HTMLInputElement).value })"
            >
          </label>
        </div>
      </div>

      <div class="stage-custom__section">
        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.fontSize') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.fontSize) }}px</span>
        </div>
        <input
          type="range"
          min="60"
          max="160"
          step="2"
          :value="settings.fontSize"
          :aria-label="t('settings.stage.fontSize')"
          @input="patch({ fontSize: Number(($event.target as HTMLInputElement).value) })"
        >
      </div>

      <div class="stage-custom__section">
        <p class="stage-custom__label">{{ t('settings.stage.fontWeight') }}</p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in weightOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="settings.fontWeight === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': settings.fontWeight === opt.value }"
            @click="patch({ fontWeight: opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </template>

    <!-- Hinos: título (1º slide/capa) com tipografia própria -->
    <template v-if="activeScope === 'hymns'">
      <div class="stage-custom__section stage-custom__section--bible">
        <p class="stage-custom__label">{{ t('settings.stage.titleAppearance') }}</p>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="clearTitleOverrides"
          >
            {{ t('settings.stage.titleReset') }}
          </button>
        </div>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.titleTextColor') }}
        </p>
        <div class="stage-custom__swatches">
          <button
            v-for="preset in STAGE_FG_PRESETS"
            :key="preset.color"
            type="button"
            class="stage-custom__swatch"
            :class="{ 'stage-custom__swatch--active': settings.titleTextColor === preset.color }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.label"
            @click="patch({ titleTextColor: preset.color })"
          />
          <label class="stage-custom__picker">
            <i class="ti ti-color-picker" aria-hidden="true" />
            <input
              type="color"
              :value="settings.titleTextColor ?? settings.textColor"
              :aria-label="t('settings.stage.titleTextColor')"
              @input="patch({ titleTextColor: ($event.target as HTMLInputElement).value })"
            >
          </label>
        </div>

        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.titleFontSize') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.titleFontSize ?? settings.fontSize) }}px</span>
        </div>
        <input
          type="range"
          min="60"
          max="160"
          step="2"
          :value="settings.titleFontSize ?? settings.fontSize"
          :aria-label="t('settings.stage.titleFontSize')"
          @input="patch({ titleFontSize: Number(($event.target as HTMLInputElement).value) })"
        >

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.titleFontWeight') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in titleWeightOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="settings.titleFontWeight === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': settings.titleFontWeight === opt.value }"
            @click="patch({ titleFontWeight: settings.titleFontWeight === opt.value ? null : opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ titleUpperCase: !settings.titleUpperCase })"
          >
            {{ t('settings.stage.titleUpperCase') }}
          </button>
          <input
            type="checkbox"
            class="stage-custom__toggle"
            :checked="settings.titleUpperCase"
            :aria-label="t('settings.stage.titleUpperCase')"
            @change="patch({ titleUpperCase: ($event.target as HTMLInputElement).checked })"
          >
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ titleTextShadow: settings.titleTextShadow === null ? !settings.textShadow : !settings.titleTextShadow })"
          >
            {{ t('settings.stage.titleTextShadow') }}
          </button>
          <input
            type="checkbox"
            class="stage-custom__toggle"
            :checked="settings.titleTextShadow ?? settings.textShadow"
            :aria-label="t('settings.stage.titleTextShadow')"
            @change="patch({ titleTextShadow: ($event.target as HTMLInputElement).checked })"
          >
        </div>
      </div>
    </template>

    <!-- Hinos: estrofes com tipografia própria (espelha o título) -->
    <template v-if="activeScope === 'hymns'">
      <div class="stage-custom__section stage-custom__section--bible">
        <p class="stage-custom__label">{{ t('settings.stage.lyricAppearance') }}</p>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="clearLyricOverrides"
          >
            {{ t('settings.stage.lyricReset') }}
          </button>
        </div>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.lyricTextColor') }}
        </p>
        <div class="stage-custom__swatches">
          <button
            v-for="preset in STAGE_FG_PRESETS"
            :key="preset.color"
            type="button"
            class="stage-custom__swatch"
            :class="{ 'stage-custom__swatch--active': settings.lyricTextColor === preset.color }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.label"
            @click="patch({ lyricTextColor: preset.color })"
          />
          <label class="stage-custom__picker">
            <i class="ti ti-color-picker" aria-hidden="true" />
            <input
              type="color"
              :value="settings.lyricTextColor ?? settings.textColor"
              :aria-label="t('settings.stage.lyricTextColor')"
              @input="patch({ lyricTextColor: ($event.target as HTMLInputElement).value })"
            >
          </label>
        </div>

        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.lyricFontSize') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.lyricFontSize ?? settings.fontSize) }}px</span>
        </div>
        <input
          type="range"
          min="60"
          max="160"
          step="2"
          :value="settings.lyricFontSize ?? settings.fontSize"
          :aria-label="t('settings.stage.lyricFontSize')"
          @input="patch({ lyricFontSize: Number(($event.target as HTMLInputElement).value) })"
        >

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.lyricFontWeight') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in lyricWeightOptions"
            :key="String(opt.value)"
            type="button"
            role="radio"
            :aria-checked="(settings.lyricFontWeight ?? null) === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': (settings.lyricFontWeight ?? null) === opt.value }"
            @click="patch({ lyricFontWeight: (settings.lyricFontWeight ?? null) === opt.value ? null : opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ lyricUpperCase: !settings.lyricUpperCase })"
          >
            {{ t('settings.stage.lyricUpperCase') }}
          </button>
          <input
            type="checkbox"
            class="stage-custom__toggle"
            :checked="settings.lyricUpperCase"
            :aria-label="t('settings.stage.lyricUpperCase')"
            @change="patch({ lyricUpperCase: ($event.target as HTMLInputElement).checked })"
          >
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ lyricTextShadow: settings.lyricTextShadow === null ? !settings.textShadow : !settings.lyricTextShadow })"
          >
            {{ t('settings.stage.lyricTextShadow') }}
          </button>
          <input
            type="checkbox"
            class="stage-custom__toggle"
            :checked="settings.lyricTextShadow ?? settings.textShadow"
            :aria-label="t('settings.stage.lyricTextShadow')"
            @change="patch({ lyricTextShadow: ($event.target as HTMLInputElement).checked })"
          >
        </div>
      </div>
    </template>
    <!-- Bíblia: tipografia própria (F3.3o) -->
    <template v-if="activeScope === 'bible'">
      <div class="stage-custom__section stage-custom__section--bible">
        <p class="stage-custom__label">{{ t('settings.stage.bibleAppearance') }}</p>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.bibleTextColor') }}
        </p>
        <div class="stage-custom__swatches">
          <button
            v-for="preset in STAGE_FG_PRESETS"
            :key="preset.color"
            type="button"
            class="stage-custom__swatch"
            :class="{ 'stage-custom__swatch--active': settings.bibleTextColor === preset.color }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.label"
            @click="patch({ bibleTextColor: preset.color })"
          />
          <label class="stage-custom__picker">
            <i class="ti ti-color-picker" aria-hidden="true" />
            <input
              type="color"
              :value="settings.bibleTextColor"
              :aria-label="t('settings.stage.bibleTextColor')"
              @input="patch({ bibleTextColor: ($event.target as HTMLInputElement).value })"
            >
          </label>
        </div>

        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.bibleFontSize') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.bibleFontSize) }}px</span>
        </div>
        <input
          type="range"
          min="50"
          max="140"
          step="2"
          :value="settings.bibleFontSize"
          :aria-label="t('settings.stage.bibleFontSize')"
          @input="patch({ bibleFontSize: Number(($event.target as HTMLInputElement).value) })"
        >

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.bibleFontWeight') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in bibleWeightOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="settings.bibleFontWeight === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': settings.bibleFontWeight === opt.value }"
            @click="patch({ bibleFontWeight: opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ showBibleVersion: !settings.showBibleVersion })"
          >
            {{ t('settings.stage.showBibleVersion') }}
          </button>
          <SettingsToggle
            :model-value="settings.showBibleVersion"
            :label="t('settings.stage.showBibleVersion')"
            @update:model-value="patch({ showBibleVersion: $event })"
          />
        </div>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.footerRefColor') }}
        </p>
        <div class="stage-custom__swatches">
          <button
            v-for="preset in STAGE_REF_PRESETS"
            :key="preset.color"
            type="button"
            class="stage-custom__swatch"
            :class="{ 'stage-custom__swatch--active': settings.footerRefColor === preset.color }"
            :style="{ '--swatch': preset.color }"
            :aria-label="preset.label"
            @click="patch({ footerRefColor: preset.color })"
          />
          <label class="stage-custom__picker">
            <i class="ti ti-color-picker" aria-hidden="true" />
            <input
              type="color"
              :value="settings.footerRefColor"
              :aria-label="t('settings.stage.footerRefColor')"
              @input="patch({ footerRefColor: ($event.target as HTMLInputElement).value })"
            >
          </label>
        </div>
      </div>
    </template>

    <!-- Características PRÓPRIAS do módulo (clock/timer/countdown) — aditivas -->
    <template v-if="activeScope === 'clock'">
      <div class="stage-custom__section stage-custom__section--module">
        <p class="stage-custom__label">{{ t('settings.stage.moduleFeatures') }}</p>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.clockStyle') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in clockStyleOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).style === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': (settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).style === opt.value }"
            @click="patchClock({ style: opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patchClock({ showSeconds: !(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).showSeconds })"
          >
            {{ t('settings.stage.clockShowSeconds') }}
          </button>
          <button
            type="button"
            role="switch"
            :aria-checked="(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).showSeconds"
            class="stage-custom__switch"
            :class="{ 'stage-custom__switch--on': (settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).showSeconds }"
            :aria-label="t('settings.stage.clockShowSeconds')"
            @click="patchClock({ showSeconds: !(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).showSeconds })"
          />
        </div>

        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patchClock({ format24h: !(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).format24h })"
          >
            {{ t('settings.stage.clockFormat24h') }}
          </button>
          <button
            type="button"
            role="switch"
            :aria-checked="(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).format24h"
            class="stage-custom__switch"
            :class="{ 'stage-custom__switch--on': (settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).format24h }"
            :aria-label="t('settings.stage.clockFormat24h')"
            @click="patchClock({ format24h: !(settings.clock ?? DEFAULT_CLOCK_MODULE_SETTINGS).format24h })"
          />
        </div>
      </div>
    </template>

    <template v-else-if="activeScope === 'timer' || activeScope === 'countdown'">
      <div class="stage-custom__section stage-custom__section--module">
        <p class="stage-custom__label">{{ t('settings.stage.moduleFeatures') }}</p>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.timeFormat') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in activeScope === 'timer' ? timerFormatOptions : countdownFormatOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="moduleTimeFormat === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': moduleTimeFormat === opt.value }"
            @click="patchModuleTimeFormat(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="activeScope === 'random'">
      <div class="stage-custom__section stage-custom__section--module">
        <p class="stage-custom__label">{{ t('settings.stage.moduleFeatures') }}</p>

        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.randomFontSize') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS ? (settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).fontSizePc : 8) }}%</span>
        </div>
        <input
          type="range"
          min="4"
          max="14"
          step="1"
          :value="(settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).fontSizePc"
          :aria-label="t('settings.stage.randomFontSize')"
          @input="patchRandom({ fontSizePc: Number(($event.target as HTMLInputElement).value) })"
        >

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.randomTextTransform') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in randomTransformOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="(settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).textTransform === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': (settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).textTransform === opt.value }"
            @click="patchRandom({ textTransform: opt.value })"
          >
            {{ opt.label }}
          </button>
        </div>

        <p class="stage-custom__label stage-custom__label--sub">
          {{ t('settings.stage.randomAnimationSpeed') }}
        </p>
        <div class="stage-custom__segment" role="radiogroup">
          <button
            v-for="opt in randomSpeedOptions"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="(settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).animationSpeed === opt.value"
            class="stage-custom__segment-btn"
            :class="{ 'stage-custom__segment-btn--active': (settings.random ?? DEFAULT_RANDOM_MODULE_SETTINGS).animationSpeed === opt.value }"
              @click="patchRandom({ animationSpeed: opt.value })"
            >
              {{ opt.label }}
            </button>
            </div>
            </div>
            </template>

            <template v-else-if="activeScope === 'hymns'">
            <div class="stage-custom__section stage-custom__section--module">
            <p class="stage-custom__label">{{ t('settings.stage.musicBg') }}</p>
            <button
            type="button"
            role="switch"
            :aria-checked="settings.hymns?.overrideBg === true"
            class="stage-custom__switch"
            :class="{ 'stage-custom__switch--on': settings.hymns?.overrideBg === true }"
            :aria-label="t('settings.stage.musicBgOverride')"
            @click="patch({ hymns: { overrideBg: settings.hymns?.overrideBg !== true } })"
            />
            <p class="stage-custom__hint">{{ t('settings.stage.musicBgHint') }}</p>
            </div>
            </template>

    <!-- Sombra e caixinha (F3.3m) -->
    <div class="stage-custom__section">
      <p class="stage-custom__label">{{ t('settings.stage.shadowAndBox') }}</p>
      <div class="stage-custom__toggle-row">
        <button
          type="button"
          class="stage-custom__toggle-label"
          @click="patch({ textShadow: !settings.textShadow })"
        >
          {{ t('settings.stage.textShadow') }}
        </button>
        <SettingsToggle
          :model-value="settings.textShadow"
          :label="t('settings.stage.textShadow')"
          @update:model-value="patch({ textShadow: $event })"
        />
      </div>
      <template v-if="settings.textShadow">
        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.shadowIntensity') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.shadowIntensity * 100) }}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1"
          step="0.05"
          :value="settings.shadowIntensity"
          :aria-label="t('settings.stage.shadowIntensity')"
          @input="patch({ shadowIntensity: Number(($event.target as HTMLInputElement).value) })"
        >
        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.shadowBlur') }}</span>
          <span class="stage-custom__chip">{{ settings.shadowBlur.toFixed(1) }}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          :value="settings.shadowBlur"
          :aria-label="t('settings.stage.shadowBlur')"
          @input="patch({ shadowBlur: Number(($event.target as HTMLInputElement).value) })"
        >
      </template>
      <div class="stage-custom__toggle-row">
        <button
          type="button"
          class="stage-custom__toggle-label"
          @click="patch({ textBox: !settings.textBox })"
        >
          {{ t('settings.stage.textBox') }}
        </button>
        <SettingsToggle
          :model-value="settings.textBox"
          :label="t('settings.stage.textBox')"
          @update:model-value="patch({ textBox: $event })"
        />
      </div>
      <template v-if="settings.textBox">
        <div class="stage-custom__row-head">
          <span>{{ t('settings.stage.boxOpacity') }}</span>
          <span class="stage-custom__chip">{{ Math.round(settings.boxOpacity * 100) }}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          :value="settings.boxOpacity"
          :aria-label="t('settings.stage.boxOpacity')"
          @input="patch({ boxOpacity: Number(($event.target as HTMLInputElement).value) })"
        >
        <div class="stage-custom__toggle-row">
          <button
            type="button"
            class="stage-custom__toggle-label"
            @click="patch({ boxBorder: !settings.boxBorder })"
          >
            {{ t('settings.stage.boxBorder') }}
          </button>
          <SettingsToggle
            :model-value="settings.boxBorder"
            :label="t('settings.stage.boxBorder')"
            @update:model-value="patch({ boxBorder: $event })"
          />
        </div>
      </template>
    </div>

    <!-- Alinhamentos -->
    <div class="stage-custom__section">
      <p class="stage-custom__label">{{ t('settings.stage.alignment') }}</p>
      <p class="stage-custom__label stage-custom__label--sub">
        {{ t('settings.stage.horizontal') }}
      </p>
      <div class="stage-custom__segment" role="radiogroup">
        <button
          v-for="opt in alignOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :aria-checked="settings.textAlign === opt.value"
          class="stage-custom__segment-btn"
          :class="{ 'stage-custom__segment-btn--active': settings.textAlign === opt.value }"
          @click="patch({ textAlign: opt.value })"
        >
          {{ opt.label }}
        </button>
      </div>
      <p class="stage-custom__label stage-custom__label--sub">
        {{ t('settings.stage.vertical') }}
      </p>
      <div class="stage-custom__segment" role="radiogroup">
        <button
          v-for="opt in vAlignOptions"
          :key="opt.value"
          type="button"
          role="radio"
          :aria-checked="settings.textVerticalAlign === opt.value"
          class="stage-custom__segment-btn"
          :class="{ 'stage-custom__segment-btn--active': settings.textVerticalAlign === opt.value }"
          @click="patch({ textVerticalAlign: opt.value })"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Redefinir -->
    <div class="stage-custom__footer">
      <button
        v-if="!confirmReset"
        type="button"
        class="stage-custom__reset"
        @click="confirmReset = true"
      >
        <i class="ti ti-rotate" aria-hidden="true" />
        {{ t('settings.stage.reset') }}
      </button>
      <template v-else>
        <span class="stage-custom__reset-msg">
          {{ t('settings.stage.resetConfirm') }}
        </span>
        <button
          type="button"
          class="stage-custom__reset stage-custom__reset--cancel"
          @click="confirmReset = false"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="stage-custom__reset stage-custom__reset--confirm"
          @click="confirmReset = false; resetScope()"
        >
          {{ t('settings.stage.reset') }}
        </button>
      </template>
    </div>
  </GlassCard>
</template>

<style scoped lang="scss">
.stage-custom {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;

  @media (max-width: 1280px) {
    gap: 1rem;
    padding: 1.15rem;
  }
}

.stage-custom__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.stage-custom__icon {
  color: var(--ds-color-tertiary, #ffb77b);
  font-size: 24px;
  line-height: 1;
}

.stage-custom__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;

  @media (max-width: 1280px) {
    font-size: 16px;
    line-height: 22px;
  }
}

.stage-custom__scopes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.25rem;
  border-radius: var(--ds-radius-md);
  background: color-mix(in srgb, var(--ds-color-surface-container-high) 80%, transparent);
}

.stage-custom__scope-btn {
  padding: 0.45rem 0.9rem;
  border: 0;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  }

  &--active {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }
}

.stage-custom__hint {
  margin: -0.75rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
}

.stage-custom__section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  &--bible {
    padding: 1.15rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: var(--ds-radius-lg);
    background: color-mix(in srgb, var(--ds-color-surface) 40%, transparent);
  }
}

.stage-custom__label {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  line-height: 16px;
  text-transform: uppercase;

  &--sub {
    margin-top: 0.5rem;
  }
}

.stage-custom__row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ds-color-on-surface);
  font-size: 14px;
  font-weight: 600;
}

.stage-custom__chip {
  padding: 0.15rem 0.6rem;
  border-radius: var(--ds-radius-full);
  background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
  color: var(--ds-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.stage-custom__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.stage-custom__swatch {
  width: 2.5rem;
  height: 2.5rem;
  border: 2px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: var(--ds-radius-full);
  background: var(--swatch);
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease;

  &:hover {
    transform: scale(1.08);
  }

  &--active {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
  }
}

.stage-custom__picker {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 20%, transparent);
  border-radius: var(--ds-radius-full);
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .ti {
    font-size: 18px;
    pointer-events: none;
  }
}

.stage-custom__segment {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0.25rem;
  max-width: 28rem;
  padding: 0.25rem;
  border-radius: var(--ds-radius-md);
  background: color-mix(in srgb, var(--ds-color-surface-container-high) 70%, transparent);
}

.stage-custom__segment-btn {
  padding: 0.45rem 0.5rem;
  border: 0;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
    color: var(--ds-color-primary);
    font-weight: 600;
  }
}

.stage-custom__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.stage-custom__toggle-label {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    color: var(--ds-color-on-surface);
  }
}

.stage-custom__dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 7rem;
  padding: 1rem;
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: var(--ds-radius-lg);
  background: color-mix(in srgb, var(--ds-color-surface-container) 50%, transparent);
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
  cursor: pointer;

  .ti {
    color: var(--ds-color-primary);
    font-size: 28px;
  }
}

// Galeria de backgrounds oficiais (assets do casting DLNA do APK)
.stage-custom__official-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.stage-custom__official-tile {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  background: none;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.4);
  }

  &--active {
    border-color: var(--stage-accent, #fcce02);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.stage-custom__official-check {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  color: #fcce02;
  background: rgba(0, 0, 0, 0.35);
}

.stage-custom__bg-preview {
  position: relative;
  overflow: hidden;
  height: 8rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-lg);
}

.stage-custom__bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stage-custom__bg-actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  background: rgb(0 0 0 / 0.35);
}

.stage-custom__bg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: var(--ds-radius-full);
  background: #fff;
  color: #111;
  cursor: pointer;

  &--danger {
    background: var(--ds-color-error, #ffb4ab);
    color: #1a0a08;
  }
}

.stage-custom__footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.stage-custom__reset {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: var(--ds-radius-md);
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: var(--ds-color-on-surface);
  }

  &--confirm {
    border-color: var(--ds-color-error, #ffb4ab);
    color: var(--ds-color-error, #ffb4ab);
  }
}

.stage-custom__reset-msg {
  flex: 1;
  color: var(--ds-color-on-surface-variant);
  font-size: 13px;
}

input[type='range'] {
  width: 100%;
  accent-color: var(--ds-color-primary);
}
</style>
