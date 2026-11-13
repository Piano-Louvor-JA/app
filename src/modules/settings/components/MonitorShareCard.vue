<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import type { MonitorShareMode } from '@shared/types/desktop-bridge'

import { useMonitorShare } from '../composables/useMonitorShare'
import SettingsToggle from './SettingsToggle.vue'

const { t } = useI18n()
const { info, busy, available, setEnabled, setDisplayMode, resetToken } = useMonitorShare()

const enabled = computed(() => info.value?.enabled === true)
const modes: { id: MonitorShareMode | null; key: string }[] = [
  { id: null, key: 'off' },
  { id: 'mirror', key: 'mirror' },
  { id: 'return', key: 'return' },
]
const chosen = computed(() => (info.value?.displays ?? []).filter((d) => d.mode !== null).length)
</script>

<template>
  <GlassCard class="monitor-share">
    <div class="monitor-share__header">
      <i class="ti ti-devices monitor-share__icon" aria-hidden="true" />
      <h3 class="monitor-share__title">
        {{ t('settings.projection.monitorShare.title') }}
      </h3>
    </div>

    <p v-if="!available()" class="monitor-share__caption">
      {{ t('settings.projection.monitorShare.desktopOnly') }}
    </p>

    <!-- Só monitores estendidos: o principal é do sonoplasta e, com um
         monitor só, não há o que compartilhar. -->
    <p
      v-else-if="info && info.extendedCount === 0"
      class="monitor-share__notice"
      role="status"
    >
      <i class="ti ti-info-circle" aria-hidden="true" />
      {{ t('settings.projection.monitorShare.noExtended') }}
    </p>

    <template v-else>
      <div class="monitor-share__row">
        <span class="monitor-share__label">{{ t('settings.projection.monitorShare.enable') }}</span>
        <SettingsToggle
          :model-value="enabled"
          :label="t('settings.projection.monitorShare.enable')"
          @update:model-value="setEnabled($event)"
        />
      </div>

      <p class="monitor-share__caption">
        {{ t('settings.projection.monitorShare.help') }}
        {{ t('settings.projection.monitorShare.primaryKept') }}
      </p>

      <div v-if="(info?.displays ?? []).length > 0" class="monitor-share__grid">
        <div
          v-for="display in info?.displays ?? []"
          :key="display.id"
          class="monitor-share__monitor"
          :class="{ 'monitor-share__monitor--on': display.mode !== null }"
        >
          <i
            class="ti monitor-share__monitor-icon"
            :class="display.mode === 'return' ? 'ti-device-tv' : display.mode === 'mirror' ? 'ti-screen-share' : 'ti-device-desktop'"
            aria-hidden="true"
          />
          <span class="monitor-share__monitor-label">{{ display.label }}</span>
          <span class="monitor-share__monitor-meta">
            {{ t('settings.projection.monitors.extended') }}
          </span>
          <div class="monitor-share__modes" role="radiogroup" :aria-label="display.label">
            <!-- "Não usar" em cima; Espelho e Retorno juntos embaixo. -->
            <div
              v-for="(row, r) in [modes.slice(0, 1), modes.slice(1)]"
              :key="r"
              class="monitor-share__modes-row"
            >
              <button
                v-for="mode in row"
                :key="mode.key"
                type="button"
                role="radio"
                class="monitor-share__mode"
                :class="{ 'monitor-share__mode--on': display.mode === mode.id }"
                :aria-checked="display.mode === mode.id"
                :disabled="busy"
                @click="setDisplayMode(display.id, mode.id)"
              >
                {{ t(`settings.projection.monitorShare.modes.${mode.key}`) }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="monitor-share__caption" role="status">
        {{ t('settings.projection.returnScreen.empty') }}
      </p>

      <div v-if="enabled && info?.running" class="monitor-share__pairing">
        <img
          v-if="info.qrDataUrl"
          :src="info.qrDataUrl"
          class="monitor-share__qr"
          :alt="t('settings.projection.monitorShare.qrAlt')"
        >
        <div class="monitor-share__pairing-text">
          <p class="monitor-share__caption">{{ t('settings.projection.monitorShare.scanHint') }}</p>
          <p class="monitor-share__address">
            {{ t('settings.projection.monitorShare.address') }}: <strong>{{ info.address }}</strong>
          </p>
          <p class="monitor-share__address">
            {{ t('settings.projection.monitorShare.code') }}: <strong>{{ info.token }}</strong>
          </p>
          <p class="monitor-share__status" role="status">
            <i class="ti" :class="info.phone ? 'ti-circle-check' : 'ti-loader-2'" aria-hidden="true" />
            {{
              info.phone
                ? t('settings.projection.monitorShare.connected', { device: info.phone.device, n: info.phone.monitors })
                : chosen === 0
                  ? t('settings.projection.monitorShare.noMonitor')
                  : t('settings.projection.monitorShare.waiting')
            }}
          </p>
          <button type="button" class="monitor-share__reset" :disabled="busy" @click="resetToken()">
            <i class="ti ti-refresh" aria-hidden="true" />
            {{ t('settings.projection.monitorShare.resetCode') }}
          </button>
        </div>
      </div>
      <p v-else-if="enabled" class="monitor-share__caption" role="alert">
        {{ t('settings.projection.monitorShare.portBusy') }}
      </p>
    </template>
  </GlassCard>
</template>

<style scoped lang="scss">
.monitor-share { display: flex; flex-direction: column; padding: 2rem; }
.monitor-share__header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
.monitor-share__icon { color: var(--ds-color-primary); font-size: 24px; line-height: 1; }
.monitor-share__title { margin: 0; color: var(--ds-color-on-surface); font-size: 20px; font-weight: 600; line-height: 28px; }
.monitor-share__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.monitor-share__label { color: var(--ds-color-on-surface-variant); font-size: 16px; }
.monitor-share__notice {
  display: flex; gap: 0.5rem; align-items: flex-start; margin: 0; padding: 0.75rem 1rem;
  border-radius: var(--ds-radius-md); background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  color: var(--ds-color-on-surface-variant); font-size: 14px; line-height: 1.45;
  i { color: var(--ds-color-primary); font-size: 18px; margin-top: 1px; }
}
.monitor-share__caption { margin: 0 0 1rem; color: var(--ds-color-on-surface-variant); font-size: 14px; line-height: 20px; opacity: 0.8; }
.monitor-share__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
.monitor-share__monitor {
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem; padding: 1rem 0.75rem;
  border: 2px solid transparent; border-radius: var(--ds-radius-lg);
  background: color-mix(in srgb, var(--ds-color-on-surface) 3%, transparent);
  box-shadow: inset 0 0 0 1px var(--ds-color-outline); color: var(--ds-color-on-surface-variant);
  &--on { border-color: var(--ds-color-primary); box-shadow: none; color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); }
}
.monitor-share__monitor-icon { font-size: 30px; line-height: 1; }
.monitor-share__monitor-label { font-size: 14px; font-weight: 700; }
.monitor-share__monitor-meta { font-size: 10px; opacity: 0.8; }
.monitor-share__modes { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; margin-top: 0.4rem; }
.monitor-share__modes-row { display: flex; justify-content: center; gap: 0.3rem; }
.monitor-share__mode {
  padding: 0.2rem 0.55rem; border: 1px solid var(--ds-color-outline); border-radius: 999px;
  background: transparent; color: var(--ds-color-on-surface-variant); font-size: 11px; cursor: pointer;
  &--on { border-color: var(--ds-color-primary); background: var(--ds-color-primary); color: var(--ds-color-on-primary); }
  &:disabled { cursor: wait; opacity: 0.7; }
}
.monitor-share__pairing { display: flex; gap: 1.25rem; align-items: flex-start; flex-wrap: wrap; }
.monitor-share__qr { width: 150px; height: 150px; border-radius: 12px; background: #fff; padding: 6px; }
.monitor-share__pairing-text { flex: 1; min-width: 12rem; }
.monitor-share__address { margin: 0 0 0.4rem; color: var(--ds-color-on-surface); font-size: 14px; strong { font-family: monospace; font-size: 15px; } }
.monitor-share__status { display: flex; align-items: center; gap: 0.4rem; margin: 0.6rem 0; color: var(--ds-color-on-surface-variant); font-size: 13px; }
.monitor-share__reset {
  display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.8rem;
  border: 1px solid var(--ds-color-outline); border-radius: 999px; background: transparent;
  color: var(--ds-color-on-surface-variant); font-size: 12px; cursor: pointer;
  &:hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }
}
</style>
