<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { palcoSession } from '@modules/settings/services/palco-session'

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
      <h1 class="obs-view__title">
        <i class="ti ti-broadcast" aria-hidden="true"></i>
        {{ t('utilities.obs') }}
      </h1>
    </header>

    <p class="obs-view__lead">{{ t('utilities.obsLead') }}</p>

    <div class="obs-view__card ds-glass-card ds-glass-card--padded">
      <div class="obs-view__row">
        <div>
          <p class="obs-view__label">{{ t('utilities.obsTransmission') }}</p>
          <p class="obs-view__state" :class="{ 'obs-view__state--on': running }">
            {{
              running
                ? t('utilities.obsOn', { n: receivers })
                : t('utilities.obsOff')
            }}
          </p>
        </div>
        <button
          type="button"
          class="obs-view__toggle"
          :class="{ 'obs-view__toggle--on': running }"
          :disabled="turning"
          @click="toggle"
        >
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

        <p class="obs-view__label">{{ t('utilities.obsHowTitle') }}</p>
        <ol class="obs-view__steps">
          <li v-for="(s, i) in steps" :key="i">{{ s }}</li>
        </ol>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.obs-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 46rem;

  &__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  &__back {
    border: none;
    background: transparent;
    color: var(--foreground);
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0.25rem;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.35rem;
    font-weight: 700;
  }

  &__lead {
    color: var(--muted-foreground);
    font-size: 0.95rem;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  &__label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted-foreground);
  }

  &__state {
    font-size: 1rem;
    color: var(--muted-foreground);

    &--on {
      color: #22c55e;
      font-weight: 600;
    }
  }

  &__toggle {
    border: none;
    border-radius: 999px;
    padding: 0.55rem 1.4rem;
    font-weight: 700;
    cursor: pointer;
    background: var(--accent);
    color: var(--background);

    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    &--on {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--foreground);
    }
  }

  &__url-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  &__url {
    flex: 1;
    font-size: 0.85rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: rgba(0, 0, 0, 0.25);
    overflow-x: auto;
    white-space: nowrap;
  }

  &__copy {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--foreground);
    border-radius: 0.5rem;
    padding: 0.5rem 0.8rem;
    cursor: pointer;
    font-size: 0.85rem;
  }

  &__steps {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    color: var(--muted-foreground);
    font-size: 0.9rem;
  }
}
</style>
