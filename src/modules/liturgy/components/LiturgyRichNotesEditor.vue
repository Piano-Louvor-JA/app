<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { NOTES_TEXT_COLORS, sanitizeNotesHtml } from '../services/rich-notes'
import '../styles/rich-notes.css'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  labelledby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [html: string]
}>()

const { t } = useI18n()

type Tool = { command: string; icon: string; key: string }
type Menu = 'size' | 'color' | 'highlight'

const TOGGLES: Tool[] = [
  { command: 'bold', icon: 'ti-bold', key: 'bold' },
  { command: 'italic', icon: 'ti-italic', key: 'italic' },
  { command: 'underline', icon: 'ti-underline', key: 'underline' },
]
const LISTS: Tool[] = [
  { command: 'insertUnorderedList', icon: 'ti-list', key: 'bulletList' },
  { command: 'insertOrderedList', icon: 'ti-list-numbers', key: 'numberedList' },
]
const ALIGNS: Tool[] = [
  { command: 'justifyLeft', icon: 'ti-align-left', key: 'alignLeft' },
  { command: 'justifyCenter', icon: 'ti-align-center', key: 'alignCenter' },
  { command: 'justifyRight', icon: 'ti-align-right', key: 'alignRight' },
]
const STATE_COMMANDS = [...TOGGLES, ...LISTS, ...ALIGNS].map((tool) => tool.command)

// Valores do execCommand('fontSize'): 2 = small, 3 = medium, 5 = x-large, 6 = xx-large
const SIZES = [
  { value: '2', key: 'sizeSmall' },
  { value: '3', key: 'sizeNormal' },
  { value: '5', key: 'sizeLarge' },
  { value: '6', key: 'sizeTitle' },
]
const TEXT_COLORS = NOTES_TEXT_COLORS
// Translúcidos: o texto continua legível no fundo escuro
const HIGHLIGHTS = [
  'rgba(255, 235, 59, 0.35)', 'rgba(255, 109, 0, 0.35)', 'rgba(239, 83, 80, 0.35)',
  'rgba(102, 187, 106, 0.35)', 'rgba(66, 165, 245, 0.35)', 'rgba(171, 71, 188, 0.35)',
]

const rootEl = ref<HTMLDivElement | null>(null)
const editorEl = ref<HTMLDivElement | null>(null)
const isEmpty = ref(true)
const openMenu = ref<Menu | null>(null)
const active = ref<Record<string, boolean>>({})
let lastEmitted: string | null = null

function render(html: string) {
  const clean = sanitizeNotesHtml(html)
  editorEl.value!.innerHTML = clean
  isEmpty.value = !clean
}

function emitContent() {
  const html = sanitizeNotesHtml(editorEl.value!.innerHTML)
  isEmpty.value = !html
  lastEmitted = html
  emit('update:modelValue', html)
}

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command)
  } catch {
    return false
  }
}

function refreshState() {
  const anchor = document.getSelection()?.anchorNode
  if (!anchor || !editorEl.value!.contains(anchor)) return
  active.value = Object.fromEntries(STATE_COMMANDS.map((command) => [command, queryState(command)]))
}

function run(command: string, value?: string) {
  editorEl.value!.focus()
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand(command, false, value)
  openMenu.value = null
  emitContent()
  refreshState()
}

/** Clicar na barra (botões e menus) não tira o foco do texto: a seleção continua valendo para o comando. */
function keepSelection(event: MouseEvent) {
  event.preventDefault()
}

function toggleMenu(menu: Menu) {
  openMenu.value = openMenu.value === menu ? null : menu
}

function onPaste(event: ClipboardEvent) {
  const data = event.clipboardData
  if (!data) return
  event.preventDefault()
  const html = data.getData('text/html')
  if (html) document.execCommand('insertHTML', false, sanitizeNotesHtml(html))
  else document.execCommand('insertText', false, data.getData('text/plain'))
  emitContent()
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!rootEl.value?.contains(event.target as Node)) openMenu.value = null
}

watch(
  () => props.modelValue,
  (value) => {
    if (value !== lastEmitted) render(value)
  },
)

onMounted(() => {
  render(props.modelValue)
  document.addEventListener('selectionchange', refreshState)
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', refreshState)
  document.removeEventListener('mousedown', onDocumentMouseDown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="rich-notes-editor"
  >
    <div
      class="rich-notes-editor__toolbar"
      role="toolbar"
      :aria-label="t('liturgy.richNotes.toolbar')"
      @mousedown="keepSelection"
    >
      <button
        v-for="tool in TOGGLES"
        :key="tool.command"
        type="button"
        class="rich-notes-editor__tool"
        :class="{ 'is-active': active[tool.command] }"
        :data-command="tool.command"
        :title="t(`liturgy.richNotes.${tool.key}`)"
        :aria-label="t(`liturgy.richNotes.${tool.key}`)"
        :aria-pressed="Boolean(active[tool.command])"
        @click="run(tool.command)"
      >
        <i
          :class="['ti', tool.icon]"
          aria-hidden="true"
        />
      </button>

      <span
        class="rich-notes-editor__sep"
        aria-hidden="true"
      />

      <div class="rich-notes-editor__menu">
        <button
          type="button"
          class="rich-notes-editor__tool rich-notes-editor__tool--menu"
          data-menu="size"
          :title="t('liturgy.richNotes.size')"
          :aria-label="t('liturgy.richNotes.size')"
          :aria-expanded="openMenu === 'size'"
          aria-haspopup="menu"
          @click="toggleMenu('size')"
        >
          <i
            class="ti ti-text-size"
            aria-hidden="true"
          />
          <i
            class="ti ti-chevron-down rich-notes-editor__caret"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="openMenu === 'size'"
          class="rich-notes-editor__popover rich-notes-editor__popover--list"
          role="menu"
        >
          <button
            v-for="size in SIZES"
            :key="size.value"
            type="button"
            role="menuitem"
            class="rich-notes-editor__size"
            :class="`rich-notes-editor__size--${size.value}`"
            :data-size="size.value"
            @click="run('fontSize', size.value)"
          >
            {{ t(`liturgy.richNotes.${size.key}`) }}
          </button>
        </div>
      </div>

      <div class="rich-notes-editor__menu">
        <button
          type="button"
          class="rich-notes-editor__tool rich-notes-editor__tool--menu"
          data-menu="color"
          :title="t('liturgy.richNotes.color')"
          :aria-label="t('liturgy.richNotes.color')"
          :aria-expanded="openMenu === 'color'"
          aria-haspopup="menu"
          @click="toggleMenu('color')"
        >
          <i
            class="ti ti-palette"
            aria-hidden="true"
          />
          <i
            class="ti ti-chevron-down rich-notes-editor__caret"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="openMenu === 'color'"
          class="rich-notes-editor__popover rich-notes-editor__popover--swatches"
          role="menu"
        >
          <button
            v-for="color in TEXT_COLORS"
            :key="color"
            type="button"
            role="menuitem"
            class="rich-notes-editor__swatch"
            :style="{ background: color }"
            :data-color="color"
            :aria-label="`${t('liturgy.richNotes.color')} ${color}`"
            @click="run('foreColor', color)"
          />
        </div>
      </div>

      <div class="rich-notes-editor__menu">
        <button
          type="button"
          class="rich-notes-editor__tool rich-notes-editor__tool--menu"
          data-menu="highlight"
          :title="t('liturgy.richNotes.highlight')"
          :aria-label="t('liturgy.richNotes.highlight')"
          :aria-expanded="openMenu === 'highlight'"
          aria-haspopup="menu"
          @click="toggleMenu('highlight')"
        >
          <i
            class="ti ti-highlight"
            aria-hidden="true"
          />
          <i
            class="ti ti-chevron-down rich-notes-editor__caret"
            aria-hidden="true"
          />
        </button>
        <div
          v-if="openMenu === 'highlight'"
          class="rich-notes-editor__popover rich-notes-editor__popover--swatches"
          role="menu"
        >
          <button
            v-for="color in HIGHLIGHTS"
            :key="color"
            type="button"
            role="menuitem"
            class="rich-notes-editor__swatch"
            :style="{ background: color }"
            :data-color="color"
            :aria-label="`${t('liturgy.richNotes.highlight')} ${color}`"
            @click="run('hiliteColor', color)"
          />
          <button
            type="button"
            role="menuitem"
            class="rich-notes-editor__swatch rich-notes-editor__swatch--none"
            data-color="transparent"
            :title="t('liturgy.richNotes.noHighlight')"
            :aria-label="t('liturgy.richNotes.noHighlight')"
            @click="run('hiliteColor', 'transparent')"
          >
            <i
              class="ti ti-ban"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <span
        class="rich-notes-editor__sep"
        aria-hidden="true"
      />

      <button
        v-for="tool in [...LISTS, ...ALIGNS]"
        :key="tool.command"
        type="button"
        class="rich-notes-editor__tool"
        :class="{ 'is-active': active[tool.command] }"
        :data-command="tool.command"
        :title="t(`liturgy.richNotes.${tool.key}`)"
        :aria-label="t(`liturgy.richNotes.${tool.key}`)"
        :aria-pressed="Boolean(active[tool.command])"
        @click="run(tool.command)"
      >
        <i
          :class="['ti', tool.icon]"
          aria-hidden="true"
        />
      </button>

      <span
        class="rich-notes-editor__sep"
        aria-hidden="true"
      />

      <button
        type="button"
        class="rich-notes-editor__tool"
        data-command="removeFormat"
        :title="t('liturgy.richNotes.clear')"
        :aria-label="t('liturgy.richNotes.clear')"
        @click="run('removeFormat')"
      >
        <i
          class="ti ti-clear-formatting"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      ref="editorEl"
      class="rich-notes rich-notes-editor__content"
      :class="{ 'is-empty': isEmpty }"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-labelledby="labelledby"
      :data-placeholder="placeholder"
      @input="emitContent"
      @paste="onPaste"
      @focus="openMenu = null"
    />
  </div>
</template>

<style scoped lang="scss">
.rich-notes-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, #fff 10%, transparent);
  border-radius: 0.65rem 0 0.65rem 0;
  background: var(--ds-color-surface-container-low, #1c1b1b);

  &:focus-within {
    outline: 2px solid color-mix(in srgb, var(--ds-color-primary) 30%, transparent);
  }
}

.rich-notes-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, #fff 8%, transparent);
}

.rich-notes-editor__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  min-width: 1.85rem;
  height: 1.85rem;
  padding: 0 0.3rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font-size: 1rem;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, #fff 8%, transparent);
  }

  &.is-active {
    background: color-mix(in srgb, var(--ds-color-primary) 22%, transparent);
    color: var(--ds-color-primary);
  }
}

.rich-notes-editor__caret {
  font-size: 0.7rem;
  opacity: 0.7;
}

.rich-notes-editor__sep {
  width: 1px;
  height: 1.2rem;
  margin: 0 0.25rem;
  background: color-mix(in srgb, #fff 12%, transparent);
}

.rich-notes-editor__menu {
  position: relative;
}

.rich-notes-editor__popover {
  position: absolute;
  top: calc(100% + 0.3rem);
  left: 0;
  z-index: 5;
  padding: 0.4rem;
  border: 1px solid color-mix(in srgb, #fff 12%, transparent);
  border-radius: 0.55rem;
  background: var(--ds-color-surface-container-high, #2a2a2a);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);

  &--list {
    display: flex;
    flex-direction: column;
    min-width: 8rem;
  }

  &--swatches {
    display: grid;
    grid-template-columns: repeat(6, 1.5rem);
    gap: 0.3rem;
  }
}

.rich-notes-editor__size {
  padding: 0.3rem 0.5rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--ds-color-on-surface);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, #fff 8%, transparent);
  }

  &--2 { font-size: 0.75rem; }
  &--3 { font-size: 0.875rem; }
  &--5 { font-size: 1.1rem; }
  &--6 { font-size: 1.3rem; font-weight: 700; }
}

.rich-notes-editor__swatch {
  width: 1.5rem;
  height: 1.5rem;
  border: 1px solid color-mix(in srgb, #fff 25%, transparent);
  border-radius: 50%;
  cursor: pointer;

  &:hover {
    transform: scale(1.12);
  }

  &--none {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  }
}

.rich-notes-editor__content {
  position: relative;
  min-height: 5.5rem;
  max-height: 16rem;
  overflow-y: auto;
  padding: 0.7rem 0.85rem;
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font-size: 0.8125rem;
  line-height: 1.4;
  outline: none;

  &.is-empty::before {
    position: absolute;
    top: 0.7rem;
    left: 0.85rem;
    content: attr(data-placeholder);
    color: color-mix(in srgb, var(--ds-color-on-surface-variant) 30%, transparent);
    pointer-events: none;
  }
}
</style>
