<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { LITURGY_TITLE_SIZES, type LiturgyCategoryAppearance } from '../services/liturgy-appearance'
import { useLiturgyAppearanceStore } from '../stores/useLiturgyAppearanceStore'
import { LITURGY_TYPE_GROUPS, type LiturgyItemType } from '../types/liturgy'

/**
 * Personalização da lista da liturgia na tela do operador: a linha das
 * categorias e a cor de cada tipo de item. O palco (o que vai para as
 * telas) continua no atalho próprio.
 */

const emit = defineEmits<{
  openStage: []
}>()

const { t } = useI18n()
const store = useLiturgyAppearanceStore()
const category = computed(() => store.appearance.category)
const types = computed(() => LITURGY_TYPE_GROUPS.flatMap((group) => group.types))

type CategoryToggle = 'bold' | 'uppercase' | 'showTime' | 'showSubtitle'
const toggles: { key: CategoryToggle; testId: string; label: string }[] = [
  { key: 'bold', testId: 'appearance-bold', label: 'liturgy.appearance.bold' },
  { key: 'uppercase', testId: 'appearance-uppercase', label: 'liturgy.appearance.uppercase' },
  { key: 'showTime', testId: 'appearance-show-time', label: 'liturgy.appearance.showTime' },
  { key: 'showSubtitle', testId: 'appearance-show-subtitle', label: 'liturgy.appearance.showSubtitle' },
]

function update(patch: Partial<LiturgyCategoryAppearance>) {
  store.updateCategory(patch)
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}

function typeColor(type: LiturgyItemType, fallback: string): string {
  return store.appearance.typeColors[type] || fallback
}
</script>

<template>
  <div class="liturgy-appearance">
    <section class="liturgy-appearance__section">
      <h3 class="liturgy-appearance__title">
        <i
          class="ti ti-category"
          aria-hidden="true"
        />
        {{ t('liturgy.appearance.categorySection') }}
      </h3>

      <div class="liturgy-appearance__row">
        <span class="liturgy-appearance__label">{{ t('liturgy.appearance.background') }}</span>
        <div class="liturgy-appearance__color">
          <input
            type="color"
            data-testid="appearance-background"
            :value="category.background || '#3a2a1e'"
            :aria-label="t('liturgy.appearance.background')"
            @input="update({ background: inputValue($event) })"
          >
          <button
            type="button"
            class="liturgy-appearance__link"
            data-testid="appearance-background-reset"
            :disabled="!category.background"
            @click="update({ background: '' })"
          >
            {{ t('liturgy.appearance.default') }}
          </button>
        </div>
      </div>

      <div class="liturgy-appearance__row">
        <span class="liturgy-appearance__label">{{ t('liturgy.appearance.titleColor') }}</span>
        <div class="liturgy-appearance__color">
          <input
            type="color"
            data-testid="appearance-title-color"
            :value="category.titleColor || '#ffffff'"
            :aria-label="t('liturgy.appearance.titleColor')"
            @input="update({ titleColor: inputValue($event) })"
          >
          <button
            type="button"
            class="liturgy-appearance__link"
            data-testid="appearance-title-color-reset"
            :disabled="!category.titleColor"
            @click="update({ titleColor: '' })"
          >
            {{ t('liturgy.appearance.default') }}
          </button>
        </div>
      </div>

      <div class="liturgy-appearance__row">
        <span class="liturgy-appearance__label">{{ t('liturgy.appearance.align') }}</span>
        <div
          class="liturgy-appearance__segmented"
          role="group"
          :aria-label="t('liturgy.appearance.align')"
        >
          <button
            v-for="align in (['left', 'center'] as const)"
            :key="align"
            type="button"
            :data-testid="`appearance-align-${align}`"
            :aria-pressed="category.titleAlign === align"
            :class="{ 'is-active': category.titleAlign === align }"
            @click="update({ titleAlign: align })"
          >
            <i
              class="ti"
              :class="align === 'left' ? 'ti-align-left' : 'ti-align-center'"
              aria-hidden="true"
            />
            {{ t(`liturgy.appearance.align_${align}`) }}
          </button>
        </div>
      </div>

      <div class="liturgy-appearance__row">
        <span class="liturgy-appearance__label">{{ t('liturgy.appearance.size') }}</span>
        <div
          class="liturgy-appearance__segmented"
          role="group"
          :aria-label="t('liturgy.appearance.size')"
        >
          <button
            v-for="size in LITURGY_TITLE_SIZES"
            :key="size"
            type="button"
            :data-testid="`appearance-size-${size}`"
            :aria-pressed="category.titleSize === size"
            :class="{ 'is-active': category.titleSize === size }"
            @click="update({ titleSize: size })"
          >
            {{ t(`liturgy.appearance.size_${size}`) }}
          </button>
        </div>
      </div>

      <div class="liturgy-appearance__toggles">
        <label
          v-for="toggle in toggles"
          :key="toggle.key"
          class="liturgy-appearance__toggle"
        >
          <input
            type="checkbox"
            :data-testid="toggle.testId"
            :checked="category[toggle.key]"
            @change="update({ [toggle.key]: ($event.target as HTMLInputElement).checked })"
          >
          {{ t(toggle.label) }}
        </label>
      </div>
    </section>

    <section class="liturgy-appearance__section">
      <h3 class="liturgy-appearance__title">
        <i
          class="ti ti-color-swatch"
          aria-hidden="true"
        />
        {{ t('liturgy.appearance.typesSection') }}
      </h3>
      <p class="liturgy-appearance__hint">
        {{ t('liturgy.appearance.typesHint') }}
      </p>
      <ul class="liturgy-appearance__types">
        <li
          v-for="chip in types"
          :key="chip.value"
          class="liturgy-appearance__type"
        >
          <input
            type="color"
            :data-testid="`appearance-type-color-${chip.value}`"
            :value="typeColor(chip.value, chip.dot)"
            :aria-label="t(`liturgy.types.${chip.value}`)"
            @input="store.setTypeColor(chip.value, inputValue($event))"
          >
          <span class="liturgy-appearance__type-name">{{ t(`liturgy.types.${chip.value}`) }}</span>
          <button
            type="button"
            class="liturgy-appearance__link"
            :data-testid="`appearance-type-reset-${chip.value}`"
            :disabled="!store.appearance.typeColors[chip.value]"
            @click="store.setTypeColor(chip.value, '')"
          >
            {{ t('liturgy.appearance.default') }}
          </button>
        </li>
      </ul>
    </section>

    <footer class="liturgy-appearance__footer">
      <button
        type="button"
        class="liturgy-appearance__action"
        data-testid="appearance-open-stage"
        @click="emit('openStage')"
      >
        <i
          class="ti ti-presentation"
          aria-hidden="true"
        />
        {{ t('liturgy.appearance.openStage') }}
      </button>
      <button
        type="button"
        class="liturgy-appearance__action liturgy-appearance__action--ghost"
        data-testid="appearance-reset"
        @click="store.reset()"
      >
        <i
          class="ti ti-restore"
          aria-hidden="true"
        />
        {{ t('liturgy.appearance.reset') }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.liturgy-appearance {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  min-width: min(34rem, 80vw);
  color: var(--ds-color-on-surface);
}

.liturgy-appearance__section {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--ds-color-on-surface) 3%, transparent);
}

.liturgy-appearance__title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.95rem;
  color: var(--ds-color-primary);

  .ti {
    font-size: 1.1rem;
  }
}

.liturgy-appearance__hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.7;
}

.liturgy-appearance__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.liturgy-appearance__label {
  font-size: 0.88rem;
}

.liturgy-appearance__color {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

input[type='color'] {
  width: 2.2rem;
  height: 1.7rem;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 20%, transparent);
  border-radius: 0.4rem;
  background: transparent;
  cursor: pointer;
}

.liturgy-appearance__segmented {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
  border-radius: 999px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.8rem;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 0.82rem;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--ds-color-on-surface) 8%, transparent);
    }

    &.is-active {
      background: color-mix(in srgb, var(--ds-color-primary) 26%, transparent);
      color: var(--ds-color-primary);
      font-weight: 700;
    }
  }
}

.liturgy-appearance__toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 1rem;
}

.liturgy-appearance__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.86rem;
  cursor: pointer;

  input {
    accent-color: var(--ds-color-primary);
    width: 1rem;
    height: 1rem;
  }
}

.liturgy-appearance__types {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.liturgy-appearance__type {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.liturgy-appearance__type-name {
  flex: 1;
  font-size: 0.86rem;
}

.liturgy-appearance__link {
  border: 0;
  background: transparent;
  color: var(--ds-color-primary);
  font-size: 0.78rem;
  cursor: pointer;

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

.liturgy-appearance__footer {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.liturgy-appearance__action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.95rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ds-color-primary) 14%, transparent);
  color: var(--ds-color-primary);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 24%, transparent);
  }

  &--ghost {
    border-color: color-mix(in srgb, var(--ds-color-on-surface) 18%, transparent);
    background: transparent;
    color: inherit;
  }
}
</style>
