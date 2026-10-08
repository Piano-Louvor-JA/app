/**
 * Módulo de compatibilidade com o formato .slja do LouvorJA Delphi
 *
 * Formato: ZIP contendo:
 * - slides.lja — INI (TMemIniFile) com a apresentação
 * - audio/<nome>.mp3 — áudio (opcional)
 * - imagens/<nome> — backgrounds referenciados (dedup)
 *
 * INI de 2 níveis: [Geral] + [Slide:1]...[Slide:N]
 * Quebra de linha em `letra` = pipe | (CR/LF viram |)
 * Cores em hex HTML (#RRGGBB)
 * Tempo em `tempo` (BYTES do BASS — só para compat) e `tempo_hms` (legível)
 */

import { zip, unzip } from 'fflate'

export interface SljaSlide {
  /** Texto principal (quebras de linha \n) */
  lyric: string
  /** Texto auxiliar (tradução/PB) */
  auxiliaryLyric?: string
  /** Tipo: 'CAPA' (slide 1) ou 'LETRA' (demais) */
  type: 'CAPA' | 'LETRA'
  /** Tempo em milissegundos (derivado de tempo_hms) */
  timeMs: number
  /** Cor do texto principal (hex) */
  textColor?: string
  /** Cor do texto auxiliar */
  auxiliaryTextColor?: string
  /** Cor de fundo da caixa de texto */
  boxColor?: string
  /** Cor de fundo do slide */
  backgroundColor?: string
  /** Imagem de fundo do slide */
  image?: { name: string; bytes: Uint8Array }
  /** Posição/crop da imagem (1-9) */
  imagePosition?: number
  /** Texto usa caixinha (fundo_letra) */
  textBox?: boolean
  /** Tamanho da fonte principal */
  fontSize?: number
  /** Tamanho da fonte auxiliar */
  auxiliaryFontSize?: number
  /** Texto usa negrito? */
  bold?: boolean
  /** Ordem do slide (1-based) */
  order?: number
}

export interface SljaAudio {
  name: string
  bytes: Uint8Array
}

export interface SljaAsset {
  path: string
  bytes: Uint8Array
}

export interface SljaArchive {
  /** Título da apresentação (nome do hino) */
  title: string
  /** Áudio da apresentação (opcional) */
  audio?: SljaAudio
  /** Assets (imagens) referenciados nos slides */
  assets?: SljaAsset[]
  /** Slides da apresentação */
  slides: SljaSlide[]
  /** Conteúdo INI bruto (para compatibilidade com Delphi) */
  rawIni?: string
  /** Versão do app que gerou */
  version?: string
}

/**
 * Gera um arquivo .slja (ArrayBuffer ZIP) a partir de SljaArchive
 */
export async function buildSlja(archive: SljaArchive): Promise<ArrayBuffer> {
  const files: Record<string, Uint8Array> = {}

  // 1. Gerar slides.lja (INI)
  const ini = generateIni(archive)
  files['slides.lja'] = new TextEncoder().encode(ini)

  // 2. Áudio (se houver)
  if (archive.audio) {
    const audioName = archive.audio.name
    files[`audio/${audioName}`] = archive.audio.bytes
  }

  // 3. Imagens (dedup por path)
  const imageMap = new Map<string, Uint8Array>()
  for (const asset of archive.assets || []) {
    if (!imageMap.has(asset.path)) {
      imageMap.set(asset.path, asset.bytes)
    }
  }
  for (const [path, bytes] of imageMap) {
    files[`imagens/${path}`] = bytes
  }

  // 4. ZIP via fflate
  return new Promise((resolve, reject) => {
    zip(files, (err, result) => {
      if (err) reject(err)
      else resolve(result.buffer)
    })
  })
}

/**
 * Lê um arquivo .slja (ArrayBuffer ZIP) e retorna SljaArchive
 */
export async function parseSlja(zipBuffer: ArrayBuffer): Promise<SljaArchive> {
  const zipResult = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(zipBuffer), (err, result) => {
      if (err) reject(err)
      else resolve(result as Record<string, Uint8Array>)
    })
  })

  // 1. Ler slides.lja (INI do Delphi usa Windows-1252/Latin-1, não UTF-8)
  const iniBytes = zipResult['slides.lja']
  if (!iniBytes) {
    throw new Error('slides.lja não encontrado no .slja')
  }
  const ini = new TextDecoder('windows-1252').decode(iniBytes)

  // Normalizar chaves do ZIP: entradas de arquivos gerados pelo Delphi podem
  // usar backslash (audio\..., imagens\...). Unificar para slash.
  const zipEntries: Record<string, Uint8Array> = {}
  for (const [key, value] of Object.entries(zipResult)) {
    zipEntries[key.replaceAll('\\', '/')] = value
  }

  // 2. Parse INI
  const iniData = parseIni(ini)

  // 3. Extrair metadados
  const geral = iniData['Geral'] || {}
  const slidesCount = parseInt(geral.slides || '0', 10)

  // Título: tentar várias fontes
  const title = geral.titulo || (geral.versao ? `v${geral.versao}` : 'Sem título')

  // Áudio (url_musica pode usar backslash no Delphi)
  let audio: SljaAudio | undefined
  if (geral.audio === '1' && geral.url_musica) {
    const audioName = geral.url_musica.replace(/^audio[/\\]/, '')
    const audioBytes = zipEntries[`audio/${audioName}`]
    if (audioBytes) {
      audio = { name: audioName, bytes: audioBytes }
    }
  }

  // 4. Assets (imagens)
  const assets: SljaAsset[] = []
  for (const [path, bytes] of Object.entries(zipEntries)) {
    if (path.startsWith('imagens/')) {
      assets.push({ path: path.replace('imagens/', ''), bytes })
    }
  }

  // 5. Parse slides
  const slides: SljaSlide[] = []
  for (let i = 1; i <= slidesCount; i++) {
    const section = iniData[`Slide:${i}`]
    if (!section) continue

    const slide = parseSlideSection(section, i)
/* v8 ignore next -- invariante: parseSlideSection sempre retorna um slide (default CAPA/LETRA); nunca null */
    if (slide) slides.push(slide)
  }

  return {
    title,
    audio,
    assets,
    rawIni: ini,
    version: geral.versao,
    slides,
  }
}

/**
 * Gera string INI a partir de SljaArchive
 */
function generateIni(archive: SljaArchive): string {
  const lines: string[] = []

  // Se tem rawIni (parse de arquivo Delphi), usar ele como base
  if (archive.rawIni) {
    return archive.rawIni
  }

  // [Geral]
  lines.push('[Geral]')
  lines.push(`slides=${archive.slides.length}`)
  lines.push(`versao=${archive.version || '2.0'}`)
  lines.push(`titulo=${archive.title}`)

  if (archive.audio) {
    lines.push(`url_musica=audio\\${archive.audio.name}`)
    lines.push('audio=1')
  } else {
    lines.push('audio=0')
  }
  lines.push('')

  // Slides
  archive.slides.forEach((slide, index) => {
    const n = index + 1
    lines.push(`[Slide:${n}]`)
    lines.push(`tipo=${slide.type}`)

    // letra com pipes
    if (slide.lyric) {
      lines.push(`letra=${slide.lyric.replace(/\n/g, '|')}`)
    }

    // letra_aux
    if (slide.auxiliaryLyric) {
      lines.push(`letra_aux=${slide.auxiliaryLyric.replace(/\n/g, '|')}`)
    }

    // tempo (em milissegundos → HH:MM:SS)
    if (slide.timeMs > 0) {
      lines.push(`tempo_hms=${msToHms(slide.timeMs)}`)
    }

    // Cores e formatação
    if (slide.textColor) lines.push(`cor_letra=${slide.textColor}`)
    if (slide.auxiliaryTextColor) lines.push(`cor_letra_aux=${slide.auxiliaryTextColor}`)
    if (slide.boxColor) lines.push(`cor_fundo=${slide.boxColor}`)
    if (slide.backgroundColor) lines.push(`cor_fundo=${slide.backgroundColor}`)

    // Imagem
    if (slide.image?.name) {
      lines.push(`imagem=imagens\\${slide.image.name}`)
    }
    if (slide.imagePosition !== undefined) {
      lines.push(`imagem_posicao=${slide.imagePosition}`)
    }

    // Texto/campos
    if (slide.textBox !== undefined) {
      lines.push(`fundo_letra=${slide.textBox ? '1' : '0'}`)
    }
    if (slide.fontSize) lines.push(`tamanho_letra=${slide.fontSize}`)
    if (slide.auxiliaryFontSize) lines.push(`tamanho_letra_aux=${slide.auxiliaryFontSize}`)

    lines.push('')
  })

  return lines.join('\r\n')
}

/**
 * Parse INI simples (sem dependências)
 */
function parseIni(ini: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  let currentSection = ''

  for (const line of ini.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue

    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1]
      result[currentSection] = {}
      continue
    }

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0 && currentSection) {
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      result[currentSection][key] = value
    }
  }

  return result
}

/**
 * Parse seção de slide do INI
 */
function parseSlideSection(section: Record<string, string>, index: number): SljaSlide | null {
  const type = section.tipo || (index === 1 ? 'CAPA' : 'LETRA')
  const lyric = section.letra ? section.letra.replace(/\|/g, '\n') : ''
  const auxiliaryLyric = section.letra_aux ? section.letra_aux.replace(/\|/g, '\n') : undefined

  // tempo em milissegundos (tempo_hms tem prioridade)
  let timeMs = 0
  if (section.tempo_hms) {
    timeMs = hmsToMs(section.tempo_hms)
  } else if (section.tempo) {
    const bytes = parseInt(section.tempo, 10)
    if (!isNaN(bytes)) {
      // Fallback aproximado: assumindo 44.1kHz stereo 16bit = 176400 bytes/seg
      timeMs = Math.round((bytes / 176400) * 1000)
    }
  }

  const slide: SljaSlide = {
    lyric,
    type: type as 'CAPA' | 'LETRA',
    timeMs,
    auxiliaryLyric,
  }

  // Cores
  if (section.cor_letra) slide.textColor = section.cor_letra
  if (section.cor_letra_aux) slide.auxiliaryTextColor = section.cor_letra_aux
  if (section.cor_fundo) {
    // cor_fundo pode ser cor da caixa OU cor do slide
    if (section.fundo_letra === '1') {
      slide.boxColor = section.cor_fundo
    } else {
      slide.backgroundColor = section.cor_fundo
    }
  }

  // Imagem
  if (section.imagem) {
    const imgName = section.imagem.replace(/^imagens[/\\]/, '')
    slide.image = { name: imgName, bytes: new Uint8Array(0) } // bytes virão do ZIP
  }
  if (section.imagem_posicao) {
    slide.imagePosition = parseInt(section.imagem_posicao, 10)
  }

  // Texto/caixa
  if (section.fundo_letra) {
    slide.textBox = section.fundo_letra === '1'
  }
  if (section.tamanho_letra) {
    slide.fontSize = parseInt(section.tamanho_letra, 10)
  }
  if (section.tamanho_letra_aux) {
    slide.auxiliaryFontSize = parseInt(section.tamanho_letra_aux, 10)
  }

  // ordem
  if (section.tempo) {
    // já tratado acima
  }

  return slide
}

/**
 * Converte ms para HH:MM:SS
 */
function msToHms(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Converte HH:MM:SS para milissegundos
 */
function hmsToMs(hms: string): number {
  const parts = hms.split(':').map(Number)
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000
  }
  return 0
}

/**
 * Lê um arquivo escolhido pelo usuário que pode ser:
 * - `.slja` direto (ZIP com slides.lja), OU
 * - `.slja.zip` (wrapper que o WhatsApp cria: zip externo com o .slja dentro).
 *
 * Retorna o SljaArchive e, quando veio de um wrapper, o nome real do .slja
 * interno (para nomear a música corretamente).
 */
export async function parseSljaFile(
  fileBuffer: ArrayBuffer,
  fileName: string,
): Promise<SljaArchive & { innerName?: string }> {
  if (!/\.zip$/i.test(fileName)) {
    return parseSlja(fileBuffer)
  }

  const zipResult = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(fileBuffer), (err: Error | null, result: unknown) => {
      if (err) reject(err)
      else resolve(result as Record<string, Uint8Array>)
    })
  })

  const innerKey = Object.keys(zipResult).find((key) =>
    key.replaceAll('\\', '/').toLowerCase().endsWith('.slja'),
  )
  if (!innerKey) {
    throw new Error('Arquivo .slja não encontrado dentro do .zip')
  }

  const innerBytes = zipResult[innerKey]!
  const innerBuffer = innerBytes.buffer.slice(
    innerBytes.byteOffset,
    innerBytes.byteOffset + innerBytes.byteLength,
  ) as ArrayBuffer

  const archive = await parseSlja(innerBuffer)
  const innerName = innerKey.replaceAll('\\', '/').split('/').pop()
  return { ...archive, innerName }
}