<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  DetectedPlayer,
  ExternalPlayerPreference,
} from '@/shared/types/desktop-bridge'

const { t } = useI18n()

const bridge = window.louvorja
const hasApi = Boolean(bridge?.isElectron && bridge.externalPlayer?.get)

const player = ref<ExternalPlayerPreference>('associated')
const installed = ref<DetectedPlayer[]>([])
const customPlayers = ref<string[]>([])
const busy = ref(false)
const detecting = ref(false)
const scanned = ref(false)

function fileName(bin: string): string {
  /* v8 ignore next 1 -- callers sempre passam caminho não vazio (filter trim) */
  return bin.split(/[\\/]/).pop() || bin
}

function customId(bin: string): ExternalPlayerPreference {
  return `custom:${bin}` as ExternalPlayerPreference
}

function customLabel(bin: string): string {
  return t('settings.externalPlayer.player.custom', { name: fileName(bin) })
}

async function loadPreference() {
  if (!hasApi) return
  try {
    player.value = await bridge!.externalPlayer!.get!()
  } catch {
    player.value = 'associated'
  }
}

async function loadCustomPlayers() {
  if (!hasApi) return
  try {
    const listed = (await bridge!.externalPlayer!.listCustom?.()) ?? []
    customPlayers.value = listed.filter((item) => typeof item === 'string' && item.trim())
    if (
      customPlayers.value.length === 0 &&
      player.value.startsWith('custom:')
    ) {
      customPlayers.value = [player.value.slice('custom:'.length)]
    }
  } catch {
    if (player.value.startsWith('custom:')) {
      customPlayers.value = [player.value.slice('custom:'.length)]
    }
  }
}

async function detectInstalled() {
  if (!hasApi || detecting.value) return
  detecting.value = true
  try {
    installed.value = (await bridge!.externalPlayer!.detect!()) ?? []
  } catch {
    installed.value = []
  } finally {
    detecting.value = false
    scanned.value = true
  }
}

onMounted(async () => {
  await loadPreference()
  await Promise.all([loadCustomPlayers(), detectInstalled()])
})

async function setPlayer(next: ExternalPlayerPreference) {
  if (!hasApi || busy.value) return
  busy.value = true
  const previous = player.value
  player.value = next
  try {
    const ok = await bridge!.externalPlayer!.set!(next)
    if (!ok) player.value = previous
    else await loadCustomPlayers()
  } catch {
    player.value = previous
  } finally {
    busy.value = false
  }
}

async function removeCustom(bin: string) {
  if (!hasApi || busy.value) return
  busy.value = true
  try {
    const result = await bridge!.externalPlayer!.removeCustom?.(bin)
    if (result) {
      player.value = result.player
      customPlayers.value = result.customPlayers ?? []
      return
    }
    customPlayers.value = customPlayers.value.filter((item) => item !== bin)
    if (player.value === customId(bin)) {
      const ok = await bridge!.externalPlayer!.set!('associated')
      if (ok) player.value = 'associated'
    }
  } catch {
    /* mantém a lista */
  } finally {
    busy.value = false
  }
}

/** Abre o seletor de arquivos para escolher qualquer player não listado. */
async function pickCustomPlayer() {
  if (!hasApi || busy.value) return
  try {
    const picked = await bridge!.dialog!.openFile!({
      title: t('settings.externalPlayer.pickTitle'),
      multiple: false,
    })
    const path = Array.isArray(picked) ? picked[0] : picked
    if (typeof path === 'string' && path.trim()) {
      await setPlayer(`custom:${path.trim()}` as ExternalPlayerPreference)
    }
  } catch {
    /* usuário cancelou */
  }
}
</script>

<template>
  <section class="ext-player-card" data-test="external-player-card">
    <h3>{{ t('settings.externalPlayer.title') }}</h3>
    <p class="hint">{{ t('settings.externalPlayer.description') }}</p>

    <div
      v-if="hasApi"
      class="options"
      role="radiogroup"
      :aria-label="t('settings.externalPlayer.title')"
    >
      <button
        type="button"
        role="radio"
        :aria-checked="player === 'associated'"
        :class="{ selected: player === 'associated' }"
        data-test="external-player-associated"
        :disabled="busy"
        @click="setPlayer('associated')"
      >
        {{ t('settings.externalPlayer.player.associated') }}
      </button>

      <button
        type="button"
        class="detect"
        data-test="external-player-detect"
        :disabled="busy || detecting"
        @click="detectInstalled"
      >
        {{
          detecting
            ? t('settings.externalPlayer.detecting')
            : t('settings.externalPlayer.detect')
        }}
      </button>

      <button
        type="button"
        data-test="external-player-pick"
        :disabled="busy"
        @click="pickCustomPlayer()"
      >
        {{ t('settings.externalPlayer.pickOther') }}
      </button>
    </div>

    <template v-if="hasApi && scanned">
      <p
        v-if="installed.length > 0"
        class="hint"
      >
        {{ t('settings.externalPlayer.detectFound') }}
      </p>
      <p
        v-else
        class="hint"
      >
        {{ t('settings.externalPlayer.detectEmpty') }}
      </p>

      <div
        v-if="installed.length > 0"
        class="options"
        role="radiogroup"
        :aria-label="t('settings.externalPlayer.detectFound')"
      >
        <button
          v-for="option in installed"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="player === option.id"
          :class="{ selected: player === option.id }"
          :data-test="`external-player-${option.id}`"
          :disabled="busy"
          @click="setPlayer(option.id as ExternalPlayerPreference)"
        >
          {{ option.label }}
        </button>
      </div>
    </template>

    <div
      v-if="hasApi && customPlayers.length > 0"
      class="options custom-options"
      role="radiogroup"
      :aria-label="t('settings.externalPlayer.pickOther')"
    >
      <div
        v-for="bin in customPlayers"
        :key="bin"
        class="player-chip"
        :class="{ selected: player === customId(bin) }"
        data-test="external-player-custom-chip"
      >
        <button
          type="button"
          role="radio"
          :aria-checked="player === customId(bin)"
          :disabled="busy"
          :data-test="`external-player-custom`"
          @click="setPlayer(customId(bin))"
        >
          {{ customLabel(bin) }}
        </button>
        <button
          type="button"
          class="chip-remove"
          :disabled="busy"
          data-test="external-player-custom-remove"
          :aria-label="t('settings.externalPlayer.removeCustom', { name: fileName(bin) })"
          @click.stop="removeCustom(bin)"
        >
          ×
        </button>
      </div>
    </div>

    <p v-if="hasApi" class="hint">
      {{ t('settings.externalPlayer.hint') }}
    </p>
    <p v-else class="hint">{{ t('settings.externalPlayer.desktopOnly') }}</p>
  </section>
</template>

<style scoped lang="scss">
.ext-player-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

h3 {
  margin: 0;
  font-size: 1rem;
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.options button {
  padding: 0.4rem 0.9rem;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.85rem;

  &.selected {
    border-color: var(--q-primary, #f2994a);
    background: color-mix(in srgb, var(--q-primary, #f2994a) 18%, transparent);
    font-weight: 600;
  }

  &.detect {
    border-color: color-mix(in srgb, var(--q-primary, #f2994a) 45%, transparent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.player-chip {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 6px;
  overflow: hidden;

  &.selected {
    border-color: var(--q-primary, #f2994a);
    background: color-mix(in srgb, var(--q-primary, #f2994a) 18%, transparent);

    button:not(.chip-remove) {
      font-weight: 600;
    }
  }

  button {
    border: 0;
    border-radius: 0;
    padding: 0.4rem 0.75rem;

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .chip-remove {
    padding: 0.35rem 0.55rem;
    border-left: 1px solid rgb(255 255 255 / 0.15);
    font-size: 1rem;
    line-height: 1;
    opacity: 0.75;

    &:hover:not(:disabled) {
      opacity: 1;
      background: rgb(255 255 255 / 0.08);
    }
  }
}
</style>
