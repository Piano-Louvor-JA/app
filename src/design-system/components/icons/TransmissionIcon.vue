<script setup lang="ts">
import ObsBrandIcon from './ObsBrandIcon.vue'
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <span class="transmission-icon" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <!-- Janela do navegador na tela de palco. -->
      <rect x="2" y="3" width="30" height="25" rx="3" />
      <path d="M2 10h30M7 7h.1M11 7h.1M15 7h.1M14 28v5M9 33h12" />
      <path d="m13 15 7 4-7 4z" />
    </svg>
    <span class="transmission-icon__obs"><ObsBrandIcon :size="size * 0.52" /></span>
  </span>
</template>

<style scoped>
.transmission-icon { position: relative; display: inline-block; flex-shrink: 0; }
.transmission-icon > svg { display: block; width: 100%; height: 100%; }
.transmission-icon__obs { position: absolute; right: 0; bottom: 0; display: flex; padding: 1px; border-radius: 50%; background: #d5d9df; color: #111; }
</style>
