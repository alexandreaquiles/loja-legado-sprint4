# loja-legado · Projeto prático da Sprint 4

Conecta+ #11 · Engenharia de Software com IA · **Verde não é verificado: guardrails, revisão em duas camadas e métricas sem vaidade**

Este é o repositório do projeto prático da Sprint 4, a última do programa. A loja (Vendure 3.7, SQLite) continua de onde a Sprint 3 parou: os plugins `cupons` (LOJA-1), `regiao` (LOJA-2) e `primeira-compra` (LOJA-3), o harness (`CLAUDE.md` com `AGENTS.md`, hooks, deny do `.env`, statusline, subagente `revisor-codigo`), os servidores MCP `revisor` e `board` e a skill `/plan-issue`. Agora chegou um PR que alguém fez com IA: a LOJA-4, um relatório de cupons em CSV, na branch `feature/relatorio-descontos`. Os testes estão verdes. O trabalho da sprint é descobrir por que isso não basta, pôr as regras do time no loop do agente (`tools/guardrails.js`), revisar em duas camadas (`/review-pr`) e ler um painel de adoção sem cair em métrica de vaidade. As tarefas estão no board do Trello; na aula ao vivo o professor resolve as tarefas essenciais neste mesmo repositório.

| | |
|---|---|
| Board do projeto (Trello) | TODO-TRELLO |
| Curso base na Alura | [IA na engenharia de software: guardrails de qualidade e estratégias de adoção](https://cursos.alura.com.br/course/ia-engenharia-software-guardrails-qualidade-estrategias-adocao) (6h estimadas) |
| Lançamento | segunda, 02/11/2026 |
| Aula ao vivo | quinta, 12/11/2026, 9h–10h |
| Entrega do Desafio | sexta, 13/11/2026, no Discord da turma |

## Preparar o ambiente

Você precisa de Node.js 22.12 ou mais novo, git e [Claude Code](https://code.claude.com) 2.1.270 ou mais novo (`claude update`), com conta Claude Pro ou chave de API. Não precisa de Docker nem de banco de dados: a loja usa SQLite.

```bash
git clone https://github.com/alexandreaquiles/loja-legado-sprint4.git
cd loja-legado-sprint4
npm install          # ~2 minutos e ~800 MB: o Vendure inteiro vem em node_modules
npm run setup        # branches locais, .env (segredos falsos), vendure.sqlite, board e npm install em tools/revisor-mcp
npm run verify       # guardrails (0 violações, 6 regras hard) + 25 testes verdes, em ~2 segundos
node tools/board-mcp/cli.js   # o board no terminal: LOJA-4 em in_review
npm run conferir     # confere os cards 00 a 04: no começo só o 00 fica todo ✔
claude               # abre o agente; aceite confiar na pasta
```

Os servidores `board` e `revisor` já vêm aprovados em `.claude/settings.json` (`enabledMcpjsonServers`), mas o Claude Code só aplica essa aprovação **depois que você confia na pasta** no primeiro `claude`.

## O PR da LOJA-4

```bash
node tools/board-mcp/cli.js show LOJA-4     # a spec: 5 regras, restrições e critérios de aceite
git diff --stat main...feature/relatorio-descontos
node tools/guardrails.js --ref feature/relatorio-descontos   # as regras hard da main sobre a branch, sem checkout
```

A branch passa no `npm test` (27 verdes e 1 pulado) e tem problemas que a máquina pega e problemas que só a revisão pega. Achar os dois tipos é o card 01.

## Guardrails: as regras do time como código

- `docs/regras-do-time.md` separa as regras **hard** (máquina) das **soft** (revisão) e explica por que a `funcao-curta` deixou de ser hard (calibração).
- `tools/guardrails.js` tem as regras hard em `REGRAS`. Uma regra é um objeto com `id`, `alvo`, `regra` e `check`.
- `npm run verify` = guardrails + vitest. É o que o `stop-gate.sh` roda antes de deixar o agente encerrar e o que o CI (`.github/workflows/verify.yml`) roda em cada PR.
- As decisões de arquitetura citadas (ADR-001 centavos, ADR-003 sem dependências novas…) estão em `docs/adr/`, com os mesmos ids do servidor `revisor` (`tools/revisor-mcp/data/adrs.json` e `rules.json`, onde vivem R-02, R-05, R-06…).

```bash
node tools/guardrails.js                     # árvore de trabalho
node tools/guardrails.js --ref main          # outra branch, sem checkout nem git stash
node tools/guardrails.js --regra sem-skip    # só uma regra (repita a flag para mais)
node tools/guardrails.js --avisos            # também os avisos soft (não bloqueiam)
```

Para testar uma regra nova nas duas branches (Intermediária): adicione o item em `REGRAS` na branch em que você está e rode `node tools/guardrails.js --regra <id>` e `node tools/guardrails.js --regra <id> --ref main`. As regras vêm do arquivo da sua árvore; os arquivos analisados vêm da ref.

## Sessão sem hooks

O `stop-gate.sh` segura o fim de cada turno enquanto `npm run verify` estiver vermelho, e manda o agente corrigir. Isso é o que você quer no card 02, e o contrário do que você quer quando o objetivo é **ver** o agente sem guardrails (card 01) ou **revisar** sem editar (card 03). Para essas sessões:

```bash
claude --settings .claude/settings.sem-hooks.json
```

O arquivo só tem `{"disableAllHooks": true}`, que tem precedência sobre os hooks do projeto (`claude --settings '{"disableAllHooks": true}'` faz o mesmo; o arquivo evita brigar com aspas no Windows). Continuam valendo o deny do `.env`, os servidores MCP, as skills e o subagente.

## Revisão em duas camadas

`/review-pr feature/relatorio-descontos`, de uma sessão sem hooks:

1. **Camada determinística:** `node tools/guardrails.js --ref <branch>` e `npm test` num worktree temporário. Violação hard, teste vermelho ou pulado: REQUEST_CHANGES, sem gastar a camada 2.
2. **Camada de julgamento:** o subagente `revisor-codigo` (só lê; `model: sonnet`) recebe a issue do board e o diff e revisa contra as regras soft. Ele é do mesmo fornecedor do modelo que provavelmente escreveu o código: ajuda, mas não é a revisão cruzada com um modelo treinado de outro jeito.
3. **Decisão e "vira hard?"**, gravadas em `docs/revisoes/LOJA-4.md`.

## Painel de adoção

```bash
npm run metricas
```

Dois times, 16 semanas simuladas (`metrics/semanas.json`): baseline, adoção da IA, e só um dos times com treino e guardrails. PRs, lead time do PR, deploys, change fail rate, retrabalho e recuperação, com a variação antes × depois de cada time e uma pergunta de interpretação no fim. Tokens aparecem como custo, não como valor.

## As tarefas

Copie o board do Trello para a sua conta e mova os cards. Resumo:

| # | tarefa | etiqueta |
|---|---|---|
| 00 | Preparar o ambiente: `npm run verify` verde na `main`, LOJA-4 em `in_review` | Essencial |
| 01 | Sentir o problema: o PR com testes verdes, numa sessão sem hooks | Essencial |
| 02 | Guardrails no loop: a branch do PR até `npm run verify` verde, sem enfraquecer teste | Essencial |
| 03 | Revisão em duas camadas: `/review-pr` e o registro em `docs/revisoes/LOJA-4.md` | Essencial |
| 04 | Medir sem vaidade: `npm run metricas` e a sua leitura em `docs/painel-leitura.md` | Essencial |
| 05 | Intermediária: uma regra hard em uma linha (feito na aula ao vivo) | Intermediária |
| 06 | Desafio em 3 níveis, no seu repositório ou no `loja-legado` | Desafio |

Cada card termina com `npm run conferir -- NN`: ✔ feito, ✘ falta, … depende de outro card. É feedback, não nota: nada ali usa LLM nem lê o seu `.env`.

As tarefas essenciais são as que o professor resolve ao vivo na quinta. Tente antes: a aula rende muito mais quando você já esbarrou no problema.

## Branches

- `main`: o estado inicial. Tudo das sprints anteriores, os guardrails, a skill `/review-pr`, o painel, o board com a LOJA-4 em `in_review`.
- `feature/relatorio-descontos`: o PR da LOJA-4, como chegou.
- `gabarito`: a LOJA-4 corrigida e cumprindo a spec inteira, a revisão de referência (`docs/revisoes/LOJA-4.md`), uma leitura de referência do painel (`docs/painel-leitura.md`) e as regras da Intermediária (`docs/intermediaria/`). Vale mais espiar depois de tentar: `git show gabarito:<arquivo>`.

## Como entregar o Desafio

Poste no Discord da turma até a sexta que fecha a sprint, com o template do card "Como entregar" no Trello. Não poste código, métricas, políticas ou nomes internos da sua empresa: anonimize ou use o `loja-legado`.

## Licença

O Vendure é GPLv3. Este repositório de exercício segue a mesma licença.

## Notas do time anterior

Loja no Vendure. Rodar com `npm run dev`. O dashboard é o antigo admin.

Os helpers de `src/misc/` são do relatório do financeiro, não mexer.

Ver com o Fulano antes de mexer no preco.
