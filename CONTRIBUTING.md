# Contribuindo — app (desktop Electron)

## Fluxo de branch (padrão da org)

1. Branch de feature a partir de `staging`
2. PR com base **staging** (NUNCA direto pra main)
3. CI verde: lint → typecheck → build → regression-gate → quality-gate (+ matrix SO)
4. Review humano antes do merge
5. `staging → main` é release (via PR, depois de validar em homologação)

## Desenvolvimento

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

## Regras

- Commits em conventional commits (`feat:`, `fix:`, `chore:`...)
- Updater e releaseNotes são superfície sensível (ver SECURITY.md)
- PRs grandes demais (>400 linhas) atrasam review — quebrar em peças
