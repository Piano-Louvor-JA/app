// @vitest-environment node
import { JSDOM, VirtualConsole } from 'jsdom'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const html = readFileSync(new URL('../player/local-video-player.html', import.meta.url), 'utf8')
const ID = 'aaaaaaaaaaa'

function openPlayer(query) {
  const attach = vi.fn()
  const dom = new JSDOM(html, {
    url: `file:///app/electron/player/local-video-player.html?${query}`,
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.LouvorjaDualTrack = { attach }
      window.HTMLCanvasElement.prototype.getContext = () => null
    },
  })
  return { dom, document: dom.window.document, attach }
}

it('carrega o script de sincronização ao lado do player', () => {
  expect(html).toContain('<script src="./dual-track-sync.js"></script>')
})

it('com audioSrc cria a trilha de som e sincroniza com o vídeo', () => {
  const src = encodeURIComponent(`local://yt-stream/${ID}/video`)
  const audioSrc = encodeURIComponent(`local://yt-stream/${ID}/audio`)
  const { dom, document, attach } = openPlayer(`src=${src}&audioSrc=${audioSrc}`)
  try {
    const video = document.getElementById('player')
    const audio = document.querySelector('audio')
    expect(video.getAttribute('src')).toBe(`local://yt-stream/${ID}/video`)
    expect(audio.getAttribute('src')).toBe(`local://yt-stream/${ID}/audio`)
    expect(audio.getAttribute('preload')).toBe('auto')
    expect(video.nextElementSibling).toBe(audio)
    expect(document.querySelector('video')).toBe(video)
    expect(attach).toHaveBeenCalledWith(video, audio, { onError: expect.any(Function) })

    attach.mock.calls[0][2].onError()
    expect(document.getElementById('error').classList.contains('is-visible')).toBe(true)
  } finally { dom.window.close() }
})

it('com legenda adiciona o <track> e pede imagem e som em modo CORS', () => {
  const src = encodeURIComponent(`local://yt-stream/${ID}/video`)
  const audioSrc = encodeURIComponent(`local://yt-stream/${ID}/audio`)
  const subtitle = encodeURIComponent(`local://yt-cache/${ID}.vtt`)
  const { dom, document } = openPlayer(`src=${src}&audioSrc=${audioSrc}&subtitle=${subtitle}`)
  try {
    const video = document.getElementById('player')
    const track = video.querySelector('track')
    expect(track.getAttribute('kind')).toBe('subtitles')
    expect(track.hasAttribute('default')).toBe(true)
    expect(track.getAttribute('src')).toBe(`local://yt-cache/${ID}.vtt`)
    expect(video.getAttribute('crossorigin')).toBe('anonymous')
    expect(document.querySelector('audio').getAttribute('crossorigin')).toBe('anonymous')
  } finally { dom.window.close() }
})

it('vídeo local comum: sem trilha de som separada, sem legenda e sem CORS', () => {
  const { dom, document, attach } = openPlayer(`src=${encodeURIComponent('local://app/home/v.mp4')}`)
  try {
    expect(document.querySelector('audio')).toBeNull()
    expect(document.querySelector('track')).toBeNull()
    expect(document.getElementById('player').hasAttribute('crossorigin')).toBe(false)
    expect(attach).not.toHaveBeenCalled()
  } finally { dom.window.close() }
})

for (const field of ['src', 'audioSrc', 'subtitle']) {
  it(`recusa protocolo executável em ${field}`, () => {
    const query = new URLSearchParams({ src: 'local://app/home/v.mp4', [field]: 'javascript:alert(1)' })
    const { dom, document } = openPlayer(query)
    try {
      for (const media of document.querySelectorAll('video, audio, track')) {
        expect(media.getAttribute('src') || '').not.toMatch(/^javascript:/)
      }
    } finally { dom.window.close() }
  })
}

it('vídeo do YouTube (local://yt-*) sem legenda também vai em modo CORS: a prévia do celular lê o quadro', () => {
  const src = encodeURIComponent(`local://yt-stream/${ID}/video`)
  const audioSrc = encodeURIComponent(`local://yt-stream/${ID}/audio`)
  const { dom, document } = openPlayer(`src=${src}&audioSrc=${audioSrc}`)
  try {
    expect(document.getElementById('player').getAttribute('crossorigin')).toBe('anonymous')
    expect(document.querySelector('audio').getAttribute('crossorigin')).toBe('anonymous')
  } finally { dom.window.close() }
})

it('arquivo local comum não muda de modo', () => {
  const { dom, document } = openPlayer(`src=${encodeURIComponent('file:///videos/teste.mp4')}`)
  try {
    expect(document.getElementById('player').hasAttribute('crossorigin')).toBe(false)
  } finally { dom.window.close() }
})
