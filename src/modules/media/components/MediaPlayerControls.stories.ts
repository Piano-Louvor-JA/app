import type { Meta, StoryObj } from '@storybook/vue3-vite'

import MediaPlayerControls from '../components/MediaPlayerControls.vue'

const meta = {
  title: 'Media/PlayerControls',
  component: MediaPlayerControls,
  tags: ['autodocs'],
} satisfies Meta<typeof MediaPlayerControls>

export default meta
type Story = StoryObj<typeof meta>

export const Tocando: Story = {
  args: {
    isPlaying: true,
    hasAudio: true,
    currentTimeLabel: '01:23',
    durationLabel: '04:05',
    progressRatio: 0.34,
    slideIndex: 2,
    slideCount: 6,
    volume: 0.7,
    projecting: false,
  },
}

export const Pausado: Story = {
  args: {
    isPlaying: false,
    hasAudio: true,
    currentTimeLabel: '00:00',
    durationLabel: '03:30',
    progressRatio: 0,
    slideIndex: 1,
    slideCount: 4,
    volume: 0.5,
    projecting: false,
  },
}

export const Projetando: Story = {
  args: {
    isPlaying: true,
    hasAudio: true,
    currentTimeLabel: '02:10',
    durationLabel: '04:05',
    progressRatio: 0.52,
    slideIndex: 3,
    slideCount: 6,
    volume: 0.9,
    projecting: true,
  },
}

export const SemAudio: Story = {
  args: {
    isPlaying: false,
    hasAudio: false,
    currentTimeLabel: '00:00',
    durationLabel: '00:00',
    progressRatio: 0,
    slideIndex: 0,
    slideCount: 1,
    volume: 0,
    projecting: false,
  },
}
