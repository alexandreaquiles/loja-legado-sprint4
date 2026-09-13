# ADR-006 · `src/misc/preco.ts` congelado; frete da loja vem da Promotion

- **Status:** aceita
- **Time:** loja
- **Mesma decisão no servidor revisor:** `tools/revisor-mcp/data/adrs.json` (id `ADR-006`); regra de revisão `R-03`.

## Contexto

`frete()` em `src/misc/preco.ts` alimenta a planilha mensal do financeiro. Em 2025 uma mudança ali para atender uma campanha desalinhou três meses de relatório.

## Decisão

Não alterar `src/misc/preco.ts`. Frete grátis e descontos de frete na loja são Promotions com as actions e conditions nativas (`free_shipping`, `minimum_order_amount`) mais `cupom_unico`. Se o relatório precisar refletir um cupom, quem decide é o financeiro, em ADR própria.

## Como é verificada

- Revisão: arquivo fora do `files` da issue. Os guardrails não olham `src/misc/` de propósito (legado; ver `docs/regras-do-time.md`).
