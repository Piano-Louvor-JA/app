# Security Policy

## Versões Suportadas

| Versão | Suportada          |
|--------|--------------------|
| 1.x    | :white_check_mark: |

## Reportando uma Vulnerabilidade

Se você descobrir uma vulnerabilidade de segurança, **NÃO** abra uma issue pública.

Reporte privativamente para rafael.zendron22@gmail.com com:

1. Descrição da vulnerabilidade
2. Passos para reproduzir
3. Impacto possível
4. Sugestão de correção (se houver)

### Tempo de Resposta

- Confirmação de recebimento: até 48h
- Avaliação inicial: até 7 dias
- Correção ou mitigação: depende da severidade (Crítico: 7 dias, Alto: 30 dias, Médio: 90 dias)

### Escopo

- Vulnerabilidades no código da API
- Problemas de autenticação/autorização
- Exposição de dados sensíveis
- Injeção de SQL ou outros ataques no banco

### Fora de Escopo

- Vulnerabilidades em dependências de terceiros sem PoC no nosso código
- Ataques de força bruta ou DoS sem bypass de rate limiting
- Reports de scanners automatizados sem análise manual

## Práticas de Segurança

- Nunca commite secrets, tokens ou credenciais
- Use variáveis de ambiente para configuração sensível
- Valide sempre input do usuário com Zod schemas
- Parâmetros de query com parametrização (better-sqlite3 previne SQL injection)
