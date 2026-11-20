// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { compileString } from 'sass'
import { expect, it } from 'vitest'

it('mantém o player fixo nos dois eixos enquanto arrasta, como a Bíblia', () => {
  const source = readFileSync('src/modules/media/components/MediaChrome.vue', 'utf8')
  const scss = source.match(/<style[^>]*>([\s\S]*?)<\/style>/)![1]!
  const style = document.createElement('style')
  style.textContent = compileString(scss).css
  const player = document.createElement('div')
  player.className = 'media-chrome'
  document.head.appendChild(style)
  document.body.appendChild(player)
  try {
    expect(getComputedStyle(player).position).toBe('fixed')
    player.classList.add('media-chrome--dragging')
    expect(getComputedStyle(player).position).toBe('fixed')
  } finally {
    style.remove()
    player.remove()
  }
})
