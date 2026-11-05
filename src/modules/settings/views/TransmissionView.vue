<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirm from '@shared/components/AppConfirm.vue'
import SettingsToggle from '../components/SettingsToggle.vue'
import TransmissionAudioOptions from '../components/TransmissionAudioOptions.vue'
import TransmissionConnectionCard from '../components/TransmissionConnectionCard.vue'
import TransmissionNetworkCard from '../components/TransmissionNetworkCard.vue'
import TransmissionQrDialog from '../components/TransmissionQrDialog.vue'
import { startObsConnection, stopObsConnection, useObsConnections } from '../composables/useObsConnections'
import {
  notifyObsChanged,
  obsBlackIdle,
  obsConnections,
  registerObsConnection,
  setObsBlackIdle,
  setObsNickname,
  unregisterObsConnection,
} from '../services/obs-connections'
import { palcoSession } from '../services/palco-session'
import type { OverlayStyle, SlotUpdateFailure, TransmissionConnection } from '../types/transmission'

const { t } = useI18n()
const { connections, refresh } = useObsConnections()

function sourceName(label: string) {
  const number = label.match(/^OBS\s*(\d+)$/)?.[1]
  return number ? t('settings.transmission.source', { n: number }) : label
}

/** Conexões do localStorage sem slot no main (registro antigo) ficam fora da tela. */
const cards = computed<TransmissionConnection[]>(() => connections.value
  .filter((connection) => connection.httpPort !== null)
  .map((connection) => ({
    id: connection.id,
    name: sourceName(connection.label),
    nickname: connection.nickname,
    running: connection.running,
    clients: connection.clients,
    receiverIps: connection.receiverIps,
    httpPort: connection.httpPort,
    error: connection.error,
    overlay: connection.overlay,
    overlayUrl: connection.overlayUrl,
    receiverUrl: connection.receiverUrl,
  })))
const onAir = computed(() => cards.value.filter((card) => card.running))
const allOnAir = computed(() => onAir.value.length === cards.value.length)
const clients = computed(() => onAir.value.reduce((sum, card) => sum + card.clients, 0))

const busy = ref<string | null>(null)
const pageError = ref('')
const notices = ref<Record<string, string>>({})

async function run(key: string, task: () => Promise<void>, failure: string) {
  if (busy.value) return
  busy.value = key
  pageError.value = ''
  try { await task() } catch { pageError.value = failure }
  finally {
    busy.value = null
    notifyObsChanged()
    await refresh()
  }
}

/** O teste de inicialização roda em segundo plano: o OBS pode ainda não estar aberto. */
function greet(id: string) {
  palcoSession.syncObsIdle(id)
  void palcoSession.warmupObs(id).catch(() => {})
}

async function switchOn(id: string): Promise<boolean> {
  const started = await startObsConnection(id)
  if (started) greet(id)
  return started
}

function toggle(card: TransmissionConnection) {
  void run(card.id, async () => {
    if (card.running) await stopObsConnection(card.id)
    else await switchOn(card.id)
  }, t('settings.transmission.errors.connection'))
}

function setAll(start: boolean) {
  void run('all', async () => {
    let failed = false
    for (const card of cards.value) {
      if (card.running === start) continue
      try {
        if (start) failed = !(await switchOn(card.id)) || failed
        else await stopObsConnection(card.id)
      } catch { failed = true }
    }
    if (failed) throw new Error('bulk')
  }, t('settings.transmission.errors.bulk'))
}

function addConnection() {
  void run('add', async () => {
    const number = Math.max(1, ...obsConnections.value.map((item) => Number(item.label.match(/\d+$/)?.[0]) || 1)) + 1
    const created = await palcoSession.createSlot(`OBS ${number}`)
    if (!created) throw new Error('create')
    registerObsConnection(created.id, created.label)
    if (!(await switchOn(created.id))) throw new Error('start')
  }, t('settings.transmission.errors.connection'))
}

const pendingRemoval = ref<TransmissionConnection | null>(null)
function confirmRemoval() {
  const card = pendingRemoval.value
  pendingRemoval.value = null
  if (!card) return
  void run(card.id, async () => {
    if (!(await palcoSession.removeSlot(card.id))) throw new Error('remove')
    unregisterObsConnection(card.id)
  }, t('settings.transmission.errors.remove'))
}

const PORT_FAILURES: Record<SlotUpdateFailure, string> = {
  range: 'settings.transmission.portRange',
  collision: 'settings.transmission.portCollision',
  running: 'settings.transmission.portStopFirst',
  'port-in-use': 'settings.transmission.portInUse',
  'not-found': 'settings.transmission.errors.connection',
}

function changePort(id: string, httpPort: number) {
  void run(id, async () => {
    notices.value = { ...notices.value, [id]: '' }
    try {
      const result = await palcoSession.updateSlot(id, { httpPort })
      if (!result.ok) notices.value = { ...notices.value, [id]: t(PORT_FAILURES[result.reason], { port: httpPort }) }
    } catch {
      notices.value = { ...notices.value, [id]: t('settings.transmission.errors.connection') }
    }
  }, '')
}

async function changeStyle(id: string, overlay: OverlayStyle) {
  notices.value = { ...notices.value, [id]: '' }
  try {
    const result = await palcoSession.updateSlot(id, { overlay })
    if (!result.ok) throw new Error(result.reason)
  } catch {
    notices.value = { ...notices.value, [id]: t('settings.transmission.style.failed') }
  }
  await refresh()
}

function reload(id: string) {
  void run(id, async () => {
    const reloaded = await palcoSession.refreshObs(id)
    notices.value = { ...notices.value, [id]: reloaded ? '' : t('settings.transmission.errors.reload') }
  }, '')
}

const qr = ref<{ url: string; title: string } | null>(null)

const preserve = ref(false)
async function changePreserve(enabled: boolean) {
  pageError.value = ''
  try { preserve.value = await palcoSession.setConnectionPersistence(enabled) }
  catch { pageError.value = t('settings.transmission.behavior.preserveFailed') }
}

function changeBlackIdle(enabled: boolean) {
  setObsBlackIdle(enabled)
  for (const card of onAir.value) palcoSession.syncObsIdle(card.id)
}

const steps = computed(() => [1, 2, 3, 4].map((step) => t(`settings.transmission.howTo.step${step}`)))

/** Espaço ao lado do título de Configurações; fora dela o status fica na barra. */
const headerAside = ref<HTMLElement | null>(null)

onMounted(() => {
  headerAside.value = document.getElementById('settings-header-aside')
  void palcoSession.getConnectionPersistence().then((enabled) => { preserve.value = enabled }).catch(() => {})
})
</script>

<template>
  <section class="transmission-view">
    <div class="transmission-view__bar">
      <Teleport :to="headerAside ?? 'body'" :disabled="!headerAside">
        <span class="transmission-view__status" :class="{ 'transmission-view__status--on': onAir.length }">
          <span class="transmission-view__dot" aria-hidden="true" />{{ onAir.length
            ? `${t('settings.transmission.onAir')} · ${t('settings.transmission.devices', clients)}`
            : t('settings.transmission.off') }}
        </span>
        <span class="transmission-view__summary">{{ t('settings.transmission.summary', { on: onAir.length, total: cards.length }) }}</span>
      </Teleport>
      <div class="transmission-view__actions">
        <button type="button" class="transmission-view__add" data-test="add" :disabled="busy !== null" @click="addConnection">
          <i class="ti ti-plus" aria-hidden="true" /> {{ t('settings.transmission.add') }}
        </button>
        <button type="button" class="transmission-view__bulk" data-test="start-all" :disabled="busy !== null || allOnAir" @click="setAll(true)">
          <i class="ti ti-player-play" aria-hidden="true" /> {{ t('settings.transmission.startAll') }}
        </button>
        <button type="button" class="transmission-view__bulk transmission-view__bulk--stop" data-test="stop-all" :disabled="busy !== null || !onAir.length" @click="setAll(false)">
          <i class="ti ti-player-stop" aria-hidden="true" /> {{ t('settings.transmission.stopAll') }}
        </button>
      </div>
    </div>

    <p v-if="pageError" class="transmission-view__error" role="alert">{{ pageError }}</p>

    <div class="transmission-view__cards">
      <TransmissionConnectionCard v-for="card in cards" :key="card.id" :connection="card" :busy="busy !== null"
        :notice="notices[card.id] ?? ''"
        @toggle="toggle(card)" @remove="pendingRemoval = card" @reload="reload(card.id)"
        @nickname="setObsNickname(card.id, $event)" @port="changePort(card.id, $event)"
        @style="changeStyle(card.id, $event)" @qr="(url, title) => (qr = { url, title })" />
    </div>

    <TransmissionNetworkCard class="transmission-view__section" :locked="onAir.length > 0" @changed="refresh" />

    <section class="transmission-view__section" aria-labelledby="transmission-behavior-title">
      <h2 id="transmission-behavior-title" class="transmission-view__title">{{ t('settings.transmission.behavior.title') }}</h2>
      <TransmissionAudioOptions />
      <div class="transmission-view__row">
        <span class="transmission-view__label">
          {{ t('settings.transmission.behavior.preserve') }}
          <small class="transmission-view__hint">{{ t('settings.transmission.behavior.preserveHint') }}</small>
        </span>
        <SettingsToggle data-test="preserve-connections" :model-value="preserve"
          :label="t('settings.transmission.behavior.preserve')" @update:model-value="changePreserve" />
      </div>
      <div class="transmission-view__row">
        <span class="transmission-view__label">
          {{ t('settings.transmission.behavior.blackIdle') }}
          <small class="transmission-view__hint" role="status">{{ t(obsBlackIdle ? 'settings.transmission.behavior.blackOn' : 'settings.transmission.behavior.blackOff') }}</small>
        </span>
        <SettingsToggle data-test="black-idle" :model-value="obsBlackIdle"
          :label="t('settings.transmission.behavior.blackIdle')" @update:model-value="changeBlackIdle" />
      </div>
    </section>

    <section class="transmission-view__section" aria-labelledby="transmission-how-to-title">
      <h2 id="transmission-how-to-title" class="transmission-view__title">{{ t('settings.transmission.howTo.title') }}</h2>
      <ol class="transmission-view__steps">
        <li v-for="(step, index) in steps" :key="index" class="transmission-view__step">
          <span class="transmission-view__step-number" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ step }}</span>
        </li>
      </ol>
    </section>

    <AppConfirm :open="pendingRemoval !== null" :z-index="120" danger
      :title="t('settings.transmission.removeTitle', { name: pendingRemoval?.name ?? '' })"
      :message="t('settings.transmission.removeMessage')" :confirm-label="t('settings.transmission.removeConfirm')"
      :cancel-label="t('common.cancel')" @cancel="pendingRemoval = null" @confirm="confirmRemoval" />
    <TransmissionQrDialog :url="qr?.url ?? null" :title="qr?.title ?? ''" @close="qr = null" />
  </section>
</template>

<style scoped lang="scss">
.transmission-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 52rem;
  padding-bottom: 4rem;

  &__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 0.9rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--ds-color-outline);
  }

  &__status {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.3rem 0.85rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 999px;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.8rem;
    font-weight: 600;

    &--on {
      border-color: color-mix(in srgb, #22c55e 35%, transparent);
      background: color-mix(in srgb, #22c55e 10%, transparent);
      color: #22c55e;
    }
  }

  &__dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: currentColor; }
  &__summary { color: var(--ds-color-on-surface-variant); font-size: 0.8rem; }
  &__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-left: auto; }

  &__add, &__bulk {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &__add {
    border: 1px solid var(--ds-color-primary);
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #111);
  }

  &__bulk {
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    color: var(--ds-color-primary);

    &--stop:not(:disabled) { border-color: color-mix(in srgb, #ff8a80 45%, transparent); background: transparent; color: #ff8a80; }
  }

  &__error { margin: 0; color: #ffb4ab; }
  &__cards { display: flex; flex-direction: column; gap: 0.85rem; }
  &__section { padding-top: 1rem; border-top: 1px solid var(--ds-color-outline); }
  &__title { margin: 0; color: var(--ds-color-on-surface); font-size: 1.1rem; font-weight: 600; }
  &__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.6rem 0; }
  &__label { display: flex; flex-direction: column; gap: 0.2rem; color: var(--ds-color-on-surface); }
  &__hint { color: var(--ds-color-on-surface-variant); font-size: 0.78rem; }
  &__steps { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.75rem 0 0; padding: 0; list-style: none; }

  &__step {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.6rem;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.9rem;
  }

  &__step-number {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    color: var(--ds-color-primary);
    font-size: 0.75rem;
    font-weight: 700;
  }
}
</style>
