<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { RemotePairingInfo } from '@shared/types/desktop-bridge'

const { t } = useI18n()

const info = ref<RemotePairingInfo | null>(null)
const failed = ref(false)
const pairingMode = ref<'browser' | 'app'>('browser')
const copyStatus = ref('')
const useBrowser = computed(() => pairingMode.value === 'browser' && Boolean(info.value?.webUrl))
const pairingQr = computed(() => useBrowser.value ? info.value?.webQrDataUrl : info.value?.qrDataUrl)
const pairingUrl = computed(() => useBrowser.value ? info.value?.webUrl : info.value?.connectUrl)
const clientCount = ref(0)
const clientAddress = ref<string | null>(null)
/** Identidade por papel: remote = APK (esquerda), speaker = pregador (direita). */
const remoteAddress = ref<string | null>(null)
const speakerAddress = ref<string | null>(null)
let offClients: (() => void) | undefined

/** id do botão copiado (para feedback "copiado") — volta sozinho. */
const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** Detalhes técnicos recolhíveis (IP/porta/token/protocolo). */
const showDetails = ref(false)

onMounted(async () => {
  const remote = getDesktopBridge()?.remote
  if (!remote?.pairingInfo) {
    failed.value = true
    return
  }
  try {
    info.value = await remote.pairingInfo()
    clientCount.value = info.value.clientCount
    clientAddress.value = info.value.clientAddress ?? null
    remoteAddress.value = info.value.remoteAddress ?? null
    speakerAddress.value = info.value.speakerAddress ?? null
    offClients = remote.onClients?.(({ count, address, remoteAddress: ra, speakerAddress: sa }) => {
      clientCount.value = count
      clientAddress.value = address ?? null
      remoteAddress.value = ra ?? null
      speakerAddress.value = sa ?? null
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
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(url)
    copyStatus.value = 'remoteBrowser.copied'
    copiedId.value = id
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copiedId.value = null }, 2000)
  } catch {
    copyStatus.value = 'remoteBrowser.copyError'
  }
}

function copyUrl() {
  void copyToClipboard(pairingUrl.value, 'remote')
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
          <p class="pairing-desc">{{ t(useBrowser ? 'remoteBrowser.hint' : 'settings.remote.pairingDescription') }}</p>
        </div>
      </header>

      <div v-if="info?.webUrl" class="pairing-modes" :aria-label="t('settings.remote.title')">
        <button type="button" :aria-pressed="pairingMode === 'browser'" @click="pairingMode = 'browser'">{{ t('remoteBrowser.browser') }}</button>
        <button type="button" :aria-pressed="pairingMode === 'app'" @click="pairingMode = 'app'">{{ t('remoteBrowser.app') }}</button>
      </div>
      <p v-if="copyStatus" role="status">{{ t(copyStatus) }}</p>
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
            v-if="pairingQr"
            :src="pairingQr"
            width="220"
            height="220"
            class="qr"
            alt="QR"
            data-testid="remote-qr"
          >
        </div>

        <p class="pairing-steps">{{ t('settings.remote.steps') }}</p>

        <div class="url-row">
          <code class="url mono" data-testid="remote-url">{{ pairingUrl }}</code>
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
          <h3 class="pairing-title">{{ t('settings.remote.speakerTitle') }}</h3>
          <p class="pairing-desc">{{ t('settings.remote.speakerHint') }}</p>
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

      <div v-if="info?.speakerQrDataUrl" class="pairing-panel" data-testid="remote-speaker-block">
        <div class="qr-frame">
          <img
            :src="info.speakerQrDataUrl"
            width="220"
            height="220"
            class="qr"
            alt="QR Pregador"
            data-testid="remote-speaker-qr"
          >
        </div>

        <p class="pairing-steps">{{ t('settings.remote.speakerSteps') }}</p>

        <div class="url-row">
          <code class="url mono" data-testid="remote-speaker-url">{{ info.speakerUrl }}</code>
          <button
            type="button"
            class="copy-btn"
            :class="{ 'copy-btn--done': copiedId === 'speaker' }"
            data-testid="remote-speaker-copy"
            @click="copySpeakerUrl"
          >
            <i
              class="ti"
              :class="copiedId === 'speaker' ? 'ti-check' : 'ti-copy'"
              aria-hidden="true"
            />
            <span>{{ copiedId === 'speaker' ? t('common.copied') : t('settings.remote.speakerCopy') }}</span>
          </button>
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
  </div>
</template>

<style scoped>
.pairing-modes { display:flex; flex-wrap:wrap; gap:.5rem; margin:1rem 0; }
.pairing-modes button { padding:.6rem .8rem; border-radius:.6rem; border:1px solid var(--ds-color-outline); color:var(--ds-color-on-surface); background:var(--ds-color-surface); cursor:pointer; }
.pairing-modes button[aria-pressed="true"] { border-color:var(--ds-color-primary); color:var(--ds-color-primary); }
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
