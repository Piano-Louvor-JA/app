import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

for (const locale of ['pt-BR', 'en', 'es']) {
  const source = await readFile(new URL(`../src/modules/sync/locales/${locale}.ts`, import.meta.url), 'utf8');
  const messages = Function(source.replace('export default', 'return'))();

  assert.equal(typeof messages.sync.downloadQueue?.title, 'string', `${locale}: sync.downloadQueue.title`);
  assert.equal(typeof messages.sync.downloadQueue?.clearFinished, 'string', `${locale}: sync.downloadQueue.clearFinished`);
}

console.log('sync download queue locales: OK');
