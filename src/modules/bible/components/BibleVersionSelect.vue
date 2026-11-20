<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useBlurSystem } from '@design-system/composables'

import type { BibleVersion } from '../types/bible'

const props = defineProps<{
  versions: BibleVersion[]
  selectedVersionId: number | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [versionId: number]
}>()

const { t } = useI18n()
const { backdropFilter } = useBlurSystem()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)

const menuPosition = ref({ top: 0, left: 0, minWidth: 0 })

const selectedVersion = computed(
  () => props.versions.find((item) => item.id === props.selectedVersionId) ?? null,
)

const selectedLabel = computed(() => {
  if (!selectedVersion.value) return t('bible.selectVersion')
  return formatVersionLabel(selectedVersion.value)
})

const menuStyle = computed(() => ({
  top: `${menuPosition.value.top}px`,
  left: `${menuPosition.value.left}px`,
  minWidth: `${menuPosition.value.minWidth}px`,
  backdropFilter: backdropFilter.value,
  WebkitBackdropFilter: backdropFilter.value,
}))

function formatVersionLabel(version: BibleVersion): string {
  const abbr = version.abbreviation?.trim()
  return abbr ? `${version.name} (${abbr})` : version.name
}

function updateMenuPosition() {
  // chamada só ocorre com o menu aberto (trigger montado)
  const trigger = triggerEl.value!
  const rect = trigger.getBoundingClientRect()
  const minWidth = Math.max(rect.width, 272)
  const maxLeft = window.innerWidth - minWidth - 12
  const left = Math.min(Math.max(12, rect.left), Math.max(12, maxLeft))
  const top = rect.bottom + 8

  menuPosition.value = {
    top,
    left,
    minWidth,
  }
}

async function toggle() {
  // O :disabled do trigger (disabled || sem versões) já bloqueia o clique;
  // aqui só alternamos o estado do menu.
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updateMenuPosition()
  }
}

function choose(versionId: number) {
  open.value = false
  if (versionId === props.selectedVersionId) return
  emit('select', versionId)
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node
  const inTrigger = Boolean(rootEl.value?.contains(target))
  const inMenu = Boolean(menuEl.value?.contains(target))
  if (!inTrigger && !inMenu) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

function onViewportChange() {
  if (open.value) updateMenuPosition()
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateMenuPosition()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div
    ref="rootEl"
    class="bible-version-select"
  >
    <span class="bible-version-select__label">{{ t('bible.version') }}</span>

    <button
      ref="triggerEl"
      type="button"
      class="bible-version-select__trigger"
      :class="{ 'bible-version-select__trigger--open': open }"
      :disabled="disabled || versions.length === 0"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="t('bible.version')"
      @click="toggle"
    >
      <span class="bible-version-select__value">{{ selectedLabel }}</span>
      <i
        class="ti ti-chevron-down bible-version-select__chevron"
        aria-hidden="true"
      />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuEl"
        class="bible-version-select__menu"
        role="listbox"
        :aria-label="t('bible.versionList')"
        :style="menuStyle"
      >
        <button
          v-for="version in versions"
          :key="version.id"
          type="button"
          role="option"
          class="bible-version-select__option"
          :class="{
            'bible-version-select__option--active': version.id === selectedVersionId,
          }"
          :aria-selected="version.id === selectedVersionId"
          @click="choose(version.id)"
        >
          <span
            v-if="version.abbreviation"
            class="bible-version-select__option-abbr"
          >
            {{ version.abbreviation }}
          </span>
          <span class="bible-version-select__option-name">
            {{ version.name }}
          </span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.bible-version-select {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.bible-version-select__label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-color-on-surface-variant);
  opacity: 0.75;
}

.bible-version-select__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: min(100%, 22rem);
  border: 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.3;
  cursor: pointer;
  padding: 0;
  text-align: left;

  &:hover:not(:disabled) {
    color: var(--ds-color-primary-soft);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &--open .bible-version-select__chevron {
    transform: rotate(180deg);
  }
}

.bible-version-select__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bible-version-select__chevron {
  flex-shrink: 0;
  font-size: 1.15rem;
  line-height: 1;
  color: var(--ds-color-on-surface-variant);
  transition: transform 160ms ease;
}
</style>

<!-- Menu teleported to body: unscoped so styles apply outside the component root -->
<style lang="scss">
.bible-version-select__menu {
  position: fixed;
  z-index: 2000;
  max-width: min(24rem, calc(100vw - 24px));
  max-height: min(18rem, calc(100vh - 24px));
  overflow-y: auto;
  padding: 0.4rem;
  border-radius: var(--ds-radius-lg, 1rem 0 1rem 0);
  background: color-mix(in srgb, var(--ds-color-surface-elevated) 92%, transparent);
  border: 1px solid var(--ds-color-outline-strong);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
  color: var(--ds-color-on-surface);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--ds-color-outline);
    border-radius: 999px;
  }
}

[data-mode='light'] .bible-version-select__menu {
  background: color-mix(in srgb, var(--ds-color-surface-elevated) 96%, transparent);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.12);
}

.bible-version-select__option {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  width: 100%;
  border: 0;
  border-radius: var(--ds-radius-md, 0.5rem 0 0.5rem 0);
  background: transparent;
  color: var(--ds-color-on-surface);
  padding: 0.65rem 0.75rem;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-primary) 12%, transparent);
  }

  &--active {
    background: color-mix(in srgb, var(--ds-color-primary) 18%, transparent);
    color: var(--ds-color-primary-soft);
  }
}

.bible-version-select__option-abbr {
  flex-shrink: 0;
  min-width: 2.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.85;
}

.bible-version-select__option-name {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.35;
}
</style>
