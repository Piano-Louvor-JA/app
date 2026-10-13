import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

assert.ok(
  packageJson.dependencies['tldts-experimental'],
  'tldts-experimental precisa ser dependência runtime: @cliqz/adblocker-electron importa-o no Electron empacotado',
);

console.log('desktop runtime dependencies: OK');
