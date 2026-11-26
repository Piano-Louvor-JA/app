<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsToggle from '@modules/settings/components/SettingsToggle.vue'

import { useAlbumsStore } from '../stores/useAlbumsStore'

/**
 * Álbuns ativos (paridade com "Ignorar álbuns" do Classic): desligar um álbum
 * deixa as músicas dele desativadas na busca e o seletor pula. O mesmo liga/
 * desliga existe no card do álbum na Central de Mídia.
 */
const { t } = useI18n()
const store = useAlbumsStore()
const filter = ref('')

onMounted(() => {
  void store.hydrateCatalog()
})

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Álbuns oficiais (coletâneas custom ficam de fora: não têm busca por álbum). */
const groups = computed(() => {
  const query = fold(filter.value.trim())
  return store.categories
    .map((category) => ({
      id: String(category.id),
      name: category.name,
      albums: category.collections
        .filter((collection) => !collection.isCustom)
        .filter((collection) => !query || fold(collection.name).includes(query))
        .map((collection) => ({ key: String(collection.id), name: collection.name, subtitle: collection.subtitle })),
    }))
    .filter((group) => group.albums.length > 0)
})

const disabledCount = computed(() => store.disabledAlbums.size)
</script>

<template>
  <section class="disabled-albums-card" data-test="disabled-albums-card">
    <h3>{{ t('albums.disabledAlbums.title') }}</h3>
    <p class="hint">{{ t('albums.disabledAlbums.description') }}</p>

    <div class="disabled-albums-card__toolbar">
      <input
        v-model="filter"
        type="search"
        class="disabled-albums-card__filter"
        :placeholder="t('albums.disabledAlbums.filter')"
        :aria-label="t('albums.disabledAlbums.filter')"
      >
      <span class="disabled-albums-card__count">
        {{ t('albums.disabledAlbums.count', { count: disabledCount }) }}
      </span>
    </div>

    <div class="disabled-albums-card__list">
      <section v-for="group in groups" :key="group.id" class="disabled-albums-card__group">
        <h4>{{ group.name }}</h4>
        <div
          v-for="album in group.albums"
          :key="album.key"
          class="disabled-albums-card__row"
          :class="{ 'disabled-albums-card__row--off': store.isAlbumDisabled(album.key) }"
          data-test="disabled-album-row"
          :data-key="album.key"
        >
          <span class="disabled-albums-card__name">
            {{ album.name }}
            <small v-if="album.subtitle">{{ album.subtitle }}</small>
          </span>
          <SettingsToggle
            :model-value="!store.isAlbumDisabled(album.key)"
            :label="album.name"
            @update:model-value="store.setAlbumDisabled(album.key, !$event)"
          />
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped lang="scss">
.disabled-albums-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

h3 {
  margin: 0;
  font-size: 1rem;
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.disabled-albums-card__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.disabled-albums-card__filter {
  flex: 1 1 14rem;
  min-width: 0;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--ds-color-outline-strong);
  border-radius: var(--ds-radius-md, 10px);
  background: transparent;
  color: inherit;
}

.disabled-albums-card__count {
  font-size: 0.8rem;
  opacity: 0.75;
}

.disabled-albums-card__list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 22rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.disabled-albums-card__group h4 {
  margin: 0 0 0.35rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.disabled-albums-card__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
}

.disabled-albums-card__row--off .disabled-albums-card__name {
  opacity: 0.5;
  text-decoration: line-through;
}

.disabled-albums-card__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 0.9rem;
}

.disabled-albums-card__name small {
  font-size: 0.75rem;
  opacity: 0.65;
}
</style>
