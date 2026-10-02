<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'

import {
  COUNTDOWN_TIME_FORMATS,
  type CountdownDisplayConfig,
  type CountdownMode,
  type CountdownTimeFormat,
  type SabbathModeConfig,
} from '../types/countdown'
import {
  getAvailablePresets,
  getPresetDurationMs,
  type AlertPresetKey,
} from '../services/alert-tone'
import {
  addLibraryTone,
  listLibraryTones,
  removeLibraryTone,
  renameLibraryTone,
  type CustomTone,
} from '../services/alert-tone-library'
import { useCountdownStore } from '../stores/useCountdownStore'

const props = defineProps<{
  open: boolean
  config: CountdownDisplayConfig
}>()

const emit = defineEmits<{
  close: []
  'update:timeFormat': [value: CountdownTimeFormat]
  'update:allowNegative': [value: boolean]
  'update:mode': [value: CountdownMode]
  'update:sabbathConfig': [value: SabbathModeConfig]
  reset: []
}>()

const { t } = useI18n()
const store = useCountdownStore()

const toneLibrary = ref<CustomTone[]>([])
const toneError = ref('')
const expandedToneId = ref<string | null>(null)

function refreshLibrary(): void {
  toneLibrary.value = listLibraryTones()
}

/** Marcos efetivos: config v2 ou seeds (paridade). */
const markers = computed(() => props.config.alertMarkers ?? [])

function markerPresetValue(preset: string): string {
  // 'custom:{id}' → o select usa option-group library com value custom:{id}
  return preset
}

function libraryOptions(): Array<{ value: string; label: string }> {
  return toneLibrary.value.map((tone) => ({
    value: `custom:${tone.id}`,
    label: tone.name,
  }))
}

function fixedOptions(): Array<{ key: string; label: string }> {
  return getAvailablePresets().filter((p) => p.key !== 'custom')
}

function onMarkerPresetChange(markerId: string, event: Event): void {
  const preset = (event.target as HTMLSelectElement).value
  store.updateAlertMarker(markerId, { preset: preset as AlertMarkerPresetCast })
}

function onMarkerOffsetChange(markerId: string, event: Event): void {
  const minutes = Number.parseFloat((event.target as HTMLInputElement).value)
  if (Number.isNaN(minutes) || minutes < 0) {
    toneError.value = t('countdown.markerInvalidOffset')
    return
  }
  const offsetMs = Math.round(minutes * 60_000)
  if (!store.updateAlertMarker(markerId, { offsetMs })) {
    toneError.value = t('countdown.markerOffsetTaken')
  }
}

function onAddMarker(): void {
  // default: 3min — colisão cai no offset livre seguinte
  let minutes = 3
  while (minutes < 60 && store.isOffsetTaken(minutes * 60_000)) minutes += 1
  if (minutes >= 60) {
    toneError.value = t('countdown.markerOffsetTaken')
    return
  }
  store.addAlertMarker(minutes * 60_000, 'beep')
}

function onRemoveMarker(markerId: string): void {
  store.removeAlertMarker(markerId)
}

type AlertMarkerPresetCast = Parameters<
  typeof store.updateAlertMarker
>[1] extends { preset?: infer P } ? (P extends string ? P : never) : never

/** Duração legível do preset efetivo do marco. */
function markerDurationLabel(preset: string): string {
  if (preset === 'none') return ''
  if (preset.startsWith('custom:')) {
    const tone = toneLibrary.value.find((tone) => `custom:${tone.id}` === preset)
    return tone ? t('countdown.toneDuration', { dur: tone.name }) : ''
  }
  const ms = getPresetDurationMs(preset as AlertPresetKey)
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`
}

/** Soma das durações dos áudios habilitados — aviso de tempo mínimo. */
const totalTonesMs = computed(() =>
  markers.value.reduce((total, marker) => {
    if (marker.preset === 'none') return total
    if (marker.preset.startsWith('custom:')) return total + 60_000
    return total + getPresetDurationMs(marker.preset as AlertPresetKey)
  }, 0),
)

const tooShortWarning = computed(() => {
  const total = totalTonesMs.value
  if (total <= 0) return ''
  if (store.runtime.durationMs >= total) return ''
  const s = Math.round(total / 1000)
  const label = s >= 60 ? `${Math.floor(s / 60)}min${s % 60 ? ` ${s % 60}s` : ''}` : `${s}s`
  return t('countdown.toneMinDurationWarning', { min: label })
})

function previewPreset(preset: string): void {
  if (preset === 'none') return
  if (preset.startsWith('custom:')) return // preview da library no próprio player do navegador
  void import('../services/alert-tone').then(({ playAlertTone }) =>
    playAlertTone(preset as AlertPresetKey),
  )
}

function previewLibraryTone(tone: CustomTone): void {
  void new Audio(tone.dataUrl).play().catch(() => {
    // autoplay bloqueado — silencioso
  })
}

function onLibraryFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      addLibraryTone(file.name.replace(/\.[^.]+$/, ''), String(reader.result))
      refreshLibrary()
      toneError.value = ''
    } catch {
      toneError.value = t('countdown.customToneTooLarge')
    }
    input.value = ''
  }
  reader.readAsDataURL(file)
}

function onRenameTone(tone: CustomTone, event: Event): void {
  renameLibraryTone(tone.id, (event.target as HTMLInputElement).value)
  refreshLibrary()
}

function onRemoveTone(tone: CustomTone): void {
  // RF-3: marcos que usavam o som voltam pro default (beep)
  for (const marker of markers.value) {
    if (marker.preset === `custom:${tone.id}`) {
      store.updateAlertMarker(marker.id, { preset: 'beep' })
    }
  }
  removeLibraryTone(tone.id)
  refreshLibrary()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="countdown-config-fade">
      <div
        v-if="open"
        class="countdown-config"
        role="dialog"
        aria-modal="true"
        :aria-label="t('countdown.configTitle')"
      >
        <GlassCard
          class="countdown-config__panel"
          elevated
          :padding="false"
        >
          <header class="countdown-config__header">
                      <div class="countdown-config__heading">
                        <div class="countdown-config__heading-icon">
                          <i
                            class="ti ti-settings"
                            aria-hidden="true"
                          />
                        </div>
                        <div>
                          <h2 class="countdown-config__title">
                            {{ t('countdown.configTitle') }}
                          </h2>
                          <p class="countdown-config__subtitle">
                            {{ t('countdown.configSubtitle') }}
                          </p>
                        </div>
                      </div>
            <button
              type="button"
              class="countdown-config__icon-btn"
              :aria-label="t('countdown.close')"
              @click="emit('close')"
            >
              <i
                class="ti ti-x"
                aria-hidden="true"
              />
            </button>
          </header>

          <div class="countdown-config__body">
            <section class="countdown-config__section">
              <div class="countdown-config__section-head">
                <i
                  class="ti ti-clock"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('countdown.timeFormat') }}</h3>
                  <p>{{ t('countdown.timeFormatHint') }}</p>
                </div>
              </div>
              <div
                class="countdown-config__formats"
                role="radiogroup"
                :aria-label="t('countdown.timeFormat')"
              >
                <button
                  v-for="format in COUNTDOWN_TIME_FORMATS"
                  :key="format"
                  type="button"
                  class="countdown-config__format-btn"
                  :class="{ 'countdown-config__format-btn--active': config.timeFormat === format }"
                  role="radio"
                  :aria-checked="config.timeFormat === format"
                  @click="emit('update:timeFormat', format)"
                >
                  {{ format }}
                </button>
              </div>
            </section>

            <section class="countdown-config__section">
                          <div class="countdown-config__section-head">
                            <i
                              class="ti ti-clock-pause"
                              aria-hidden="true"
                            />
                            <div>
                              <h3>{{ t('countdown.allowNegative') }}</h3>
                              <p>{{ t('countdown.allowNegativeHint') }}</p>
                            </div>
                          </div>
                          <label class="countdown-config__toggle">
                            <input
                              type="checkbox"
                              role="switch"
                              :checked="config.allowNegative ?? false"
                              :aria-label="t('countdown.allowNegative')"
                              @change="emit('update:allowNegative', ($event.target as HTMLInputElement).checked)"
                            >
                          </label>
                        </section>

                        <section
              v-if="open"
              class="countdown-config__section"
              data-testid="alert-markers-section"
            >
              <div class="countdown-config__section-head">
                <i
                  class="ti ti-bell"
                  aria-hidden="true"
                />
                <div>
                  <h3>{{ t('countdown.alertTones') }}</h3>
                  <p>{{ t('countdown.alertTonesHint') }}</p>
                </div>
              </div>
              <div
                v-for="marker in markers"
                :key="marker.id"
                class="countdown-config__tone-block"
              >
                <div class="countdown-config__tone-row">
                  <label class="countdown-config__tone-offset">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      class="countdown-config__offset-input"
                      :value="marker.offsetMs / 60_000"
                      :aria-label="t('countdown.markerOffsetLabel')"
                      @change="onMarkerOffsetChange(marker.id, $event)"
                    >
                    <span>min</span>
                  </label>
                  <select
                    class="countdown-config__tone-select"
                    :value="markerPresetValue(marker.preset)"
                    :aria-label="t('countdown.markerPresetLabel')"
                    @change="onMarkerPresetChange(marker.id, $event)"
                  >
                    <optgroup :label="t('countdown.markerGroupPresets')">
                      <option
                        v-for="p in fixedOptions()"
                        :key="p.key"
                        :value="p.key"
                      >
                        {{ p.label }}
                      </option>
                    </optgroup>
                    <optgroup
                      v-if="libraryOptions().length > 0"
                      :label="t('countdown.markerGroupLibrary')"
                    >
                      <option
                        v-for="opt in libraryOptions()"
                        :key="opt.value"
                        :value="opt.value"
                      >
                        {{ opt.label }}
                      </option>
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    class="countdown-config__icon-btn"
                    :aria-label="t('countdown.markerPreview')"
                    @click="previewPreset(marker.preset)"
                  >
                    <i
                      class="ti ti-player-play"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="countdown-config__icon-btn countdown-config__icon-btn--danger"
                    :aria-label="t('countdown.markerRemove')"
                    @click="onRemoveMarker(marker.id)"
                  >
                    <i
                      class="ti ti-trash"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <span
                  v-if="markerDurationLabel(marker.preset)"
                  class="countdown-config__tone-duration"
                >{{ markerDurationLabel(marker.preset) }}</span>
              </div>
              <button
                type="button"
                class="countdown-config__btn countdown-config__btn--add"
                data-testid="add-marker"
                @click="onAddMarker"
              >
                <i
                  class="ti ti-plus"
                  aria-hidden="true"
                />
                {{ t('countdown.markerAdd') }}
              </button>

              <div class="countdown-config__library">
                <h4>{{ t('countdown.libraryTitle') }}</h4>
                <p class="countdown-config__library-hint">
                  {{ t('countdown.libraryHint') }}
                </p>
                <label class="countdown-config__tone-file">
                  <input
                    type="file"
                    accept="audio/*"
                    data-testid="library-upload"
                    @change="onLibraryFile"
                  >
                  <span>{{ t('countdown.libraryUpload') }}</span>
                </label>
                <ul
                  v-if="toneLibrary.length > 0"
                  class="countdown-config__library-list"
                >
                  <li
                    v-for="tone in toneLibrary"
                    :key="tone.id"
                    class="countdown-config__library-item"
                  >
                    <button
                      type="button"
                      class="countdown-config__icon-btn"
                      :aria-label="t('countdown.markerPreview')"
                      @click="previewLibraryTone(tone)"
                    >
                      <i
                        class="ti ti-player-play"
                        aria-hidden="true"
                      />
                    </button>
                    <input
                      type="text"
                      class="countdown-config__library-name"
                      :value="tone.name"
                      :aria-label="t('countdown.libraryRename')"
                      @change="onRenameTone(tone, $event)"
                    >
                    <button
                      type="button"
                      class="countdown-config__icon-btn countdown-config__icon-btn--danger"
                      :aria-label="t('countdown.libraryRemove')"
                      @click="onRemoveTone(tone)"
                    >
                      <i
                        class="ti ti-trash"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                </ul>
                <p
                  v-if="toneError"
                  class="countdown-config__tone-warning"
                  role="alert"
                >
                  {{ toneError }}
                </p>
              </div>
            </section>
          </div>

          <footer class="countdown-config__footer">
            <p
              v-if="tooShortWarning"
              class="countdown-config__tone-warning"
              role="alert"
            >
              <i
                class="ti ti-alert-triangle"
                aria-hidden="true"
              />
              {{ tooShortWarning }}
            </p>
            <button
              type="button"
              class="countdown-config__btn countdown-config__btn--danger"
              @click="emit('reset')"
            >
              {{ t('countdown.resetDisplay') }}
            </button>
            <button
              type="button"
              class="countdown-config__btn countdown-config__btn--primary"
              @click="emit('close')"
            >
              {{ t('countdown.apply') }}
            </button>
          </footer>
        </GlassCard>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.countdown-config {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(2px);
}

.countdown-config__panel {
  display: flex;
  width: min(100%, 42rem);
  max-height: min(90vh, 40rem);
  flex-direction: column;
  overflow: hidden;
}

.countdown-config__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.countdown-config__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
}

.countdown-config__heading-icon {
  display: flex;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.25rem;
  }
}

.countdown-config__title {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
}

.countdown-config__subtitle {
  margin: 0.15rem 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
  line-height: 1.3;
}

.countdown-config__icon-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
    color: var(--ds-color-on-surface);
  }

  .ti {
    font-size: 1.25rem;
  }
}

.countdown-config__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}

.countdown-config__section {
  padding: 1rem;
  border-radius: var(--ds-radius-md, 0.75rem);
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
}

.countdown-config__tone-block {
  padding: 0.5rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);

  &:last-child {
    border-bottom: none;
  }
}

.countdown-config__tone-duration {
            display: block;
            font-size: 0.72rem;
            color: var(--ds-color-on-surface-muted, var(--ds-color-on-surface));
            margin-top: 0.1rem;
          }

          .countdown-config__tone-warning {
            display: flex;
            flex-basis: 100%;
            align-items: center;
            gap: 0.4rem;
            margin: 0 0 0.5rem;
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background: color-mix(in srgb, #f59e0b 15%, transparent);
            color: #b45309;
            font-size: 0.78rem;
          }

          .countdown-config__tone-file {
  display: block;
  margin-top: 0.35rem;
  margin-left: calc(180px + 1rem);
  font-size: 0.85rem;
  color: var(--ds-color-on-surface-variant);

  input[type='file'] {
    max-width: 320px;
    font-size: 0.85rem;
  }
}

.countdown-config__tone-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;

  > label,
  > span.countdown-config__tone-marker {
    flex: 0 0 180px;
    color: var(--ds-color-on-surface);
    font-size: 0.95rem;
  }

  .countdown-config__tone-select {
    flex: 1;
    max-width: 320px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: var(--ds-radius-sm);
    background: var(--ds-color-surface-container);
    color: var(--ds-color-on-surface);
    font-size: 0.95rem;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23757575' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2.5rem;
  }
}

.countdown-config__section-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;

  > .ti {
    margin-top: 0.15rem;
    color: var(--ds-color-primary);
    font-size: 1.35rem;
  }

  h3 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    margin: 0.15rem 0 0;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.75rem;
    line-height: 1.3;
  }
}

.countdown-config__swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem;
}

.countdown-config__swatch {
  width: 2.25rem;
  height: 2.25rem;
  border: 2px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 9999px;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;

  &--active {
    border-color: var(--ds-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
    transform: scale(1.12);
  }

  &:hover {
    transform: scale(1.08);
  }
}

.countdown-config__custom {
  position: relative;
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 2px dashed color-mix(in srgb, var(--ds-color-on-surface) 22%, transparent);
  border-radius: 9999px;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .ti {
    font-size: 0.95rem;
    pointer-events: none;
  }
}

.countdown-config__formats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.countdown-config__format-btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: var(--ds-radius-md, 0.5rem);
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  font-weight: 700;

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary);
  }
}

.countdown-config__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.countdown-config__btn {
  display: inline-flex;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  padding: 0 1.25rem;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 700;

  &--danger {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 16%, transparent);
    color: var(--ds-color-error, #ffb4ab);
  }

  &--primary {
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }
}

.countdown-config-fade-enter-active,
.countdown-config-fade-leave-active {
  transition: opacity 180ms ease;
}

.countdown-config-fade-enter-from,
.countdown-config-fade-leave-to {
  opacity: 0;
}
</style>
