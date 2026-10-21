<script setup lang="ts">
import AppIcon from '@design-system/components/AppIcon.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LiturgyItem } from '../types/liturgy'

import { GlassCard } from '@design-system/index'

const props = defineProps<{
  teamItems?: LiturgyItem[]
  remainingCountdown: string
  countdownExpired: boolean
  countdownRunning: boolean
  canStartCountdown: boolean
  startTimeInput: string
  endTimeInput: string
  notes: string
}>()

const emit = defineEmits<{
  'update:notes': [value: string]
  manageTeam: []
  setStartFromInput: [value: string]
  clearStart: []
  setEndFromInput: [value: string]
  clearEnd: []
  startCountdown: []
  stopCountdown: []
}>()

const { t } = useI18n()
const assignedItems = computed(() => (props.teamItems ?? []).filter(item => item.type !== 'category' && item.responsible))

function onNotesInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:notes', target.value)
}

function onStartTimeChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value) {
    emit('clearStart')
    return
  }
  emit('setStartFromInput', value)
}

function onEndTimeChange(event: Event) {
  const value = (event.target as HTMLInputElement).value
  if (!value) {
    emit('clearEnd')
    return
  }
  emit('setEndFromInput', value)
}
</script>

<template>
  <aside class="liturgy-sidebar">
    <GlassCard class="liturgy-sidebar__panel">
      <div class="liturgy-sidebar__heading-row">
        <h2 class="liturgy-sidebar__heading">
          {{ t('liturgy.summary.title') }}
        </h2>
        <button
          v-if="!countdownRunning"
          type="button"
          class="liturgy-sidebar__play"
          :disabled="!canStartCountdown"
          :title="t('liturgy.summary.startCountdown')"
          :aria-label="t('liturgy.summary.startCountdown')"
          @click="emit('startCountdown')"
        >
          <AppIcon name="player-play" aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          class="liturgy-sidebar__play liturgy-sidebar__play--stop"
          :title="t('liturgy.summary.stopCountdown')"
          :aria-label="t('liturgy.summary.stopCountdown')"
          @click="emit('stopCountdown')"
        >
          <AppIcon name="player-stop" aria-hidden="true" />
        </button>
      </div>

      <dl class="liturgy-sidebar__stats">
        <div class="liturgy-sidebar__stat">
          <dt>{{ t('liturgy.summary.realStart') }}</dt>
          <dd class="liturgy-sidebar__time-row">
            <input
              class="liturgy-sidebar__time-input"
              type="time"
              :value="startTimeInput"
              :aria-label="t('liturgy.summary.pickStart')"
              @change="onStartTimeChange"
            >
            <button
              v-if="startTimeInput"
              type="button"
              class="liturgy-sidebar__time-btn liturgy-sidebar__time-btn--ghost"
              :title="t('liturgy.summary.clearTime')"
              :aria-label="t('liturgy.summary.clearTime')"
              @click="emit('clearStart')"
            >
              <AppIcon name="x" aria-hidden="true" />
            </button>
          </dd>
        </div>

        <div class="liturgy-sidebar__stat">
          <dt>{{ t('liturgy.summary.plannedEnd') }}</dt>
          <dd class="liturgy-sidebar__time-row">
            <input
              class="liturgy-sidebar__time-input"
              type="time"
              :value="endTimeInput"
              :aria-label="t('liturgy.summary.pickEnd')"
              @change="onEndTimeChange"
            >
            <button
              v-if="endTimeInput"
              type="button"
              class="liturgy-sidebar__time-btn liturgy-sidebar__time-btn--ghost"
              :title="t('liturgy.summary.clearTime')"
              :aria-label="t('liturgy.summary.clearTime')"
              @click="emit('clearEnd')"
            >
              <AppIcon name="x" aria-hidden="true" />
            </button>
          </dd>
        </div>

        <div class="liturgy-sidebar__stat">
          <dt>{{ t('liturgy.summary.remainingTime') }}</dt>
          <dd
            class="liturgy-sidebar__mono liturgy-sidebar__mono--countdown"
            :class="{
              'liturgy-sidebar__mono--expired': countdownExpired,
              'liturgy-sidebar__mono--primary':
                countdownRunning && !countdownExpired,
            }"
          >
            {{ remainingCountdown }}
          </dd>
        </div>
      </dl>

      <div
        class="liturgy-sidebar__rule"
        aria-hidden="true"
      />

      <h3 class="liturgy-sidebar__team-title">
        {{ t('liturgy.team.title') }}
      </h3>
      <ul v-if="assignedItems.length" class="liturgy-sidebar__team-list">
        <li v-for="item in assignedItems" :key="item.id">
          <strong>{{ item.responsible }}</strong><span>{{ item.name }}</span>
        </li>
      </ul>
      <p v-else class="liturgy-sidebar__team-empty">
        {{ t('liturgy.team.empty') }}
      </p>
      <button
        type="button"
        class="liturgy-sidebar__team-btn"
        @click="emit('manageTeam')"
      >
        {{ t('liturgy.team.manage') }}
      </button>
    </GlassCard>

    <GlassCard class="liturgy-sidebar__note">
      <div class="liturgy-sidebar__note-header">
        <AppIcon name="info-circle" aria-hidden="true" />
        <h3>{{ t('liturgy.broadcastNote.title') }}</h3>
      </div>
      <textarea
        class="liturgy-sidebar__note-input"
        :value="notes"
        :placeholder="t('liturgy.broadcastNote.placeholder')"
        rows="4"
        @input="onNotesInput"
      />
    </GlassCard>
  </aside>
</template>

<style scoped lang="scss">
.liturgy-sidebar__team-list { margin: 0; padding: 0; list-style: none; display: grid; gap: .6rem; }
.liturgy-sidebar__team-list li { display: grid; gap: .15rem; font-size: .8rem; overflow-wrap: anywhere; }
.liturgy-sidebar__team-list span { color: var(--ds-color-on-surface-variant); }
.liturgy-sidebar {
  display: flex;
  width: 100%;
  max-width: 20rem;
  flex-direction: column;
  gap: 1.5rem;
  min-height: 0;
  height: 100%;
}

.liturgy-sidebar__panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.liturgy-sidebar__heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
}

.liturgy-sidebar__heading {
  margin: 0;
  color: var(--ds-color-primary);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
}

.liturgy-sidebar__play {
  flex-shrink: 0;
  width: 2.35rem;
  height: 2.35rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: var(--ds-color-primary);
  color: var(--ds-color-on-primary, #003258);
  cursor: pointer;
  box-shadow: 0 0 14px color-mix(in srgb, var(--ds-color-primary) 35%, transparent);
  transition:
    transform 140ms ease,
    opacity 140ms ease,
    background-color 160ms ease;

  i {
    font-size: 1.35rem;
    margin-left: 0.1rem;
  }

  &:hover:not(:disabled) {
    transform: scale(1.06);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    box-shadow: none;
  }

  &--stop {
    background: color-mix(in srgb, var(--ds-color-error, #ffb4ab) 85%, #1a1a1a);
    color: #2b1512;
    box-shadow: 0 0 14px color-mix(in srgb, var(--ds-color-error, #ffb4ab) 28%, transparent);

    i {
      margin-left: 0;
      font-size: 1.15rem;
    }
  }
}

.liturgy-sidebar__stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 0;
}

.liturgy-sidebar__stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  dt {
    margin: 0;
    flex-shrink: 0;
    font-size: 0.875rem;
    color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  }

  dd {
    margin: 0;
  }
}

.liturgy-sidebar__time-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  min-width: 0;
}

.liturgy-sidebar__time-input {
  width: 6.75rem;
  min-height: 2rem;
  padding: 0.2rem 0.4rem;
  border-radius: 0.5rem 0 0.5rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  color: var(--ds-color-on-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8125rem;
  color-scheme: dark;

  &:focus {
    outline: 2px solid color-mix(in srgb, var(--ds-color-primary) 45%, transparent);
    outline-offset: 0;
  }
}

.liturgy-sidebar__time-btn {
  flex-shrink: 0;
  min-height: 2rem;
  padding: 0;
  width: 1.75rem;
  border-radius: 0.5rem 0 0.5rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 14%, transparent);
  background: transparent;
  color: color-mix(in srgb, var(--ds-color-on-surface) 55%, transparent);
  cursor: pointer;

  &:hover {
    color: var(--ds-color-error, #ffb4ab);
    background: color-mix(in srgb, var(--ds-color-on-surface) 6%, transparent);
  }

  i {
    font-size: 0.95rem;
  }
}

.liturgy-sidebar__mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.95rem;
  color: var(--ds-color-on-surface);

  &--countdown {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  &--primary {
    color: var(--ds-color-primary);
  }

  &--expired {
    color: var(--ds-color-error, #ffb4ab);
  }
}

.liturgy-sidebar__rule {
  height: 1px;
  background: color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
}

.liturgy-sidebar__team-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ds-color-on-surface);
}

.liturgy-sidebar__team-empty {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: color-mix(in srgb, var(--ds-color-on-surface) 58%, transparent);
}

.liturgy-sidebar__team-btn {
  width: 100%;
  min-height: 2.75rem;
  margin-top: 0.25rem;
  border-radius: 0.75rem 0 0.75rem 0;
  border: 1px solid color-mix(in srgb, var(--ds-color-on-surface) 10%, transparent);
  background: transparent;
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 180ms ease;

  &:hover {
    background: color-mix(in srgb, var(--ds-color-on-surface) 5%, transparent);
  }
}

.liturgy-sidebar__note {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-color: color-mix(in srgb, var(--ds-color-secondary, #78d6d2) 30%, transparent) !important;
  background: color-mix(
    in srgb,
    var(--ds-color-secondary, #78d6d2) 10%,
    transparent
  ) !important;
}

.liturgy-sidebar__note-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
  color: var(--ds-color-secondary, #78d6d2);

  i {
    font-size: 1.25rem;
  }

  h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }
}

.liturgy-sidebar__note-input {
  width: 100%;
  flex: 1 1 auto;
  min-height: 5.5rem;
  resize: vertical;
  border: 0;
  border-radius: 0.5rem 0 0.5rem 0;
  background: transparent;
  color: var(--ds-color-on-surface-variant, var(--ds-color-on-surface));
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.5;
  padding: 0;

  &::placeholder {
    color: color-mix(in srgb, var(--ds-color-on-surface) 42%, transparent);
  }

  &:focus {
    outline: none;
  }
}

@media (max-width: 960px) {
  .liturgy-sidebar {
    max-width: none;
  }
}

@media (max-width: 1280px) {
  .liturgy-sidebar {
    max-width: 16rem;
    gap: 0.75rem;
  }

  .liturgy-sidebar__panel {
    gap: 0.7rem;
  }

  .liturgy-sidebar__heading-row {
    gap: 0.5rem;
    padding-bottom: 0.55rem;
  }

  .liturgy-sidebar__heading {
    font-size: 1rem;
  }

  .liturgy-sidebar__play {
    width: 1.85rem;
    height: 1.85rem;

    i {
      font-size: 1.05rem;
    }

    &--stop i {
      font-size: 0.95rem;
    }
  }

  .liturgy-sidebar__stats {
    gap: 0.55rem;
  }

  .liturgy-sidebar__stat {
    gap: 0.45rem;

    dt {
      font-size: 0.75rem;
    }
  }

  .liturgy-sidebar__time-input {
    width: 5.75rem;
    min-height: 1.7rem;
    font-size: 0.75rem;
  }

  .liturgy-sidebar__time-btn {
    width: 1.5rem;
    min-height: 1.7rem;

    i {
      font-size: 0.85rem;
    }
  }

  .liturgy-sidebar__mono {
    font-size: 0.85rem;

    &--countdown {
      font-size: 0.92rem;
    }
  }

  .liturgy-sidebar__team-title {
    font-size: 0.78rem;
  }

  .liturgy-sidebar__team-empty {
    font-size: 0.72rem;
  }

  .liturgy-sidebar__team-btn {
    min-height: 2.15rem;
    font-size: 0.78rem;
  }

  .liturgy-sidebar__note-header {
    gap: 0.4rem;
    margin-bottom: 0.45rem;

    i {
      font-size: 1rem;
    }

    h3 {
      font-size: 0.78rem;
    }
  }

  .liturgy-sidebar__note-input {
    min-height: 3.75rem;
    font-size: 0.78rem;
    line-height: 1.4;
  }
}
</style>
