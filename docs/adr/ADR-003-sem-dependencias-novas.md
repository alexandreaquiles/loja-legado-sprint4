# ADR-003 · Sem dependências novas de runtime além do Vendure

- **Status:** aceita
- **Time:** loja
- **Mesma decisão no servidor revisor:** `tools/revisor-mcp/data/adrs.json` (id `ADR-003`).

## Contexto

Cada dependência nova passa pela política de supply chain da empresa e atrasa o deploy. Agente de IA adiciona biblioteca com facilidade, às vezes desatualizada ou vulnerável, e às vezes sem usar.

## Decisão

Nenhuma dependência de runtime além das que o Vendure já traz (`@vendure/*`, `better-sqlite3`, `dotenv`). Dependência nova só com aprovação registrada em ADR própria, num PR separado.

## Consequências

- CSV, datas e formatação simples se resolvem com a biblioteca padrão.
- Quem precisar de uma biblioteca abre a ADR antes do código.

## Como é verificada

- Máquina: regra hard `sem-dependencias-novas` em `tools/guardrails.js` (compara `dependencies` do `package.json` com a lista acima).
- CI: `npm ci` falha se o `package-lock.json` não tiver a dependência declarada; o guardrail falha se tiver.
