# E2E com APIs seguras

O Playwright valida as URLs antes das specs. Todos os canais precisam de URL explícita: `VITE_URL_DATABASE`, `VITE_URL_FILES` e `VITE_PALCO_API_URL`. `PIANO_API_BASE_URL` e o CSV `VITE_API_FALLBACK_URLS`, quando configurados, também são validados.

A configuração usa o carregador real do Vite no modo development, incluindo `.env`, `.env.local`, `.env.development`, `.env.development.local`, expansão de variáveis e precedência do ambiente do processo. Produção, inclusive hostname com ponto final, aborta. Valores vazios que reativariam os defaults de produção também abortam. Erros não imprimem credenciais presentes nas URLs.

Para a suíte mockada deste repositório:

```sh
VITE_URL_DATABASE=http://localhost:3100/json_db \
VITE_URL_FILES=http://localhost:3100/file \
VITE_PALCO_API_URL=http://localhost:3100 \
VITE_API_FALLBACK_URLS=http://localhost:3100 \
npx playwright test
```

As specs interceptam essas URLs locais. O servidor Vite é iniciado novamente a cada execução para não reutilizar um processo com configuração antiga. Para testes com API de staging, configure todos os canais explicitamente; as specs mockadas acima continuam usando URLs locais.

Se a máquina atingir o limite de watchers, acrescente `CHOKIDAR_USEPOLLING=true` ao comando.
