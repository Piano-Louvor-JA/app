import { describe, expect, it } from 'vitest'
import { zip } from 'fflate'

import { buildSlja, parseSljaFile } from '../slja'

function zipBuffers(files: Record<string, Uint8Array>): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    zip(files, (err, result) => {
      if (err) reject(err)
      else resolve(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength))
    })
  })
}

const archive = {
  title: 'Teste Zip',
  slides: [
    { lyric: 'Capa', type: 'CAPA' as const, timeMs: 0 },
    { lyric: 'Estrofe 1', type: 'LETRA' as const, timeMs: 1000 },
  ],
}

describe('parseSljaFile — wrapper .slja.zip do WhatsApp', () => {
  it('aceita .slja direto (sem wrapper)', async () => {
    const buffer = await buildSlja(archive)
    const parsed = await parseSljaFile(buffer, 'musica.slja')
    expect(parsed.title).toBe('Teste Zip')
    expect(parsed.slides).toHaveLength(2)
  })

  it('aceita .slja.zip: zip externo contendo o .slja interno', async () => {
    const inner = new Uint8Array(await buildSlja(archive))
    const wrapper = await zipBuffers({ 'musica.slja': inner })
    const parsed = await parseSljaFile(wrapper, 'musica.slja.zip')
    expect(parsed.title).toBe('Teste Zip')
    expect(parsed.slides[1]?.lyric).toBe('Estrofe 1')
  })

  it('encontra o .slja mesmo com nome arbitrário dentro do zip', async () => {
    const inner = new Uint8Array(await buildSlja(archive))
    const wrapper = await zipBuffers({ 'pasta/qualquer coisa.slja': inner })
    const parsed = await parseSljaFile(wrapper, 'recebido.zip')
    expect(parsed.title).toBe('Teste Zip')
  })

  it('rejeita zip sem .slja interno com erro claro', async () => {
    const wrapper = await zipBuffers({ 'outro.txt': new TextEncoder().encode('nada') })
    await expect(parseSljaFile(wrapper, 'sem-slja.zip')).rejects.toThrow(/não encontrado/)
  })
  describe('gaps — INI sem [Geral]', () => {
    it('INI sem seção Geral: título default e 0 slides extras', async () => {
      const ini = '[Outro]\nfoo=1\n'
      const files: Record<string, Uint8Array> = {
        'slides.lja': new TextEncoder().encode(ini),
      }
      const buffer = await zipBuffers(files)
      const parsed = await parseSljaFile(buffer, 'musica.slja')
      expect(parsed).toBeTruthy()
      expect(parsed.title).toBe('Sem título')
      expect(parsed.slides).toHaveLength(0)
    })
  })


  describe('gaps onda — caudas de parse (B151/B171/B276)', () => {
    it('audio marcado no INI mas SEM entry no zip → áudio undefined (B151 falso)', async () => {
      const ini = '[Geral]\naudio=1\nurl_musica=audio/hino.mp3\nslides=0\n'
      const files: Record<string, Uint8Array> = {
        'slides.lja': new TextEncoder().encode(ini),
        // SEM audio/hino.mp3 no zip
      }
      const buffer = await zipBuffers(files)
      const parsed = await parseSljaFile(buffer, 'musica.slja')
      expect(parsed.audio).toBeUndefined()
    })

    it('INI com [Slide:1] sem linhas chave=valor → 0 slides adicionais e linha ignorada (B276 falso: sem =)', async () => {
      const ini = '[Geral]\nslides=1\n[Slide:1]\nlinha-sem-igual\n\n'
      const files: Record<string, Uint8Array> = {
        'slides.lja': new TextEncoder().encode(ini),
      }
      const buffer = await zipBuffers(files)
      const parsed = await parseSljaFile(buffer, 'musica.slja')
      expect(parsed.slides).toHaveLength(1) // slide criado pela contagem, com defaults
      expect(parsed.title).toBe('Sem título')
    })

    it('INI [Slide:2] além do existente com seção vazia → push do slide default (B171 verdadeiro via contagem)', async () => {
      const ini = '[Geral]\nslides=2\n[Slide:2]\nletra=alfa\n'
      const files: Record<string, Uint8Array> = {
        'slides.lja': new TextEncoder().encode(ini),
      }
      const buffer = await zipBuffers(files)
      const parsed = await parseSljaFile(buffer, 'musica.slja')
      // Slide:1 ausente → continue; Slide:2 presente → 1 slide
      expect(parsed.slides).toHaveLength(1)
      expect(parsed.slides[0].lyric).toBe('alfa')
    })
  })
})
