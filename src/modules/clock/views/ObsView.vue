<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { palcoSession } from '@modules/settings/services/palco-session'
import ObsBrandIcon from '@design-system/components/icons/ObsBrandIcon.vue'

// Issue app#361: card funcional do OBS — Browser Source do palco-server.
// Por baixo usa o palco (transporte); por fora é "Transmitir via OBS".
const { t } = useI18n()

const running = ref(false)
const obsUrl = ref('')
const copied = ref(false)
const turning = ref(false)
const receivers = ref(0)

let timer: ReturnType<typeof setInterval> | null = null

const steps = computed(() => [
  t('utilities.obsStep1'),
  t('utilities.obsStep2'),
  t('utilities.obsStep3'),
])

async function refresh() {
  const st = await palcoSession.status()
  if (st) {
    running.value = st.running
    receivers.value = st.clients
    obsUrl.value =
      'receiverUrl' in st
        ? String((st as { receiverUrl?: string | null }).receiverUrl ?? '')
        : ''
  }
}

async function toggle() {
  if (turning.value) return
  turning.value = true
  try {
    if (running.value) {
      await palcoSession.turnOff()
    } else {
      await palcoSession.turnOn()
    }
    await refresh()
  } finally {
    turning.value = false
  }
}

function copyUrl() {
  if (!obsUrl.value) return
  void navigator.clipboard?.writeText(obsUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

onMounted(() => {
  void refresh()
  timer = setInterval(() => void refresh(), 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="obs-view">
    <header class="obs-view__header">
      <button type="button" class="obs-view__back" @click="$router.back()">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <ObsBrandIcon :size="28" class="obs-view__brand" />
      <h1 class="obs-view__title">{{ t('utilities.obs') }}</h1>
      <span class="obs-view__status" :class="{ 'obs-view__status--on': running }">
        <span class="obs-view__status-dot" aria-hidden="true"></span>
        {{ running ? t('utilities.obsOn', { n: receivers }) : t('utilities.obsOff') }}
      </span>
    </header>

    <p class="obs-view__lead">{{ t('utilities.obsLead') }}</p>

    <div class="obs-view__card ds-glass-card ds-glass-card--padded">
      <div class="obs-view__row">
        <div class="obs-view__hero">
          <div class="obs-view__hero-icon" :class="{ 'obs-view__hero-icon--on': running }">
            <ObsBrandIcon :size="40" />
          </div>
          <div class="obs-view__hero-text">
            <p class="obs-view__label">{{ t('utilities.obsTransmission') }}</p>
            <p
              class="obs-view__state"
              :class="{ 'obs-view__state--on': running }"
            >
              {{
                running
                  ? t('utilities.obsOn', { n: receivers })
                  : t('utilities.obsOff')
              }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="obs-view__toggle"
          :class="{ 'obs-view__toggle--on': running }"
          :disabled="turning"
          @click="toggle"
        >
          <i
            class="ti"
            :class="running ? 'ti-player-stop' : 'ti-player-play'"
            aria-hidden="true"
          ></i>
          {{ running ? t('utilities.obsStop') : t('utilities.obsStart') }}
        </button>
      </div>

      <template v-if="running && obsUrl">
        <p class="obs-view__label">{{ t('utilities.obsUrlLabel') }}</p>
        <div class="obs-view__url-row">
          <code class="obs-view__url">{{ obsUrl }}</code>
          <button
            type="button"
            class="obs-view__copy"
            @click="copyUrl"
          >
            <i
              class="ti"
              :class="copied ? 'ti-check' : 'ti-copy'"
              aria-hidden="true"
            ></i>
            {{ copied ? t('utilities.obsCopied') : t('utilities.obsCopy') }}
          </button>
        </div>
      </template>

      <p class="obs-view__label">{{ t('utilities.obsHowTitle') }}</p>
      <ol class="obs-view__steps">
        <li v-for="(s, i) in steps" :key="i" class="obs-view__step">
          <span class="obs-view__step-num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="obs-view__step-text">{{ s }}</span>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped lang="scss">
.obs-view {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-width: 46rem;
  margin-inline: auto;
  padding-inline: 1.5rem;

  &__header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-top: 0.25rem;
  }

  &__brand {
    color: var(--ds-color-primary);
    flex-shrink: 0;
  }

  &__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 999px;
    background: transparent;
    color: var(--ds-color-on-surface-variant, var(--foreground));
    cursor: pointer;
    font-size: 1.1rem;
    transition: background 150ms ease;

    &:hover {
      background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
    }
  }

  &__title {
    font-size: 1.3rem;
    font-weight: 700;
    margin-right: auto;
  }

  &__status {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.85rem;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));
    border: 1px solid var(--ds-color-outline);
    background: color-mix(in srgb, var(--ds-color-surface, transparent) 60%, transparent);

    &--on {
      color: #22c55e;
      border-color: color-mix(in srgb, #22c55e 35%, transparent);
      background: color-mix(in srgb, #22c55e 10%, transparent);
    }
  }

  &__status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: currentColor;

    .obs-view__status--on & {
      animation: obs-view-pulse 1.6s ease-in-out infinite;
    }
  }

  &__lead {
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));
    font-size: 0.95rem;
    max-width: 40rem;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    margin-top: 0.5rem;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  &__hero {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  &__hero-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    border-radius: 1rem;
    flex-shrink: 0;
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));
    background: color-mix(in srgb, var(--ds-color-surface, #000) 55%, transparent);
    border: 1px solid var(--ds-color-outline);
    transition: all 250ms ease;

    &--on {
      color: var(--ds-color-primary);
      border-color: color-mix(in srgb, var(--ds-color-primary) 40%, transparent);
      background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    }
  }

  &__hero-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  &__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));
  }

  &__state {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));

    &--on {
      color: #22c55e;
    }
  }

  &__toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 999px;
    padding: 0.625rem 1.5rem;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    color: var(--ds-color-primary);
    transition:
      background 200ms ease,
      transform 150ms ease;

    .ti {
      font-size: 18px;
      line-height: 1;
    }

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ds-color-primary) 24%, transparent);
    }

    &:active:not(:disabled) {
      transform: scale(0.96);
    }

    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    &--on {
      border-color: var(--ds-color-outline-strong, var(--ds-color-outline));
      background: transparent;
      color: var(--ds-color-on-surface, var(--foreground));

      &:hover:not(:disabled) {
        background: color-mix(in srgb, var(--ds-color-primary) 8%, transparent);
      }
    }
  }

  &__url-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  &__url {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: color-mix(in srgb, #000 25%, transparent);
    overflow-x: auto;
    white-space: nowrap;
  }

  &__copy {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--ds-color-outline);
    background: transparent;
    color: var(--ds-color-on-surface, var(--foreground));
    border-radius: 0.5rem;
    padding: 0.5rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 150ms ease;

    &:hover {
      background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
    }
  }

  &__steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  &__step {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.85rem;
    border-radius: 0.6rem;
    border: 1px solid var(--ds-color-outline);
    background: color-mix(in srgb, var(--ds-color-surface, #000) 40%, transparent);
    color: var(--ds-color-on-surface-variant, var(--muted-foreground));
    font-size: 0.9rem;
  }

  &__step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  }
}

@keyframes obs-view-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}
</style>
