---
name: review-pr
disable-model-invocation: true
description: Revisa uma branch (PR) da loja-legado em duas camadas, sem editar código. Camada 1 determinística (tools/guardrails.js --ref e npm test num worktree temporário); camada 2 de julgamento pelo subagente revisor-codigo contra a issue do board e docs/regras-do-time.md. Termina com APPROVE ou REQUEST_CHANGES, a pergunta "vira hard?" e o registro em docs/revisoes/. Só roda quando o humano digita /review-pr <branch> [ID].
---

# Revisar um PR

Autor garante, revisor confirma. Esta skill é a confirmação: ela **nunca edita código** nem faz checkout na sua árvore de trabalho. Rode-a de uma sessão sem o stop-gate, que empurraria o agente a "corrigir": `claude --settings .claude/settings.sem-hooks.json`. Nessa sessão o `guard.sh` também fica desligado: rode só os comandos desta skill.

A skill tem `disable-model-invocation: true`: o modelo não a carrega sozinho (uma pergunta como "está pronto para merge?" não a dispara); ela roda quando alguém digita `/review-pr`.

Entrada: o nome da branch (ex.: `feature/relatorio-descontos`) e, se houver, o id da issue (ex.: `LOJA-4`). Sem branch, pergunte.

## 1. Camada determinística (barata, não depende de humor nem de contexto)

- `git diff --stat main...<branch>` para saber o que mudou; guarde o id da issue (mensagem de commit ou pedido).
- `node tools/guardrails.js --ref <branch> --json`: as regras hard da `main` aplicadas aos arquivos da branch, sem checkout. As regras são as da `main` de propósito: o PR não pode afrouxar a régua que o avalia.
- Testes da branch num worktree temporário, sem mexer na sua árvore:
  `git worktree add --detach .claude/worktrees/revisao <branch>`, depois `npm test` dentro dele (o `node_modules` da raiz é encontrado de lá) e `git worktree remove --force .claude/worktrees/revisao`.
- Anote: violações hard (ids e `arquivo:linha`), testes passados/falhando/pulados.
- Se houver violação hard, teste vermelho ou teste pulado: **PARE**. Decisão = REQUEST_CHANGES, a lista da máquina é o feedback. Não gaste a camada 2 revisando o que a máquina já rejeitou.

## 2. Camada de julgamento (só se a camada 1 passou)

- Pegue a issue: `mcp__board__get_issue(<id>)` (ou `node tools/board-mcp/cli.js show <id>`).
- Pegue o diff completo: `git diff main...<branch>`.
- Delegue ao subagente `revisor-codigo` colando no pedido: a issue, o diff inteiro e o resumo da camada 1. Ele não tem Bash nem as tools do board, por isso tudo vai no pedido. Peça que ele leia `docs/regras-do-time.md` (regras soft) e `docs/adr/`.
- Leia a resposta com desconfiança: achado sem `arquivo:linha` não entra.
- Limitação a dizer em voz alta: o `revisor-codigo` é `model: sonnet`, do **mesmo fornecedor** do modelo que escreveu o código (às vezes o mesmo modelo). Ajuda, mas não é a revisão cruzada com um modelo treinado de outro jeito.

## 3. Decisão, "vira hard?" e registro

Formato obrigatório:

```
**Decisão:** APPROVE | REQUEST_CHANGES
**Camada determinística:** N violações hard (ids), testes X passados, Y falhando, Z pulados
**Camada de julgamento:**
- [soft] arquivo:linha — regra — o que corrigir
**Vira hard?**
- <achado>: sim, check: <regex ou contagem, alvo> | não, porque <exige julgamento>
```

- Grave esse texto em `docs/revisoes/<ID>.md` (ex.: `docs/revisoes/LOJA-4.md`), com a branch e o commit revisado (`git rev-parse --short <branch>`) no topo. É documento, não código: pode.
- Se houver board, comente na issue com a decisão (`mcp__board__add_comment`). REQUEST_CHANGES com a issue em `in_review` volta para `in_progress` (`mcp__board__update_issue_state`); APPROVE não muda estado: merge e `done` são do humano.

## Regras de ouro

- Não edite código. Correção é outra conversa (ou `/plan-issue`).
- Não existe "aprovado com ressalvas": ressalva é REQUEST_CHANGES.
- Um achado que a máquina poderia pegar é um achado que a máquina DEVE pegar da próxima vez: proponha o item de `REGRAS`, com alvo, e confira que ele não dispara na `main` (`node tools/guardrails.js --regra <id> --ref main`).
- Um achado que a camada 2 deixou passar e você achou: melhore o contexto do revisor (`docs/regras-do-time.md`), para ele achar sozinho no próximo PR.
