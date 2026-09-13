# ADR-002 · Teto de 30% de desconto para promoções percentuais

- **Status:** aceita
- **Time:** loja
- **Mesma decisão no servidor revisor:** `tools/revisor-mcp/data/adrs.json` (id `ADR-002`); regra de revisão `R-01`.

## Contexto

Em 2022 um cupom de 100% ficou ativo num fim de semana e a loja perdeu R$ 40 mil.

## Decisão

Promoções percentuais aplicam no máximo 30%, mesmo que o admin configure mais. O teto vive no código do plugin `cupons` (action `desconto_percentual_com_teto`), não na configuração.

## Como é verificada

- Testes: `test/cupom.test.ts` (LOJA-1).
- Revisão: as actions nativas do Vendure continuam sem teto; o caminho que contorna a regra é assunto de revisão (e do Desafio da Sprint 1).
