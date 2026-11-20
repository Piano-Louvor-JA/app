import type { Meta, StoryObj } from '@storybook/vue3-vite'

import BlurContainer from '../components/glass/BlurContainer.vue'

const meta = {
  title: 'Design System/BlurContainer',
  component: BlurContainer,
  tags: ['autodocs'],
} satisfies Meta<typeof BlurContainer>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  render: () => ({
    components: { BlurContainer },
    template: `<BlurContainer><p style="padding: 1.5rem">Conteúdo com blur de fundo.</p></BlurContainer>`,
  }),
}

export const NivelAlto: Story = {
  render: () => ({
    components: { BlurContainer },
    template: `<BlurContainer level="high"><p style="padding: 1.5rem">Blur nível alto.</p></BlurContainer>`,
  }),
}
