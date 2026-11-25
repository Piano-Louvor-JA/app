<script setup lang="ts">
import { GlassCard } from "@design-system/index";
import { openMusicPlayer } from "@modules/media/services/open-music-player";
import PageBackStack from "@shared/components/PageBackStack.vue";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import {
	getCommunityCollectionDetail,
	type CommunityCollectionDetail,
} from "../services/community-catalog";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const detail = ref<CommunityCollectionDetail | null>(null);
const isLoading = ref(true);
const failed = ref(false);
const playingId = ref<number | null>(null);

const collectionId = computed(() => Number(route.params.collectionId));

async function load(): Promise<void> {
	isLoading.value = true;
	failed.value = false;
	detail.value = await getCommunityCollectionDetail(collectionId.value);
	failed.value = detail.value === null;
	isLoading.value = false;
}

async function play(music: CommunityCollectionDetail["musics"][number]): Promise<void> {
	if (!music.hasAudio || playingId.value !== null) return;
	playingId.value = music.id;
	try {
		await openMusicPlayer({
			musicId: music.officialMusicId ?? music.id,
			mode: "audio",
			project: false,
		});
	} finally {
		playingId.value = null;
	}
}

watch(collectionId, load);
onMounted(load);
</script>

<template>
  <section class="community-collection-view">
    <header class="community-collection-view__header">
      <PageBackStack>
        <button
          type="button"
          class="community-collection-view__back"
          :aria-label="t('community.back')"
          @click="router.back()"
        >
          <i class="ti ti-arrow-left" aria-hidden="true" />
        </button>
      </PageBackStack>
      <div>
        <h1>{{ detail?.name ?? t('community.collectionTitle') }}</h1>
        <p v-if="detail?.authorName">{{ t('community.byAuthor', { author: detail.authorName }) }}</p>
      </div>
    </header>

    <p v-if="isLoading" role="status" aria-live="polite">{{ t('community.loading') }}</p>

    <div v-else-if="failed" class="community-collection-view__error" role="alert">
      <p>{{ t('community.collectionLoadError') }}</p>
      <button type="button" @click="load">{{ t('community.retry') }}</button>
    </div>

    <template v-else-if="detail">
      <p v-if="detail.description" class="community-collection-view__description">{{ detail.description }}</p>
      <p class="community-collection-view__count">
        {{ t('community.trackCount', { count: detail.musics.length }) }}
      </p>
      <GlassCard class="community-collection-view__tracks" elevated>
        <ol>
          <li v-for="music in detail.musics" :key="music.id">
            <span>{{ music.name }}</span>
            <button
              v-if="music.hasAudio"
              type="button"
              :disabled="playingId !== null"
              :aria-label="t('community.playTrack', { name: music.name })"
              @click="play(music)"
            >
              <i class="ti" :class="playingId === music.id ? 'ti-loader-2 ti-spin' : 'ti-player-play'" aria-hidden="true" />
              {{ t('community.play') }}
            </button>
            <span v-else class="community-collection-view__unavailable">
              {{ t('community.trackUnavailable') }}
            </span>
          </li>
        </ol>
      </GlassCard>
    </template>
  </section>
</template>

<style scoped>
.community-collection-view { padding: 1.5rem; max-width: 900px; margin: 0 auto; }
.community-collection-view__header { display: flex; align-items: center; gap: 1rem; }
.community-collection-view__back, .community-collection-view button { cursor: pointer; }
.community-collection-view__tracks ol { display: grid; gap: .5rem; list-style: decimal inside; padding: 1rem; }
.community-collection-view__tracks li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.community-collection-view__unavailable { color: var(--ds-color-on-surface-variant); font-size: .9rem; }
.community-collection-view__error { display: grid; gap: .75rem; }
</style>
