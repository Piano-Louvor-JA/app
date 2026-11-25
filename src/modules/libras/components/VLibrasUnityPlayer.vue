<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { getLibrasAvatar, isLibrasSubtitleEnabled, getLibrasSpeed, type LibrasAvatar } from '../services/libras-preferences'

/**
 * VLibrasUnityPlayer — F-B.1 (SPEC v2.1.0): player Unity oficial VLibras
 * (avatar Ícaro/Hozana) embutido via iframe + protocolo postMessage.
 * Modelo: LibrasOverlay.vue do violin-app (louvorja) — mesmo serviço público
 * vlibras.gov.br (spbgovbr-vlibras, LGPL-3.0). ONLINE + Libras (PT-BR→glosa).
 * SPEC v2 offline/locale-arbitrário segue no AvatarRenderer local (fallback).
 * ponytail: sem cache de bundles ainda — tocar stream direto; cache IndexedDB
 * entra quando hinos reais (F2) justificarem (~30KB/token).
 */
const VLIBRAS_UNITY_URL = '/vlibras/index.html'
// Host local F-B.3: mesmo Unity do gov (assets remotos originais), mas com
// playerweb.json NOSSO → webglContextAttributes.alpha=true + backgroundColor
// transparent → avatar com fundo TRANSPARENTE de verdade. Offline/fallback:
// gov direto (https://vlibras.gov.br/app/unity/index.html) via prop govFallback.

/**
 * compact: cartão pequeno para overlay na tela de PROJEÇÃO (canto).
 * O Unity pinta fundo branco (playerweb.json backgroundColor "#FFFFFF") —
 * transparência real exige fork do index (F-B.3); aqui o cartão é o "estúdio".
 */
const props = defineProps<{ compact?: boolean; avatar?: LibrasAvatar; visible?: boolean; subtitle?: boolean; speed?: number }>()

const ready = ref(false)
const iframeEl = ref<HTMLIFrameElement | null>(null)
let pendingGloss = ''

/** Avatar ativo: prop vence pref; default icaro. */
const avatar = (): LibrasAvatar => props.avatar ?? getLibrasAvatar()

/** Legenda: prop vence pref; default ON (widget oficial desenha gloss textual). */
const subtitle = (): boolean => props.subtitle ?? isLibrasSubtitleEnabled()

/** Velocidade: prop vence pref; default 1 (normal). 0.5=lenta … 2=rápida. */
const speed = (): number => props.speed ?? getLibrasSpeed()

function sendToUnity(object: string, method: string, param = '') {
  if (!iframeEl.value?.contentWindow) return
  iframeEl.value.contentWindow.postMessage({ type: 'unity', object, method, params: param }, '*')
}

function onUnityMessage(event: MessageEvent) {
  if (event.source !== iframeEl.value?.contentWindow) return
  if (event.data?.type !== 'unity_event') return
  if (event.data.event === 'on_load_player') {
    ready.value = true
    sendToUnity('PlayerManager', 'Change', avatar())
    // Legenda default do widget é ON; desligar via toggleSubtitle (Player.js oficial).
    if (!subtitle()) sendToUnity('PlayerManager', 'toggleSubtitle')
    // Velocidade do intérprete: PlayerManager.setSlider (Player.setSpeed oficial).
    sendToUnity('PlayerManager', 'setSlider', String(speed()))
    if (pendingGloss) {
      sendToUnity('PlayerManager', 'playNow', pendingGloss)
      pendingGloss = ''
    }
  }
}

// Troca de avatar em tempo real (settings → prop reativa).
watch(() => props.avatar, (next) => {
  if (next && ready.value) sendToUnity('PlayerManager', 'Change', next)
})

// Velocidade em tempo real.
watch(() => props.speed, (next) => {
  if (next !== undefined && ready.value) sendToUnity('PlayerManager', 'setSlider', String(next))
})

// Toggle de legenda em tempo real.
watch(() => props.subtitle, (next) => {
  if (next !== undefined && ready.value) sendToUnity('PlayerManager', 'toggleSubtitle')
})

function playGloss(gloss: string) {
  if (!ready.value) {
    pendingGloss = gloss
    return
  }
  sendToUnity('PlayerManager', 'playNow', gloss)
}

function stop() {
  if (ready.value) sendToUnity('PlayerManager', 'stopAll')
}

onMounted(() => window.addEventListener('message', onUnityMessage))
onUnmounted(() => {
  stop()
  window.removeEventListener('message', onUnityMessage)
})

defineExpose({ ready, playGloss, stop })
</script>

<template>
  <div
    class="vlibras-unity"
    :class="{ 'vlibras-unity--compact': props.compact, 'vlibras-unity--hidden': props.visible === false }"
    data-testid="vlibras-unity-player"
  >
    <iframe
      ref="iframeEl"
      :src="VLIBRAS_UNITY_URL"
      sandbox="allow-scripts allow-same-origin allow-pointer-lock"
      allow="autoplay"
      title="Intérprete VLibras (Ícaro)"
      class="vlibras-unity-iframe"
    />
  </div>
</template>

<style scoped>
.vlibras-unity {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: transparent;
  border-radius: 8px;
  overflow: hidden;
}
.vlibras-unity--compact {
  position: absolute;
  right: 1.2vmin;
  bottom: 1.2vmin;
  width: 14vmin;
  height: 18vmin;
  min-width: 160px;
  min-height: 200px;
  aspect-ratio: auto;
  background: transparent;
  border-radius: clamp(12px, 1.6vmin, 20px);
  box-shadow: none;
  z-index: 5;
  pointer-events: none;
}
/* Prewarm: iframe montado desde o início (Unity carrega fora do timing da
   música); invisível ≠ display:none (manteria o WebGL rodando? não — mas
   visibility+opacity preservam o renderer ativo). */
.vlibras-unity--hidden {
  visibility: hidden;
  opacity: 0;
}
.vlibras-unity-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
