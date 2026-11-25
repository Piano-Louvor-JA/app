<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

/**
 * VLibrasUnityPlayer — F-B.1 (SPEC v2.1.0): player Unity oficial VLibras
 * (avatar Ícaro/Hozana) embutido via iframe + protocolo postMessage.
 * Modelo: LibrasOverlay.vue do violin-app (louvorja) — mesmo serviço público
 * vlibras.gov.br (spbgovbr-vlibras, LGPL-3.0). ONLINE + Libras (PT-BR→glosa).
 * SPEC v2 offline/locale-arbitrário segue no AvatarRenderer local (fallback).
 * ponytail: sem cache de bundles ainda — tocar stream direto; cache IndexedDB
 * entra quando hinos reais (F2) justificarem (~30KB/token).
 */
const VLIBRAS_UNITY_URL = 'https://vlibras.gov.br/app/unity/index.html'

/**
 * compact: cartão pequeno para overlay na tela de PROJEÇÃO (canto).
 * O Unity pinta fundo branco (playerweb.json backgroundColor "#FFFFFF") —
 * transparência real exige fork do index (F-B.3); aqui o cartão é o "estúdio".
 */
const props = defineProps<{ compact?: boolean }>()

const ready = ref(false)
const iframeEl = ref<HTMLIFrameElement | null>(null)
let pendingGloss = ''

function sendToUnity(object: string, method: string, param = '') {
  if (!iframeEl.value?.contentWindow) return
  iframeEl.value.contentWindow.postMessage({ type: 'unity', object, method, params: param }, '*')
}

function onUnityMessage(event: MessageEvent) {
  if (event.source !== iframeEl.value?.contentWindow) return
  if (event.data?.type !== 'unity_event') return
  if (event.data.event === 'on_load_player') {
    ready.value = true
    // Ícaro é o avatar padrão; Hozana via prop futura (troca de avatar).
    sendToUnity('PlayerManager', 'Change', 'icaro')
    if (pendingGloss) {
      sendToUnity('PlayerManager', 'playNow', pendingGloss)
      pendingGloss = ''
    }
  }
}

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
    :class="{ 'vlibras-unity--compact': props.compact }"
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
  background: #101418;
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
  background: #f4f1ea;
  border-radius: clamp(12px, 1.6vmin, 20px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  z-index: 5;
  pointer-events: none;
}
.vlibras-unity-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
