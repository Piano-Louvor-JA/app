<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PalcoRenameDialog from '../components/PalcoRenameDialog.vue'
import {
  discoverPalcoTvs,
  hasPalcoClients,
  listPalcoTvs,
  listRunningSlots,
  onPalcoClientsChanged,
  sendPalcoCommand,
  setPalcoTvMuted,
  wakePalcoTv,
  type FoundTv,
  type PalcoClient,
  type PalcoSlotSummary,
} from '../services/palco-clients'

/**
 * Palco: TVs com o app Palco (webOS, Tizen, Android TV) conectadas às
 * transmissões deste computador. Marca = recebe a transmissão; desmarcada a
 * TV fica na tela de espera. Paridade com Ferramentas › Palco do apk.
 */
const { t } = useI18n()
const router = useRouter()

const available = hasPalcoClients()
const tvs = ref<PalcoClient[]>([])
const slots = ref<PalcoSlotSummary[]>([])
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
  const [list, running] = await Promise.all([listPalcoTvs(), listRunningSlots()])
  tvs.value = list
  slots.value = running
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
    tv.slotLabel,
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

async function copyIp() {
  if (!ownIp.value) return
  try {
    await navigator.clipboard.writeText(ownIp.value)
    say(t('settings.palcoTvs.ipCopied', { ip: ownIp.value }))
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

      <div v-if="!slots.length" class="palco-view__off">
        <span>
          <strong>{{ t('settings.palcoTvs.offTitle') }}</strong>
          <small>{{ t('settings.palcoTvs.offHint') }}</small>
        </span>
        <button type="button" class="palco-view__primary" data-test="palco-open-transmission"
          @click="router.push({ name: 'settings-transmission' })">
          {{ t('settings.palcoTvs.turnOn') }}
        </button>
      </div>

      <section class="palco-view__section" aria-labelledby="palco-connected-title">
        <h2 id="palco-connected-title" class="palco-view__title">
          {{ t('settings.palcoTvs.connected') }}
          <span v-if="slots.length" class="palco-view__count">{{ tvs.length }}</span>
        </h2>
        <p v-if="!tvs.length" class="palco-view__hint">
          {{ slots.length ? t('settings.palcoTvs.noneConnected') : t('settings.palcoTvs.turnOnHint') }}
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

      <section class="palco-view__section palco-view__section--ip">
        <p class="palco-view__hint">{{ t('settings.palcoTvs.redKey') }}</p>
        <div class="palco-view__ip">
          <code>{{ ownIp ?? t('settings.palcoTvs.noNetwork') }}</code>
          <button v-if="ownIp" type="button" class="palco-view__dots" :aria-label="t('settings.palcoTvs.copyIp')"
            data-test="palco-copy-ip" @click="copyIp">
            <i class="ti ti-copy" aria-hidden="true" />
          </button>
        </div>
      </section>
    </template>

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
