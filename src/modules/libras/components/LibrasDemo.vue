<script setup lang="ts">
import { computed, ref, shallowRef, watch, onUnmounted } from 'vue'
import { DEMO_SIGN_PACK_V2 } from '../demo-signpack-v2'
import { parseSignPackV2 } from '../sign-pack-v2'
import { SignAnimator } from '../sign-animator'
import AvatarRenderer from './AvatarRenderer.vue'
import SignPlayer from './SignPlayerText.vue'

/**
 * LibrasDemo — F-A.4 (SPEC v2.1.0): prova end-to-end do intérprete avatar 3D.
 * Carrega demo pack v2 (keyframes) → AvatarRenderer 3D + gloss textual.
 * Avatar como t: hands = posição no plano de sinalização.
 */
const demoPack = parseSignPackV2(DEMO_SIGN_PACK_V2)

const terms = computed(() => [...demoPack.glossary.keys()])
const currentTerm = ref(0)

const animator = shallowRef<SignAnimator | null>(null)

// monta animator com o termo atual
function buildAnimator(term: string) {
  const sign = demoPack.glossary.get(term)
  if (!sign) return null
  return new SignAnimator(sign.keyframes, 1, 0.25)
}

watch(currentTerm, (t) => {
  animator.value = buildAnimator(terms.value[t] ?? '')
}, { immediate: true })

onUnmounted(() => { animator.value = null })
</script>

<template>
  <div class="libras-demo-container" data-testid="libras-demo">
    <h2>Intérprete de Sinais v2.1 — Avatar 3D</h2>
    <p data-testid="libras-demo-notice">
      {{ demoPack.manifest.locale }} · {{ terms.length }} sinais · {{ demoPack.manifest.license }}
    </p>

    <!-- Avatar 3D (F-A.3) -->
    <AvatarRenderer v-if="animator" :animator="animator" :term="terms[currentTerm]" />

    <!-- Gloss textual (fallback acessível F1.3) -->
    <SignPlayer :terms="[terms[currentTerm] ?? '']" />

    <div class="libras-demo-controls">
      <button
        v-for="(t, i) in terms"
        :key="t"
        :class="{ active: i === currentTerm }"
        @click="currentTerm = i"
      >
        {{ t }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.libras-demo-container { padding: 16px; }
.libras-demo-controls { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 12px; }
.libras-demo-controls button { cursor: pointer; padding: 4px 10px; border-radius: 4px; }
.libras-demo-controls button.active { font-weight: bold; }
</style>
