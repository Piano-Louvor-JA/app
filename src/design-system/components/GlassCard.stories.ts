import type { Meta, StoryObj } from '@storybook/vue3-vite'

import GlassCard from '../components/glass/GlassCard.vue'

const meta = {
  title: 'Design System/GlassCard',
  component: GlassCard,
  tags: ['autodocs'],
} satisfies Meta<typeof GlassCard>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  args: {},
  render: (args) => ({
    components: { GlassCard },
    setup: () => ({ args }),
    template: `<GlassCard v-bind="args"><p style="padding: 1rem">Conteúdo dentro do glass card.</p></GlassCard>`,
  }),
}

export const SemPadding: Story = {
  args: { padding: false },
  render: (args) => ({
    components: { GlassCard },
    setup: () => ({ args }),
    template: `<GlassCard v-bind="args"><p style="padding: 1rem">Card sem padding interno.</p></GlassCard>`,
  }),
}

export const Elevado: Story = {
  args: { elevated: true },
  render: (args) => ({
    components: { GlassCard },
    setup: () => ({ args }),
    template: `<GlassCard v-bind="args"><p style="padding: 1rem">Card elevado (sombra).</p></GlassCard>`,
  }),
}
