import type { Meta, StoryObj } from '@storybook/vue3-vite'

import LiturgyTimelineItem from '../components/LiturgyTimelineItem.vue'
import type { LiturgyItem } from '../types/liturgy'

const meta = {
  title: 'Liturgy/TimelineItem',
  component: LiturgyTimelineItem,
  tags: ['autodocs'],
} satisfies Meta<typeof LiturgyTimelineItem>

export default meta
type Story = StoryObj<typeof meta>

const baseItem: LiturgyItem = {
  id: 'item-1',
  type: 'music',
  name: 'A Única Esperança',
  subtitle: 'Athus',
  done: false,
  durationMs: 4 * 60_000,
  accentColor: '#7c4dff',
  categoryId: null,
  startTime: '19:00',
  endTime: '19:05',
}

const labels = {
  startLabel: '19:00',
  durationLabel: '04:00',
}

export const ItemMusica: Story = {
  args: { item: { ...baseItem }, index: 0, selected: false, ...labels },
}

export const ItemSelecionado: Story = {
  args: { item: { ...baseItem }, index: 0, selected: true, ...labels },
}

export const ItemConcluido: Story = {
  args: { item: { ...baseItem, done: true }, index: 0, selected: false, ...labels },
}

export const ItemProjecaoAtiva: Story = {
  args: {
    item: { ...baseItem },
    index: 0,
    selected: false,
    siteProjecting: true,
    ...labels,
  },
}

export const CategoriaEmAndamento: Story = {
  args: {
    item: { ...baseItem, type: 'category', name: 'Louvor Inicial', childCount: 3 },
    index: 0,
    selected: false,
    sectionInProgress: true,
    collapsible: true,
    ...labels,
  },
}

export const CategoriaAguardando: Story = {
  args: {
    item: { ...baseItem, type: 'category', name: 'Palavra', childCount: 2 },
    index: 1,
    selected: false,
    sectionWaiting: true,
    collapsible: true,
    ...labels,
  },
}

export const EmReordenacao: Story = {
  args: {
    item: { ...baseItem },
    index: 0,
    selected: true,
    reorderActive: true,
    isDragSource: true,
    ...labels,
  },
}
