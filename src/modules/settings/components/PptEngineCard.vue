<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  DetectedPresentationEngine,
  PresentationEngine,
} from '@/shared/types/desktop-bridge'

const { t } = useI18n()

const bridge = window.louvorja
const hasApi = Boolean(bridge?.isElectron && bridge.presentation?.getEngine)

const engine = ref<PresentationEngine>('auto')
const installed = ref<DetectedPresentationEngine[]>([])
const busy = ref(false)
const detecting = ref(false)
const scanned = ref(false)

async function loadPreference() {
  if (!hasApi) return
  try {
    engine.value = await bridge!.presentation!.getEngine!()
  } catch {
    engine.value = 'auto'
  }
}

async function detectInstalled() {
  if (!hasApi || detecting.value || !bridge?.presentation?.detectEngines) return
  detecting.value = true
  try {
    installed.value = (await bridge.presentation.detectEngines()) ?? []
  } catch {
    installed.value = []
  } finally {
    detecting.value = false
    scanned.value = true
  }
}

onMounted(async () => {
  await loadPreference()
  await detectInstalled()
})

async function setEngine(next: PresentationEngine) {
  /* v8 ignore next 1 -- controles só renderizam com hasApi; busy bloqueia no template */
  if (!hasApi || busy.value) return
  if (next === 'custom') {
    await pickCustomApp()
    return
  }
  busy.value = true
  const previous = engine.value
  engine.value = next
  try {
    const ok = await bridge!.presentation!.setEngine!(next)
    if (!ok) engine.value = previous
  } catch {
    engine.value = previous
  } finally {
    busy.value = false
  }
}

/** Seletor de aplicativo externo (Keynote, OnlyOffice, WPS...). */
async function pickCustomApp() {
  try {
    const picked = await bridge!.dialog!.openFile!({
      title: t('settings.presentation.customAppTitle'),
      multiple: false,
    })
    const appPath = Array.isArray(picked) ? picked[0] : picked
    if (typeof appPath === 'string' && appPath.trim()) {
      const ok = await bridge!.presentation!.setCustomApp!(appPath.trim())
      if (ok) {
        await bridge!.presentation!.setEngine!('custom')
        engine.value = 'custom'
      }
    }
  } catch {
    /* usuário cancelou */
  }
}
</script>

<template>
  <section class="ppt-engine-card" data-test="ppt-engine-card">
    <h3>{{ t('settings.presentation.title') }}</h3>
    <p class="hint">{{ t('settings.presentation.description') }}</p>

    <div
      v-if="hasApi"
      class="options"
      role="radiogroup"
      :aria-label="t('settings.presentation.title')"
    >
      <button
        type="button"
        role="radio"
        :aria-checked="engine === 'auto'"
        :class="{ selected: engine === 'auto' }"
        data-test="ppt-engine-auto"
        :disabled="busy"
        @click="setEngine('auto')"
      >
        {{ t('settings.presentation.engine.auto') }}
      </button>

      <button
        type="button"
        class="detect"
        data-test="ppt-engine-detect"
        :disabled="busy || detecting"
        @click="detectInstalled"
      >
        {{
          detecting
            ? t('settings.presentation.detecting')
            : t('settings.presentation.detect')
        }}
      </button>

      <button
        type="button"
        role="radio"
        :aria-checked="engine === 'custom'"
        :class="{ selected: engine === 'custom' }"
        data-test="ppt-engine-custom"
        :disabled="busy"
        @click="setEngine('custom')"
      >
        {{
          engine === 'custom'
            ? t('settings.presentation.customActive')
            : t('settings.presentation.custom')
        }}
      </button>
    </div>

    <template v-if="hasApi && scanned">
      <p
        v-if="installed.length > 0"
        class="hint"
      >
        {{ t('settings.presentation.detectFound') }}
      </p>
      <p
        v-else
        class="hint"
      >
        {{ t('settings.presentation.detectEmpty') }}
      </p>

      <div
        v-if="installed.length > 0"
        class="options"
        role="radiogroup"
        :aria-label="t('settings.presentation.detectFound')"
      >
        <button
          v-for="option in installed"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="engine === option.id"
          :class="{ selected: engine === option.id }"
          :data-test="`ppt-engine-${option.id}`"
          :disabled="busy"
          @click="setEngine(option.id as PresentationEngine)"
        >
          {{ option.label }}
        </button>
      </div>
    </template>

    <p v-else-if="!hasApi" class="hint">{{ t('settings.presentation.desktopOnly') }}</p>

    <p class="hint small">{{ t('settings.presentation.hint') }}</p>
  </section>
</template>

<style scoped>
.ppt-engine-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hint {
  opacity: 0.7;
  font-size: 0.85rem;
}
.hint.small {
  font-size: 0.78rem;
  opacity: 0.55;
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
button {
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: filter 0.15s ease;
}
button:hover:not(:disabled) {
  filter: brightness(1.2);
}
button.selected {
  background: var(--ds-color-primary, #04549b);
  border-color: transparent;
  color: #fff;
}
button.detect {
  border-color: color-mix(in srgb, var(--ds-color-primary, #f2994a) 45%, transparent);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
