// Testes do script msstore-release-helpers.mjs — resolução de asset e guards.
// Gate C/D: seleção única de asset, URL HTTPS, recusa de submit sem isReady/ID.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const script = join(process.cwd(), 'scripts', 'msstore-release-helpers.mjs');

const {
  pickSingleAsset,
  assertHttpsUrl,
  guardSubmitReady,
} = await import(`file://${script}`);

const asset = (name) => ({
  name,
  browser_download_url: `https://github.com/Piano-Louvor-JA/app/releases/download/v1.31.0/${encodeURIComponent(name)}`,
});

test('pickSingleAsset resolve exatamente um .exe', () => {
  const url = pickSingleAsset('v1.31.0', 'Setup\\.exe$', [asset('LouvorJA-PIANO-1.31.0-Setup.exe'), asset('SHA256SUMS-win-x64')]);
  assert.ok(url.startsWith('https://'));
  assert.ok(url.endsWith('LouvorJA-PIANO-1.31.0-Setup.exe'));
});

test('pickSingleAsset falha com zero matches', () => {
  assert.throws(() => pickSingleAsset('v1.31.0', 'naoexiste\\.exe$', [asset('x.exe')]), /nenhum asset/i);
});

test('pickSingleAsset falha com múltiplos matches', () => {
  assert.throws(() => pickSingleAsset('v1.31.0', 'Setup\\.exe$', [asset('a-Setup.exe'), asset('b-Setup.exe')]), /m[úu]ltiplos assets/i);
});

test('assertHttpsUrl recusa http e protocolos estranhos', () => {
  assert.throws(() => assertHttpsUrl('http://x/y.exe'), /https/i);
  assert.throws(() => assertHttpsUrl('file:///etc/passwd'), /https/i);
  assert.equal(assertHttpsUrl('https://ok/x.exe'), 'https://ok/x.exe');
});

test('guardSubmitReady exige isReady true', () => {
  assert.throws(() => guardSubmitReady({ isReady: false, ongoingSubmissionId: null }, 's-1'), /isReady/i);
  assert.throws(() => guardSubmitReady({ isReady: true, ongoingSubmissionId: 's-9' }, 's-1'), /em curso/i);
  assert.throws(() => guardSubmitReady({ isReady: true, ongoingSubmissionId: null, submissionId: 's-2' }, 'other'), /divergente/i);
});

test('guardSubmitReady aceita status pronto com ID igual', () => {
  const status = { isReady: true, ongoingSubmissionId: null, submissionId: 's-1' };
  assert.doesNotThrow(() => guardSubmitReady(status, 's-1'));
});

test('assertTagMatchesVersion valida tag contra package.json', async () => {
  const { assertTagMatchesVersion } = await import(`file://${script}`);
  assert.equal(assertTagMatchesVersion('v1.31.0', '1.31.0'), '1.31.0');
  assert.throws(() => assertTagMatchesVersion('v1.31.0', '1.30.0'), /difere/i);
  assert.throws(() => assertTagMatchesVersion('banana', '1.31.0'), /semver/i);
});
