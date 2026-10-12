<script setup lang="ts">
import BibleProjectionView from "@modules/bible/views/BibleProjectionView.vue";
import ClockProjectionView from "@modules/clock/views/ClockProjectionView.vue";
import CountdownProjectionView from "@modules/countdown/views/CountdownProjectionView.vue";
import LiturgyWebProjectionView from "@modules/liturgy/views/LiturgyWebProjectionView.vue";
import MediaProjectionView from "@modules/media/views/MediaProjectionView.vue";
import MediaReturnProjectionView from "@modules/media/views/MediaReturnProjectionView.vue";
import RandomProjectionView from "@modules/random/views/RandomProjectionView.vue";
import TimerProjectionView from "@modules/timer/views/TimerProjectionView.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const moduleId = computed(() => {
	const value = route.query.module;
	return typeof value === "string" ? value : "";
});

const layout = computed(() => {
	const value = route.query.layout;
	return typeof value === "string" ? value : "";
});
</script>

<template>
  <ClockProjectionView v-if="moduleId === 'clock'" />
  <TimerProjectionView v-else-if="moduleId === 'timer'" />
  <CountdownProjectionView v-else-if="moduleId === 'countdown'" />
  <RandomProjectionView v-else-if="moduleId === 'random'" />
  <BibleProjectionView v-else-if="moduleId === 'bible'" />
  <MediaReturnProjectionView v-else-if="moduleId === 'media' && layout === 'return'" />
  <MediaProjectionView v-else-if="moduleId === 'media'" />
  <LiturgyWebProjectionView v-else-if="moduleId === 'liturgy-web'" />
  <div
    v-else
    class="projection-host-empty"
  />
</template>

<style scoped lang="scss">
.projection-host-empty {
  width: 100vw;
  height: 100vh;
  background: #000;
}
</style>
