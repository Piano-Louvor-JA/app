# Contribuindo — app (desktop Electron)

## Fluxo de branch (padrão da org)

1. Branch de feature a partir de `staging`
2. PR com base **staging**
3. Checks obrigatórios: Quality Gate, PR Pre-review, CodeQL (javascript-typescript), CodeQL (actions) e Codex Review Complete
4. Em `staging` o merge é humano e não exige aprovação formal
5. `staging → main` é a promoção, com uma aprovação humana

## Desenvolvimento

```bash
npm ci
npm run type-check
npm test
npm run test:regression
npm run build
npx playwright test
```

Não há script `lint` nem `typecheck`. O CI só executa o Biome quando existe `biome.json` ou `biome.jsonc`.

## Regras

- Commits em conventional commits (`feat:`, `fix:`, `chore:`...)
- Updater e notas de release são superfície sensível (ver SECURITY.md)
- PRs grandes demais (>400 linhas) atrasam review — quebrar em peças
