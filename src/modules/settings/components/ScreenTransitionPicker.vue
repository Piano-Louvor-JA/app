<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import '@styles/screen-transitions.css'

import { STAGE_TRANSITION_OPTIONS, type StageTransition } from '../types/stage-settings'

const props = defineProps<{
  modelValue: StageTransition
  /** Duração de cada fase (ms), a mesma da projeção. */
  durationMs: number
  /** Nome acessível do grupo (ex.: "Transição ao trocar versículo"). */
  label: string
  testId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: StageTransition]
}>()

const { t } = useI18n()

/** Painel lista só transições animadas; desligar é o interruptor acima. */
const options = STAGE_TRANSITION_OPTIONS.filter(
  (value): value is Exclude<StageTransition, 'none'> => value !== 'none',
)

function labelKey(value: StageTransition): string {
  return value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

const samples = ['Jo 3:16', 'Sl 23:1']
const tick = ref(0)
const hovered = ref<StageTransition | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const previewStyle = computed(() => ({
  '--scr-transition-ms': `${props.durationMs}ms`,
}))

/** Só a escolhida e a que está sob o mouse ficam animando. */
function isPlaying(value: StageTransition) {
  return value === props.modelValue || value === hovered.value
}

onMounted(() => {
  timer = setInterval(() => {
    tick.value += 1
  }, Math.max(1200, props.durationMs * 2 + 800))
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="transition-picker"
    role="radiogroup"
    :data-testid="testId"
    :aria-label="label"
  >
    <button
      v-for="value in options"
      :key="value"
      type="button"
      role="radio"
      class="transition-picker__card"
      :class="{ 'transition-picker__card--active': modelValue === value }"
      :aria-checked="modelValue === value"
      @mouseenter="hovered = value"
      @mouseleave="hovered = null"
      @focus="hovered = value"
      @blur="hovered = null"
      @click="emit('update:modelValue', value)"
    >
      <span
        class="transition-picker__preview"
        :style="previewStyle"
        aria-hidden="true"
      >
        <Transition
          :name="`scr-${value}`"
          mode="out-in"
        >
          <span
            :key="isPlaying(value) ? tick : 0"
            class="transition-picker__sample"
          >
            {{ samples[(isPlaying(value) ? tick : 0) % samples.length] }}
          </span>
        </Transition>
      </span>
      <span class="transition-picker__name">
        {{ t(`settings.stage.transitionNames.${labelKey(value)}`) }}
      </span>
      <i
        v-if="modelValue === value"
        class="ti ti-check transition-picker__check"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped lang="scss">
.transition-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.transition-picker__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.45rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 12%, transparent);
  border-radius: 0.6rem 0 0.6rem 0;
  background: color-mix(in srgb, var(--ds-color-on-surface) 4%, transparent);
  color: var(--ds-color-on-surface);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--ds-color-primary);
    outline-offset: 2px;
  }

  &--active {
    border-color: var(--ds-color-primary);
    background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
  }
}

.transition-picker__preview {
  position: relative;
  display: grid;
  place-items: center;
  height: 3.6rem;
  overflow: hidden;
  border-radius: 0.4rem 0 0.4rem 0;
  background: linear-gradient(135deg, #0b0b0f 0%, #1c1c24 100%);
}

.transition-picker__sample {
  display: block;
  padding: 0.2rem 0.5rem;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
}

.transition-picker__name {
  font-size: 0.75rem;
  font-weight: 600;
}

.transition-picker__check {
  position: absolute;
  top: 0.3rem;
  right: 0.35rem;
  display: grid;
  place-items: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #1a1a1a);
  font-size: 0.7rem;
}
</style>
