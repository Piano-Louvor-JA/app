<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import { getDesktopBridge } from '@shared/services/desktop-bridge'
import type { RemotePairingInfo } from '@shared/types/desktop-bridge'

const { t } = useI18n()

const info = ref<RemotePairingInfo | null>(null)
const failed = ref(false)
const clientCount = ref(0)
const clientAddress = ref<string | null>(null)
let offClients: (() => void) | undefined

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
    offClients = remote.onClients?.(({ count, address }) => {
      clientCount.value = count
      clientAddress.value = address ?? null
    })
  } catch {
    failed.value = true
  }
})

onUnmounted(() => offClients?.())

function copyUrl() {
  if (!info.value) return
  void navigator.clipboard?.writeText(info.value.connectUrl)
}

function copySpeakerUrl() {
  if (!info.value?.speakerUrl) return
  void navigator.clipboard?.writeText(info.value.speakerUrl)
}

function copyOperatorUrl() {
  if (!info.value?.operatorUrl) return
  void navigator.clipboard?.writeText(info.value.operatorUrl)
}
</script>

<template>
  <GlassCard class="pairing-card">
    <h3 class="text-h6 mb-2">
      {{ t('settings.remote.title') }}
    </h3>
    <p class="text-body-2 text-medium-emphasis mb-4">
      {{ t('settings.remote.pairingDescription') }}
    </p>

    <div
      class="connection-status"
      :class="{ connected: clientCount > 0 }"
      data-testid="remote-client-status"
    >
      <span class="status-dot" />
      {{ clientCount > 0
        ? t('settings.remote.clientConnected', {
            device: clientAddress ?? 'Piano LouvorJA',
          })
        : t('settings.remote.waitingClient') }}
    </div>

    <div v-if="failed" class="pairing-warning" data-testid="remote-unavailable">
      {{ t('settings.remote.unavailable') }}
    </div>

    <div v-else-if="info" class="d-flex align-stretch mt-2">
      <div class="qr-col">
        <img
          v-if="info.qrDataUrl"
          :src="info.qrDataUrl"
          width="180"
          height="180"
          class="qr"
          alt="QR"
          data-testid="remote-qr"
        />
        <div class="text-caption text-medium-emphasis mt-1 text-center">
          {{ t('settings.remote.title') }}
        </div>
      </div>
      <div class="ml-6 flex-grow-1">
        <div class="text-caption text-medium-emphasis">
          {{ t('settings.remote.address') }}
        </div>
        <div class="text-body-1 font-weight-bold mono">
          {{ info.host }}:{{ info.port }}
        </div>

        <div class="text-caption text-medium-emphasis mt-4">
          {{ t('settings.remote.token') }}
        </div>
        <div class="token mono" data-testid="remote-token">
          {{ info.token }}
        </div>

        <button
          type="button"
          class="copy-btn mt-4"
          data-testid="remote-copy"
          @click="copyUrl"
        >
          {{ t('settings.remote.copyLink') }}
        </button>
      </div>
    </div>

    <!-- Pregador: QR da página /speaker (browser do celular, sem app) -->
    <div
      v-if="info && info.speakerQrDataUrl"
      class="d-flex align-stretch mt-6"
      data-testid="remote-speaker-block"
    >
      <div class="qr-col">
        <img
          :src="info.speakerQrDataUrl"
          width="180"
          height="180"
          class="qr"
          alt="QR Pregador"
          data-testid="remote-speaker-qr"
        >
        <div class="text-caption text-medium-emphasis mt-1 text-center">
          {{ t('settings.remote.speakerTitle') }}
        </div>
      </div>
      <div class="ml-6 flex-grow-1">
        <div class="text-subtitle-2 mb-1">
          {{ t('settings.remote.speakerTitle') }}
        </div>
        <p class="text-caption text-medium-emphasis">
          {{ t('settings.remote.speakerHint') }}
        </p>
        <div class="text-body-2 mono speaker-url" data-testid="remote-speaker-url">
          {{ info.speakerUrl }}
        </div>
        <button
          type="button"
          class="copy-btn mt-3"
          data-testid="remote-speaker-copy"
          @click="copySpeakerUrl"
        >
          {{ t('settings.remote.speakerCopy') }}
        </button>
      </div>
    </div>

    <!-- Operador: QR da página /operator (app remoto Piano LouvorJA) -->
    <div
      v-if="info && info.operatorQrDataUrl"
      class="d-flex align-stretch mt-6"
      data-testid="remote-operator-block"
    >
      <div class="qr-col">
        <img
          :src="info.operatorQrDataUrl"
          width="180"
          height="180"
          class="qr"
          alt="QR Operador"
          data-testid="remote-operator-qr"
        >
        <div class="text-caption text-medium-emphasis mt-1 text-center">
          {{ t('settings.remote.operatorTitle') }}
        </div>
      </div>
      <div class="ml-6 flex-grow-1">
        <div class="text-subtitle-2 mb-1">
          {{ t('settings.remote.operatorTitle') }}
        </div>
        <p class="text-caption text-medium-emphasis">
          {{ t('settings.remote.operatorHint') }}
        </p>
        <div class="text-body-2 mono operator-url" data-testid="remote-operator-url">
          {{ info.operatorUrl }}
        </div>
        <button
          type="button"
          class="copy-btn mt-3"
          data-testid="remote-operator-copy"
          @click="copyOperatorUrl"
        >
          {{ t('settings.remote.operatorCopy') }}
        </button>
      </div>
    </div>

    <!-- Status duplo: Speaker (pregador) + Operator (app remoto) -->
    <div class="mt-6 d-flex flex-wrap gap-4" data-testid="remote-dual-status">
      <div class="status-badge" data-testid="remote-speaker-status">
        <span class="status-dot" :class="{ active: info?.speakerUrl }" />
        {{ info?.speakerUrl ? t('settings.remote.speakerReady') : t('settings.remote.speakerWaiting') }}
      </div>
      <div class="status-badge" data-testid="remote-operator-status">
        <span class="status-dot" :class="{ active: info?.operatorUrl }" />
        {{ info?.operatorUrl ? t('settings.remote.operatorReady') : t('settings.remote.operatorWaiting') }}
      </div>
    </div>
  </GlassCard>
</template>

<style scoped>
.qr-col {
  flex-shrink: 0;
}
.pairing-card {
  max-width: 560px;
}

.qr {
  border-radius: 8px;
  background: #fff;
  padding: 8px;
}

.mono {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.08em;
}

.token {
  font-size: 1.6rem;
  font-weight: 900;
}

.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.68);
  font-size: 0.875rem;
  font-weight: 600;
}

.connection-status.connected {
  background: rgba(51, 178, 115, 0.15);
  color: #63d19a;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8a8a8a;
}

.connection-status.connected .status-dot {
  background: #63d19a;
  box-shadow: 0 0 0 4px rgba(99, 209, 154, 0.15);
}

.pairing-warning {
  padding: 12px;
  border-radius: 8px;
  background: rgba(255, 193, 7, 0.12);
  color: #ffc107;
  font-size: 0.875rem;
}

.copy-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.speaker-block {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 16px;
}

.speaker-url {
  word-break: break-all;
  opacity: 0.8;
  margin-bottom: 8px;
}

</style>
