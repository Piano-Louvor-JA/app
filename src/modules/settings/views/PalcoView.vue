<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import AppConfirm from '@shared/components/AppConfirm.vue'

import PalcoRenameDialog from '../components/PalcoRenameDialog.vue'
import TransmissionBehaviorCard from '../components/TransmissionBehaviorCard.vue'
import { palcoSession } from '../services/palco-session'
import {
  createPalcoConnection,
  discoverPalcoTvs,
  hasPalcoClients,
  listPalcoConnections,
  listPalcoTvs,
  removePalcoConnection,
  onPalcoClientsChanged,
  sendPalcoCommand,
  setPalcoTvMuted,
  wakePalcoTv,
  type FoundTv,
  type PalcoClient,
  type PalcoConnection,
} from '../services/palco-clients'

/**
 * Palco: TVs com o app Palco (webOS, Tizen, Android TV) e as conexões do
 * Palco, separadas das da Transmissão (OBS/navegador): ligar, desligar e
 * criar conexões aqui não mexe na Transmissão, e o Palco não usa o token da
 * rede. Marca = a TV recebe a projeção; desmarcada fica na tela de espera.
 * Paridade com Ferramentas › Palco do apk.
 */
const { t } = useI18n()

const available = hasPalcoClients()
const tvs = ref<PalcoClient[]>([])
const connections = ref<PalcoConnection[]>([])
const slots = computed(() => connections.value.filter((connection) => connection.running))
const anyOn = computed(() => slots.value.length > 0)
const principal = computed(() => connections.value[0] ?? null)
const busy = ref<string | null>(null)
const adding = ref(false)
const newName = ref('')
const pendingRemoval = ref<PalcoConnection | null>(null)
const found = ref<FoundTv[]>([])
const ownIp = ref<string | null>(null)
const scanning = ref(false)
const notice = ref('')
const menuFor = ref<string | null>(null)
const renaming = ref<PalcoClient | null>(null)
const waking = ref<string | null>(null)

const connectedIps = computed(() => new Set(tvs.value.map((tv) => tv.ip)))
const notConnected = computed(() => found.value.filter((tv) => !connectedIps.value.has(tv.ip)))

let noticeTimer: ReturnType<typeof setTimeout> | null = null
function say(message: string) {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), 4000)
}

async function refresh() {
  const [list, stage] = await Promise.all([listPalcoTvs(), listPalcoConnections()])
  tvs.value = list
  connections.value = stage
}

/** TV ainda conectada numa transmissão (app antigo da TV): dá para mover para o Palco. */
function onTransmission(tv: PalcoClient) {
  return !connections.value.some((connection) => connection.id === tv.slotId)
}

function connectionDetail(connection: PalcoConnection) {
  if (connection.error?.code === 'port-in-use') return t('settings.palcoTvs.portInUse', { port: connection.error.port ?? connection.httpPort })
  if (!connection.running) return t('settings.palcoTvs.connectionOff', { port: connection.httpPort })
  const count = tvs.value.filter((tv) => tv.slotId === connection.id).length
  return t('settings.palcoTvs.connectionOn', { port: connection.httpPort, count })
}

async function act(key: string, task: () => Promise<unknown>, failure: string) {
  if (busy.value) return
  busy.value = key
  try {
    if ((await task()) === false) say(failure)
  } catch {
    say(failure)
  } finally {
    busy.value = null
    await refresh()
  }
}

function toggleConnection(connection: PalcoConnection) {
  void act(connection.id, () => connection.running
    ? palcoSession.stopPalcoConnection(connection.id)
    : palcoSession.startPalcoConnection(connection.id), t('settings.palcoTvs.connectionFailed'))
}

function turnOnPrincipal() {
  if (principal.value) toggleConnection(principal.value)
}

function addConnection() {
  const name = newName.value.trim()
  if (!name) return
  void act('add', async () => {
    const created = await createPalcoConnection(name)
    if (!created) return false
    adding.value = false
    newName.value = ''
    return palcoSession.startPalcoConnection(created.id)
  }, t('settings.palcoTvs.connectionFailed'))
}

function confirmRemoval() {
  const connection = pendingRemoval.value
  pendingRemoval.value = null
  if (!connection) return
  void act(connection.id, () => removePalcoConnection(connection.id), t('settings.palcoTvs.connectionFailed'))
}

async function scan() {
  if (scanning.value) return
  scanning.value = true
  try {
    const result = await discoverPalcoTvs()
    found.value = result.tvs
    ownIp.value = result.ownIp
  } finally {
    scanning.value = false
  }
}

function detail(tv: PalcoClient) {
  return [
    tv.ip,
    onTransmission(tv) ? t('settings.palcoTvs.onTransmission', { slot: tv.slotLabel }) : tv.slotLabel,
    tv.version ? `v${tv.version}` : '',
    tv.muted ? t('settings.palcoTvs.onHold') : '',
  ].filter(Boolean).join(' · ')
}

function otherSlots(tv: PalcoClient) {
  return slots.value.filter((slot) => slot.id !== tv.slotId)
}

async function toggleMuted(tv: PalcoClient) {
  await setPalcoTvMuted(tv, !tv.muted)
  await refresh()
}

async function run(tv: PalcoClient, action: string) {
  menuFor.value = null
  const gone = t('settings.palcoTvs.gone')
  if (action === 'identify') {
    say(await sendPalcoCommand(tv, 'identify') ? t('settings.palcoTvs.identifySent', { name: tv.name }) : gone)
  } else if (action === 'rename') {
    renaming.value = tv
  } else if (action === 'reload') {
    say(await sendPalcoCommand(tv, 'reload') ? t('settings.palcoTvs.reloadSent', { name: tv.name }) : gone)
  } else if (action.startsWith('move:')) {
    const target = slots.value.find((slot) => `move:${slot.id}` === action)
    if (!target) return
    const ok = await sendPalcoCommand(tv, 'moveTo', { targetSlotId: target.id })
    say(ok ? t('settings.palcoTvs.moveSent', { name: tv.name, target: target.label }) : gone)
  }
}

async function confirmRename(name: string) {
  const tv = renaming.value
  renaming.value = null
  if (!tv) return
  const ok = await sendPalcoCommand(tv, 'rename', { name })
  say(ok ? t('settings.palcoTvs.renamed', { name }) : t('settings.palcoTvs.gone'))
  await refresh()
}

async function wake(tv: FoundTv) {
  waking.value = tv.ip
  const ok = await wakePalcoTv(tv.ip)
  waking.value = null
  say(ok ? t('settings.palcoTvs.waking', { name: tv.name }) : t('settings.palcoTvs.wakeFailed'))
}

/** IP:porta do Palco principal: serve até para o app antigo da TV achar o Palco. */
const typedAddress = computed(() => ownIp.value && principal.value ? `${ownIp.value}:${principal.value.httpPort}` : ownIp.value ?? '')

async function copyIp() {
  if (!ownIp.value) return
  try {
    await navigator.clipboard.writeText(typedAddress.value)
    say(t('settings.palcoTvs.ipCopied', { ip: typedAddress.value }))
  } catch { /* clipboard indisponível: o IP segue visível */ }
}

function closeMenu() { menuFor.value = null }

let unsubscribe: (() => void) | null = null
onMounted(() => {
  if (!available) return
  unsubscribe = onPalcoClientsChanged(() => void refresh())
  document.addEventListener('click', closeMenu)
  void refresh()
  void scan()
})
onUnmounted(() => {
  unsubscribe?.()
  document.removeEventListener('click', closeMenu)
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <section class="palco-view" data-testid="palco-view">
    <Teleport v-if="available" defer to="#settings-header-aside">
      <button type="button" class="palco-view__scan" data-test="palco-scan" :disabled="scanning" @click="scan">
        <i class="ti ti-refresh" :class="{ 'palco-view__spin': scanning }" aria-hidden="true" />
        {{ t('settings.palcoTvs.scan') }}
      </button>
    </Teleport>

    <p v-if="!available" class="palco-view__hint">{{ t('settings.palcoTvs.desktopOnly') }}</p>

    <template v-else>
      <p v-if="notice" class="palco-view__notice" role="status">{{ notice }}</p>

      <div v-if="!anyOn" class="palco-view__off">
        <span>
          <strong>{{ t('settings.palcoTvs.offTitle') }}</strong>
          <small>{{ t('settings.palcoTvs.offHint') }}</small>
        </span>
        <button type="button" class="palco-view__primary" data-test="palco-turn-on" :disabled="!principal || busy !== null"
          @click="turnOnPrincipal">
          {{ t('settings.palcoTvs.turnOn') }}
        </button>
      </div>

      <section class="palco-view__section" aria-labelledby="palco-connections-title">
        <h2 id="palco-connections-title" class="palco-view__title">
          {{ t('settings.palcoTvs.connections') }}
          <button type="button" class="palco-view__link palco-view__link--small" data-test="palco-add"
            :disabled="busy !== null" @click="adding = !adding">
            <i class="ti ti-plus" aria-hidden="true" /> {{ t('settings.palcoTvs.addConnection') }}
          </button>
        </h2>
        <p class="palco-view__hint">{{ t('settings.palcoTvs.connectionsHint') }}</p>
        <form v-if="adding" class="palco-view__add" data-test="palco-add-form" @submit.prevent="addConnection">
          <input v-model="newName" class="palco-view__input" type="text" maxlength="60"
            :placeholder="t('settings.palcoTvs.connectionPlaceholder')" :aria-label="t('settings.palcoTvs.connectionName')"
            data-test="palco-add-name">
          <button type="submit" class="palco-view__primary" :disabled="!newName.trim() || busy !== null">
            {{ t('settings.palcoTvs.create') }}
          </button>
        </form>
        <ul class="palco-view__list">
          <li v-for="(connection, index) in connections" :key="connection.id" class="palco-view__row"
            :data-test="`palco-connection-${connection.id}`">
            <i class="ti ti-broadcast palco-view__icon" :class="{ 'palco-view__icon--off': !connection.running }" aria-hidden="true" />
            <span class="palco-view__info">
              <strong>{{ connection.label }}</strong>
              <small>{{ connectionDetail(connection) }}</small>
            </span>
            <button type="button" :class="connection.running ? 'palco-view__link' : 'palco-view__primary'"
              :disabled="busy !== null" :data-test="`palco-toggle-${connection.id}`" @click="toggleConnection(connection)">
              {{ connection.running ? t('settings.palcoTvs.turnOff') : t('settings.palcoTvs.turnOn') }}
            </button>
            <button v-if="index > 0" type="button" class="palco-view__dots" :disabled="busy !== null"
              :aria-label="t('settings.palcoTvs.removeConnection', { name: connection.label })"
              :data-test="`palco-remove-${connection.id}`" @click="pendingRemoval = connection">
              <i class="ti ti-trash" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <section class="palco-view__section" aria-labelledby="palco-connected-title">
        <h2 id="palco-connected-title" class="palco-view__title">
          {{ t('settings.palcoTvs.connected') }}
          <span v-if="anyOn || tvs.length" class="palco-view__count">{{ tvs.length }}</span>
        </h2>
        <p v-if="!tvs.length" class="palco-view__hint">
          {{ anyOn ? t('settings.palcoTvs.noneConnected') : t('settings.palcoTvs.turnOnHint') }}
        </p>
        <ul v-else class="palco-view__list">
          <li v-for="tv in tvs" :key="tv.uid" class="palco-view__row" :class="{ 'palco-view__row--muted': tv.muted }"
            :data-test="`palco-tv-${tv.uid}`">
            <input type="checkbox" class="palco-view__check" :checked="!tv.muted"
              :aria-label="t('settings.palcoTvs.receives', { name: tv.name })" :data-test="`palco-check-${tv.uid}`"
              @change="toggleMuted(tv)">
            <i class="ti ti-device-tv palco-view__icon" aria-hidden="true" />
            <span class="palco-view__info">
              <strong>{{ tv.name }}</strong>
              <small>{{ detail(tv) }}</small>
            </span>
            <span class="palco-view__menu-wrap">
              <button type="button" class="palco-view__dots" :aria-label="t('settings.palcoTvs.actions', { name: tv.name })"
                :aria-expanded="menuFor === tv.uid" :data-test="`palco-menu-${tv.uid}`"
                @click.stop="menuFor = menuFor === tv.uid ? null : tv.uid">
                <i class="ti ti-dots-vertical" aria-hidden="true" />
              </button>
              <div v-if="menuFor === tv.uid" class="palco-view__menu" role="menu" @click.stop>
                <p v-if="!tv.version" class="palco-view__menu-note">{{ t('settings.palcoTvs.updateApp') }}</p>
                <button type="button" role="menuitem" :disabled="!tv.version" data-test="palco-identify"
                  @click="run(tv, 'identify')">
                  <i class="ti ti-eye" aria-hidden="true" /> {{ t('settings.palcoTvs.identify') }}
                </button>
                <button type="button" role="menuitem" :disabled="!tv.version" data-test="palco-rename"
                  @click="run(tv, 'rename')">
                  <i class="ti ti-pencil" aria-hidden="true" /> {{ t('settings.palcoTvs.renameAction') }}
                </button>
                <button v-for="slot in otherSlots(tv)" :key="slot.id" type="button" role="menuitem"
                  :disabled="!tv.version" :data-test="`palco-move-${slot.id}`" @click="run(tv, `move:${slot.id}`)">
                  <i class="ti ti-arrows-exchange" aria-hidden="true" /> {{ t('settings.palcoTvs.moveTo', { target: slot.label }) }}
                </button>
                <button type="button" role="menuitem" :disabled="!tv.version" data-test="palco-reload"
                  @click="run(tv, 'reload')">
                  <i class="ti ti-reload" aria-hidden="true" /> {{ t('settings.palcoTvs.reload') }}
                </button>
              </div>
            </span>
          </li>
        </ul>
      </section>

      <section class="palco-view__section" aria-labelledby="palco-found-title">
        <h2 id="palco-found-title" class="palco-view__title">
          {{ t('settings.palcoTvs.found') }}
          <span v-if="!scanning" class="palco-view__count">{{ notConnected.length }}</span>
        </h2>
        <p v-if="scanning" class="palco-view__hint">
          <i class="ti ti-loader-2 palco-view__spin" aria-hidden="true" /> {{ t('settings.palcoTvs.scanning') }}
        </p>
        <p v-else-if="!notConnected.length" class="palco-view__hint">{{ t('settings.palcoTvs.noneFound') }}</p>
        <ul v-else class="palco-view__list">
          <li v-for="tv in notConnected" :key="tv.ip" class="palco-view__row" :data-test="`palco-found-${tv.ip}`">
            <i class="ti ti-device-tv palco-view__icon" aria-hidden="true" />
            <span class="palco-view__info">
              <strong>{{ tv.name }}</strong>
              <small>{{ tv.ip }} · {{ t('settings.palcoTvs.notConnected') }}</small>
            </span>
            <button v-if="tv.canWake" type="button" class="palco-view__link" :disabled="waking === tv.ip"
              :data-test="`palco-wake-${tv.ip}`" @click="wake(tv)">
              {{ t('settings.palcoTvs.open') }}
            </button>
            <small v-else class="palco-view__hint">{{ t('settings.palcoTvs.openOnTv') }}</small>
          </li>
        </ul>
      </section>

      <TransmissionBehaviorCard @error="notice = $event" />

      <section class="palco-view__section palco-view__section--ip">
        <p class="palco-view__hint">{{ t('settings.palcoTvs.redKey') }}</p>
        <div class="palco-view__ip">
          <code>{{ ownIp ? typedAddress : t('settings.palcoTvs.noNetwork') }}</code>
          <button v-if="ownIp" type="button" class="palco-view__dots" :aria-label="t('settings.palcoTvs.copyIp')"
            data-test="palco-copy-ip" @click="copyIp">
            <i class="ti ti-copy" aria-hidden="true" />
          </button>
        </div>
      </section>
    </template>

    <AppConfirm :open="pendingRemoval !== null" :z-index="120" danger
      :title="t('settings.palcoTvs.removeTitle', { name: pendingRemoval?.label ?? '' })"
      :message="t('settings.palcoTvs.removeMessage')" :confirm-label="t('settings.palcoTvs.removeConfirm')"
      :cancel-label="t('common.cancel')" @cancel="pendingRemoval = null" @confirm="confirmRemoval" />
    <PalcoRenameDialog :open="renaming !== null" :current="renaming?.name ?? ''" @cancel="renaming = null"
      @confirm="confirmRename" />
  </section>
</template>

<style scoped lang="scss">
.palco-view {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 52rem;
  padding-bottom: 4rem;

  &__scan, &__primary, &__link {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.95rem;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;

    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &__scan, &__link {
    border: 1px solid color-mix(in srgb, var(--ds-color-primary) 28%, transparent);
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    color: var(--ds-color-primary);
  }

  &__primary {
    border: 1px solid var(--ds-color-primary);
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary, #111);
  }

  &__notice {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    color: var(--ds-color-on-surface);
    font-size: 0.85rem;
  }

  &__off {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.9rem;

    span { display: flex; flex-direction: column; gap: 0.25rem; }
    small { color: var(--ds-color-on-surface-variant); }
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    &--ip { padding-top: 1rem; border-top: 1px solid var(--ds-color-outline); }
  }

  &__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0;
    padding: 0.5rem 0.9rem;
    border-radius: 0.7rem;
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
    color: var(--ds-color-on-surface);
    font-size: 1rem;
    font-weight: 700;
  }

  &__count { color: var(--ds-color-on-surface-variant); font-size: 0.85rem; font-weight: 600; }

  &__hint {
    margin: 0;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.85rem;
  }

  &__list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }

  &__row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.6rem 0.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--ds-color-outline) 60%, transparent);

    &--muted .palco-view__info strong { color: var(--ds-color-on-surface-variant); }
  }

  &__check {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--ds-color-primary);
    cursor: pointer;
  }

  &__icon { color: var(--ds-color-primary); font-size: 1.25rem; }
  &__icon--off { color: var(--ds-color-on-surface-variant); }

  &__link--small { padding: 0.25rem 0.7rem; font-size: 0.8rem; }

  &__add {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  &__input {
    flex: 1;
    min-width: 0;
    padding: 0.5rem 0.8rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.6rem;
    background: transparent;
    color: var(--ds-color-on-surface);
    font: inherit;
  }

  &__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;

    small { color: var(--ds-color-on-surface-variant); font-size: 0.8rem; }
  }

  &__menu-wrap { position: relative; }

  &__dots {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ds-color-on-surface);
    cursor: pointer;

    &:hover { background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent); }
  }

  &__menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 15rem;
    padding: 0.35rem;
    border: 1px solid var(--ds-color-outline);
    border-radius: 0.7rem;
    background: var(--ds-color-surface-container, #2a2a2a);
    box-shadow: 0 12px 30px rgb(0 0 0 / 0.4);

    button {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.7rem;
      border: 0;
      border-radius: 0.5rem;
      background: transparent;
      color: var(--ds-color-on-surface);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &:hover:not(:disabled) { background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent); }
      &:disabled { opacity: 0.45; cursor: not-allowed; }
    }
  }

  &__menu-note {
    margin: 0;
    padding: 0.4rem 0.7rem;
    color: var(--ds-color-on-surface-variant);
    font-size: 0.78rem;
  }

  &__ip {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    code { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em; }
  }

  &__spin { animation: palco-spin 1s linear infinite; }
}

@keyframes palco-spin { to { transform: rotate(360deg); } }
</style>
