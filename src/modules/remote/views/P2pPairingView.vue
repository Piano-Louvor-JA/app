<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

import { GlassCard } from '@design-system/index'

import { P2pRemoteHost } from '../services/p2p-remote-host'

const { t } = useI18n()

type Step = 'idle' | 'offer' | 'scan' | 'connected' | 'error'

const step = ref<Step>('idle')
const offerQr = ref('')
const answerText = ref('')
const manualAnswer = ref('')
const errorMsg = ref('')
const log = ref<string[]>([])
const host = new P2pRemoteHost()

let video: HTMLVideoElement | null = null
let stream: MediaStream | null = null
let scanTimer: number | null = null

function pushLog(msg: string) {
  log.value = [...log.value.slice(-6), msg]
}

async function startOffer() {
  step.value = 'offer'
  errorMsg.value = ''
  try {
    const offer = await host.createOffer()
    offerQr.value = await QRCode.toDataURL(offer, {
      width: 320,
      errorCorrectionLevel: 'L', // payload SDP é grande — level baixo
    })
    pushLog(t('settings.remote.p2pOfferReady'))
    await startScan()
  } catch (e) {
    step.value = 'error'
    errorMsg.value = String(e)
  }
}

async function startScan() {
  step.value = 'scan'
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })
    await new Promise((r) => setTimeout(r, 200)) // video element montar
    if (video) {
      video.srcObject = stream
      await video.play()
      scanTimer = window.setInterval(scanFrame, 250)
    }
  } catch {
    // sem webcam: usuário usa o campo manual
    pushLog(t('settings.remote.p2pNoCamera'))
  }
}

function scanFrame() {
  /* v8 ignore next 1 -- intervalo só inicia depois do template ref atribuído */
  if (!video) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx || !canvas.width) return
  ctx.drawImage(video, 0, 0)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(img.data, img.width, img.height)
  if (result?.data) {
    answerText.value = result.data
    applyAnswer(result.data)
  }
}

async function applyAnswer(answer: string) {
  const ok = await host.acceptAnswer(answer)
  if (ok) {
    stopScan()
    host.onOpen = () => {
      step.value = 'connected'
      pushLog(t('settings.remote.p2pConnected'))
    }
    host.onMessage = (data) => {
      pushLog(`← ${JSON.stringify(data).slice(0, 80)}`)
    }
    pushLog(t('settings.remote.p2pAnswerOk'))
  } else {
    errorMsg.value = t('settings.remote.p2pBadAnswer')
  }
}

function submitManual() {
  if (manualAnswer.value.trim()) applyAnswer(manualAnswer.value.trim())
}

function sendPing() {
  host.send({ action: 'remote.hello', device: 'web-test', id: `p${Date.now()}` })
  pushLog('→ hello')
}

function stopScan() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null }
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

onUnmounted(() => {
  stopScan()
  host.destroy()
})
</script>

<template>
  <section class="p2p-pairing">
    <GlassCard class="p2p-pairing__card">
      <h2 class="p2p-pairing__title">
        {{ t('settings.remote.p2pTitle') }}
      </h2>

      <!-- Passo 1: gerar QR -->
      <div
        v-if="step !== 'error'"
        class="p2p-pairing__step"
      >
        <p class="p2p-pairing__hint">
          {{ t('settings.remote.p2pHint1') }}
        </p>
        <button
          type="button"
          class="p2p-pairing__btn"
          @click="startOffer"
        >
          {{ t('settings.remote.p2pStart') }}
        </button>
        <img
          v-if="offerQr"
          class="p2p-pairing__qr"
          :src="offerQr"
          alt="QR offer"
        >
      </div>

      <!-- Passo 2: ler answer -->
      <div
        v-if="step === 'scan' || step === 'connected'"
        class="p2p-pairing__step"
      >
        <p class="p2p-pairing__hint">
          {{ t('settings.remote.p2pHint2') }}
        </p>
        <video
          ref="video"
          class="p2p-pairing__cam"
          muted
          playsinline
        />
        <textarea
          v-model="manualAnswer"
          class="p2p-pairing__manual"
          rows="3"
          :placeholder="t('settings.remote.p2pManualPlaceholder')"
        />
        <button
          type="button"
          class="p2p-pairing__btn"
          @click="submitManual"
        >
          {{ t('settings.remote.p2pManualApply') }}
        </button>
      </div>

      <p
        v-if="errorMsg"
        class="p2p-pairing__error"
      >
        {{ errorMsg }}
      </p>

      <div
        v-if="step === 'connected'"
        class="p2p-pairing__step"
      >
        <p class="p2p-pairing__ok">
          ✓ {{ t('settings.remote.p2pConnected') }}
        </p>
        <button
          type="button"
          class="p2p-pairing__btn"
          @click="sendPing"
        >
          {{ t('settings.remote.p2pTestPing') }}
        </button>
      </div>

      <ul
        v-if="log.length"
        class="p2p-pairing__log"
      >
        <li
          v-for="(line, i) in log"
          :key="i"
        >
          {{ line }}
        </li>
      </ul>
    </GlassCard>
  </section>
</template>

<style scoped lang="scss">
.p2p-pairing {
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.p2p-pairing__card {
  width: min(28rem, 100%);
  padding: 1.5rem;
}

.p2p-pairing__title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: #fff;
}

.p2p-pairing__step {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}

.p2p-pairing__hint {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: rgb(255 255 255 / 0.75);
  text-align: center;
}

.p2p-pairing__qr {
  width: 320px;
  max-width: 100%;
  border-radius: 8px;
  background: #fff;
}

.p2p-pairing__cam {
  width: 100%;
  max-width: 320px;
  border-radius: 8px;
  background: #000;
}

.p2p-pairing__manual {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid rgb(255 255 255 / 0.15);
  border-radius: 8px;
  background: rgb(0 0 0 / 0.3);
  color: #fff;
  font-family: monospace;
  font-size: 0.72rem;
  resize: vertical;
}

.p2p-pairing__btn {
  padding: 0.5rem 1.2rem;
  border: none;
  border-radius: 999px;
  background: var(--ds-color-primary, #2196f3);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.p2p-pairing__error {
  color: #e57373;
  font-size: 0.85rem;
}

.p2p-pairing__ok {
  color: #81c784;
  font-weight: 600;
}

.p2p-pairing__log {
  margin: 0.5rem 0 0;
  padding: 0.5rem;
  border-radius: 8px;
  background: rgb(0 0 0 / 0.3);
  color: rgb(255 255 255 / 0.6);
  font-family: monospace;
  font-size: 0.7rem;
  list-style: none;
}
</style>
