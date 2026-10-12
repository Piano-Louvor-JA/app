<script setup lang="ts">
withDefaults(
	defineProps<{
		intensity?: "subtle" | "medium" | "strong";
	}>(),
	{
		intensity: "subtle",
	},
);
</script>

<template>
  <div class="ds-gradient-bg" :data-intensity="intensity">
    <!-- Camadas suaves (evita o “anel” de um blur único) -->
    <div class="ds-gradient-bg__glow" aria-hidden="true" />
    <!-- Dither/noise: quebra o banding em monitores 8-bit -->
    <div class="ds-gradient-bg__dither" aria-hidden="true" />
    <div class="ds-gradient-bg__content">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ds-gradient-bg {
  --ds-glow-a: 10%;
  --ds-glow-b: 5%;
  --ds-glow-c: 2%;
  --ds-lift: 3.2%;

  position: relative;
  isolation: isolate;
  height: 100%;
  min-height: 0;
  width: 100%;
  background-color: var(--ds-color-background);
  color: var(--ds-color-on-surface);
  overflow: hidden;
}

.ds-gradient-bg[data-intensity='medium'] {
  --ds-glow-a: 14%;
  --ds-glow-b: 7%;
  --ds-glow-c: 3%;
  --ds-lift: 4%;
}

.ds-gradient-bg[data-intensity='strong'] {
  --ds-glow-a: 20%;
  --ds-glow-b: 10%;
  --ds-glow-c: 4%;
  --ds-lift: 5%;
}

.ds-gradient-bg__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  /* Círculo suave (como o blur anterior) + stops para reduzir banding */
  background:
    radial-gradient(
      circle at 50% 45%,
      color-mix(in srgb, var(--ds-color-primary) var(--ds-glow-a), transparent) 0%,
      color-mix(in srgb, var(--ds-color-primary) var(--ds-glow-b), transparent) 28%,
      color-mix(in srgb, var(--ds-color-primary) var(--ds-glow-c), transparent) 48%,
      transparent 68%
    ),
    radial-gradient(
      circle at 50% 48%,
      color-mix(in srgb, #ffffff var(--ds-lift), var(--ds-color-background)) 0%,
      var(--ds-color-background) 62%
    );
}

.ds-gradient-bg__dither {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.055;
  mix-blend-mode: soft-light;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 160px 160px;
}

.ds-gradient-bg__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
