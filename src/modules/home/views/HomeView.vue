<script setup lang="ts">
import logoUrl from "@assets/brand/logo-louvor-ja.svg";
import { useI18n } from "vue-i18n";

import HomeLocationField from "../components/HomeLocationField.vue";
import { useHomeClock } from "../composables/useHomeClock";
import { useHomeLocation } from "../composables/useHomeLocation";

const { t } = useI18n();
const { profile, setDistrict, setChurch } = useHomeLocation();
const { formattedTime } = useHomeClock();
</script>

<template>
  <section class="home-view">
    <div class="home-view__content">
      <div class="home-view__logo-wrap">
        <img
          class="home-view__logo"
          :src="logoUrl"
          :alt="t('app.name')"
          width="128"
          height="128"
        >
      </div>

      <div class="home-view__titles">
        <HomeLocationField
          :value="profile.district"
          :label="t('home.districtLabel')"
          :placeholder="t('home.districtPlaceholder')"
          size="lg"
          @save="setDistrict"
        />
        <HomeLocationField
          :value="profile.church"
          :label="t('home.churchLabel')"
          :placeholder="t('home.churchPlaceholder')"
          size="md"
          @save="setChurch"
        />
        <div
          class="home-view__clock"
          aria-live="polite"
        >
          {{ formattedTime }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.home-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 0;
  overflow: hidden;
  padding: var(--ds-spacing-page);
}

.home-view__content {
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 42rem;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.home-view__logo-wrap {
  margin-bottom: 2.5rem;
  transition: transform 500ms ease;

  &:hover {
    transform: scale(1.05);
  }
}

.home-view__logo {
  width: 8rem;
  height: 8rem;
  object-fit: contain;
  display: block;
}

.home-view__titles {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
}

.home-view__clock {
  margin-top: 1rem;
  font-size: 32px;
  font-weight: 700;
  line-height: 40px;
  letter-spacing: -0.02em;
  color: var(--ds-color-primary);
  text-shadow: 0 0 8px color-mix(in srgb, var(--ds-color-primary) 50%, transparent);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1280px) {
  .home-view {
    padding: 1.25rem;
  }

  .home-view__logo {
    width: 5.5rem;
    height: 5.5rem;
  }

  .home-view__logo-wrap {
    margin-bottom: 1.25rem;
  }

  .home-view__clock {
    font-size: 24px;
    line-height: 30px;
  }
}
</style>
