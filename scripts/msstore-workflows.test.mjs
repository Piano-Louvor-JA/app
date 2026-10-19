import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const wf = (name) => readFileSync(join(root, '.github/workflows', name), 'utf8');

const parseYaml = (text) => {
  const dir = execFileSync('mktemp', ['-d']).toString().trim();
  const path = join(dir, 'w.yml');
  writeFileSyncSafe(path, text);
  const out = execFileSync('python3', ['-c', PY_PARSE, path]).toString();
  return JSON.parse(out);
};
import { writeFileSync as writeFileSyncSafe } from 'node:fs';

const triggersOf = (parsed) => parsed.on ?? parsed.true ?? parsed['true'];

const PY_PARSE = `
import json, sys
try:
    import yaml
except ImportError:
    sys.exit(3)
with open(sys.argv[1]) as f:
    print(json.dumps(yaml.safe_load(f)))
`;

test('all workflow YAML files parse', () => {
  for (const name of ['build-windows.yml', 'sync-msstore-draft.yml', 'submit-msstore-certification.yml']) {
    const parsed = parseYaml(wf(name));
    assert.ok(parsed.name, `${name} deve ter name`);
  }
});

// ---------------- Gate B: workflow de tag sem segredo Store ----------------

test('build-windows (tag) não referencia segredos de submissão da Store', () => {
  const text = wf('build-windows.yml');
  for (const banned of ['AZURE_AD_APPLICATION_SECRET', 'SELLER_ID', 'MS_STORE_PRODUCT_ID',
    'api.store.microsoft.com', 'msstore publish', 'login.microsoftonline.com']) {
    assert.ok(!text.includes(banned), `build-windows.yml não deve conter ${banned}`);
  }
});

test('build-windows não dispara workflow de Store automaticamente', () => {
  const text = wf('build-windows.yml');
  assert.ok(!text.includes('msstore-release.yml'), 'sem dispatch encadeado de workflow Store');
  assert.ok(!text.includes('sync-msstore-draft'), 'sem dispatch encadeado de sync draft');
  assert.ok(!text.includes('submit-msstore-certification'), 'sem dispatch encadeado de submit');
});

test('msstore-release.yml legado não existe mais (substituído por sync/submit dispatch)', () => {
  assert.throws(() => wf('msstore-release.yml'), 'msstore-release.yml deve ter sido removido');
});

// ---------------- Gate C: sync-msstore-draft ----------------

test('sync-msstore-draft só dispara via workflow_dispatch', () => {
  const parsed = parseYaml(wf('sync-msstore-draft.yml'));
  assert.deepEqual(Object.keys(triggersOf(parsed)), ['workflow_dispatch']);
});

test('sync-msstore-draft usa environment microsoft-store-draft', () => {
  const parsed = parseYaml(wf('sync-msstore-draft.yml'));
  const jobs = Object.values(parsed.jobs);
  const storeJobs = jobs.filter(j => JSON.stringify(j.steps ?? []).includes('msstore-cli'));
  assert.ok(storeJobs.length > 0, 'existe job que chama msstore-cli');
  for (const job of storeJobs) {
    assert.equal(job.environment, 'microsoft-store-draft');
  }
});

test('sync-msstore-draft exige input tag', () => {
  const parsed = parseYaml(wf('sync-msstore-draft.yml'));
  const inputs = triggersOf(parsed).workflow_dispatch.inputs;
  assert.ok(inputs.tag?.required === true, 'input tag obrigatório');
});

// ---------------- Gate D: submit-msstore-certification ----------------

test('submit-msstore-certification só workflow_dispatch e exige expected_submission_id', () => {
  const parsed = parseYaml(wf('submit-msstore-certification.yml'));
  const triggers = triggersOf(parsed);
  assert.deepEqual(Object.keys(triggers), ['workflow_dispatch']);
  const inputs = triggers.workflow_dispatch.inputs;
  assert.ok(inputs.expected_submission_id?.required === true);
});

test('submit-msstore-certification usa environment separado microsoft-store-certification', () => {
  const parsed = parseYaml(wf('submit-msstore-certification.yml'));
  const jobs = Object.values(parsed.jobs);
  assert.ok(jobs.length > 0);
  for (const job of jobs) {
    assert.equal(job.environment, 'microsoft-store-certification');
  }
});

test('nenhum workflow automático referencia POST /submit', () => {
  for (const name of ['build-windows.yml', 'release.yml', 'board-sync.yml', 'ci.yml']) {
    const text = wf(name).replace(/#.*$/gm, '');
    assert.ok(!text.includes('/submit'), `${name} não pode chamar /submit`);
    assert.ok(!text.includes('submit-msstore-certification'), `${name} não pode despachar certificação`);
  }
});
