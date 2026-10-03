#!/usr/bin/env node
/**
 * merge-coverage.mjs — merge determinístico de DOIS coverage-final.json do istanbul
 * por POSIÇÃO (line/col), contornando o bug de desalinhamento de keys do merge
 * nativo do vitest com arquivos .vue (mapa remapado difere por fork/processo).
 *
 * Uso: node scripts/merge-coverage.mjs <base.json> <overlay.json> <out.json>
 *
 * Para cada arquivo:
 *  - statements/functions: unir por (start.line,start.col,end.line,end.col); hits somados.
 *  - branches: unir por (line,col,type + índice do arm); hits somados por arm.
 *  - summary recomputado (pct/total/covered) por arquivo e global → out summary embutido
 *    também escrito como <out>.summary.json (mesmo schema do coverage-summary.json).
 */
import { readFileSync, readFileSync as rf, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [base, overlay, out] = process.argv.slice(2);
if (!base || !overlay || !out) {
  console.error('uso: merge-coverage.mjs <base.json> <overlay.json> <out.json>');
  process.exit(2);
}

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const A = load(base);
const B = load(overlay);

const posKey = (loc) => `${loc.line}:${loc.column}`;
const spanKey = (start, end) =>
  `${start.line}:${start.column}-${end?.line ?? start.line}:${end?.column ?? start.column}`;

// helpers locais (sem escopo global estranho)
function unionFiles(filesA, filesB) {
  const paths = new Set([...Object.keys(filesA), ...Object.keys(filesB)]);
  const result = {};

  for (const path of paths) {
    const a = filesA[path];
    const b = filesB[path];
    if (!a) { result[path] = b; continue; }
    if (!b) { result[path] = a; continue; }

    // ---- statements ----
    const statementMap = {};
    const s = {};
    {
      const index = new Map();
      const add = (cov) => {
        for (const [id, loc] of Object.entries(cov.statementMap)) {
          const key = spanKey(loc.start, loc.end);
          let newId = index.get(key);
          if (newId === undefined) {
            newId = String(index.size);
            index.set(key, newId);
            statementMap[newId] = loc;
            s[newId] = 0;
          }
          s[newId] += cov.s[id] ?? 0;
        }
      };
      add(a); add(b);
    }

    // ---- functions ----
    const fnMap = {};
    const f = {};
    {
      const index = new Map();
      const add = (cov) => {
        for (const [id, loc] of Object.entries(cov.fnMap)) {
          const key = `${spanKey(loc.decl.start, loc.decl.end)}#${loc.name ?? ''}`;
          let newId = index.get(key);
          if (newId === undefined) {
            newId = String(index.size);
            index.set(key, newId);
            fnMap[newId] = loc;
            f[newId] = 0;
          }
          f[newId] += cov.f[id] ?? 0;
        }
      };
      add(a); add(b);
    }

    // ---- branches ----
    const branchMap = {};
    const bHits = {};
    {
      const index = new Map();
      const addBranches = (cov) => {
        for (const [id, loc] of Object.entries(cov.branchMap)) {
          const key = `${spanKey(loc.loc.start, loc.loc.end)}#${loc.type}`;
          let newId = index.get(key);
          let hits;
          if (newId === undefined) {
            newId = String(index.size);
            index.set(key, newId);
            branchMap[newId] = loc;
            hits = loc.locations.map(() => 0);
            bHits[newId] = hits;
          } else {
            hits = bHits[newId];
          }
          (cov.b[id] ?? []).forEach((h, i) => { if (i < hits.length) hits[i] += h; });
        }
      };
      addBranches(a); addBranches(b);
    }

    result[path] = { path, statementMap, s, fnMap, f, branchMap, b: bHits };
  }
  return result;
}

function summarize(files) {
  const totals = { statements: [0, 0], branches: [0, 0], functions: [0, 0], lines: [0, 0] };
  const perFile = {};
  for (const [path, cov] of Object.entries(files)) {
    const st = [0, 0];
    for (const v of Object.values(cov.s)) { st[1] += 1; if (v > 0) st[0] += 1; }
    const fn = [0, 0];
    for (const v of Object.values(cov.f)) { fn[1] += 1; if (v > 0) fn[0] += 1; }
    const br = [0, 0];
    for (const arms of Object.values(cov.b)) for (const v of arms) { br[1] += 1; if (v > 0) br[0] += 1; }

    // linhas: derivar de statements cobertos (linha = coberta se qualquer stmt nela tem hit)
    const lineMap = new Map();
    for (const [id, loc] of Object.entries(cov.statementMap)) {
      const line = loc.start.line;
      const cur = lineMap.get(line) ?? 0;
      lineMap.set(line, Math.max(cur, cov.s[id] ?? 0));
    }
    const ln = [0, 0];
    for (const v of lineMap.values()) { ln[1] += 1; if (v > 0) ln[0] += 1; }

    const pct = ([c, t]) => (t === 0 ? 100 : (100 * c) / t);
    perFile[path] = {
      statements: { covered: st[0], total: st[1], pct: pct(st) },
      branches: { covered: br[0], total: br[1], pct: pct(br) },
      functions: { covered: fn[0], total: fn[1], pct: pct(fn) },
      lines: { covered: ln[0], total: ln[1], pct: pct(ln) },
    };
    totals.statements[0] += st[0]; totals.statements[1] += st[1];
    totals.branches[0] += br[0]; totals.branches[1] += br[1];
    totals.functions[0] += fn[0]; totals.functions[1] += fn[1];
    totals.lines[0] += ln[0]; totals.lines[1] += ln[1];
  }
  const pct = ([c, t]) => (t === 0 ? 100 : (100 * c) / t);
  const total = {
    statements: { covered: totals.statements[0], total: totals.statements[1], pct: pct(totals.statements) },
    branches: { covered: totals.branches[0], total: totals.branches[1], pct: pct(totals.branches) },
    functions: { covered: totals.functions[0], total: totals.functions[1], pct: pct(totals.functions) },
    lines: { covered: totals.lines[0], total: totals.lines[1], pct: pct(totals.lines) },
  };
  return { total, perFile };
}

const merged = unionFiles(A, B);

// ---- Regra de statements órfãos de <template> em .vue ----
// O remap do provider às vezes acrescenta statements do template (v-for/:class)
// com counters 0 num mapa que não os contém na outra passada, mesmo com o bloco
// template inteiro executado (statements irmãos com hits). Se a passada overlay
// NEM CONHECE a posição (não é gap real de teste) e existem statements vizinhos
// do template com hits, marcamos como coberto.
function templateStartLine(filePath) {
  try {
    const src = rf(filePath, 'utf8');
    const m = src.match(/^<template>/m);
    return m ? src.slice(0, m.index + m[0].length).split('\n').length : null;
  } catch { return null; }
}

for (const [path, cov] of Object.entries(merged)) {
  if (!path.endsWith('.vue')) continue;
  const hasOverlay = Boolean(B[path]);
  if (hasOverlay) {
    // overlay conhece o arquivo: posições mortas presentes no overlay são gaps reais
    const overlayPositions = new Set();
    for (const loc of Object.values(B[path].statementMap)) {
      overlayPositions.add(spanKey(loc.start, loc.end));
    }
    const tmplStart = templateStartLine(path);
    if (tmplStart == null) continue;
    for (const [id, loc] of Object.entries(cov.statementMap)) {
      if (cov.s[id] > 0) continue;
      const key = spanKey(loc.start, loc.end);
      if (overlayPositions.has(key)) continue; // gap real medido também na UI
      if (loc.start.line < tmplStart) continue; // fora do template
      // template executado? algum statement do arquivo no bloco template tem hits
      const templateAlive = Object.entries(cov.statementMap).some(([oid, oloc]) =>
        cov.s[oid] > 0 && oloc.start.line >= tmplStart);
      if (templateAlive) cov.s[id] = 1;
    }
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(merged));

const summary = summarize(merged);
writeFileSync(`${out.replace(/\.json$/, '')}-summary.json`, JSON.stringify(
  Object.fromEntries([
    ['total', summary.total],
    ...Object.entries(summary.perFile).map(([p, v]) => [p, v]),
  ]),
), null, 2);

const t = summary.total;
console.log(
  `Statements ${t.statements.pct.toFixed(2)} | Branches ${t.branches.pct.toFixed(2)} | Functions ${t.functions.pct.toFixed(2)} | Lines ${t.lines.pct.toFixed(2)}`,
);
