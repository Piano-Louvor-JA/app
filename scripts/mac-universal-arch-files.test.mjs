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
  assert.deepEqual(arch, ['universal'])
  assert.equal(
    minimatch(oxcParserArm64, mac.x64ArchFiles, { matchBase: true }),
    true,
  )
  assert.equal(
    minimatch(electronFramework, mac.x64ArchFiles, { matchBase: true }),
    false,
  )
})
