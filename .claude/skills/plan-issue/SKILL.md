---
name: plan-issue
description: Planeja e executa uma issue do board de ponta a ponta (assumir, obter spec, planejar, implementar, testar, conferir contra a spec) atualizando o estado da issue conforme evolui. Use quando o usuário passar um id de issue (ex.: LOJA-2) ou pedir "a próxima issue não bloqueada".
---

# Planejar e executar uma issue do board

Fluxo do time loja para tirar uma issue do board e entregá-la pronta, testada e conferida contra a spec.
O estado da issue vive no board (MCP `board`), nunca só na sua cabeça.

## 0. Pré-requisitos

- MCP `board` disponível (`mcp__board__*`). Se não estiver, PARE e avise (o servidor precisa estar aprovado: confie na pasta e abra o `claude` de novo).
- Confira a branch com `git branch --show-current`. Nunca trabalhe direto na `main`: se estiver nela, PARE e peça para abrir um worktree (`claude -w loja-2`, branch `worktree-loja-2`).

## 1. Escolher e assumir a issue

- Se o usuário passou um id, use-o.
- Se pediu "a próxima": `mcp__board__list_issues(state="todo", unblocked_only=true)`; a lista vem por prioridade.
- Antes de assumir, `mcp__board__list_issues(state="in_progress")` e compare o campo `files`: se alguma issue em andamento toca os mesmos arquivos que a candidata, NÃO pegue essa; vá para a próxima da lista. Paralelo só entre issues sem arquivos em comum.
- **Assuma na hora**, antes de ler a spec ou planejar: `mcp__board__update_issue_state(id, "in_progress")`. É isso que impede outra sessão de pegar a mesma issue.
- Se o board recusar (já está `in_progress` em outra sessão, bloqueada, ou com `files` em comum com outra em andamento), leia o motivo e volte ao início deste passo com a próxima issue. Se o usuário passou o id, conte o motivo e pare.

## 2. Obter e ler a spec

- `mcp__board__get_issue(id)`.
- Extraia: contexto, regras, restrições, stack e padrões, critérios de aceite, verificação, `files`.
- **Definition of Ready:** se faltar regras, critérios de aceite verificáveis, verificação ou `files`, a issue NÃO está pronta. Mova para `blocked` (`mcp__board__update_issue_state(id, "blocked")`) e deixe um comentário (`mcp__board__add_comment`) com as perguntas que a PO precisa responder. Se o usuário pediu "a próxima", volte ao passo 1. Nunca invente regras para preencher uma spec vaga.

## 3. Planejar

- Releia o `CLAUDE.md` e o `AGENTS.md` (centavos inteiros, action devolve negativo, `pricesIncludeTax`, um plugin por domínio em `src/plugins/<nome>/` com `index.ts` exportando `plugin`, regras puras em `regras.ts`, nunca reimplementar o que a `Promotion` nativa faz, sem dependências).
- Crie uma ToDo list com todas as tarefas, incluindo o arquivo de teste pedido nos critérios de aceite.
- Antes de fechar o plano, releia a spec e garanta: não criar regressão; não criar padrão desalinhado com o projeto; procure um exemplo parecido (`src/plugins/cupons/`, `test/cupom.test.ts` e os exemplos oficiais em `node_modules/@vendure/core/dist/config/promotion/`).
- O plano só toca arquivos de `files`. Se precisar de outro, pergunte antes.

## 4. Implementar

- Respeite a stack, as restrições e o plano. Regras puras em `regras.ts`, objetos do Vendure em `promocoes.ts`, plugin em `<nome>.plugin.ts`, teste em `test/<nome>.test.ts`.
- Nunca edite `package.json` à mão nem instale dependência.
- Atualize a ToDo list conforme avança.

## 5. Testar

- Escreva e rode os testes relacionados (`npm test`). Os hooks do projeto também rodam os testes após cada edição; leia o que eles devolvem.
- Se um teste EXISTENTE quebrar, verifique se foi você. Se sim, analise as causas e **PERGUNTE** antes de mudar o teste: talvez uma regra de negócio não prevista precise ser adicionada. Nunca "conserte" um teste mudando a expectativa para bater com o código novo.

## 6. Conferir contra a spec (gate)

- Escreva um checklist com cada regra (R1, R2, ...) e cada critério de aceite e valide um por um, citando arquivo e linha.
- Rode `npm run verify` (guardrails das regras hard e testes) e `npx tsc --noEmit`. O vitest não checa tipos e não conhece as regras do time: sem os dois limpos, não diga que está pronto e não siga para o passo 7.
- Peça ao subagente `revisor-codigo` para revisar o diff, colando a issue no pedido.

## 7. Marcar como in_review e comentar

- `mcp__board__update_issue_state(id, "in_review")`.
- `mcp__board__add_comment(id, body)` com: resumo do que foi implementado, arquivos tocados, checklist dos critérios marcados, comando para verificar.

## 8. Commit

- Commit em conventional commits pt-BR com o id da issue, ex.: `feat(regiao): frete grátis por região (LOJA-2)`.
- Não faça merge, push nem `done`: a integração é decisão humana (revisar, resolver conflitos, rodar tudo junto, mover para `done`).

## Regras de ouro

- **Nunca pule atualização de estado**: `in_progress` ao escolher, `in_review` ao entregar, `blocked` quando travar.
- **Uma issue por vez** neste worktree.
- **Spec ambígua → pergunte antes de assumir.** Não mova para `in_review` com dúvida em aberto.
- **Paralelo só sem sobreposição de arquivos.**
