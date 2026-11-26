import { describe, expect, it } from 'vitest'

import { isChannelLink, isPlaylistLink } from '../services/youtube-links'

describe('isChannelLink (colar no "Cadastrar canal")', () => {
  it('reconhece link de canal, @handle completo e id UC…', () => {
    expect(isChannelLink('https://www.youtube.com/@casapublicadora')).toBe(true)
    expect(isChannelLink(' youtube.com/@HinárioAntigoAdventista/videos ')).toBe(true)
    expect(isChannelLink('https://m.youtube.com/channel/UCQhkLOO40bmTMeLcbspKW8A')).toBe(true)
    expect(isChannelLink('https://youtube.com/c/NovoTempo')).toBe(true)
    expect(isChannelLink('https://youtube.com/user/voxmusic')).toBe(true)
    expect(isChannelLink('@casapublicadora')).toBe(true)
    expect(isChannelLink('UCQhkLOO40bmTMeLcbspKW8A')).toBe(true)
  })

  it('texto comum, vídeo, playlist e outro site não', () => {
    expect(isChannelLink('casa publicadora')).toBe(false)
    expect(isChannelLink('https://www.youtube.com/watch?v=AAAAAAAAAAA')).toBe(false)
    expect(isChannelLink('https://www.youtube.com/playlist?list=PLabcdefghij1234')).toBe(false)
    expect(isChannelLink('https://example.com/@canal')).toBe(false)
    expect(isChannelLink('@a')).toBe(false)
    expect(isChannelLink('')).toBe(false)
  })
})

describe('isPlaylistLink (colar na "Coletânea a partir de uma playlist")', () => {
  it('reconhece link com list= e o id colado', () => {
    expect(isPlaylistLink('https://www.youtube.com/playlist?list=PLAPpcKnpMfeO9Fydpl1tTKC9CRRnIMMSK')).toBe(true)
    expect(isPlaylistLink('https://youtu.be/AAAAAAAAAAA?si=x&list=PLVk-tYq6iIlM')).toBe(true)
    expect(isPlaylistLink(' PLVk-tYq6iIlM ')).toBe(true)
    expect(isPlaylistLink('OLAK5uy_abcdefghijk')).toBe(true)
  })

  it('vídeo sem lista, texto e list curto demais não', () => {
    expect(isPlaylistLink('https://www.youtube.com/watch?v=AAAAAAAAAAA')).toBe(false)
    expect(isPlaylistLink('hinos de natal')).toBe(false)
    expect(isPlaylistLink('https://www.youtube.com/watch?v=x&list=curto')).toBe(false)
    expect(isPlaylistLink('')).toBe(false)
  })
})
