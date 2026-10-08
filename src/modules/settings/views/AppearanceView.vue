<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import AccentColorCard from '../components/AccentColorCard.vue'
import InteractionModeCard from '../components/InteractionModeCard.vue'
import LyricCustomizationCard from '../components/LyricCustomizationCard.vue'
import ThemeOrbitalSwitcher from '../components/ThemeOrbitalSwitcher.vue'
import { useProjectionSettings } from '../composables/useProjectionSettings'

const { t } = useI18n()
const { hydrate } = useProjectionSettings()

/** Oculto por enquanto — reative para voltar a Personalização da Letra.
 * Configurável via VITE_SHOW_LYRIC_CUSTOMIZATION=1 (permite testar os dois
 * lados do v-if e ativar a feature em staging sem redeploy). */
const SHOW_LYRIC_CUSTOMIZATION =
  import.meta.env.VITE_SHOW_LYRIC_CUSTOMIZATION === '1'

onMounted(() => {
  void hydrate()
})
</script>

<template>
  <div class="appearance-experience">
    <header class="appearance-experience__hero">
      <h1 class="appearance-experience__title">
        {{ t('settings.appearance.experienceTitle') }}
      </h1>
      <p class="appearance-experience__subtitle">
        {{ t('settings.appearance.experienceSubtitle') }}
      </p>
    </header>

    <div class="appearance-experience__layout">
      <aside class="appearance-experience__col appearance-experience__col--left">
        <InteractionModeCard />
      </aside>

      <div class="appearance-experience__center">
        <ThemeOrbitalSwitcher />
      </div>

      <aside class="appearance-experience__col appearance-experience__col--right">
        <AccentColorCard />
      </aside>
    </div>

    <section
      v-if="SHOW_LYRIC_CUSTOMIZATION"
      class="appearance-experience__lyrics"
    >
      <LyricCustomizationCard />
    </section>
  </div>
</template>

<style scoped lang="scss">
.appearance-experience {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding-bottom: 1rem;
}

.appearance-experience__hero {
  z-index: 1;
  margin-bottom: 3rem;
  text-align: center;
}

.appearance-experience__title {
  margin: 0 0 0.5rem;
  color: var(--ds-color-on-surface);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 40px;
}

.appearance-experience__subtitle {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  opacity: 0.8;
}

.appearance-experience__layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.5rem;
  width: 100%;
  max-width: 56rem;

  @media (min-width: 1024px) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }
}

.appearance-experience__col {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;

  @media (min-width: 1024px) {
    width: 18rem;
    flex-shrink: 0;
  }
}

.appearance-experience__center {
  display: flex;
  justify-content: center;
  width: 100%;
  order: -1;

  @media (min-width: 1024px) {
    order: 0;
    flex: 1;
    min-width: 0;
  }
}

.appearance-experience__lyrics {
  width: 100%;
  max-width: 64rem;
  margin-top: 3rem;
}

@media (max-width: 1280px) {
  .appearance-experience__hero {
    margin-bottom: 1.25rem;
  }

  .appearance-experience__title {
    font-size: 24px;
    line-height: 30px;
  }

  .appearance-experience__subtitle {
    font-size: 14px;
    line-height: 20px;
  }

  .appearance-experience__layout {
    gap: 1.25rem;

    @media (min-width: 960px) {
      gap: 1rem;
    }
  }

  .appearance-experience__col {
    gap: 1rem;
  }

  .appearance-experience__lyrics {
    margin-top: 1.5rem;
  }
}
</style>

<style lang="scss">
[data-mode='light'] .appearance-experience .ds-glass-card {
  background: color-mix(in srgb, #ffffff 82%, transparent);
  border-color: #e8ecf3;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.03);
}

[data-mode='light'] .appearance-experience .ds-glass-card:hover {
  background: color-mix(in srgb, #ffffff 92%, transparent);
}
</style>
