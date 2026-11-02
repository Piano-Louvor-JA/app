<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppConfirm from '@shared/components/AppConfirm.vue'
import PageBackStack from '@shared/components/PageBackStack.vue'
import { useMinimizablePage } from '@shared/composables/useMinimizablePage'

import { palcoSession } from '@modules/settings/services/palco-session'
import { useObsConnections } from '@modules/settings/composables/useObsConnections'
import { obsBlackIdle, setObsBlackIdle, setObsNickname, obsConnections, registerObsConnection, unregisterObsConnection, notifyObsChanged } from '@modules/settings/services/obs-connections'
import TransmissionAudioOptions from '@modules/settings/components/TransmissionAudioOptions.vue'
import TransmissionIcon from '@design-system/components/icons/TransmissionIcon.vue'

// Issue app#361: card funcional do OBS — Browser Source do palco-server.
// Por baixo usa o palco (transporte); por fora é "Transmitir via OBS".
const { t } = useI18n()

// Minimizar: o estado da tela já vive na store; o retrato guarda só rolagem e miniatura.
const { minimize, prepare } = useMinimizablePage({
  describe: () => ({ title: t('utilities.obs'), icon: 'ti-broadcast', summary: '' }),
  capture: () => null,
  fallbackRoute: { name: 'settings-appearance' },
})

const preserveConnections = ref(true)
const persistenceBusy = ref(true)
async function changePersistence(event: Event) {
  persistenceBusy.value = true
  try { preserveConnections.value = await palcoSession.setConnectionPersistence((event.target as HTMLInputElement).checked) }
  catch {
    (event.target as HTMLInputElement).checked = preserveConnections.value
    connectionError.value = t('utilities.obsPersistenceFailed')
  }
  finally { persistenceBusy.value = false }
}
const running = ref(false)
const obsUrl = ref('')
const copied = ref(false)
const turning = ref(false)
const receivers = ref(0)
const receiverIps = ref<string[]>([])
const { connections, refresh: refreshConnections } = useObsConnections()
const additionalConnections = computed(() => connections.value.filter((item) => item.id !== '0'))
const additionalUrls = ref<Record<string, string>>({})
const additionalIps = ref<Record<string, string[]>>({})
const connectionError = ref('')
const busyConnection = ref<string | null>(null)
const copiedConnection = ref<string | null>(null)
const nicknameDrafts = ref<Record<string, string>>({})
function saveNickname(id: string, value: string) {
  setObsNickname(id, value)
  delete nicknameDrafts.value[id]
}
const pendingRemoval = ref<{ id: string; label: string } | null>(null)
async function confirmRemoveConnection() {
  const connection = pendingRemoval.value
  if (!connection || connection.id === '0' || controlsBusy.value) return
  pendingRemoval.value = null
  busyConnection.value = connection.id
  connectionError.value = ''
  try {
    if (!(await palcoSession.removeSlot(connection.id))) throw new Error('remove')
    unregisterObsConnection(connection.id)
    await refresh()
  } catch { connectionError.value = t('utilities.obsDeleteFailed') }
  finally { busyConnection.value = null }
}
const controlsBusy = computed(() => turning.value || busyConnection.value !== null)
const anyRunning = computed(() => running.value || additionalConnections.value.some((item) => item.running))
const connectionCards = computed(() => [
  { id: '0', label: t('utilities.obsSource', { n: 1 }), nickname: obsConnections.value.find((item) => item.id === '0')?.nickname ?? '', running: running.value, clients: receivers.value, receiverIps: receiverIps.value, url: obsUrl.value },
  ...additionalConnections.value.map((item) => ({ ...item, label: /^OBS\s*(\d+)$/.test(item.label) ? t('utilities.obsSource', { n: item.label.match(/\d+$/)?.[0] }) : item.label, receiverIps: additionalIps.value[item.id] ?? [], url: additionalUrls.value[item.id] ?? '' })),
])
const allRunning = computed(() => running.value && additionalConnections.value.every((item) => item.running))
const totalReceivers = computed(() => receivers.value + additionalConnections.value.reduce((sum, item) => sum + item.clients, 0))
async function toggleAll(start: boolean) {
  if (controlsBusy.value) return
  busyConnection.value = 'all'
  connectionError.value = ''
  let failed = false
  try {
    await refresh()
    const targets = [{ id: '0', running: running.value }, ...additionalConnections.value]
    for (const target of targets) {
      if (target.running === start) continue
      try {
        if (target.id === '0') {
          if (start) {
            if (!(await palcoSession.turnOn())) failed = true
          } else await palcoSession.turnOff()
        } else if (start) {
          if (!(await palcoSession.startSlot(target.id))) failed = true
        } else await palcoSession.stopSlot(target.id)
      } catch { failed = true }
    }
    if (start) await Promise.all(targets.filter(target => !target.running).map(target => palcoSession.warmupObs(target.id)))
    notifyObsChanged()
    await refresh()
    if (failed) connectionError.value = t('utilities.obsBulkFailed')
  } catch { connectionError.value = t('utilities.obsBulkFailed') }
  finally { busyConnection.value = null }
}

function changeBlackIdle(event: Event) {
  setObsBlackIdle((event.target as HTMLInputElement).checked)
  for (const connection of connectionCards.value) {
    if (connection.running) palcoSession.syncObsIdle(connection.id)
  }
}

async function refreshConnection(id: string) {
  if (controlsBusy.value) return
  busyConnection.value = id
  connectionError.value = ''
  try {
    if (!(await palcoSession.refreshObs(id))) throw new Error('refresh')
  } catch { connectionError.value = t('utilities.obsRefreshFailed') }
  finally { busyConnection.value = null }
}

async function createConnection() {
  if (controlsBusy.value) return
  busyConnection.value = 'create'
  connectionError.value = ''
  try {
    const number = Math.max(1, ...obsConnections.value.map((item) => Number(item.label.match(/\d+$/)?.[0]) || 1)) + 1
    const slot = await palcoSession.createSlot(`OBS ${number}`)
    if (!slot) throw new Error('create')
    registerObsConnection(slot.id, slot.label)
    const started = await palcoSession.startSlot(slot.id)
    if (!started) throw new Error('start')
    await palcoSession.warmupObs(slot.id)
    notifyObsChanged()
    await refresh()
  } catch { connectionError.value = t('utilities.obsConnectionFailed') }
  finally { busyConnection.value = null }
}
async function toggleConnection(id: string, active: boolean) {
  if (controlsBusy.value) return
  busyConnection.value = id
  connectionError.value = ''
  try {
    if (active) await palcoSession.stopSlot(id)
    else {
      if (!(await palcoSession.startSlot(id))) throw new Error('start')
      await palcoSession.warmupObs(id)
    }
    notifyObsChanged()
    await refresh()
  } catch { connectionError.value = t('utilities.obsConnectionFailed') }
  finally { busyConnection.value = null }
}
function copyConnection(id: string) {
  const url = additionalUrls.value[id]
  if (!url) return
  void navigator.clipboard?.writeText(url)
  copiedConnection.value = id
  setTimeout(() => { copiedConnection.value = null }, 2000)
}


let timer: ReturnType<typeof setInterval> | null = null

const steps = computed(() => [
  t('utilities.obsStep1'),
  t('utilities.obsStep2'),
  t('utilities.obsStep3'),
])

async function refresh() {
  await refreshConnections()
  const urls: Record<string, string> = {}
  await Promise.all(additionalConnections.value.map(async (connection) => {
    const status = await palcoSession.statusSlot(connection.id)
    urls[connection.id] = status?.receiverUrl ?? ''
    additionalIps.value[connection.id] = status?.receiverIps ?? []
    if (status?.running) palcoSession.syncObsIdle(connection.id)
  }))
  additionalUrls.value = urls
  const st = await palcoSession.status()
  if (st) {
    if (st.running) { registerObsConnection('0', 'OBS 1'); palcoSession.syncObsIdle('0') }
    running.value = st.running
    receivers.value = st.clients
    receiverIps.value = st.receiverIps ?? []
    obsUrl.value =
      'receiverUrl' in st
        ? String((st as { receiverUrl?: string | null }).receiverUrl ?? '')
        : ''
  }
}

async function toggle() {
  if (controlsBusy.value) return
  turning.value = true
  try {
    if (running.value) {
      await palcoSession.turnOff()
    } else {
      if (await palcoSession.turnOn()) await palcoSession.warmupObs('0')
    }
    await refresh()
  } catch { connectionError.value = t('utilities.obsConnectionFailed'); await refresh() } finally {
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
  palcoSession.setSlot('0')
  void palcoSession.getConnectionPersistence().then(enabled => { preserveConnections.value = enabled }).catch(() => {}).finally(() => { persistenceBusy.value = false })
  void refresh()
  timer = setInterval(() => void refresh(), 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="obs-view">
    <div class="obs-view__content">
    <header class="obs-view__header">
      <PageBackStack @minimize="minimize" @prepare="prepare">
        <button type="button" class="obs-view__back" @click="$router.back()">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
      </PageBackStack>
      <TransmissionIcon :size="32" class="obs-view__brand" />
      <h1 class="obs-view__title">{{ t('utilities.obs') }}</h1>
      <span class="obs-view__status" :class="{ 'obs-view__status--on': anyRunning }">
        <span class="obs-view__status-dot" aria-hidden="true"></span>
        {{ anyRunning ? t('utilities.obsOn', { n: totalReceivers }) : t('utilities.obsOff') }}
      </span>
    </header>

    <div class="obs-view__card ds-glass-card--padded ds-glass-card">
      <div class="obs-view__bulk-actions">
        <button type="button" class="obs-view__copy obs-view__add" :disabled="controlsBusy" @click="createConnection">
          <i class="ti ti-plus" aria-hidden="true" /> {{ t('utilities.obsAddConnection') }}
        </button>
        <button type="button" class="obs-view__bulk-button obs-view__start-all" :disabled="controlsBusy || allRunning" @click="toggleAll(true)">
          <i class="ti ti-player-play" aria-hidden="true" /> {{ t('utilities.obsStartAll') }}
        </button>
        <button type="button" class="obs-view__bulk-button obs-view__stop-all" :disabled="controlsBusy || !anyRunning" @click="toggleAll(false)">
          <i class="ti ti-player-stop" aria-hidden="true" /> {{ t('utilities.obsStopAll') }}
        </button>
      </div>
      <p v-if="connectionError" role="alert">{{ connectionError }}</p>
      <article v-for="connection in connectionCards" :key="connection.id"
        class="obs-view__connection" :class="{ 'obs-view__connection--on': connection.running }">
        <div class="obs-view__connection-header">
          <div class="obs-view__connection-icon"><TransmissionIcon :size="32" /></div>
          <div class="obs-view__connection-info">
            <div class="obs-view__name-row">
              <strong class="obs-view__connection-name">{{ connection.label }}</strong>
              <input class="obs-view__nickname" type="text" maxlength="60" :value="nicknameDrafts[connection.id] ?? connection.nickname ?? ''"
                :placeholder="t('utilities.obsNickname')" :aria-label="t('utilities.obsNicknameLabel', { name: connection.label })"
                @input="nicknameDrafts[connection.id] = ($event.target as HTMLInputElement).value"
                @change="saveNickname(connection.id, ($event.target as HTMLInputElement).value)"
                @keydown.enter="($event.target as HTMLInputElement).blur()" />
            </div>
            <span class="obs-view__connection-state" :class="{ 'obs-view__connection-state--on': connection.running }">
              <span class="obs-view__status-dot" aria-hidden="true" />
              {{ connection.running ? t('utilities.obsOn', { n: connection.clients }) : t('utilities.obsOff') }}
            </span>
          </div>
          <div class="obs-view__connection-actions">
          <button type="button" class="obs-view__toggle" :class="{ 'obs-view__toggle--on': connection.running }"
            :disabled="controlsBusy" @click="connection.id === '0' ? toggle() : toggleConnection(connection.id, connection.running)">
            <i class="ti" :class="connection.running ? 'ti-player-stop' : 'ti-player-play'" aria-hidden="true" />
            {{ connection.running ? t('utilities.obsStop') : t('utilities.obsStart') }}
          </button>
            <button v-if="connection.id !== '0'" type="button" class="obs-view__delete"
              :disabled="controlsBusy" :aria-label="t('utilities.obsDeleteConnection', { name: connection.label })"
              :title="t('utilities.obsDeleteConnection', { name: connection.label })"
              @click="pendingRemoval = { id: connection.id, label: connection.label }">
              <i class="ti ti-x" aria-hidden="true" />
            </button>
            <span v-else class="obs-view__delete-placeholder" aria-hidden="true" />
          </div>
        </div>
        <p v-if="connection.receiverIps?.length" class="obs-view__background-hint">{{ connection.receiverIps.join(', ') }}</p>
        <div v-if="connection.running && connection.url" class="obs-view__connection-url">
          <p class="obs-view__label">{{ t('utilities.obsUrlLabel') }}</p>
          <div class="obs-view__url-row">
            <code class="obs-view__url">{{ connection.url }}</code>
            <button type="button" class="obs-view__refresh" :disabled="controlsBusy"
              :title="t('utilities.obsRefresh')" :aria-label="t('utilities.obsRefresh')" @click="refreshConnection(connection.id)">
              <i class="ti ti-refresh" aria-hidden="true" />
            </button>
            <button type="button" class="obs-view__copy" @click="connection.id === '0' ? copyUrl() : copyConnection(connection.id)">
              <i class="ti" :class="(connection.id === '0' ? copied : copiedConnection === connection.id) ? 'ti-check' : 'ti-copy'" aria-hidden="true" />
              {{ (connection.id === '0' ? copied : copiedConnection === connection.id) ? t('utilities.obsCopied') : t('utilities.obsCopy') }}
            </button>
          </div>
        </div>
      </article>
      <section class="obs-view__settings" aria-labelledby="transmission-settings-title">
        <h2 id="transmission-settings-title">{{ t('utilities.transmissionSettings') }}</h2>
<TransmissionAudioOptions />
    <label class="obs-view__black-idle">
      <input data-test="preserve-connections" type="checkbox" :checked="preserveConnections" :disabled="persistenceBusy" @change="changePersistence" />
      <span>{{ t('utilities.obsPreserveConnections') }}<small class="obs-view__background-hint">{{ t('utilities.obsPreserveHint') }}</small></span>
    </label>
    <label class="obs-view__black-idle">
      <input type="checkbox" :checked="obsBlackIdle" @change="changeBlackIdle" />
      <span>{{ t('utilities.obsBlackIdle') }}<small class="obs-view__background-hint" role="status">{{ t(obsBlackIdle ? 'utilities.obsBackgroundBlack' : 'utilities.obsBackgroundCustom') }}</small></span>
    </label>
      </section>
      <section class="obs-view__instructions" aria-labelledby="transmission-how-to-title">
        <h2 id="transmission-how-to-title" class="obs-view__section-title">{{ t('utilities.transmissionHowTo') }}</h2>
      <p class="obs-view__background-hint">{{ t('utilities.transmissionReceiverHint') }}</p>

        <p class="obs-view__instructions-title">{{ t('utilities.obsHowTitle') }}</p>
      <ol class="obs-view__steps">
        <li v-for="(s, i) in steps" :key="i" class="obs-view__step">
          <span class="obs-view__step-num" aria-hidden="true">{{ i + 1 }}</span>
          <span class="obs-view__step-text">{{ s }}</span>
        </li>
      </ol>
      </section>
    </div>
    </div>
    <AppConfirm :open="pendingRemoval !== null" :z-index="120" danger
      :title="t('utilities.obsDeleteTitle', { name: pendingRemoval?.label ?? '' })"
      :message="t('utilities.obsDeleteMessage')" :confirm-label="t('utilities.obsDeleteConfirm')"
      :cancel-label="t('common.cancel')" @cancel="pendingRemoval = null" @confirm="confirmRemoveConnection" />
  </section>
</template>

<style scoped lang="scss">
.obs-view__settings { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--ds-color-outline); }
.obs-view__settings h2, .obs-view__section-title { margin: 0; color: var(--ds-color-on-surface); font-size: 1.1rem; font-weight: 600; }

.obs-view__black-idle { display: flex; align-items: center; gap: 0.65rem; padding: 0.75rem 0; color: var(--ds-color-on-surface); cursor: pointer; }
.obs-view__background-hint { display: block; margin-top: 0.25rem; color: var(--ds-color-on-surface-variant); font-size: 0.8rem; }
.obs-view__black-idle input { accent-color: var(--ds-color-primary); }
.obs-view__bulk-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--ds-color-outline);
}
.obs-view__name-row { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
.obs-view__nickname { min-width: 0; width: 100%; padding: 0.2rem 0.4rem; border: 1px solid transparent; border-radius: 0.3rem; color: var(--ds-color-on-surface); background: transparent; font: inherit; font-size: 0.85rem; }
.obs-view__nickname:hover { border-color: var(--ds-color-outline); }
.obs-view__nickname:focus { outline: 1px solid var(--ds-color-primary); background: var(--ds-color-surface); }
.obs-view__connection-name { white-space: nowrap; color: var(--ds-color-on-surface); font-size: 1rem; font-weight: 700; }
.obs-view__stop-all:not(:disabled) { color: #ff8a80; border-color: color-mix(in srgb, #ff8a80 45%, transparent); }

 .obs-view__connection {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid var(--ds-color-outline);
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--ds-color-surface, #171717) 75%, transparent);
}
.obs-view__connection--on { border-color: color-mix(in srgb, #22c55e 40%, transparent); }
.obs-view__connection-header { display: grid; grid-template-columns: 2.7rem minmax(0, 1fr) auto; gap: 0.8rem; align-items: center; }
.obs-view__connection-icon { display: flex; align-items: center; justify-content: center; width: 2.7rem; height: 2.7rem; border-radius: 0.65rem; background: #d5d9df; color: #111; }
.obs-view__connection-info { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.obs-view__connection-state { display: flex; align-items: center; gap: 0.4rem; color: var(--ds-color-on-surface-variant); font-size: 0.8rem; }
.obs-view__connection-state--on { color: #22c55e; }
.obs-view__connection-url { display: flex; flex-direction: column; gap: 0.45rem; }
.obs-view__connection .obs-view__toggle { min-width: 11rem; justify-content: center; }
.obs-view__instructions { margin-top: 0.5rem; padding: 0.85rem 0; border-top: 1px solid var(--ds-color-outline); }
.obs-view__instructions-title { margin: 0 0 0.8rem; color: var(--ds-color-on-surface-variant); font-size: 0.8rem; font-weight: 600; }

@media (max-width: 600px) {
  .obs-view__connection-header { grid-template-columns: 2.7rem minmax(0, 1fr); }
  .obs-view__connection .obs-view__toggle { grid-column: 1 / -1; width: 100%; }
}
.obs-view .obs-view__add {
  margin-right: auto;
  align-self: center;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--ds-color-primary);
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #111);
  font-weight: 700;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--ds-color-primary) 25%, transparent);
}
.obs-view .obs-view__add:hover:not(:disabled) { filter: brightness(1.1); }
.obs-view .obs-view__add:disabled { opacity: 0.5; cursor: not-allowed; }
.obs-view__connection-actions { display: flex; align-items: center; gap: 0.5rem; }
.obs-view__delete, .obs-view__delete-placeholder { flex-shrink: 0; width: 2rem; height: 2rem; }
.obs-view__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, #ff8a80 45%, transparent);
  border-radius: 50%;
  color: #ff8a80;
  background: color-mix(in srgb, #c62828 14%, transparent);
  cursor: pointer;
}
.obs-view__delete:hover:not(:disabled) { background: #c62828; color: #fff; }
.obs-view__delete:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 600px) {
  .obs-view__connection-actions { grid-column: 1 / -1; }
  .obs-view__connection-actions .obs-view__toggle { flex: 1; }
}

.obs-view {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;

  &__content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 46rem;
    margin-inline: auto;
    padding: 0 1.5rem 5rem;
  }

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

  &__toggle,
  &__bulk-button {
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

  &__copy,
  &__refresh {
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
