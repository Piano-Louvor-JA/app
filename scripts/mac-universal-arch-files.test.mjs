import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const { minimatch } = require('minimatch')

const oxcParserArm64 =
  'Contents/Resources/app.asar.unpacked/node_modules/@oxc-parser/binding-darwin-arm64/parser.darwin-arm64.node'
const electronFramework =
  'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'

test('DMG universal autoriza .node idêntico e ainda lipa o framework do Electron', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const mac = pkg.build.mac
  const arch = mac.target.flatMap((target) => target.arch ?? [])
  assert.deepEqual([...new Set(arch)], ['universal'])
  assert.equal(
    minimatch(oxcParserArm64, mac.x64ArchFiles, { matchBase: true }),
    true,
  )
  assert.equal(
    minimatch(electronFramework, mac.x64ArchFiles, { matchBase: true }),
    false,
  )
})

test('macOS gera ZIP universal que o electron-updater consegue selecionar', () => {
  const { findFile } = require('electron-updater/out/providers/Provider.js')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const files = pkg.build.mac.target.map(({ target, arch }) => ({
    url: new URL(`https://example.test/LouvorJA-PIANO-1.0.0-${arch[0]}.${target}`),
    info: { url: `LouvorJA-PIANO-1.0.0-${arch[0]}.${target}` },
  }))
  const zip = findFile(files, 'zip', ['pkg', 'dmg'])
  assert.ok(zip, 'Sem ZIP, MacUpdater falha com ERR_UPDATER_ZIP_FILE_NOT_FOUND')
  assert.match(zip.url.pathname, /universal\.zip$/)
})

test('publicação macOS inclui ZIP e blockmap na mesma release do manifesto', () => {
  const workflow = readFileSync(join(root, '.github/workflows/build-macos.yml'), 'utf8')
  assert.match(workflow, /dist-electron\/\*\.zip\b/)
  assert.match(workflow, /dist-electron\/\*\.zip\.blockmap/)
  assert.match(workflow, /validate-release-artifacts\.mjs mac/)
})
