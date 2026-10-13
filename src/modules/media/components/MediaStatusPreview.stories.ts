import type { Meta, StoryObj } from '@storybook/vue3-vite'

import MediaStatusPreview from '../components/MediaStatusPreview.vue'

const meta = {
  title: 'Media/StatusPreview',
  component: MediaStatusPreview,
  tags: ['autodocs'],
} satisfies Meta<typeof MediaStatusPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Versiculo: Story = {
  args: {
    snippet:
      'Porque eu bem sei os pensamentos que tenho a vosso respeito, diz o SENHOR; pensamentos de paz e não de mal, para vos dar o fim que esperais.',
    reference: 'Jeremias 29:11',
  },
}

export const TrechoCurto: Story = {
  args: {
    snippet: 'O SENHOR é o meu pastor.',
    reference: 'Salmos 23:1',
  },
}

export const TextoLongo: Story = {
  args: {
    snippet:
      'Alegrai-vos sempre no Senhor; outra vez digo, alegrai-vos. A vossa equidade seja notória a todos os homens. Perto está o Senhor. Não estejais inquietos por coisa alguma; antes, as vossas petições sejam em tudo conhecidas diante de Deus, pela oração e súplicas, com ação de graças. E a paz de Deus, que excede todo o entendimento, guardará os vossos corações.',
    reference: 'Filipenses 4:4-7',
  },
}
