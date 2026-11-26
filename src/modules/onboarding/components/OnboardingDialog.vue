<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import logoUrl from '@assets/brand/logo-louvor-ja.svg'
import { defaultInteraction } from '@design-system/themes'
import { useHomeLocation } from '@modules/home/composables/useHomeLocation'
import AccentColorCard from '@modules/settings/components/AccentColorCard.vue'
import InteractionModeCard from '@modules/settings/components/InteractionModeCard.vue'
import { useAppearanceSettings } from '@modules/settings/composables/useAppearanceSettings'

import { useOnboarding } from '../composables/useOnboarding'

/**
 * Assistente de primeira execução (SPEC telemetria-dispositivos §4).
 * - Distrito e igreja são obrigatórios para seguir (sem pular).
 * - Cor de realce e animação têm "Usar padrão" para quem não quer escolher.
 */
const { t } = useI18n()
const { profile, setLocation } = useHomeLocation()
const { resetAccent, setInteractionMode } = useAppearanceSettings()
const { mode, steps, stepIndex, currentStep, isOpen, isLastStep, next, back } =
  useOnboarding()

const district = ref('')
const church = ref('')

watch(
  isOpen,
  (open) => {
    if (!open) return
    district.value = profile.value.district
    church.value = profile.value.church
  },
  { immediate: true },
)

const isLocationOnly = computed(() => mode.value === 'location')

const primaryLabel = computed(() => {
  if (isLocationOnly.value) return t('onboarding.save')
  return isLastStep.value ? t('onboarding.finish') : t('onboarding.continue')
})

function saveLocationDraft() {
  const nextLocation = { district: district.value.trim(), church: church.value.trim() }
  if (
    nextLocation.district !== profile.value.district ||
    nextLocation.church !== profile.value.church
  ) {
    setLocation(nextLocation)
  }
}

const isLocationFilled = computed(
  () => district.value.trim().length > 0 && church.value.trim().length > 0,
)

const canContinue = computed(() => currentStep.value !== 'location' || isLocationFilled.value)

function onPrimary() {
  if (!canContinue.value) return
  if (currentStep.value === 'location') saveLocationDraft()
  next()
}

/** "Usar padrão": volta a escolha da tela ao padrão do app e segue. */
function onUseDefault() {
  if (currentStep.value === 'accent') resetAccent()
  else if (currentStep.value === 'interaction') setInteractionMode(defaultInteraction)
  next()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="onboarding-overlay"
      data-test="onboarding-dialog"
    >
      <section
        class="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header class="onboarding-card__top">
          <p
            class="onboarding-card__eyebrow"
            data-test="onboarding-wizard-title"
          >
            <i
              class="ti"
              :class="isLocationOnly ? 'ti-refresh' : 'ti-sparkles'"
              aria-hidden="true"
            />
            <span>{{ isLocationOnly ? t('onboarding.update.wizardTitle') : t('onboarding.wizardTitle') }}</span>
            <span
              v-if="steps.length > 1"
              class="onboarding-card__step"
            >
              {{ t('onboarding.stepOf', { current: stepIndex + 1, total: steps.length }) }}
            </span>
          </p>
          <div
            v-if="steps.length > 1"
            class="onboarding-card__dots"
            :aria-label="t('onboarding.stepOf', { current: stepIndex + 1, total: steps.length })"
          >
            <span
              v-for="(step, index) in steps"
              :key="step"
              class="onboarding-card__dot"
              :class="{ 'onboarding-card__dot--active': index === stepIndex, 'onboarding-card__dot--done': index < stepIndex }"
            />
          </div>
        </header>

        <!-- Instalação nova: boas-vindas nas 3 etapas. Atualização: "seu Piano LouvorJA foi atualizado". -->
        <div
          class="onboarding-welcome"
          data-test="onboarding-welcome"
        >
          <img
            class="onboarding-welcome__logo"
            :src="logoUrl"
            alt=""
            width="56"
            height="56"
          >
          <div class="onboarding-welcome__copy">
            <p class="onboarding-welcome__title">
              {{ isLocationOnly ? t('onboarding.update.title') : t('onboarding.welcome.title') }}
            </p>
            <p class="onboarding-welcome__text">
              {{ isLocationOnly ? t('onboarding.update.text') : t('onboarding.welcome.text') }}
            </p>
          </div>
        </div>

        <div
          v-if="currentStep === 'location'"
          class="onboarding-card__body"
          data-test="onboarding-step-location"
        >
          <i class="ti ti-building-church onboarding-card__icon" aria-hidden="true" />
          <h2 id="onboarding-title" class="onboarding-card__title">
            {{ t('onboarding.location.title') }}
          </h2>
          <p class="onboarding-card__text">
            {{ t('onboarding.location.text') }}
          </p>
          <label class="onboarding-field">
            <span class="onboarding-field__label">{{ t('onboarding.location.district') }}</span>
            <input
              v-model="district"
              class="onboarding-field__input"
              type="text"
              maxlength="80"
              autocomplete="off"
              data-test="onboarding-district"
              :placeholder="t('home.districtPlaceholder')"
            >
          </label>
          <label class="onboarding-field">
            <span class="onboarding-field__label">{{ t('onboarding.location.church') }}</span>
            <input
              v-model="church"
              class="onboarding-field__input"
              type="text"
              maxlength="80"
              autocomplete="off"
              data-test="onboarding-church"
              :placeholder="t('home.churchPlaceholder')"
              @keydown.enter.prevent="onPrimary"
            >
          </label>
          <p class="onboarding-card__note">
            <i class="ti ti-lock" aria-hidden="true" />
            {{ t('onboarding.location.privacy') }}
          </p>
          <p
            v-if="!isLocationFilled"
            class="onboarding-card__note onboarding-card__note--hint"
            data-test="onboarding-required"
          >
            <i class="ti ti-info-circle" aria-hidden="true" />
            {{ t('onboarding.location.required') }}
          </p>
        </div>

        <div
          v-else-if="currentStep === 'accent'"
          class="onboarding-card__body"
          data-test="onboarding-step-accent"
        >
          <h2 id="onboarding-title" class="onboarding-card__title">
            {{ t('onboarding.accent.title') }}
          </h2>
          <p class="onboarding-card__text">
            {{ t('onboarding.accent.text') }}
          </p>
          <AccentColorCard class="onboarding-card__embed" />
        </div>

        <div
          v-else-if="currentStep === 'interaction'"
          class="onboarding-card__body"
          data-test="onboarding-step-interaction"
        >
          <h2 id="onboarding-title" class="onboarding-card__title">
            {{ t('onboarding.interaction.title') }}
          </h2>
          <p class="onboarding-card__text">
            {{ t('onboarding.interaction.text') }}
          </p>
          <InteractionModeCard class="onboarding-card__embed" />
        </div>

        <footer class="onboarding-card__footer">
          <button
            v-if="stepIndex > 0"
            type="button"
            class="onboarding-btn onboarding-btn--ghost onboarding-btn--start"
            data-test="onboarding-back"
            @click="back"
          >
            {{ t('onboarding.back') }}
          </button>
          <button
            v-if="currentStep !== 'location'"
            type="button"
            class="onboarding-btn onboarding-btn--outline"
            data-test="onboarding-default"
            @click="onUseDefault"
          >
            {{ t('onboarding.useDefault') }}
          </button>
          <button
            type="button"
            class="onboarding-btn onboarding-btn--primary"
            data-test="onboarding-primary"
            :disabled="!canContinue"
            @click="onPrimary"
          >
            {{ primaryLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, var(--ds-color-background, #000) 55%, transparent);
  backdrop-filter: blur(6px);
  animation: onboarding-fade var(--ds-motion-duration, 200ms) ease-out;
}

.onboarding-card {
  display: flex;
  width: 520px;
  max-width: 100%;
  max-height: calc(100vh - 32px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.12));
  border-radius: var(--ds-radius-lg, 16px);
  background: var(--ds-color-surface-elevated, var(--ds-color-surface-card, #1e1e2e));
  color: var(--ds-color-on-surface);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
  animation: onboarding-rise calc(var(--ds-motion-duration, 200ms) * 1.5) ease-out;
}

.onboarding-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 20px 24px 4px;
}

.onboarding-card__eyebrow {
  display: flex;
  flex: 1 1 100%;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--ds-color-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  i {
    font-size: 15px;
  }
}

.onboarding-card__step {
  margin-left: auto;
  color: var(--ds-color-on-surface-variant);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.onboarding-card__dots {
  display: flex;
  gap: 6px;
}

.onboarding-card__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ds-radius-full, 999px);
  background: color-mix(in srgb, var(--ds-color-on-surface) 20%, transparent);
  transition:
    width var(--ds-motion-duration, 200ms) ease,
    background var(--ds-motion-duration, 200ms) ease;
}

.onboarding-card__dot--done {
  background: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
}

.onboarding-card__dot--active {
  width: 22px;
  background: var(--ds-color-primary);
}

.onboarding-card__body {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 8px 24px 16px;
}

.onboarding-welcome {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 8px 24px 4px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  border-radius: 14px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--ds-color-primary) 18%, transparent), transparent 60%),
    color-mix(in srgb, var(--ds-color-on-surface) 3%, transparent);
}

.onboarding-welcome__logo {
  flex: none;
  width: 56px;
  height: 56px;
  // Mesma pulsação suave do logo da Home (escala e brilho leves).
  animation: onboarding-logo-pulse 3.2s ease-in-out infinite;
}

@keyframes onboarding-logo-pulse {
  0%,
  100% {
    transform: scale(1);
    filter: drop-shadow(0 0 0 transparent);
  }

  50% {
    transform: scale(1.04);
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--ds-color-primary) 35%, transparent));
  }
}

.onboarding-welcome__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.onboarding-welcome__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.onboarding-welcome__text {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 13px;
  line-height: 1.5;
}

.onboarding-card__icon {
  color: var(--ds-color-primary);
  font-size: 36px;
  line-height: 1;
}

.onboarding-card__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.onboarding-card__text {
  margin: 0 0 4px;
  color: var(--ds-color-on-surface-variant);
  font-size: 14px;
  line-height: 1.5;
}

.onboarding-card__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 12px;
  line-height: 1.45;

  i {
    margin-top: 1px;
    font-size: 14px;
  }
}

// Os cards de Configurações flutuam; dentro do diálogo ficam parados.
.onboarding-card__body .onboarding-card__embed {
  animation: none;
}

.onboarding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.onboarding-field__label {
  font-size: 13px;
  font-weight: 600;
}

.onboarding-field__input {
  padding: 10px 12px;
  border: 1px solid var(--ds-color-outline, rgba(255, 255, 255, 0.16));
  border-radius: 10px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 15px;
  outline: none;
  transition: border-color var(--ds-motion-duration, 200ms) ease;

  &:focus {
    border-color: var(--ds-color-primary);
  }
}

.onboarding-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 20px;
}

.onboarding-btn {
  padding: 9px 18px;
  border: none;
  border-radius: var(--ds-radius-full, 999px);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--ds-motion-duration, 200ms) ease;
}

.onboarding-btn--ghost {
  background: transparent;
  color: var(--ds-color-on-surface-variant);

  &:hover {
    color: var(--ds-color-on-surface);
  }
}

.onboarding-btn--start {
  margin-right: auto;
}

.onboarding-btn--outline {
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
  background: transparent;
  color: var(--ds-color-on-surface);

  &:hover {
    border-color: color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
    color: var(--ds-color-primary);
  }
}

.onboarding-btn--primary {
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #fff);

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.onboarding-card__note--hint {
  color: var(--ds-color-primary);
}

@keyframes onboarding-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes onboarding-rise {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .onboarding-overlay,
  .onboarding-card,
  .onboarding-welcome__logo {
    animation: none;
  }
}
</style>
