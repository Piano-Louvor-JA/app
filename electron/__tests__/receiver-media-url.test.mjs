// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Funções de mídia do receiver (sem DOM), avaliadas com host/port simulados.
const html = readFileSync(fileURLToPath(new URL('../palco/receiver.html', import.meta.url)), 'utf8')
const fn = (name) => {
  const start = html.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`sem ${name}`)
  let depth = 0
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1)
  }
  throw new Error(`fim de ${name}`)
}
function mediaUrl(value, host, port) {
  const source = ['palcoLanHost', 'palcoSenderHost', 'palcoOfficialOrigin', 'palcoMediaUrl'].map(fn).join('\n')
  // eslint-disable-next-line no-new-func
  return new Function('host', 'port', 'location', `${source}\nreturn palcoMediaUrl(${JSON.stringify(value)})`)(
    host,
    port,
    { href: 'http://127.0.0.1:4980/espelho', protocol: 'http:' },
  )
}

describe('receiver: mídia do transmissor conectado', () => {
  it('vem pelo endereço por onde a tela se conectou (IP anunciado inalcançável)', () => {
    // Celular emulado anuncia 10.0.2.16; a tela chegou nele por 127.0.0.1:4981.
    expect(mediaUrl('http://10.0.2.16:4980/media/video.mp4', '127.0.0.1', '4981'))
      .toBe('http://127.0.0.1:4980/media/video.mp4')
    // Celular com duas redes: anuncia uma, a TV está na outra.
    expect(mediaUrl('http://192.168.43.1:4982/media/a.png?x=1', '10.0.0.7', '4983'))
      .toBe('http://10.0.0.7:4982/media/a.png?x=1')
  })

  it('outras origens seguem iguais', () => {
    // Outra porta (outro serviço da rede) não é o transmissor conectado.
    expect(mediaUrl('http://192.168.0.20:8080/x.mp4', '127.0.0.1', '4981'))
      .toBe('http://192.168.0.20:8080/x.mp4')
    expect(mediaUrl('https://api.pianolouvorja.com.br/file/a.mp3', '127.0.0.1', '4981'))
      .toBe('https://api.pianolouvorja.com.br/file/a.mp3')
    expect(mediaUrl('http://evil.example/x.mp4', '127.0.0.1', '4981')).toBe('')
  })
})
