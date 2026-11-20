<script setup lang="ts">
import PptEngineCard from '../components/PptEngineCard.vue'
import ExternalPlayerCard from '../components/ExternalPlayerCard.vue'
import YoutubeAccountCard from '../components/YoutubeAccountCard.vue'
import YoutubeOfflineCard from '../components/YoutubeOfflineCard.vue'
</script>

<template>
  <div class="media-view">
    <!-- Cada tipo de configuração num bloco igual aos da aba Geral (faixa na cor de realce). Card que não aparece não deixa bloco vazio. -->
    <div class="media-view__block media-view__block--youtube">
      <YoutubeAccountCard />
    </div>
    <div class="media-view__block media-view__block--offline">
      <YoutubeOfflineCard />
    </div>
    <div class="media-view__block media-view__block--pptx">
      <PptEngineCard />
    </div>
    <div class="media-view__block media-view__block--player">
      <ExternalPlayerCard />
    </div>
  </div>
</template>

<style scoped>
.media-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.media-view__block {
  position: relative;
  overflow: hidden;
  padding: 20px 20px 20px 24px;
  border-radius: var(--ds-radius-lg);
  border: 1px solid var(--ds-color-outline-strong);
  background: color-mix(in srgb, var(--ds-color-surface-elevated) var(--ds-glass-fill, 80%), transparent);
  color: var(--ds-color-on-surface);
  backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--ds-blur-active, 16px)) saturate(140%);
  transition: border-color var(--ds-motion-duration, 280ms) ease;
}

.media-view__block:hover {
  border-color: color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
}

/* Faixa na cor de realce, como nos cards da aba Geral. */
.media-view__block::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--ds-color-primary);
  opacity: 0.8;
}

@media (max-width: 1280px) {
  .media-view__block {
    padding: 0.75rem 0.75rem 0.75rem 1rem;
  }
}

/* Só comentário do v-if dentro (card escondido): sem painel vazio. */
.media-view__block:empty {
  display: none;
}
</style>
