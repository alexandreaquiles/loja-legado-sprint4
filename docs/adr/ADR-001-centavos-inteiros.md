# ADR-001 · Valores monetários em centavos inteiros

- **Status:** aceita
- **Time:** loja
- **Mesma decisão no servidor revisor:** `tools/revisor-mcp/data/adrs.json` (id `ADR-001`). Substitui a ADR-005 (reais com float, depreciada).

## Contexto

Cálculos com float em reais geraram diferenças de 1 centavo em relatórios do financeiro. O Vendure já trabalha em minor units (centavos).

## Decisão

Todo valor monetário é inteiro em centavos. Arredondar com `Math.round` somente no fim do cálculo. Nunca `reais * 100` nem `centavos / 100` com float.

## Consequências

- Formatar em reais (R$ 19,90) é trabalho de quem exibe, não de quem calcula.
- Relatório que precise de valor recebe e devolve centavos inteiros.

## Como é verificada

- Máquina: regra hard `dinheiro-em-centavos` em `tools/guardrails.js` (pega `toFixed(2)` e literais com duas casas decimais).
- Revisão: conta com float que não tem literal (ex.: `valor / 100`) só o revisor pega.
