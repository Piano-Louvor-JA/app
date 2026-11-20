// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const FUSE_OFF = /runAsNode["']?\s*[:=]\s*false|RunAsNode\]\s*:\s*false|RunAsNode\s*,\s*false/i

function fusesOff(node, path = 'build') {
  if (!node || typeof node !== 'object') return []
  const found = node.electronFuses?.runAsNode === false ? [`${path}.electronFuses`] : []
  return found.concat(...Object.entries(node).map(([key, value]) => fusesOff(value, `${path}.${key}`)))
}

function filesUnder(dir, exts) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, exts))
    else if (exts.some((ext) => name.endsWith(ext))) out.push(full)
  }
  return out
}

describe('empacotamento da cópia local do YouTube', () => {
  it('o yt-dlp usa o próprio executável do app como Node: nenhum build desliga o fusível RunAsNode', () => {
    expect(fusesOff(pkg.build)).toEqual([])
    const sources = [
      ...filesUnder(join(ROOT, 'scripts'), ['.mjs', '.js', '.cjs']),
      ...filesUnder(join(ROOT, 'build'), ['.mjs', '.js', '.cjs']),
      ...filesUnder(join(ROOT, '.github', 'workflows'), ['.yml', '.yaml']),
      ...filesUnder(join(ROOT, 'packaging'), ['.yml', '.yaml', '.json', '.sh']),
      join(ROOT, 'snap', 'snapcraft.yaml'),
    ]
    const offenders = sources.filter((file) => FUSE_OFF.test(readFileSync(file, 'utf8'))).map((file) => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('a guarda reconhece as formas de desligar o fusível', () => {
    expect(fusesOff({ linux: { electronFuses: { runAsNode: false } } })).toEqual(['build.linux.electronFuses'])
    expect(fusesOff({ electronFuses: { runAsNode: true } })).toEqual([])
    for (const text of ['runAsNode: false', '"runAsNode": false', '[FuseV1Options.RunAsNode]: false', 'FuseV1Options.RunAsNode, false', '-c.electronFuses.runAsNode=false']) {
      expect(text).toMatch(FUSE_OFF)
    }
  })

  it('os módulos do download e o player de duas trilhas entram no pacote', () => {
    expect(pkg.build.files).toContain('electron/**/*')
    const excluded = pkg.build.files.filter((pattern) => pattern.startsWith('!') && /electron\/(online-video|player)/.test(pattern))
    expect(excluded).toEqual([])
    for (const file of ['electron/online-video/manager.mjs', 'electron/online-video/tools.mjs', 'electron/player/dual-track-sync.js', 'electron/player/local-video-player.html']) {
      expect(statSync(join(ROOT, file)).isFile()).toBe(true)
    }
  })
})
