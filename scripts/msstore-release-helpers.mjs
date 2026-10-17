// Helpers puros dos workflows Microsoft Store (Gates C/D do PLAN msstore-mcp).
// Sem rede, sem segredos: funções puras testáveis; os workflows as consomem
// via node --input-type=module ou import direto.
//
// Contrato (SPEC frozen 2026-10-15):
// - asset da release: exatamente um match da regex, URL HTTPS pública
// - submit: só quando isReady === true, sem submissão em curso e
//   submission ID igual ao esperado informado pelo operador.

export function assertHttpsUrl(url) {
  const value = String(url ?? '');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`URL inválida (redigida)`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`URL do asset deve ser HTTPS pública (recebido: ${parsed.protocol}//…, redigido)`);
  }
  return value;
}

export function pickSingleAsset(tag, assetRegex, assets) {
  const re = new RegExp(assetRegex);
  const matches = (assets ?? []).filter((a) => re.test(a.name ?? ''));
  if (matches.length === 0) {
    throw new Error(`github_asset_not_found: nenhum asset casa com ${assetRegex} na release ${tag}`);
  }
  if (matches.length > 1) {
    const names = matches.map((a) => a.name).join(', ');
    throw new Error(`github_asset_ambiguous: múltiplos assets (${matches.length}) casam com ${assetRegex} na release ${tag}: ${names}. Refine a regex.`);
  }
  return assertHttpsUrl(matches[0].browser_download_url);
}

// status: resposta de GET /status (API EXE/MSI). expectedSubmissionId:
// ID que o operador declara ser o draft a certificar.
export function guardSubmitReady(status, expectedSubmissionId) {
  if (status?.isReady !== true) {
    throw new Error(`submit recusado: isReady != true (isReady=${status?.isReady})`);
  }
  if (status?.ongoingSubmissionId) {
    throw new Error(`submit recusado: submissão em curso (${status.ongoingSubmissionId})`);
  }
  const actual = status?.submissionId ?? status?.draftSubmissionId;
  if (actual && expectedSubmissionId && actual !== expectedSubmissionId) {
    throw new Error(`submit recusado: submission id divergente (esperado ${expectedSubmissionId}, atual ${actual})`);
  }
  if (!actual && !expectedSubmissionId) {
    throw new Error('submit recusado: sem submission id esperado informado e sem ID no status');
  }
  return true;
}

// Resolve a versão a partir da tag e valida contra package.json.
export function assertTagMatchesVersion(tag, packageVersion) {
  const version = String(tag ?? '').trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`tag semver inválida: ${tag}`);
  }
  if (version !== String(packageVersion ?? '').trim()) {
    throw new Error(`versão do pacote (${packageVersion}) difere da tag (${version})`);
  }
  return version;
}
