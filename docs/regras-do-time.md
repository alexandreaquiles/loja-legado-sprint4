# Regras do time loja (conhecimento "as code")

Este arquivo é a fonte das regras do time. Cada regra tem um dono de verificação:

- **máquina**: vira item em `REGRAS` no `tools/guardrails.js`, roda no Stop hook (`npm run verify`) e no CI (`.github/workflows/verify.yml`) e bloqueia o PR;
- **revisor**: exige julgamento; fica com quem revisa (pessoa ou o subagente `revisor-codigo`, pela skill `/review-pr`).

Os ids `R-0N` e `ADR-00N` são os mesmos do servidor MCP `revisor` (`tools/revisor-mcp/data/rules.json` e `adrs.json`); as ADRs aceitas estão também em `docs/adr/`.

## Regras hard (máquina, nunca quebrar)

| id | regra | origem | como a máquina verifica |
|---|---|---|---|
| sem-segredo | Nenhuma credencial no código (chave, senha, URL com senha) | R-02 | regex de `sk_live_`/`sk_test_`, `api_key = '...'`, `password =`, `://user:senha@` em `src/` e `test/` |
| sem-console-log | Nenhum `console.log` em `src/` | R-05 | regex |
| sem-dependencias-novas | Sem dependência de runtime além das do Vendure | ADR-003 | `dependencies` do `package.json` contra a lista do create |
| dinheiro-em-centavos | Dinheiro em centavos inteiros | ADR-001 | regex de `toFixed(2)` e literais com duas casas |
| teste-com-assert | Todo `it()`/`test()` compara algo | política do time (a R-07 fala do estilo dos testes) | um `expect(...)` real dentro do bloco (não `expect(true)`) |
| sem-skip | Nenhum teste pulado | política do time (a R-07 fala do estilo dos testes) | regex de `it.skip`, `test.skip`, `describe.skip`, `.todo` |

Comandos:

```bash
npm run verify                              # guardrails + vitest (o que o stop-gate e o CI rodam)
node tools/guardrails.js                    # só as regras hard, na árvore de trabalho
node tools/guardrails.js --ref main         # as mesmas regras sobre outra branch, sem checkout nem stash
node tools/guardrails.js --regra sem-skip   # uma regra só (repita a flag para mais de uma)
node tools/guardrails.js --avisos           # também os avisos soft que têm check (não bloqueiam)
```

Quer adicionar uma regra hard? Um item em `REGRAS`: `id`, `alvo` (`src`, `plugins`, `test`, `package`, ou combinados com `+`), `regra` e `check`. O alvo `plugins` é só o código dos plugins do time (`src/plugins/<dominio>/`), sem o `registro.ts` e sem o legado de `src/misc/`, `src/stuff/` e `src/utils/`. Antes de promover, rode a regra nas duas branches: ela precisa pegar o problema no PR e **nada** na `main`, senão o time inteiro para no dia seguinte. Se não dá para escrever o check, não é hard: vai para a lista soft.

## Calibração: por que `funcao-curta` saiu da lista hard

Até a Sprint 3 o time tratava "função com no máximo 40 linhas" como regra hard. Na Sprint 4 ela virou **aviso soft** (`funcao-longa`, `node tools/guardrails.js --avisos`): o check continua lá, mas não quebra o build.

- O curso usa tamanho de método como o exemplo típico de regra que um linter põe no loop do agente (seção 2, «Guardrails de qualidade», aula «Análise estática»: "o método `XPTO` que acabou de ser escrito tem 30 linhas e deve ter, no máximo, 20 — é apenas um exemplo numérico"). Ou seja, dá para ser hard, e muitos times fazem assim.
- O mesmo curso questiona a regra (aula «Qualidade de código»): "métodos longos podem ser vantajosos para a IA, pois ela opera sobre o que está no contexto", as restrições de tamanho "tendem a afrouxar com o tempo" e "Precisamos mesmo que todos os métodos sejam pequenos?". Também pede razoabilidade: rigor onde o sistema é crítico, menos onde não é, para não gastar energia com *nitpicking*.
- E avisa sobre calibrar (aula «Análise estática»): com regras demais, "o agente entrará em um laço infinito e não entregará nada, ou entregará com um custo maior". Hard é o que "não queremos nunca quebrar".

Decisão deste time: a lista hard fica com o que tem custo real quando escapa (segredo vazado, dinheiro errado, dependência fora da política, teste que não testa). Tamanho de função é gosto e contexto; num agente com stop-gate, uma regra hard de 40 linhas faz o modelo picar a função só para passar no contador, sem ganho para quem lê. Uma função longa num PR continua podendo ser um achado, só que da revisão: o problema, quando existe, é misturar responsabilidades ou esconder uma regra sem teste, não o número de linhas. Se o seu time decidir o contrário, mover `funcao-longa` de `AVISOS` para `REGRAS` é uma linha, e a decisão vale uma ADR.

## Regras soft (revisão, exigem julgamento)

Spec e arquitetura
- Cada regra e cada restrição da issue no board tem código e teste correspondentes. Campo, coluna, parâmetro ou comportamento que a spec não pede é achado.
- Decisões de arquitetura seguem as ADRs aceitas (`docs/adr/`) e as regras do Vendure: plugin por domínio, nunca reimplementar a `Promotion`, actions e conditions puras (R-03, R-04, R-06). Mudança de ADR é PR separado.
- Antes de escrever uma função nova, procurar equivalente existente (`src/plugins/*/regras.ts`, `src/plugins/compartilhado/`, o próprio Vendure). Não duplicar normalização, cálculo de subtotal, formatação.
- Função longa (aviso `funcao-longa`): quebrar quando mistura responsabilidades ou esconde uma regra sem teste; não quebrar só pelo número.

Dados e consultas
- Consulta filtra no banco, não na memória, e lê tudo o que a spec pede: com os serviços do Vendure, o filtro vai no `ListQueryOptions` e a leitura respeita a paginação (`skip`/`take`, `totalItems`).
- Nada de `any` explícito no código dos plugins; parâmetros validados na borda (schema GraphQL, args da action), não no meio.

Segurança e privacidade
- O código não expõe segredo por outro caminho (log, mensagem de erro, retorno, header para terceiros) (R-02).
- Plugin não faz chamada de rede por conta própria; integração com outro sistema é decisão de arquitetura, com ADR.
- Dado pessoal de cliente não é compartilhado com terceiros sem base legal e decisão registrada (LGPD).
- Arquivo exportado para planilha segue o escape que a spec define e a recomendação da OWASP para "CSV Injection".
- Erros de negócio como `ErrorResult` do GraphQL (padrão do Vendure), nunca `throw` com mensagem solta; mensagens não expõem dados internos.

Testes (seção 2 do curso, aula «Testes automatizados»)
- O teste exercita o **comportamento** descrito na spec, não a implementação; cobre limites (vazio, um, muitos) e o caminho de erro.
- Um teste por classe de equivalência; teste repetido é custo de manutenção.
- Mock só de fronteira externa (rede, relógio, `OrderService` falso). Não mockar as próprias regras.
- Pelo menos um teste de caso de uso pela borda (resolver ou condition com um serviço falso), não só a função pura.
- Um `expect` que compara pouco demais passa na regra `teste-com-assert` e não prova o comportamento: é achado de revisão. O teste compara o resultado exato que a spec descreve.

## O que só produção mostra (guardrails do outro lado)

- Alerta em latência e erro 5xx por rota; SLA escrito.
- Deploy ≠ release: feature flag para cupom e relatório novos, rollout gradual (1% → 10% → 100%).
- Rollback automatizado quando a taxa de erro sobe depois do deploy.

## Como esta lista evolui

Quando um problema passar pela revisão ou chegar à produção, a pergunta é: **dava para virar regra hard?** Se dá para escrever o check sem falso positivo na `main`, entra no `guardrails.js` no mesmo PR da correção. Se não dá, entra aqui com um exemplo, e o contexto do revisor melhora para o próximo PR. Regra que ninguém quebra há 6 meses, ou que só gera ruído, pode ser rebaixada (foi o caso da `funcao-curta`).

## Exemplos que vieram das revisões

Acrescentados depois da revisão da LOJA-4 (`docs/revisoes/LOJA-4.md`), para o revisor achar sozinho no próximo PR. Na `main` da sprint, esta seção ainda não existe: escrevê-la é o passo 5 da tarefa 03.

- Dados e consultas: `findAll(ctx, { take: 500 })` com o filtro de data num `.filter()` depois perde pedidos sem erro nenhum; o filtro vai em `filter` e a leitura percorre as páginas até `totalItems`.
- Privacidade: um resolver que manda o CSV com o e-mail de cada cliente para um serviço externo a cada consulta.
- CSV: campo que começa com `=`, `+`, `-`, `@`, tab ou CR recebe apóstrofo e vai entre aspas; vírgula, aspas e quebra de linha vão entre aspas.
- Spec: uma coluna calculada que a spec não pede (`valorEstimado`) e uma transformação que ela não pede (e-mail em minúsculas).
- Testes: `expect(csv.length > 0).toBe(true)` passa na `teste-com-assert` e não prova o cabeçalho; compare o CSV exato.
