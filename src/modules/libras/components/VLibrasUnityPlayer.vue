<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { getLibrasAvatar, isLibrasSubtitleEnabled, getLibrasSpeed, type LibrasAvatar } from '../services/libras-preferences'
import { prepareGlossForPlayback } from '../services/libras-trie'

const VLIBRAS_UNITY_URL = '/vlibras/index.html'
const props = defineProps<{ compact?: boolean; avatar?: LibrasAvatar; visible?: boolean; subtitle?: boolean; speed?: number }>()
const ready = ref(false)
const iframeEl = ref<HTMLIFrameElement | null>(null)
const fingerspellingCaption = ref('')
let pendingGloss = ''
let settingsApplied = false
let playSequence = 0

const avatar = (): LibrasAvatar => props.avatar ?? getLibrasAvatar()
const subtitle = (): boolean => props.subtitle ?? isLibrasSubtitleEnabled()
const speed = (): number => props.speed ?? getLibrasSpeed()

function sendToUnity(object: string, method: string, param: string | number = '') {
  iframeEl.value?.contentWindow?.postMessage({ type: 'unity', object, method, params: param }, '*')
}

function playPreparedGloss(gloss: string) {
  if (!ready.value) pendingGloss = gloss
  else sendToUnity('PlayerManager', 'playNow', gloss)
}

async function prepareAndPlay(gloss: string) {
  const sequence = ++playSequence
  try {
    const playback = await prepareGlossForPlayback(gloss)
    if (sequence !== playSequence) return
    fingerspellingCaption.value = playback.fingerspelled.map((token) => `soletrando: ${token}`).join(' · ')
    playPreparedGloss(playback.gloss)
  } catch {
    if (sequence !== playSequence) return
    fingerspellingCaption.value = ''
    if (ready.value) playPreparedGloss(gloss)
  }
}

function onUnityMessage(event: MessageEvent) {
  if (event.source !== iframeEl.value?.contentWindow || event.data?.type !== 'unity_event') return
  if (event.data.event === 'on_load_player') {
    ready.value = true
    sendToUnity('PlayerManager', 'setBaseUrl', 'https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/BR/')
    sendToUnity('PlayerManager', 'Change', avatar())
    if (!subtitle()) sendToUnity('PlayerManager', 'toggleSubtitle')
    if (pendingGloss) {
      sendToUnity('PlayerManager', 'playNow', pendingGloss)
      pendingGloss = ''
    }
  }
  if (event.data.event === 'on_playing_state_change') {
    const data = event.data.data as string[] | undefined
    if (data?.[0] === 'True' && !settingsApplied) {
      settingsApplied = true
      sendToUnity('PlayerManager', 'setSlider', speed())
    }
  }
}

watch(() => props.avatar, (next) => { if (next && ready.value) sendToUnity('PlayerManager', 'Change', next) })
watch(() => props.speed, (next) => { if (next !== undefined && ready.value) sendToUnity('PlayerManager', 'setSlider', Number(next)) })
watch(() => props.subtitle, (next) => { if (next !== undefined && ready.value) sendToUnity('PlayerManager', 'toggleSubtitle') })

function playGloss(gloss: string) {
  if (!ready.value) {
    pendingGloss = gloss
    void prepareAndPlay(gloss)
    return
  }
  playPreparedGloss(gloss)
  void prepareAndPlay(gloss)
}
function stop() { if (ready.value) sendToUnity('PlayerManager', 'stopAll') }

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
    <iframe ref="iframeEl" :src="VLIBRAS_UNITY_URL" sandbox="allow-scripts allow-same-origin allow-pointer-lock" allow="autoplay" title="Intérprete VLibras (Ícaro)" class="vlibras-unity-iframe" />
    <span v-if="fingerspellingCaption" class="sr-only" aria-live="polite">{{ fingerspellingCaption }}</span>
  </div>
</template>

<style scoped>
.vlibras-unity { position: relative; width: 100%; aspect-ratio: 4 / 3; background: transparent; border-radius: 8px; overflow: hidden; }
.vlibras-unity--compact { position: absolute; right: 1.2vmin; bottom: 1.2vmin; width: 14vmin; height: 18vmin; min-width: 160px; min-height: 200px; aspect-ratio: auto; border-radius: clamp(12px, 1.6vmin, 20px); z-index: 5; pointer-events: none; }
.vlibras-unity--hidden { visibility: hidden; opacity: 0; }
.vlibras-unity-iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
