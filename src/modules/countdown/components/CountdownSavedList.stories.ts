import type { Meta, StoryObj } from '@storybook/vue3-vite'

import CountdownSavedList from '../components/CountdownSavedList.vue'

const meta = {
  title: 'Countdown/SavedList',
  component: CountdownSavedList,
  tags: ['autodocs'],
} satisfies Meta<typeof CountdownSavedList>

export default meta
type Story = StoryObj<typeof meta>

export const TresTemposSalvos: Story = {
  args: {
    items: [5 * 60_000, 10 * 60_000, 30 * 60_000],
    timeFormat: 'hh:mm:ss',
  },
}

export const ComMilesimos: Story = {
  args: {
    items: [95_500, 3 * 60_000 + 12_300],
    timeFormat: 'hh:mm:ss.ms',
  },
}

export const ListaVazia: Story = {
  args: {
    items: [],
    timeFormat: 'hh:mm:ss',
  },
}
