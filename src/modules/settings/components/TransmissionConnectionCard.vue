<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TransmissionIcon from '@design-system/components/icons/TransmissionIcon.vue'
import TransmissionLinkRow from './TransmissionLinkRow.vue'
import TransmissionOverlayStyle from './TransmissionOverlayStyle.vue'
import type { OverlayStyle, TransmissionConnection } from '../types/transmission'

const MIN_PORT = 1024
const MAX_PORT = 65534

const props = defineProps<{ connection: TransmissionConnection; busy: boolean; notice?: string }>()
const emit = defineEmits<{
  toggle: []
  remove: []
  reload: []
  nickname: [value: string]
  port: [httpPort: number]
  style: [style: OverlayStyle]
  qr: [url: string, title: string]
}>()
const { t } = useI18n()

const nicknameDraft = ref<string | null>(null)
function saveNickname(value: string) {
  emit('nickname', value)
  nicknameDraft.value = null
}

const portDraft = ref<string | null>(null)
watch(() => props.connection.httpPort, () => { portDraft.value = null })
const draftPort = computed(() => Number(portDraft.value))
const draftValid = computed(() => Number.isInteger(draftPort.value) && draftPort.value >= MIN_PORT && draftPort.value <= MAX_PORT)
const portChanged = computed(() => portDraft.value !== null && draftPort.value !== props.connection.httpPort)
const pairPort = computed(() => {
  if (portDraft.value !== null && draftValid.value) return draftPort.value + 1
  return props.connection.httpPort === null ? null : props.connection.httpPort + 1
})
function applyPort() {
  if (portChanged.value && draftValid.value && !props.busy) emit('port', draftPort.value)
}

const failure = computed(() => {
  const error = props.connection.error
  if (!error) return ''
  return error.code === 'port-in-use'
    ? t('settings.transmission.portInUse', { port: error.port })
    : t('settings.transmission.startFailed')
})

const links = computed(() => [
  { key: 'overlay', url: props.connection.overlayUrl, label: t('settings.transmission.overlay'), hint: t('settings.transmission.overlayHint'), primary: true },
  { key: 'replica', url: props.connection.receiverUrl, label: t('settings.transmission.replica'), hint: t('settings.transmission.replicaHint'), primary: false },
].filter((link): link is typeof link & { url: string } => Boolean(link.url)))

const styleOpen = ref(false)
</script>

<template>
  <article class="transmission-card" :class="{ 'transmission-card--on': connection.running }">
    <header class="transmission-card__header">
      <div class="transmission-card__icon"><TransmissionIcon :size="28" /></div>
      <div class="transmission-card__info">
        <div class="transmission-card__name-row">
          <strong class="transmission-card__name">{{ connection.name }}</strong>
          <input class="transmission-card__nickname" type="text" maxlength="60" data-test="nickname"
            :value="nicknameDraft ?? connection.nickname ?? ''"
            :placeholder="t('settings.transmission.nickname')"
            :aria-label="t('settings.transmission.nicknameLabel', { name: connection.name })"
            @input="nicknameDraft = ($event.target as HTMLInputElement).value"
            @change="saveNickname(($event.target as HTMLInputElement).value)"
            @keydown.enter="($event.target as HTMLInputElement).blur()">
        </div>
        <span class="transmission-card__state" :class="{ 'transmission-card__state--on': connection.running }">
          <span class="transmission-card__dot" aria-hidden="true" />
          <template v-if="connection.running">
            {{ t('settings.transmission.onAir') }} · {{ t('settings.transmission.devices', connection.clients) }}
          </template>
          <template v-else>{{ t('settings.transmission.off') }}</template>
        </span>
        <small v-if="connection.receiverIps.length" class="transmission-card__ips">{{ connection.receiverIps.join(', ') }}</small>
      </div>
      <div class="transmission-card__actions">
        <button type="button" class="transmission-card__toggle" data-test="toggle"
          :class="{ 'transmission-card__toggle--on': connection.running }" :disabled="busy" @click="emit('toggle')">
          <i class="ti" :class="connection.running ? 'ti-player-stop' : 'ti-player-play'" aria-hidden="true" />
          {{ connection.running ? t('settings.transmission.stop') : t('settings.transmission.start') }}
        </button>
        <button v-if="connection.id !== '0'" type="button" class="transmission-card__remove" data-test="remove"
          :disabled="busy" :aria-label="t('settings.transmission.remove', { name: connection.name })"
          :title="t('settings.transmission.remove', { name: connection.name })" @click="emit('remove')">
          <i class="ti ti-x" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="failure || notice" class="transmission-card__alert" role="alert">
      <span v-if="failure">{{ failure }}</span>
      <span v-if="notice">{{ notice }}</span>
      <button v-if="connection.error?.suggestedPort" type="button" class="transmission-card__suggest" data-test="port-suggest"
        :disabled="busy" @click="emit('port', connection.error.suggestedPort)">
        {{ t('settings.transmission.portSuggest', { port: connection.error.suggestedPort }) }}
      </button>
    </div>

    <div v-if="links.length" class="transmission-card__links">
      <TransmissionLinkRow v-for="link in links" :key="link.key" :label="link.label" :hint="link.hint" :url="link.url"
        :primary="link.primary" @qr="emit('qr', $event, `${connection.name} · ${link.label}`)" />
      <button type="button" class="transmission-card__reload" data-test="reload" :disabled="busy" @click="emit('reload')">
        <i class="ti ti-refresh" aria-hidden="true" /> {{ t('settings.transmission.reload') }}
      </button>
    </div>
    <p v-else class="transmission-card__hint">{{ t('settings.transmission.waitingLinks') }}</p>

    <div class="transmission-card__port">
      <label class="transmission-card__port-field">
        <span class="transmission-card__label">{{ t('settings.transmission.port') }}</span>
        <input type="number" inputmode="numeric" data-test="port" :min="MIN_PORT" :max="MAX_PORT"
          :value="portDraft ?? connection.httpPort ?? ''" :disabled="connection.running || busy"
          :aria-label="t('settings.transmission.portLabel', { name: connection.name })"
          @input="portDraft = ($event.target as HTMLInputElement).value"
          @keydown.enter="applyPort">
      </label>
      <button v-if="portChanged" type="button" class="transmission-card__apply" data-test="port-apply"
        :disabled="!draftValid || busy" @click="applyPort">
        {{ t('settings.transmission.portApply') }}
      </button>
      <div class="transmission-card__port-hints">
        <small v-if="pairPort !== null">{{ t('settings.transmission.portPair', { port: pairPort }) }}</small>
        <small v-if="portDraft !== null && !draftValid" class="transmission-card__port-error">{{ t('settings.transmission.portRange') }}</small>
        <small v-if="connection.running">{{ t('settings.transmission.portStopFirst') }}</small>
        <small v-if="connection.id === '0'">{{ t('settings.transmission.portMainHint') }}</small>
      </div>
    </div>

    <div class="transmission-card__style">
      <button type="button" class="transmission-card__style-toggle" data-test="style-toggle"
        :aria-expanded="styleOpen" @click="styleOpen = !styleOpen">
        <i class="ti" :class="styleOpen ? 'ti-chevron-up' : 'ti-chevron-down'" aria-hidden="true" />
        {{ t('settings.transmission.style.title') }}
      </button>
      <TransmissionOverlayStyle v-if="styleOpen" :model-value="connection.overlay" :name="connection.name"
        @update:model-value="emit('style', $event)" />
    </div>
  </article>
</template>

<style scoped lang="scss">
.transmission-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--ds-color-surface, #171717) 75%, transparent);

  &--on { border-color: color-mix(in srgb, #22c55e 40%, transparent); }

  &__header { display: grid; grid-template-columns: 2.6rem minmax(0, 1fr) auto; gap: 0.8rem; align-items: center; }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 0.65rem;
    background: #d5d9df;
    color: #111;
  }

  &__info { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
  &__name-row { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  &__name { color: var(--ds-color-on-surface); font-size: 1rem; white-space: nowrap; }

  &__nickname {
    width: 100%;
    min-width: 0;
    padding: 0.2rem 0.4rem;
    border: 1px solid transparent;
    border-radius: 0.3rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font: inherit;
    font-size: 0.85rem;

    &:hover { border-color: var(--ds-color-outline); }
    &:focus { outline: 1px solid var(--ds-color-primary); background: var(--ds-color-surface); }
  }

  &__state { display: flex; align-items: center; gap: 0.4rem; color: var(--ds-color-on-surface-variant); font-size: 0.8rem; }
  &__state--on { color: #22c55e; }
  &__dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: currentColor; }
  &__ips, &__hint { margin: 0; color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
  &__actions { display: flex; align-items: center; gap: 0.5rem; }

  &__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-width: 8.5rem;
    padding: 0.55rem 1.1rem;
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    color: var(--ds-color-primary);
    font-weight: 600;
    cursor: pointer;

    &--on { border-color: var(--ds-color-outline); background: transparent; color: var(--ds-color-on-surface); }
    &:disabled { opacity: 0.6; cursor: wait; }
  }

  &__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid color-mix(in srgb, #ff8a80 45%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, #c62828 14%, transparent);
    color: #ff8a80;
    cursor: pointer;

    &:hover:not(:disabled) { background: #c62828; color: #fff; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &__alert {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.8rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid color-mix(in srgb, #ff8a80 45%, transparent);
    border-radius: 0.6rem;
    background: color-mix(in srgb, #c62828 12%, transparent);
    color: #ffb4ab;
    font-size: 0.85rem;
  }

  &__suggest, &__apply, &__reload, &__style-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font-size: 0.82rem;
    cursor: pointer;

    &:hover:not(:disabled) { background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent); }
    &:disabled { opacity: 0.55; cursor: not-allowed; }
  }

  &__links { display: flex; flex-direction: column; gap: 0.55rem; }
  &__reload { align-self: flex-start; }
  &__port { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem 0.75rem; }
  &__port-field { display: flex; flex-direction: column; gap: 0.3rem; }
  &__label { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; font-weight: 600; }

  &__port-field input {
    width: 7rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.5rem;
    background: var(--ds-color-surface, #171717);
    color: inherit;

    &:disabled { opacity: 0.6; }
  }

  &__port-hints { display: flex; flex-direction: column; gap: 0.15rem; color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
  &__port-error { color: #ffb4ab; }
  &__style { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--ds-color-outline); }
  &__style-toggle { align-self: flex-start; border: 0; padding-inline: 0; font-weight: 600; }
}

@media (max-width: 600px) {
  .transmission-card__header { grid-template-columns: 2.6rem minmax(0, 1fr); }
  .transmission-card__actions { grid-column: 1 / -1; }
  .transmission-card__toggle { flex: 1; }
}
</style>
