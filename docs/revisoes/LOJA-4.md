# Revisão da LOJA-4 · `feature/relatorio-descontos` (referência do gabarito)

Branch: `feature/relatorio-descontos` · commit revisado: `5f2e475` (o PR como chegou) · spec: `node tools/board-mcp/cli.js show LOJA-4` · sessão sem hooks (`claude --settings .claude/settings.sem-hooks.json`) · régua: `docs/regras-do-time.md` e `docs/adr/`.

Esta é a revisão de referência. Ela registra as duas passagens da `/review-pr`: a primeira para na camada 1; a segunda roda a camada 2 como se os guardrails já estivessem verdes (é o que acontece depois do card 02, quando o agente zera as violações e deixa o resto). Os achados da camada 2 continuam valendo depois do card 02, porque nenhum deles quebra uma regra hard.

**Decisão:** REQUEST_CHANGES

**Camada determinística:** 8 violações hard em 6 regras (`node tools/guardrails.js --ref feature/relatorio-descontos`), testes 27 passados, 0 falhando, 1 pulado (`npm test` na branch). Mais 1 aviso soft (`funcao-longa`). A camada 1 sozinha já decide REQUEST_CHANGES:

- [hard] src/plugins/relatorio/relatorio.ts:3 — sem-segredo (R-02) — chave `sk_live_` no código.
- [hard] src/plugins/relatorio/relatorio.ts:10 — sem-console-log (R-05) — log a cada geração.
- [hard] src/plugins/relatorio/relatorio.ts:61 — sem-console-log (R-05) — o `catch` imprime a chave.
- [hard] package.json:1 — sem-dependencias-novas (ADR-003) — `csv-stringify` declarada e nem usada.
- [hard] src/plugins/relatorio/relatorio.ts:5 — dinheiro-em-centavos (ADR-001) — `19.90` em reais.
- [hard] src/plugins/relatorio/relatorio.ts:42 — dinheiro-em-centavos (ADR-001) — `toFixed(2)`.
- [hard] test/relatorio.test.ts:5 — teste-com-assert — `expect(true).toBe(true)`.
- [hard] test/relatorio.test.ts:15 — sem-skip — o único teste de ordenação está pulado.

**Camada de julgamento** (`revisor-codigo` com a issue e o diff; o que a máquina não pega):

- [soft] src/plugins/relatorio/relatorio.plugin.ts:15 — R5 da spec, "consulta filtra no banco" — `findAll(ctx, { take: 500 })` e o filtro de data no `.filter()` da linha 18: com milhares de pedidos por mês, o relatório perde pedidos do período sem erro nenhum. Filtro `orderPlacedAt between` na consulta e laço `skip`/`take` até `totalItems`.
- [soft] src/plugins/relatorio/relatorio.ts:47 — R4 da spec, CSV seguro — escapa vírgula, aspas e quebra de linha, mas não neutraliza campo que começa com `=`, `+`, `-`, `@`: um e-mail ou código legado como `=HYPERLINK(...)` vira fórmula na planilha do financeiro.
- [soft] src/plugins/relatorio/relatorio.plugin.ts:21 — restrição "o relatório não sai da loja" (R-02, LGPD) — `{ enviar: true }` manda o CSV, com o e-mail de cada cliente, para um serviço externo (relatorio.ts:57) a cada consulta, com a chave no header (relatorio.ts:59), sem `await` e sem ADR de integração.
- [soft] src/plugins/relatorio/relatorio.ts:12 — R1 da spec, "exatamente as colunas cliente,codigo,usos" — `valorEstimado` foi inventado (e em reais).
- [soft] test/relatorio.test.ts:10 — regras soft de teste — `expect(csv.length > 0).toBe(true)` passa na regra `teste-com-assert` e não prova o cabeçalho; não há teste de R2 (normalização), R4 (CSV seguro) nem de R5 pelo resolver.
- [soft] src/plugins/relatorio/relatorio.plugin.ts:13 — "nada de any" — `args: any` (e `o: any` na linha 18); o schema diz `fim: DateTime!`, mas o código inventa um padrão com `new Date()` na linha 17 e ainda contém um `TODO` (linha 14) que admite o bug da paginação.
- [soft] src/plugins/relatorio/relatorio.ts:17 — spec — o e-mail vai para minúsculas, o que a spec não pede (dois clientes podem virar um). Perguntar à PO antes de manter.
- [soft] src/plugins/relatorio/relatorio.ts:9 — aviso `funcao-longa` — 56 linhas que fazem tudo à mão; quebrar em normalizar, contar, ordenar e escrever o campo, cada um com teste. O problema não é o número de linhas: é que ninguém consegue testar R2 e R4 isoladamente.

**Vira hard?**

- paginação com `take` fixo e filtro depois: não, porque decidir se a consulta traz tudo exige entender a query; um check de `take: \d{3,}` daria falso positivo em consultas limitadas de propósito. Fica soft, com exemplo em `docs/regras-do-time.md`.
- CSV sem neutralizar fórmula: não como regex (o escape pode estar em qualquer lugar); sim como teste: o critério de aceite exige o caso `=HYPERLINK` e o `teste-com-assert` garante que ele compara algo.
- `fetch` dentro de plugin: sim, check `sem-fetch-em-plugin`, regex `\bfetch\(` no alvo `plugins`; na `main` dá 0 (conferido com `--ref main`).
- dado pessoal para fora: não, porque exige saber o que é dado pessoal e para onde vai; o `sem-fetch-em-plugin` pega o caminho mais comum.
- campo fora da spec (`valorEstimado`): não, porque depende da spec de cada issue; é o primeiro item do revisor.
- `expect` fraco: não, porque "fraco" é julgamento; a regra hard só pega o caso degenerado.
- `any` explícito no plugin: sim, check `sem-any`, regex `:\s*any\b|\bas any\b` no alvo `plugins` (no alvo `src` pegaria o `registro.ts` da `main`).
- `TODO` e `new Date()` no plugin: sim, checks `sem-todo` e `sem-new-date-em-promocao` no alvo `plugins` (no alvo `src` pegariam o legado de `src/misc`, `src/stuff` e `src/utils`).
- função longa: não; continua aviso soft (calibração em `docs/regras-do-time.md`).

As quatro regras que viram hard estão prontas em `docs/intermediaria/regras-referencia.md`, com o resultado na `main` e no PR.

Limitação registrada: o `revisor-codigo` roda com `model: sonnet`, do mesmo fornecedor do modelo que escreveu o PR. Os achados acima têm `arquivo:linha` e regra escrita; mesmo assim, a decisão é de quem revisa.
