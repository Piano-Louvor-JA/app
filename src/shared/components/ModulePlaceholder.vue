<script setup lang="ts">
import { useI18n } from "vue-i18n";

const props = defineProps<{
	titleKey: string;
}>();

const { t } = useI18n();
</script>

<template>
  <section class="module-placeholder">
    <h1>{{ t(titleKey) }}</h1>
    <p>{{ t('common.comingSoon') }}</p>
  </section>
</template>

<style scoped lang="scss">
.module-placeholder {
  display: flex;
  min-height: 0;
  overflow: auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: var(--ds-spacing-page);
  text-align: center;
  color: var(--ds-color-on-surface-variant);

  h1 {
    margin: 0;
    color: var(--ds-color-on-surface);
    font-size: 24px;
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: 14px;
  }

  @media (max-width: 1280px) {
      h1 {
        font-size: 20px;
      }
    }
}
</style>
