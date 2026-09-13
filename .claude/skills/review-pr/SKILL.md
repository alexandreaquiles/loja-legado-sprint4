---
name: review-pr
description: Revisa uma branch (PR) da loja-legado (Vendure) em duas camadas: guardrails determinísticos (tools/guardrails.js + npm test) e revisão de julgamento pelo subagente revisor contra docs/regras-do-time.md. Use quando o usuário pedir para revisar uma branch, um PR ou perguntar se algo está pronto para merge.
---

# Revisar um PR

Autor garante, revisor confirma. Esta skill é a confirmação: ela NUNCA edita código.

## 1. Camada determinística (custo zero, nunca erra)

- `git diff --stat main...<branch>` para saber o que mudou.
- Faça checkout da branch em um worktree ou confira que já está nela (`git branch --show-current`).
- Rode `node tools/guardrails.js --json` e `npm test`.
- Se houver violação hard ou teste vermelho: PARE. Decisão = REQUEST_CHANGES, e a lista de violações é o feedback. Não gaste tokens revisando o que a máquina já rejeitou.

## 2. Camada de julgamento (só se a camada 1 passou)

- Delegue ao subagente `revisor` (somente leitura, modelo diferente do seu) com: o diff, o caminho de `docs/regras-do-time.md` (seção "Regras soft") e a spec da issue se houver (`mcp__board__get_issue`).
- Peça que ele responda item a item da lista soft, com arquivo:linha e evidência, e um veredito APROVADO / VOLTAR.

## 3. Decisão e registro

- Formato de saída obrigatório:
  **Decisão:** APPROVE | REQUEST_CHANGES
  **Camada determinística:** N violações hard, testes X/Y
  **Camada de julgamento:** lista "[soft] arquivo:linha — regra — o que corrigir"
  **Virou regra hard?** para cada achado soft: dá para escrever um check no `guardrails.js`? Se sim, sugira o item.
- Se houver board: comente na issue com o resultado (`mcp__board__add_comment`).

## Regras de ouro

- Não edite arquivos. Se o usuário quiser corrigir, é outra conversa (ou `/plan-issue`).
- Não "aprove com ressalvas": ressalva é REQUEST_CHANGES.
- Um achado que a máquina poderia pegar é um achado que a máquina DEVE pegar da próxima vez: proponha a regra.
