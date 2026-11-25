<script setup lang="ts">
import { computed, ref, shallowRef, watch, onUnmounted } from 'vue'
import { DEMO_SIGN_PACK_V2 } from '../demo-signpack-v2'
import { parseSignPackV2 } from '../sign-pack-v2'
import { SignAnimator } from '../sign-animator'
import AvatarRenderer from './AvatarRenderer.vue'
import SignPlayer from './SignPlayerText.vue'
import VLibrasUnityPlayer from './VLibrasUnityPlayer.vue'
import { getLibrasGloss } from '../services/libras-translate'

/**
 * LibrasDemo — F-A.4 + F-B.1 (SPEC v2.1.0): prova end-to-end do intérprete.
 * Online: VLibras Unity (Ícaro) — botão traduz termo PT→glosa→playNow.
 * Offline fallback: AvatarRenderer local (pack v2 keyframes).
 */
const demoPack = parseSignPackV2(DEMO_SIGN_PACK_V2)

const terms = computed(() => [...demoPack.glossary.keys()])
const currentTerm = ref(0)

const animator = shallowRef<SignAnimator | null>(null)
const unity = ref<InstanceType<typeof VLibrasUnityPlayer> | null>(null)
const translating = ref(false)

// monta animator com o termo atual
function buildAnimator(term: string) {
  const sign = demoPack.glossary.get(term)
  if (!sign) return null
  return new SignAnimator(sign.keyframes, 1, 0.25)
}

watch(currentTerm, (t) => {
  animator.value = buildAnimator(terms.value[t] ?? '')
}, { immediate: true })

/** Traduz termo PT → glosa VLibras → playNow no Unity (ou pendência se carregando). */
async function playOnVLibras() {
  const term = terms.value[currentTerm.value] ?? ''
  if (!term || translating.value) return
  translating.value = true
  try {
    const { gloss } = await getLibrasGloss(term)
    if (gloss) unity.value?.playGloss(gloss)
  } finally {
    translating.value = false
  }
}

onUnmounted(() => { animator.value = null })
</script>

<template>
  <div class="libras-demo-container" data-testid="libras-demo">
    <h2>Intérprete de Sinais v2.1 — Avatar 3D</h2>
    <p data-testid="libras-demo-notice">
      {{ demoPack.manifest.locale }} · {{ terms.length }} sinais · {{ demoPack.manifest.license }}
    </p>

    <!-- Online: player Unity oficial VLibras (Ícaro/Hozana) -->
    <VLibrasUnityPlayer ref="unity" />

    <!-- Gloss textual (fallback acessível F1.3) -->
    <SignPlayer :terms="[terms[currentTerm] ?? '']" />

    <!-- Offline fallback: avatar local rig próprio (SPEC v2.1) -->
    <details class="libras-demo-offline">
      <summary>Avatar local (offline)</summary>
      <AvatarRenderer v-if="animator" :animator="animator" :term="terms[currentTerm]" />
    </details>

    <div class="libras-demo-controls">
      <button
        v-for="(t, i) in terms"
        :key="t"
        :class="{ active: i === currentTerm }"
        @click="currentTerm = i"
      >
        {{ t }}
      </button>
      <button
        class="libras-demo-play"
        data-testid="libras-demo-play-vlibras"
        :disabled="translating"
        @click="playOnVLibras"
      >
        {{ translating ? 'Traduzindo…' : '▶ VLibras' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.libras-demo-container { padding: 16px; }
.libras-demo-controls { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 12px; }
.libras-demo-controls button { cursor: pointer; padding: 4px 10px; border-radius: 4px; }
.libras-demo-controls button.active { font-weight: bold; }
.libras-demo-play { margin-left: auto; }
.libras-demo-offline { margin-top: 12px; }
</style>
