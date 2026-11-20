import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const loc = (start, end) => ({ start: { line: 1, column: start }, end: { line: 1, column: end } });
const file = (map, hits) => ({ path: 'fixture.js', statementMap: map, s: hits, fnMap: {}, f: {}, branchMap: {}, b: {} });
function merge(a, b) {
  const dir = mkdtempSync(join(tmpdir(), 'coverage-merge-test-'));
  try {
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ 'fixture.js': a }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ 'fixture.js': b }));
    execFileSync(process.execPath, [join(process.cwd(), 'scripts/merge-coverage.mjs'), join(dir, 'a.json'), join(dir, 'b.json'), join(dir, 'out.json')]);
    return JSON.parse(readFileSync(join(dir, 'out-summary.json'), 'utf8')).total;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('uncovered statement on a covered source line remains uncovered', () => {
  const a = file({ 0: loc(0, 10), 1: loc(11, 20) }, { 0: 1, 1: 0 });
  assert.equal(merge(a, a).statements.pct, 50);
});
test('a nested uncovered span present in only one pass remains uncovered', () => {
  const a = file({ 0: loc(0, 30), 1: loc(10, 20) }, { 0: 1, 1: 0 });
  const b = file({ 5: loc(0, 30) }, { 5: 1 });
  assert.equal(merge(a, b).statements.pct, 50);
});
test('a matching span covered in the second pass is correctly counted', () => {
  const a = file({ 0: loc(0, 10) }, { 0: 0 });
  const b = file({ 7: loc(0, 10) }, { 7: 1 });
  assert.equal(merge(a, b).statements.pct, 100);
});
