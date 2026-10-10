import type { Meta, StoryObj } from '@storybook/vue3-vite'

import CountdownPreview from '../components/CountdownPreview.vue'
import {
  DEFAULT_COUNTDOWN_DISPLAY_CONFIG,
  DEFAULT_COUNTDOWN_RUNTIME,
} from '../types/countdown'

const meta = {
  title: 'Countdown/Preview',
  component: CountdownPreview,
  tags: ['autodocs'],
} satisfies Meta<typeof CountdownPreview>

export default meta
type Story = StoryObj<typeof meta>

const runtime = (over: Partial<typeof DEFAULT_COUNTDOWN_RUNTIME> = {}) => ({
  ...DEFAULT_COUNTDOWN_RUNTIME,
  status: 'paused' as const,
  segmentStartedAt: null,
  accumulatedMs: 0,
  durationMs: 5 * 60_000,
  savedTimesMs: [],
  finished: false,
  ...over,
})

export const Rodando: Story = {
  args: {
    config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG },
    runtime: runtime({ status: 'running' as const }),
    preview: true,
  },
}

export const Urgente: Story = {
  args: {
    config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG },
    runtime: runtime({ status: 'running' as const, accumulatedMs: 4 * 60_000 + 40_000 }),
    preview: true,
  },
}

export const Finalizado: Story = {
  args: {
    config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG },
    runtime: runtime({ finished: true, accumulatedMs: 5 * 60_000 }),
    preview: true,
  },
}

export const ComMilesimos: Story = {
  args: {
    config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, timeFormat: 'hh:mm:ss.ms' },
    runtime: runtime({ status: 'running' as const }),
    preview: true,
  },
}

export const CoresCustomizadas: Story = {
  args: {
    config: { ...DEFAULT_COUNTDOWN_DISPLAY_CONFIG, bgColor: '#1a237e', textColor: '#ffab00' },
    runtime: runtime({ status: 'running' as const }),
    preview: true,
  },
}
