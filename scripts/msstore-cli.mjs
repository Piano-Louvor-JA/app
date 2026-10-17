#!/usr/bin/env node
// CLI dos workflows Microsoft Store (Gates C/D) — API EXE/MSI oficial.
//
// Uso:
//   node scripts/msstore-cli.mjs status                      → GET /status
//   node scripts/msstore-cli.mjs submission-status <id>      → GET /submission/<id>/status
//   node scripts/msstore-cli.mjs sync-draft <tag> <regex> <packageId>  → PATCH + POST /packages/commit
//   node scripts/msstore-cli.mjs submit <expectedSubmissionId>         → guard + POST /submit
//
// Env obrigatório (via environment protegido, nunca em logs):
//   MSSTORE_TENANT_ID, MSSTORE_CLIENT_ID, MSSTORE_CLIENT_SECRET,
//   MSSTORE_SELLER_ID, MSSTORE_PRODUCT_ID
// Opcional: MSSTORE_GITHUB_REPO (padrão Piano-Louvor-JA/app), GITHUB_TOKEN.
//
// POST nunca é repetido automaticamente. Segredos nunca são impressos.
import { pickSingleAsset, assertHttpsUrl, guardSubmitReady, assertTagMatchesVersion } from './msstore-release-helpers.mjs';

const API_BASE = 'https://api.store.microsoft.com/submission/v1/product';
const TOKEN_URL = (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const SCOPE = 'https://api.store.microsoft.com/.default';

const REQUIRED = ['MSSTORE_TENANT_ID', 'MSSTORE_CLIENT_ID', 'MSSTORE_CLIENT_SECRET', 'MSSTORE_SELLER_ID', 'MSSTORE_PRODUCT_ID'];

function fail(code, message, extra = {}) {
  console.error(JSON.stringify({ error: code, message, ...extra }));
  process.exit(1);
}

function creds() {
  const missing = REQUIRED.filter((k) => !(process.env[k] ?? '').trim());
  if (missing.length) fail('missing_credentials', `Variáveis ausentes: ${missing.join(', ')}`);
  return Object.fromEntries(REQUIRED.map((k) => [k, process.env[k]]));
}

let tokenCache = { token: null, exp: 0 };
async function getToken(c) {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const resp = await fetch(TOKEN_URL(c.MSSTORE_TENANT_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.MSSTORE_CLIENT_ID,
      client_secret: c.MSSTORE_CLIENT_SECRET,
      scope: SCOPE,
    }),
  });
  if (!resp.ok) fail('store_api_error', `Token recusado (HTTP ${resp.status})`, { http_status: resp.status });
  const data = await resp.json();
  tokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function api(c, method, path, body) {
  const token = await getToken(c);
  const resp = await fetch(`${API_BASE}/${c.MSSTORE_PRODUCT_ID}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Seller-Account-Id': c.MSSTORE_SELLER_ID,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const correlationId = resp.headers.get('X-Correlation-ID');
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!resp.ok) {
    fail('store_api_error', String(data.errorMessage ?? data.message ?? `HTTP ${resp.status}`),
      { http_status: resp.status, correlation_id: correlationId, error_code: data.errorCode });
  }
  console.error(`INFO: ${method} ${path} ok (X-Correlation-ID: ${correlationId ?? 'n/d'})`);
  return { data, correlationId };
}

async function releaseAssets(repo, tag) {
  const headers = { Accept: 'application/vnd.github+json' };
  if ((process.env.GITHUB_TOKEN ?? '').trim()) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const resp = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (resp.status === 404) fail('github_asset_not_found', `Release ${tag} não encontrada em ${repo}`);
  if (!resp.ok) fail('github_asset_not_found', `GitHub API HTTP ${resp.status}`);
  return (await resp.json()).assets ?? [];
}

const [command, ...args] = process.argv.slice(2);
const c = creds();
const repo = process.env.MSSTORE_GITHUB_REPO || 'Piano-Louvor-JA/app';

switch (command) {
  case 'status': {
    const { data } = await api(c, 'GET', '/status');
    console.log(JSON.stringify({ isReady: data.isReady ?? null, ongoingSubmissionId: data.ongoingSubmissionId ?? null }));
    break;
  }
  case 'submission-status': {
    const [submissionId] = args;
    if (!submissionId) fail('invalid_input', 'Uso: submission-status <submission_id>');
    const { data } = await api(c, 'GET', `/submission/${submissionId}/status`);
    console.log(JSON.stringify({ publishingStatus: data.publishingStatus ?? null, hasFailed: data.hasFailed ?? null }));
    break;
  }
  case 'sync-draft': {
    const [tag, assetRegex, packageId, packageType = 'exe'] = args;
    if (!tag || !assetRegex || !packageId) {
      fail('invalid_input', 'Uso: sync-draft <tag> <asset_regex> <package_id> [package_type=exe]');
    }
    const assets = await releaseAssets(repo, tag);
    const url = assertHttpsUrl(pickSingleAsset(tag, assetRegex, assets));
    if (!url.toLowerCase().endsWith(`.${packageType}`)) {
      fail('invalid_package_input', `Asset não termina em .${packageType}`);
    }
    const version = assertTagMatchesVersion(tag, JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8')).version);
    const body = {
      packageType,
      packageUrl: url,
      architectures: ['X64'],
      languages: ['pt-BR'],
      isSilentInstall: true,
    };
    if (packageType === 'exe') body.genericDocUrl = `https://github.com/${repo}/releases/tag/v${version}`;
    await api(c, 'PATCH', `/packages/${packageId}`, body);
    const { data: commit } = await api(c, 'POST', '/packages/commit');
    console.log(JSON.stringify({ ok: commit.isSuccess !== false, pollingUrl: commit.pollingUrl ?? null, correlation_id: commit.correlationId ?? null }));
    break;
  }
  case 'submit': {
    const [expectedSubmissionId] = args;
    if (!expectedSubmissionId) fail('invalid_input', 'Uso: submit <expected_submission_id>');
    const { data: status } = await api(c, 'GET', '/status');
    const guardStatus = {
      isReady: status.isReady,
      ongoingSubmissionId: status.ongoingSubmissionId,
      ...(status.draftSubmissionId ? { submissionId: status.draftSubmissionId } : {}),
    };
    guardSubmitReady(guardStatus, expectedSubmissionId);
    // Guard passou com ID esperado; POST único, sem retry.
    const { data, correlationId } = await api(c, 'POST', '/submit');
    console.log(JSON.stringify({ submissionId: data.submissionId ?? null, pollingUrl: data.pollingUrl ?? null, correlation_id: correlationId }));
    break;
  }
  default:
    fail('invalid_input', `Comando desconhecido: ${command}`);
}
