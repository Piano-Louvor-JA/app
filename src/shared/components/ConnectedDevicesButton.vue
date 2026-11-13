<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useConnectedDevices } from '@shared/composables/useConnectedDevices'

/** Círculo no canto: quantos aparelhos estão ligados a este desktop. */
const { t } = useI18n()
const { remote, speaker, phone, tvs, count, available } = useConnectedDevices()
const open = ref(false)
</script>

<template>
  <div v-if="available()" class="connected-devices">
    <button
      type="button"
      class="connected-devices__circle"
      :class="{ 'connected-devices__circle--on': count > 0 }"
      :aria-expanded="open"
      :aria-label="t('connectedDevices.title')"
      :title="t('connectedDevices.title')"
      @click="open = !open"
    >
      <i class="ti ti-devices" aria-hidden="true" />
      <span v-if="count > 0" class="connected-devices__badge">{{ count }}</span>
    </button>

    <div v-if="open" class="connected-devices__backdrop" @click="open = false" />
    <section v-if="open" class="connected-devices__panel" role="dialog" :aria-label="t('connectedDevices.title')">
      <header class="connected-devices__head">
        <span>{{ t('connectedDevices.title') }}</span>
        <button type="button" class="connected-devices__close" :aria-label="t('common.close')" @click="open = false">
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </header>

      <ul class="connected-devices__list">
        <li class="connected-devices__item">
          <i class="ti ti-device-gamepad-2" aria-hidden="true" />
          <div>
            <strong>{{ t('connectedDevices.remote') }}</strong>
            <span :class="{ on: remote }">{{ remote ?? t('connectedDevices.none') }}</span>
          </div>
        </li>
        <li class="connected-devices__item">
          <i class="ti ti-presentation" aria-hidden="true" />
          <div>
            <strong>{{ t('connectedDevices.speaker') }}</strong>
            <span :class="{ on: speaker }">{{ speaker ?? t('connectedDevices.none') }}</span>
          </div>
        </li>
        <li class="connected-devices__item">
          <i class="ti ti-screen-share" aria-hidden="true" />
          <div>
            <strong>{{ t('connectedDevices.monitors') }}</strong>
            <span :class="{ on: phone }">
              {{
                phone
                  ? t('connectedDevices.monitorsInUse', { device: phone.device, host: phone.host, n: phone.monitors })
                  : t('connectedDevices.none')
              }}
            </span>
          </div>
        </li>
        <li class="connected-devices__item" data-test="palco-devices">
          <i class="ti ti-device-tv" aria-hidden="true" />
          <div>
            <strong>{{ t('connectedDevices.palco') }}</strong>
            <template v-if="tvs.length">
              <span v-for="tv in tvs" :key="tv.uid" class="on">
                {{ t('connectedDevices.palcoTv', { name: tv.name, ip: tv.ip }) }}
              </span>
            </template>
            <span v-else>{{ t('connectedDevices.none') }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.connected-devices {
  position: fixed;
  right: 1.5rem;
  bottom: calc((var(--ds-dock-height, 72px) - 3rem) / 2);
  z-index: 60;
}
.connected-devices__circle {
  position: relative;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface-container);
  color: var(--ds-color-on-surface-variant);
  font-size: 1.3rem;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
  &:hover { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }
  &--on { border-color: var(--ds-color-primary); color: var(--ds-color-primary); }
}
.connected-devices__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.25rem;
}
.connected-devices__backdrop { position: fixed; inset: 0; z-index: -1; }
.connected-devices__panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.6rem);
  width: 21rem;
  padding: 0.9rem;
  border-radius: 14px;
  border: 1px solid var(--ds-color-outline);
  background: var(--ds-color-surface);
  box-shadow: 0 18px 40px rgb(0 0 0 / 40%);
}
.connected-devices__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  color: var(--ds-color-on-surface);
  font-weight: 600;
}
.connected-devices__close {
  border: 0;
  background: none;
  color: var(--ds-color-on-surface-variant);
  cursor: pointer;
}
.connected-devices__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
.connected-devices__item {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  > i { color: var(--ds-color-primary); font-size: 1.2rem; margin-top: 0.1rem; }
  div { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
  strong { color: var(--ds-color-on-surface); font-size: 0.9rem; font-weight: 600; }
  span { color: var(--ds-color-on-surface-variant); font-size: 0.82rem; opacity: 0.8; }
  span.on { color: var(--ds-color-primary); opacity: 1; }
}
</style>
