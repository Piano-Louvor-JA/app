import type { Meta, StoryObj } from '@storybook/vue3-vite'

import LiturgyDayTabs from '../components/LiturgyDayTabs.vue'
import type { LiturgyDayKey } from '../types/liturgy'

const meta = {
  title: 'Liturgy/DayTabs',
  component: LiturgyDayTabs,
  tags: ['autodocs'],
} satisfies Meta<typeof LiturgyDayTabs>

export default meta
type Story = StoryObj<typeof meta>

export const DomingoSelecionado: Story = {
  args: { selectedDay: 'sunday' as LiturgyDayKey },
}

export const QuartaSelecionada: Story = {
  args: { selectedDay: 'wednesday' as LiturgyDayKey },
}

export const CustomSelecionado: Story = {
  args: { selectedDay: 'custom' as LiturgyDayKey },
}
