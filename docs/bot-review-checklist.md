# Checklist do Bot de Review — regras de APPROVE

> Este arquivo define as regras que o bot de IA (`pianolouvorja`) usa para decidir entre
> APPROVE e COMMENT numa PR. Versionado aqui — qualquer mudança passa por PR e é auditável.

## O bot dá APPROVE (com label `ia-approved`) SÓ SE TODAS as condições:

1. **Tamanho**: diff ≤ 400 linhas alteradas E ≤ 15 arquivos
2. **Zona vermelha livre**: nenhum arquivo tocando:
   - `auth`/`authentication`/`authorization` (login, sessão, permissões)
   - `migration`/`schema` (mudança de banco)
   - `payment`/`billing`
   - config de produção (`.env` prod, `docker-compose` de prod, `Caddyfile`)
3. **CI completo**: todos os checks verdes (não só auto-labeler)
4. **Sem problema crítico/alto** no review da IA (bug de lógica, falha de segurança, quebra de contrato da API)
5. **Testes**: se a PR toca lógica de negócio, novos testes cobrem o caso

## O bot dá COMMENT + label `ia-changes-requested` quando:

- Qualquer item acima falha
- Encontra bug de lógica ou risco de segurança (mesmo fora da zona vermelha)
- Duplica lógica que já existe no repo (blindagem anti-redundância)

## O bot NUNCA:

- Aprova PR de zona vermelha (mesmo pequena) — review humano direto
- Mergea qualquer coisa
- Aprova com veredito ambíguo ("talvez", "depende") — nessas vira COMMENT

## Labels

| Label | Significado | Ação esperada |
|---|---|---|
| `ia-approved` | checklist zerado | humano revisa rápido e aprova |
| `ia-changes-requested` | problema encontrado | autor corrige antes do review humano |
| `ia-reviewed` | passou pelo bot (informativo) | — |

## O approve humano (Ezequias) é SEMPRE obrigatório para o merge.
## O approve do bot é sinal de priorização, não autorização de merge.

---
*Regras propostas 03/10/2026. Mudanças por PR neste arquivo.*
