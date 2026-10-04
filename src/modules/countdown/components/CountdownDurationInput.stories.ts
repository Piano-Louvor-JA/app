import type { Meta, StoryObj } from '@storybook/vue3-vite'

import CountdownDurationInput from '../components/CountdownDurationInput.vue'

const meta = {
  title: 'Countdown/DurationInput',
  component: CountdownDurationInput,
  tags: ['autodocs'],
} satisfies Meta<typeof CountdownDurationInput>

export default meta
type Story = StoryObj<typeof meta>

export const Duracao5Minutos: Story = {
  args: { durationMs: 5 * 60_000 },
}

export const Duracao45Minutos: Story = {
  args: { durationMs: 45 * 60_000 },
}

export const ModoUntil: Story = {
  args: { durationMs: 0, mode: 'until', untilHour: 18, untilMinute: 30 },
}

export const Compacto: Story = {
  args: { durationMs: 10 * 60_000, compact: true },
}

export const Desabilitado: Story = {
  args: { durationMs: 60_000, disabled: true },
}
