<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import AppConfirm from '@shared/components/AppConfirm.vue'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { RemotePairingInfo } from '@shared/types/desktop-bridge'

const { t } = useI18n()

const info = ref<RemotePairingInfo | null>(null)
const failed = ref(false)
const clientCount = ref(0)
const clientAddress = ref<string | null>(null)
/** Identidade por papel: remote = APK (esquerda), speaker = pregador (direita). */
const remoteAddress = ref<string | null>(null)
const speakerAddress = ref<string | null>(null)
const viewerCount = ref(0)
const speakerCount = ref(0)
let offClients: (() => void) | undefined

/** id do botão copiado (para feedback "copiado") — volta sozinho. */
const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** Detalhes técnicos recolhíveis (IP/porta/token/protocolo). */
const showDetails = ref(false)
const tokenRole = ref<'remote' | 'speaker' | null>(null)
const tokenBusy = ref(false)
const tokenFailed = ref(false)
const disconnectBusy = ref(false)
const disconnectFailed = ref(false)
const canDisconnectSpeaker = computed(() => Boolean(getDesktopBridge()?.remote?.disconnectSpeaker))
const canResetTokens = computed(() => Boolean(getDesktopBridge()?.remote?.resetToken))

function applyInfo(value: RemotePairingInfo) {
  info.value = value
  clientCount.value = value.clientCount
  clientAddress.value = value.clientAddress ?? null
  remoteAddress.value = value.remoteAddress ?? null
  speakerAddress.value = value.speakerAddress ?? null
  viewerCount.value = value.viewerCount ?? 0
  speakerCount.value = value.speakerCount ?? (value.speakerAddress ? 1 : 0)
}

async function disconnectSpeaker() {
  if (disconnectBusy.value) return
  disconnectBusy.value = true
  disconnectFailed.value = false
  try {
    const disconnect = getDesktopBridge()?.remote?.disconnectSpeaker
    if (!disconnect) throw new Error('Disconnect unavailable')
    applyInfo(await disconnect())
  } catch {
    disconnectFailed.value = true
  } finally {
    disconnectBusy.value = false
  }
}

async function renewToken() {
  const role = tokenRole.value
  if (!role) return
  tokenRole.value = null
  tokenBusy.value = true
  tokenFailed.value = false
  try {
    const reset = getDesktopBridge()?.remote?.resetToken
    if (!reset) throw new Error('Token reset unavailable')
    applyInfo(await reset(role))
    copiedId.value = null
  } catch {
    tokenFailed.value = true
  } finally {
    tokenBusy.value = false
  }
}


onMounted(async () => {
  const remote = getDesktopBridge()?.remote
  if (!remote?.pairingInfo) {
    failed.value = true
    return
  }
  try {
    applyInfo(await remote.pairingInfo())
    offClients = remote.onClients?.(({ count, address, remoteAddress: ra, speakerAddress: sa, viewerCount: vc, speakerCount: sc }) => {
      clientCount.value = count
      clientAddress.value = address ?? null
      remoteAddress.value = ra ?? null
      speakerAddress.value = sa ?? null
      viewerCount.value = vc ?? 0
      speakerCount.value = sc ?? (sa ? 1 : 0)
    })
  } catch {
    failed.value = true
  }
})

onUnmounted(() => {
  offClients?.()
  clearTimeout(copiedTimer)
})

async function copyToClipboard(url: string | undefined | null, id: string) {
  if (!url) return
  try {
    await navigator.clipboard?.writeText(url)
    copiedId.value = id
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedId.value = null }, 2000)
  } catch {
    // clipboard bloqueado — mantém botão como estava, sem feedback falso
  }
}

function copyUrl() {
  void copyToClipboard(info.value?.connectUrl, 'remote')
}

function copySpeakerUrl() {
  void copyToClipboard(info.value?.speakerUrl, 'speaker')
}

function copyOperatorUrl() {
  void copyToClipboard(info.value?.operatorUrl, 'operator')
}
</script>

<template>
  <div class="pairing-grid">
    <!-- ── Painel: Controle Remoto (app no celular) ─────────────────── -->
    <GlassCard class="pairing-card">
      <header class="pairing-head">
        <span class="pairing-icon" aria-hidden="true">
          <i class="ti ti-device-mobile" />
        </span>
        <div class="pairing-head__text">
          <h3 class="pairing-title">{{ t('settings.remote.title') }}</h3>
          <p class="pairing-desc">{{ t('settings.remote.pairingDescription') }}</p>
        </div>
      </header>

      <div
        class="pairing-status"
        :class="{ 'pairing-status--on': !!remoteAddress }"
        data-testid="remote-client-status"
      >
        <span class="status-dot" />
        {{ remoteAddress
          ? t('settings.remote.clientConnected', { device: remoteAddress })
          : t('settings.remote.waitingClient') }}
      </div>

      <div v-if="failed" class="pairing-warning" data-testid="remote-unavailable">
        {{ t('settings.remote.unavailable') }}
      </div>

      <div v-else-if="info" class="pairing-panel">
        <div class="qr-frame">
          <img
            v-if="info.qrDataUrl"
            :src="info.qrDataUrl"
            width="220"
            height="220"
            class="qr"
            alt="QR"
            data-testid="remote-qr"
          >
        </div>

        <p class="pairing-steps">{{ t('settings.remote.steps') }}</p>

        <div class="url-row">
          <code class="url mono" data-testid="remote-url">{{ info.connectUrl }}</code>
          <button
            type="button"
            class="copy-btn"
            :class="{ 'copy-btn--done': copiedId === 'remote' }"
            data-testid="remote-copy"
            @click="copyUrl"
          >
            <i
              class="ti"
              :class="copiedId === 'remote' ? 'ti-check' : 'ti-copy'"
              aria-hidden="true"
            />
            <span>{{ copiedId === 'remote' ? t('common.copied') : t('settings.remote.copyLink') }}</span>
          </button>
        </div>

        <button v-if="canResetTokens" type="button" class="copy-btn"
          data-testid="remote-renew-token" :disabled="tokenBusy" @click="tokenRole = 'remote'">
          <i class="ti ti-refresh" aria-hidden="true" /> {{ t('settings.remote.renewToken') }}
        </button>
        <p class="pairing-steps">{{ t('settings.remote.tokenPersistent') }}</p>

        <button
          type="button"
          class="details-toggle"
          :aria-expanded="showDetails"
          @click="showDetails = !showDetails"
        >
          <i class="ti ti-chevron-down" :class="{ 'chev-rot': showDetails }" aria-hidden="true" />
          {{ t('settings.remote.technicalDetails') }}
        </button>

        <div v-if="showDetails" class="details-body">
          <div class="detail-row">
            <span class="detail-label">{{ t('settings.remote.address') }}</span>
            <span class="mono">{{ info.host }}:{{ info.port }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ t('settings.remote.token') }}</span>
            <span class="mono token" data-testid="remote-token">{{ info.token }}</span>
          </div>
        </div>
      </div>
    </GlassCard>

    <!-- ── Painel: Pregador (passador de slides) ────────────────────── -->
    <GlassCard class="pairing-card">
      <header class="pairing-head">
        <span class="pairing-icon pairing-icon--secondary" aria-hidden="true">
          <i class="ti ti-presentation" />
        </span>
        <div class="pairing-head__text">
          <h3 class="pairing-title">{{ t('settings.remote.supportTitle') }}</h3>
          <p class="pairing-desc">{{ t('settings.remote.supportHint') }}</p>
        </div>
      </header>

      <div
        class="pairing-status"
        :class="{ 'pairing-status--on': !!speakerAddress }"
        data-testid="remote-speaker-status"
      >
        <span class="status-dot" />
        {{ speakerAddress
          ? t('settings.remote.speakerConnected', { device: speakerAddress })
          : (info?.speakerUrl ? t('settings.remote.speakerReady') : t('settings.remote.speakerWaiting')) }}
      </div>

      <div v-if="info?.speakerQrDataUrl" class="support-qr-grid" data-testid="remote-speaker-block">
        <section class="support-role">
          <div class="qr-frame"><img v-if="info.viewerQrDataUrl" :src="info.viewerQrDataUrl" width="220" height="220" class="qr" :alt="t('settings.remote.regencyTitle')" data-testid="remote-viewer-qr"></div>
          <h4>{{ t('settings.remote.regencyTitle') }}</h4>
          <p class="pairing-steps">{{ t('settings.remote.regencyDescription') }}<strong class="support-connection-note">{{ t('settings.remote.regencyConnections') }}</strong></p>
          <div class="url-row">
            <code class="url mono" data-testid="remote-viewer-url">{{ info.viewerUrl }}</code>
            <button type="button" class="copy-btn" data-testid="remote-viewer-copy" @click="copyToClipboard(info.viewerUrl, 'viewer')">
              <i class="ti ti-copy" aria-hidden="true" />{{ copiedId === 'viewer' ? t('common.copied') : t('settings.remote.copyLink') }}
            </button>
            <p class="support-count" data-testid="viewer-connection-count" role="status">{{ t('settings.remote.activeConnections') }} <strong>{{ viewerCount }}</strong></p>
          </div>
        </section>
        <section class="support-role">
          <div class="qr-frame"><img :src="info.speakerQrDataUrl" width="220" height="220" class="qr" :alt="t('settings.remote.presenterTitle')" data-testid="remote-speaker-qr"></div>
          <h4>{{ t('settings.remote.presenterTitle') }}</h4>
          <p class="pairing-steps">{{ t('settings.remote.presenterDescription') }}<strong class="support-connection-note">{{ t('settings.remote.presenterConnections') }}</strong></p>
          <div class="url-row">
            <code class="url mono" data-testid="remote-speaker-url">{{ info.speakerUrl }}</code>
            <button type="button" class="copy-btn" data-testid="remote-speaker-copy" @click="copySpeakerUrl">
              <i class="ti ti-copy" aria-hidden="true" />{{ copiedId === 'speaker' ? t('common.copied') : t('settings.remote.copyLink') }}
            </button>
            <button v-if="canDisconnectSpeaker" type="button" class="copy-btn" data-testid="speaker-disconnect"
              :disabled="disconnectBusy || tokenBusy || !speakerAddress" @click="disconnectSpeaker">
              <i class="ti ti-plug-off" aria-hidden="true" /> {{ t('settings.remote.disconnectSpeaker') }}
            </button>
            <p v-if="disconnectFailed" class="pairing-warning" role="alert">{{ t('settings.remote.disconnectFailed') }}</p>
            <p class="support-count" data-testid="speaker-connection-count" role="status">{{ t('settings.remote.activeConnections') }} <strong>{{ speakerCount }}</strong></p>
          </div>
        </section>
        <div class="support-token-actions">
          <button v-if="canResetTokens" type="button" class="copy-btn" data-testid="speaker-renew-token" :disabled="tokenBusy" @click="tokenRole = 'speaker'">
            <i class="ti ti-refresh" aria-hidden="true" /> {{ t('settings.remote.renewToken') }}
          </button>
          <p class="pairing-steps">{{ t('settings.remote.tokenPersistent') }}</p>
        </div>
      </div>

      <!-- Operador: mesma hierarquia, abaixo do pregador no mesmo painel -->
      <div v-if="info?.operatorQrDataUrl" class="operator-sub" data-testid="remote-operator-block">
        <div class="operator-sub__head">
          <i class="ti ti-users-group" aria-hidden="true" />
          <div>
            <div class="operator-sub__title">{{ t('settings.remote.operatorTitle') }}</div>
            <div class="operator-sub__desc">{{ t('settings.remote.operatorHint') }}</div>
          </div>
        </div>
        <div
          class="pairing-status pairing-status--sub"
          :class="{ 'pairing-status--on': !!info.operatorUrl }"
          data-testid="remote-operator-status"
        >
          <span class="status-dot" />
          {{ info.operatorUrl ? t('settings.remote.operatorReady') : t('settings.remote.operatorWaiting') }}
        </div>
        <div class="url-row">
          <code class="url mono url--sm" data-testid="remote-operator-url">{{ info.operatorUrl }}</code>
          <button
            type="button"
            class="copy-btn copy-btn--sm"
            :class="{ 'copy-btn--done': copiedId === 'operator' }"
            data-testid="remote-operator-copy"
            @click="copyOperatorUrl"
          >
            <i
              class="ti"
              :class="copiedId === 'operator' ? 'ti-check' : 'ti-copy'"
              aria-hidden="true"
            />
            <span>{{ copiedId === 'operator' ? t('common.copied') : t('settings.remote.operatorCopy') }}</span>
          </button>
        </div>
      </div>
    </GlassCard>
    <p v-if="tokenFailed" class="pairing-warning" role="alert" data-testid="remote-token-error">{{ t('settings.remote.renewFailed') }}</p>
    <AppConfirm :open="tokenRole !== null" :z-index="120"
      :title="t(tokenRole === 'speaker' ? 'settings.remote.renewSpeakerTitle' : 'settings.remote.renewRemoteTitle')"
      :message="t(tokenRole === 'speaker' ? 'settings.remote.renewSpeakerMessage' : 'settings.remote.renewRemoteMessage')"
      :confirm-label="t('settings.remote.renewTokenConfirm')" :cancel-label="t('common.cancel')"
      @cancel="tokenRole = null" @confirm="renewToken" />
  </div>
</template>

<style scoped>
.pairing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--ds-gutter-grid, 24px);
  width: 100%;
  align-items: start;
}

/* Desktop: painel Pregador um pouco mais largo — a URL dele é mais comprida
   e quebra em 2 linhas; coluna extra absorve o wrap e iguala as alturas. */
@media (min-width: 1024px) {
  .pairing-grid {
    grid-template-columns: 1fr 1.15fr;
  }
}

.support-qr-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
.support-role{min-width:0;display:flex;flex-direction:column;align-items:center}
.support-role .qr-frame{max-width:100%;box-sizing:border-box}
.support-role .qr{width:100%;height:auto;max-width:220px}
.support-role h4{margin:12px 0 0;color:var(--ds-color-on-surface);text-align:center}
.support-role .pairing-steps{flex:1}
.support-connection-note{display:block;margin-top:8px;font-weight:700;color:var(--ds-color-primary)}
.support-count{display:flex;justify-content:center;align-items:center;gap:8px;margin:4px 0;padding:10px;border:1px solid var(--ds-color-outline-strong);border-radius:var(--ds-radius-sm);color:var(--ds-color-on-surface-variant);font-size:13px}
.support-count strong{color:var(--ds-color-primary);font-size:18px;font-variant-numeric:tabular-nums}
.support-token-actions{grid-column:1/-1;text-align:center}
.support-token-actions>.copy-btn{margin:4px}
.copy-btn:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:480px){.support-qr-grid{gap:12px}.support-role h4{font-size:14px}}
.pairing-card {
  min-width: 0;
}

/* ── Cabeçalho dos dois painéis ── */
.pairing-head {
  display: flex;
  gap: var(--ds-spacing, 12px);
  align-items: flex-start;
  margin-bottom: 16px;
}

.pairing-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 22px;
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary-soft);
}

.pairing-icon--secondary {
  background: color-mix(in srgb, var(--ds-color-secondary) 14%, transparent);
  color: var(--ds-color-secondary);
}

.pairing-title {
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--ds-color-on-surface);
}

.pairing-desc {
  margin: 4px 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--ds-color-on-surface-variant);
}

/* ── Status real ── */
.pairing-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 6px 12px;
  border-radius: var(--ds-radius-full);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--ds-color-on-surface-variant);
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
}

.pairing-status--on {
  color: #4caf7d; /* verde de status — legível em dark e light */
  background: color-mix(in srgb, #4caf7d 12%, transparent);
}

.pairing-status--sub {
  font-size: 0.78rem;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ds-color-on-surface-variant);
  opacity: 0.5;
}

.pairing-status--on .status-dot {
  background: #4caf7d;
  opacity: 1;
  box-shadow: 0 0 0 3px color-mix(in srgb, #4caf7d 20%, transparent);
}

/* ── QR protagonista ── */
.pairing-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-frame {
  padding: 10px;
  background: #fff;
  border-radius: var(--ds-radius-md, 12px 0 12px 0);
}

.qr {
  display: block;
  width: 220px;
  height: 220px;
}

.pairing-steps {
  margin: 12px 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  text-align: center;
  color: var(--ds-color-on-surface-variant);
}

/* ── URL + copiar ── */
.url-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  align-items: stretch;
}

.url {
  display: block;
  padding: 8px 12px;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  font-size: 0.78rem;
  word-break: break-all;
  color: var(--ds-color-on-surface-variant);
  text-align: center;
}

.url--sm {
  font-size: 0.72rem;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  color: var(--ds-color-primary-soft);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.copy-btn:hover {
  background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
}

.copy-btn--done {
  border-color: #4caf7d;
  color: #4caf7d;
  background: color-mix(in srgb, #4caf7d 12%, transparent);
}

.copy-btn--sm {
  padding: 8px 14px;
  font-size: 0.8125rem;
}

/* ── Detalhes técnicos (recolhível) ── */
.details-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  cursor: pointer;
}

.details-toggle:hover {
  color: var(--ds-color-on-surface);
}

.chev-rot {
  transition: transform 160ms ease;
  transform: rotate(180deg);
}

.details-body {
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  font-size: 0.82rem;
}

.detail-label {
  color: var(--ds-color-on-surface-variant);
}

.token {
  font-weight: 700;
  letter-spacing: 0.08em;
}

/* ── Sub-bloco Operador ── */
.operator-sub {
  width: 100%;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--ds-color-outline-strong);
}

.operator-sub__head {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.operator-sub__head > i {
  font-size: 20px;
  color: var(--ds-color-primary-soft);
}

.operator-sub__title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--ds-color-on-surface);
}

.operator-sub__desc {
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--ds-color-on-surface-variant);
}

/* ── Erro ── */
.pairing-warning {
  padding: 12px;
  border-radius: var(--ds-radius-sm, 8px 0 8px 0);
  background: color-mix(in srgb, var(--ds-color-brand-yellow) 14%, transparent);
  color: color-mix(in srgb, var(--ds-color-brand-yellow) 80%, var(--ds-color-on-surface));
  font-size: 0.875rem;
}

.mono {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
}

@media (max-width: 720px) {
  .qr {
    width: 180px;
    height: 180px;
  }
}
</style>
