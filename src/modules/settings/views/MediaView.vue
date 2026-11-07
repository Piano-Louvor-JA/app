<script setup lang="ts">
import PptEngineCard from '../components/PptEngineCard.vue'
import ExternalPlayerCard from '../components/ExternalPlayerCard.vue'
import YoutubeAccountCard from '../components/YoutubeAccountCard.vue'
import YoutubeOfflineCard from '../components/YoutubeOfflineCard.vue'
</script>

<template>
  <div class="media-view">
    <YoutubeAccountCard />
    <YoutubeOfflineCard />
    <PptEngineCard />
    <ExternalPlayerCard />
  </div>
</template>

<style scoped>
.media-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
