// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildBackupFileName,
  collectBackupEntries,
  createAppBackupArchive,
  isRestorableZipPath,
  readRestoredBrowserStorage,
  restoreBackupZip,
  resolveSafeExtractPath,
  stripBackupRootPrefix,
  writeBackupZip,
  writeBrowserStorageSnapshot,
} from '../app-backup.mjs'

const temps = []

function tempDir(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  temps.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('app-backup', () => {
  it('nomeia o zip com pasta + data + hora e segundo', () => {
    const name = buildBackupFileName(new Date('2026-09-11T15:13:22'), 'LouvorJA-PIANO')
    expect(name).toBe('LouvorJA-PIANO_2026-09-11_151322.zip')
  })

  it('mapeia mídia custom para Media/ no zip e ignora Cache', () => {
    const dataRoot = tempDir('piano-data-')
    const mediaRoot = tempDir('piano-media-')
    mkdirSync(path.join(dataRoot, '.sysdata'), { recursive: true })
    mkdirSync(path.join(dataRoot, 'Cache'), { recursive: true })
    mkdirSync(path.join(mediaRoot, 'covers'), { recursive: true })
    mkdirSync(path.join(mediaRoot, 'music', 'pt'), { recursive: true })
    mkdirSync(path.join(mediaRoot, 'images'), { recursive: true })
    writeFileSync(path.join(dataRoot, '.sysdata', 'liturgy.json'), '{"ok":1}')
    writeFileSync(path.join(dataRoot, 'Cache', 'x.bin'), 'cache')
    writeFileSync(path.join(dataRoot, '.media-root'), mediaRoot)
    writeFileSync(path.join(dataRoot, 'Preferences'), '{"chromium":true}')
    mkdirSync(path.join(dataRoot, 'Network'), { recursive: true })
    writeFileSync(path.join(dataRoot, 'Network', 'Cookies'), 'locked')
    writeFileSync(path.join(mediaRoot, 'covers', 'hino.jpg'), 'capa')
    writeFileSync(path.join(mediaRoot, 'music', 'pt', 'canto.mp3'), 'audio')
    writeFileSync(path.join(mediaRoot, 'images', 'slide.png'), 'img')

    const entries = collectBackupEntries({ dataRoot, mediaRoot })
    const zipPaths = entries.map((e) => e.zipPath).sort()
    expect(zipPaths).toEqual([
      '.sysdata/liturgy.json',
      'Media/covers/hino.jpg',
      'Media/images/slide.png',
      'Media/music/pt/canto.mp3',
    ])
  })

  it('junta leftover da pasta padrão com mídia custom e sobe se o root for covers', () => {
    const dataRoot = tempDir('piano-leftover-')
    const customMedia = tempDir('piano-custom-full-')
    mkdirSync(path.join(customMedia, 'covers'), { recursive: true })
    mkdirSync(path.join(dataRoot, 'Media', 'music'), { recursive: true })
    mkdirSync(path.join(dataRoot, 'Media', 'images'), { recursive: true })
    writeFileSync(path.join(customMedia, 'covers', 'nova.jpg'), 'capa')
    writeFileSync(path.join(dataRoot, 'Media', 'music', 'hino.mp3'), 'audio')
    writeFileSync(path.join(dataRoot, 'Media', 'images', 'fundo.png'), 'img')

    const fromCovers = collectBackupEntries({
      dataRoot,
      mediaRoot: path.join(customMedia, 'covers'),
    })
    expect(fromCovers.map((e) => e.zipPath).sort()).toEqual([
      'Media/covers/nova.jpg',
      'Media/images/fundo.png',
      'Media/music/hino.mp3',
    ])
  })

  it('mapeia pastas legado musicas/imagens/capas para a árvore padrão', () => {
    const dataRoot = tempDir('piano-alias-')
    const mediaRoot = tempDir('piano-alias-media-')
    mkdirSync(path.join(mediaRoot, 'capas'), { recursive: true })
    mkdirSync(path.join(mediaRoot, 'musicas', 'album'), { recursive: true })
    mkdirSync(path.join(mediaRoot, 'imagens'), { recursive: true })
    writeFileSync(path.join(mediaRoot, 'capas', 'a.jpg'), 'capa')
    writeFileSync(path.join(mediaRoot, 'musicas', 'album', 'b.mp3'), 'audio')
    writeFileSync(path.join(mediaRoot, 'imagens', 'c.png'), 'img')

    const zipPaths = collectBackupEntries({ dataRoot, mediaRoot })
      .map((e) => e.zipPath)
      .sort()
    expect(zipPaths).toEqual([
      'Media/covers/a.jpg',
      'Media/images/c.png',
      'Media/music/album/b.mp3',
    ])
  })

  it('usa as pastas covers/music/images do app mesmo com mediaRoot vazio', () => {
    const dataRoot = tempDir('piano-folders-')
    const elsewhere = tempDir('piano-elsewhere-')
    mkdirSync(path.join(elsewhere, 'covers'), { recursive: true })
    mkdirSync(path.join(elsewhere, 'music'), { recursive: true })
    mkdirSync(path.join(elsewhere, 'images'), { recursive: true })
    writeFileSync(path.join(elsewhere, 'covers', 'c.jpg'), 'c')
    writeFileSync(path.join(elsewhere, 'music', 'm.mp3'), 'm')
    writeFileSync(path.join(elsewhere, 'images', 'i.png'), 'i')

    const zipPaths = collectBackupEntries({
      dataRoot,
      mediaRoot: path.join(dataRoot, 'Media'),
      mediaFolders: {
        covers: path.join(elsewhere, 'covers'),
        music: path.join(elsewhere, 'music'),
        images: path.join(elsewhere, 'images'),
      },
    })
      .map((e) => e.zipPath)
      .sort()

    expect(zipPaths).toEqual([
      'Media/covers/c.jpg',
      'Media/images/i.png',
      'Media/music/m.mp3',
    ])
  })

  it('bloqueia zip-slip na extração', () => {
    const dest = tempDir('piano-dest-')
    expect(() => resolveSafeExtractPath(dest, '../etc/passwd')).toThrow('zip-slip')
  })

  it('remove o prefixo LouvorJA-PIANO/ do zip', () => {
    expect(stripBackupRootPrefix('LouvorJA-PIANO/Media/covers/a.jpg')).toBe(
      'Media/covers/a.jpg',
    )
    expect(stripBackupRootPrefix('Media/covers/a.jpg')).toBe('Media/covers/a.jpg')
  })

  it('só restaura dados do app, não o perfil Chromium', () => {
    expect(isRestorableZipPath('.sysdata/prefs.json')).toBe(true)
    expect(isRestorableZipPath('Media/covers/a.jpg')).toBe(true)
    expect(isRestorableZipPath('Media/music/pt/a.mp3')).toBe(true)
    expect(isRestorableZipPath('Media/images/a.png')).toBe(true)
    expect(isRestorableZipPath('Media/musicas/a.mp3')).toBe(true)
    expect(isRestorableZipPath('.sysdata/local-storage.json')).toBe(true)
    expect(isRestorableZipPath('window-state.json')).toBe(true)
    expect(isRestorableZipPath('Network/Cookies')).toBe(false)
    expect(isRestorableZipPath('Preferences')).toBe(false)
    expect(isRestorableZipPath('Local State')).toBe(false)
  })

  it('grava e restaura zip com mídia na pasta padrão', async () => {
    const dataRoot = tempDir('piano-src-')
    const customMedia = tempDir('piano-custom-media-')
    mkdirSync(path.join(dataRoot, '.sysdata'), { recursive: true })
    mkdirSync(path.join(customMedia, 'covers'), { recursive: true })
    mkdirSync(path.join(customMedia, 'music'), { recursive: true })
    mkdirSync(path.join(customMedia, 'images'), { recursive: true })
    writeFileSync(path.join(dataRoot, '.sysdata', 'prefs.json'), '{"lang":"pt-BR"}')
    writeFileSync(path.join(customMedia, 'covers', 'capa.bin'), 'IMG')
    writeFileSync(path.join(customMedia, 'music', 'hino.mp3'), 'MP3')
    writeFileSync(path.join(customMedia, 'images', 'slide.bin'), 'PNG')

    const zipPath = path.join(tempDir('piano-zip-'), 'LouvorJA-PIANO_test.zip')
    const entries = collectBackupEntries({ dataRoot, mediaRoot: customMedia })
    await writeBackupZip(entries, zipPath)

    const restoreRoot = tempDir('piano-restore-')
    mkdirSync(path.join(restoreRoot, '.sysdata'), { recursive: true })
    mkdirSync(path.join(restoreRoot, 'Media', 'covers'), { recursive: true })
    writeFileSync(path.join(restoreRoot, '.sysdata', 'old.json'), 'old')
    writeFileSync(path.join(restoreRoot, 'Media', 'covers', 'old.jpg'), 'old')

    await restoreBackupZip(zipPath, restoreRoot)

    expect(readFileSync(path.join(restoreRoot, '.sysdata', 'prefs.json'), 'utf8')).toBe(
      '{"lang":"pt-BR"}',
    )
    expect(readFileSync(path.join(restoreRoot, 'Media', 'covers', 'capa.bin'), 'utf8')).toBe(
      'IMG',
    )
    expect(readFileSync(path.join(restoreRoot, 'Media', 'music', 'hino.mp3'), 'utf8')).toBe(
      'MP3',
    )
    expect(readFileSync(path.join(restoreRoot, 'Media', 'images', 'slide.bin'), 'utf8')).toBe(
      'PNG',
    )
    expect(() => readFileSync(path.join(restoreRoot, '.sysdata', 'old.json'))).toThrow()
    expect(() => readFileSync(path.join(restoreRoot, 'Media', 'covers', 'old.jpg'))).toThrow()
  })

  it('ignora arquivos do Chromium no zip e não interrompe a restauração', async () => {
    const dataRoot = tempDir('piano-src-chrome-')
    mkdirSync(path.join(dataRoot, '.sysdata'), { recursive: true })
    writeFileSync(path.join(dataRoot, '.sysdata', 'prefs.json'), '{"ok":1}')
    writeFileSync(path.join(dataRoot, 'Preferences'), 'chromium')
    mkdirSync(path.join(dataRoot, 'Network'), { recursive: true })
    writeFileSync(path.join(dataRoot, 'Network', 'Cookies'), 'cookies')

    const zipPath = path.join(tempDir('piano-zip-chrome-'), 'backup.zip')
    await writeBackupZip(
      [
        { source: path.join(dataRoot, '.sysdata', 'prefs.json'), zipPath: '.sysdata/prefs.json' },
        { source: path.join(dataRoot, 'Preferences'), zipPath: 'Preferences' },
        { source: path.join(dataRoot, 'Network', 'Cookies'), zipPath: 'Network/Cookies' },
      ],
      zipPath,
    )

    const restoreRoot = tempDir('piano-restore-chrome-')
    writeFileSync(path.join(restoreRoot, 'Preferences'), 'live-profile')

    await restoreBackupZip(zipPath, restoreRoot)

    expect(readFileSync(path.join(restoreRoot, '.sysdata', 'prefs.json'), 'utf8')).toBe(
      '{"ok":1}',
    )
    expect(readFileSync(path.join(restoreRoot, 'Preferences'), 'utf8')).toBe('live-profile')
    expect(() => readFileSync(path.join(restoreRoot, 'Network', 'Cookies'))).toThrow()
  })

  it('grava playlists e liturgia do localStorage no zip e restaura o arquivo', async () => {
    const dataRoot = tempDir('piano-ls-src-')
    mkdirSync(path.join(dataRoot, '.sysdata'), { recursive: true })
    writeFileSync(path.join(dataRoot, '.sysdata', 'keep.bin'), 'keep')

    const zipPath = path.join(tempDir('piano-ls-zip-'), 'backup.zip')
    await createAppBackupArchive({
      dataRoot,
      mediaRoot: path.join(dataRoot, 'Media'),
      destZip: zipPath,
      browserStorage: {
        user_data: JSON.stringify({ 'liturgy.state': { weekdays: { sunday: [] } } }),
        'louvorja-playlists-v1': JSON.stringify([{ id: 'p1', name: 'Culto', items: [] }]),
        ignored: 'nope',
      },
    })

    const restoreRoot = tempDir('piano-ls-restore-')
    await restoreBackupZip(zipPath, restoreRoot)

    const snapshot = readRestoredBrowserStorage(restoreRoot)
    expect(snapshot?.['louvorja-playlists-v1']).toContain('Culto')
    expect(JSON.parse(snapshot?.user_data ?? '{}')['liturgy.state'].weekdays.sunday).toEqual([])
    expect(snapshot).not.toHaveProperty('ignored')
  })

  it('não gera snapshot vazio de localStorage', () => {
    const dir = tempDir('piano-ls-empty-')
    expect(writeBrowserStorageSnapshot({}, dir)).toBeNull()
    expect(writeBrowserStorageSnapshot({ other: 'x' }, dir)).toBeNull()
  })
})
