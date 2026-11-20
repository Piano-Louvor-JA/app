<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { GlassCard } from '@design-system/index'
import LiturgyRichNotesEditor from '@modules/liturgy/components/LiturgyRichNotesEditor.vue'
import LiturgyTitleColorPicker from '@modules/liturgy/components/LiturgyTitleColorPicker.vue'
import { resolveMediaUrl } from '@shared/services/workspace-api'

import { useAnnouncementDraft } from '../composables/useAnnouncementDraft'
import { useUrlTitleAutofill } from '../composables/useUrlTitleAutofill'
import type { Announcement } from '../types/announcements'

/** Montado com `v-if` pelo pai: cada abertura é um rascunho novo. */
const props = defineProps<{
  item: Announcement
  isNew: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [item: Announcement]
  notice: [key: string, params?: Record<string, unknown>]
}>()

const { t } = useI18n()
const { draft, busy, isValid, pickFiles, removeImage, moveImage, setText, commit, discard } =
  useAnnouncementDraft(props.item, props.isNew)

const { loading: titleLoading } = useUrlTitleAutofill(draft)

const showErrors = ref(false)
const errorMessage = computed(() => {
  if (draft.value.kind === 'text') return t('announcements.dialog.emptyText')
  if (draft.value.kind === 'url') return t('announcements.dialog.invalidUrl')
  return t('announcements.dialog.emptyFiles')
})
const kindLabel = computed(() => t(`announcements.kinds.${draft.value.kind}`))
const heading = computed(() =>
  props.isNew
    ? t('announcements.dialog.newTitle', { kind: kindLabel.value })
    : t('announcements.dialog.editTitle', { kind: kindLabel.value }),
)

async function onPick() {
  const result = await pickFiles()
  if (!result.ok) {
    if (result.reason !== 'cancelled') emit('notice', 'announcements.notices.pickFailed')
    return
  }
  if (result.rejected.length > 0) {
    emit('notice', 'announcements.notices.rejected', {
      count: result.rejected.length,
      names: result.rejected.map((r) => r.name).join(', '),
    })
  }
}

async function onSave() {
  if (busy.value) return
  if (!isValid.value) {
    showErrors.value = true
    return
  }
  emit('save', await commit())
}

async function onCancel() {
  if (busy.value) return
  await discard()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="announcement-editor"
      role="dialog"
      aria-modal="true"
      :aria-label="heading"
      @keydown.esc="onCancel"
    >
      <GlassCard
        class="announcement-editor__panel"
        elevated
      >
        <form
          class="announcement-editor__form"
          @submit.prevent="onSave"
        >
          <h2 class="announcement-editor__heading">
            {{ heading }}
          </h2>

          <div class="announcement-editor__field">
            <label
              class="announcement-editor__label"
              for="announcement-title"
            >
              {{ t('announcements.dialog.title') }}
            </label>
            <div class="announcement-editor__title-row">
              <LiturgyTitleColorPicker
                v-if="draft.kind === 'text'"
                :model-value="draft.titleColor"
                @update:model-value="draft.kind === 'text' && (draft.titleColor = $event)"
              />
              <input
                id="announcement-title"
                v-model="draft.title"
                class="announcement-editor__input"
                type="text"
                maxlength="120"
                :placeholder="t('announcements.dialog.titlePlaceholder')"
                data-test="editor-title"
              >
            </div>
          </div>

          <div
            v-if="draft.kind === 'text'"
            class="announcement-editor__field"
          >
            <span
              id="announcement-text-label"
              class="announcement-editor__label"
            >{{ t('announcements.dialog.text') }}</span>
            <LiturgyRichNotesEditor
              :model-value="draft.html"
              labelledby="announcement-text-label"
              @update:model-value="setText"
            />
          </div>

          <div
            v-else-if="draft.kind === 'url'"
            class="announcement-editor__field"
          >
            <label
              class="announcement-editor__label"
              for="announcement-url"
            >
              {{ t('announcements.dialog.url') }}
            </label>
            <input
              id="announcement-url"
              v-model="draft.url"
              class="announcement-editor__input"
              type="url"
              inputmode="url"
              placeholder="https://"
              data-test="editor-url"
            >
            <p
              class="announcement-editor__hint"
              data-test="editor-url-hint"
            >
              {{ titleLoading ? t('announcements.dialog.fetchingTitle') : t('announcements.dialog.urlHint') }}
            </p>
          </div>

          <div
            v-else-if="draft.kind === 'images'"
            class="announcement-editor__field"
          >
            <ol
              v-if="draft.files.length > 0"
              class="announcement-editor__images"
            >
              <li
                v-for="(file, index) in draft.files"
                :key="file.relativePath"
                class="announcement-editor__image"
                data-test="editor-image"
              >
                <img
                  :src="resolveMediaUrl(file.relativePath)"
                  :alt="file.name"
                  loading="lazy"
                >
                <span class="announcement-editor__image-name">{{ file.name }}</span>
                <div class="announcement-editor__image-actions">
                  <button
                    type="button"
                    :disabled="index === 0"
                    :aria-label="t('announcements.dialog.moveImageUp')"
                    :title="t('announcements.dialog.moveImageUp')"
                    @click="moveImage(index, index - 1)"
                  >
                    <i
                      class="ti ti-arrow-left"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    :disabled="index === draft.files.length - 1"
                    :aria-label="t('announcements.dialog.moveImageDown')"
                    :title="t('announcements.dialog.moveImageDown')"
                    @click="moveImage(index, index + 1)"
                  >
                    <i
                      class="ti ti-arrow-right"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    :aria-label="t('announcements.dialog.removeImage')"
                    :title="t('announcements.dialog.removeImage')"
                    data-test="editor-image-remove"
                    @click="removeImage(index)"
                  >
                    <i
                      class="ti ti-x"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </li>
            </ol>
            <button
              type="button"
              class="announcement-editor__pick"
              :disabled="busy"
              data-test="editor-pick"
              @click="onPick"
            >
              <i
                class="ti ti-photo-plus"
                aria-hidden="true"
              />
              {{ busy ? t('announcements.dialog.copying') : t('announcements.dialog.addImages') }}
            </button>
          </div>

          <div
            v-else
            class="announcement-editor__field"
          >
            <p
              v-if="draft.file"
              class="announcement-editor__file"
              data-test="editor-file"
            >
              <i
                class="ti"
                :class="draft.kind === 'video' ? 'ti-video' : 'ti-presentation'"
                aria-hidden="true"
              />
              {{ draft.file.name }}
            </p>
            <button
              type="button"
              class="announcement-editor__pick"
              :disabled="busy"
              data-test="editor-pick"
              @click="onPick"
            >
              <i
                class="ti ti-file-upload"
                aria-hidden="true"
              />
              <template v-if="busy">
                {{ t('announcements.dialog.copying') }}
              </template>
              <template v-else-if="draft.file">
                {{ t('announcements.dialog.replaceFile') }}
              </template>
              <template v-else>
                {{ draft.kind === 'video' ? t('announcements.dialog.chooseVideo') : t('announcements.dialog.chooseFile') }}
              </template>
            </button>
          </div>

          <p
            v-if="showErrors && !isValid"
            class="announcement-editor__error"
            role="alert"
            data-test="editor-error"
          >
            {{ errorMessage }}
          </p>

          <div class="announcement-editor__actions">
            <button
              type="button"
              class="announcement-editor__btn"
              :disabled="busy"
              data-test="editor-cancel"
              @click="onCancel"
            >
              {{ t('announcements.cancel') }}
            </button>
            <button
              type="submit"
              class="announcement-editor__btn announcement-editor__btn--primary"
              :disabled="busy"
              data-test="editor-save"
            >
              {{ t('announcements.save') }}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.announcement-editor {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 55%);
}

.announcement-editor__panel {
  width: min(44rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}

.announcement-editor__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.announcement-editor__heading {
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 1.15rem;
  font-weight: 600;
}

.announcement-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.announcement-editor__label {
  color: var(--ds-color-on-surface-variant);
  font-size: 0.8rem;
  font-weight: 600;
}

.announcement-editor__title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.announcement-editor__input {
  height: 2.5rem;
  flex: 1;
  padding: 0 0.75rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 16%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  color: var(--ds-color-on-surface);
  font-size: 0.95rem;

  &:focus {
    border-color: var(--ds-color-primary);
    outline: none;
  }
}

.announcement-editor__images {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.announcement-editor__image {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.4rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  border-radius: 0.5rem;

  img {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 0.35rem;
    background: rgb(0 0 0 / 35%);
    object-fit: contain;
  }
}

.announcement-editor__image-name {
  overflow: hidden;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-editor__image-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.15rem;

  button {
    display: inline-flex;
    width: 1.75rem;
    height: 1.75rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 9999px;
    background: transparent;
    color: var(--ds-color-on-surface-variant);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
      color: var(--ds-color-on-surface);
    }

    &:disabled {
      cursor: default;
      opacity: 0.35;
    }
  }
}

.announcement-editor__file {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--ds-color-on-surface);
  font-size: 0.9rem;
  word-break: break-all;
}

.announcement-editor__pick {
  display: inline-flex;
  height: 2.4rem;
  align-items: center;
  align-self: flex-start;
  gap: 0.4rem;
  padding: 0 1rem;
  border: 1px dashed color-mix(in srgb, var(--ds-color-primary) 55%, transparent);
  border-radius: 0.5rem 0 0.5rem 0;
  background: color-mix(in srgb, var(--ds-color-primary) 10%, transparent);
  color: var(--ds-color-primary);
  cursor: pointer;
  font-weight: 600;

  &:disabled {
    cursor: progress;
    opacity: 0.7;
  }
}

.announcement-editor__hint {
  margin: 0;
  color: var(--ds-color-on-surface-variant);
  font-size: 0.75rem;
}

.announcement-editor__error {
  margin: 0;
  color: var(--ds-color-error, #ffb4ab);
  font-size: 0.85rem;
}

.announcement-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.announcement-editor__btn {
  height: 2.4rem;
  padding: 0 1.1rem;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  border-radius: 0.5rem 0 0.5rem 0;
  background: transparent;
  color: var(--ds-color-on-surface);
  cursor: pointer;
  font-weight: 600;

  &--primary {
    border-color: transparent;
    background: var(--ds-color-primary);
    color: var(--ds-color-on-primary);
  }

  &:disabled {
    opacity: 0.6;
  }
}
</style>
