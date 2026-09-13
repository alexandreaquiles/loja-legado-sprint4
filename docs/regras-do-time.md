# Regras do time loja (conhecimento "as code")

Este arquivo é a fonte das regras. Cada regra tem um dono de verificação: **máquina** (vira item em `tools/guardrails.js`, roda no hook e no CI, bloqueia o PR) ou **revisor** (humano ou o subagente `revisor` via `/review-pr`, porque exige julgamento).

## Regras hard (máquina, nunca quebrar)

| id | regra | como a máquina verifica |
|---|---|---|
| sem-console-log | Nenhum `console.log` em `src/` | regex |
| sem-segredo | Nenhuma credencial no código | regex de chaves, senhas e URLs com senha |
| sem-dependencias-novas | Sem dependências de runtime além das do Vendure (ADR-003) | `package.json` contra a lista do create |
| funcao-curta | Funções com no máximo 40 linhas | contagem de linhas por função |
| dinheiro-em-centavos | Dinheiro em centavos inteiros (ADR-001) | regex de `toFixed(2)` e literais com 2 casas |
| teste-com-assert | Todo `it()`/`test()` compara algo | `expect(...)` real dentro do bloco |
| sem-skip | Nenhum teste pulado | regex de `it.skip` / `test.skip` / `todo` |

Quer adicionar uma regra hard? Adicione um item em `REGRAS` no `tools/guardrails.js`. Se não dá para escrever o check, não é hard: vai para a lista abaixo.

## Regras soft (revisão, exigem julgamento)

- O teste exercita o **comportamento** descrito na spec, não a implementação. Cobre limites (0, 1, máximo) e o caminho de erro.
- Antes de escrever uma função nova, procurar equivalente existente (`src/plugins/*/regras.ts`, e o próprio Vendure). Não duplicar normalização de sigla ou código, cálculo de subtotal, formatação.
- Decisões de arquitetura seguem as ADRs aceitas (centavos, teto de 30%, sem dependências novas) e as regras do Vendure (plugin por domínio, nunca reimplementar a `Promotion`, actions puras). Mudança de ADR é PR separado.
- Erros de negócio como `ErrorResult` do GraphQL (padrão do Vendure), nunca `throw` com mensagem solta; mensagens não expõem dados internos.
- Nada de `any` explícito no código de produção; parâmetros validados na borda (schema GraphQL, args da action), não no meio.
- Mock só de fronteira externa (rede, relógio, `OrderService` via injector falso). Não mockar as próprias regras em `regras.ts`.
- Segurança lógica: o código não expõe segredo por outro caminho (log, mensagem de erro, retorno).

## O que só produção mostra (guardrails do outro lado)

- Alerta em latência e erro 5xx por rota; SLA escrito.
- Deploy ≠ release: feature flag para cupom novo, rollout gradual (1% → 10% → 100%).
- Rollback automatizado quando a taxa de erro sobe após deploy.

## Como esta lista evolui

Quando um bug passar pela revisão, a pergunta é: dava para virar regra hard? Se sim, entra no `guardrails.js` no mesmo PR da correção. Se não, entra aqui com um exemplo. Regra que ninguém quebra há 6 meses pode ser removida.
