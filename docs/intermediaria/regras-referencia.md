# Intermediária · quatro regras hard de referência

Quatro regras prontas para comparar com a sua. Cada uma é um item para colar em `REGRAS` no `tools/guardrails.js`. Todas usam o alvo `plugins` (`src/plugins/<dominio>/`), não `src`: o legado (`src/misc/`, `src/stuff/`, `src/utils/`) e o `src/plugins/registro.ts` têm `TODO`, `new Date()` e `any` que o time não vai mexer agora, e uma regra hard que dispara na `main` para o time inteiro no dia seguinte.

```js
{ id: 'sem-fetch-em-plugin', alvo: 'plugins', regra: 'Plugin da loja não faz rede por conta própria: nenhum fetch/http em src/plugins/<dominio>/.',
  check: (c) => porLinha(c, /\bfetch\(|from ['"](node:)?https?['"]/, () => 'chamada de rede dentro do plugin') },

{ id: 'sem-todo', alvo: 'plugins', regra: 'Nenhum TODO/FIXME chega ao PR no código dos plugins.',
  check: (c) => porLinha(c, /\b(TODO|FIXME)\b/, () => 'pendência deixada no código') },

{ id: 'sem-new-date-em-promocao', alvo: 'plugins', regra: 'Plugin não lê o relógio direto (R-06): sem new Date() em src/plugins/<dominio>/; a data vem da Promotion ou de argumento.',
  check: (c) => porLinha(c, /new Date\(\s*\)/, () => 'new Date() dentro do plugin; receba a data como argumento') },

{ id: 'sem-any', alvo: 'plugins', regra: 'Nada de any explícito no código dos plugins.',
  check: (c) => porLinha(c, /:\s*any\b|\bas any\b|<any>/, () => 'any explícito; tipe a borda') },
```

## Como testar nas duas branches, sem `git stash`

Na branch do PR, cole a regra em `REGRAS` e rode:

```bash
git checkout feature/relatorio-descontos
node tools/guardrails.js --regra sem-any                 # a regra nos arquivos do PR
node tools/guardrails.js --regra sem-any --ref main      # a MESMA regra (do seu arquivo) nos arquivos da main
git checkout -- tools/guardrails.js                      # descarta a regra, se não for ficar
```

`--ref` lê os arquivos da outra branch com `git ls-tree` e `git show`; as regras continuam vindo do `tools/guardrails.js` da sua árvore. O `git stash` do roteiro antigo guardava também a regra nova e rodava a `main` sem ela.

## Resultado de referência

Medido com as quatro regras acima coladas em `REGRAS` (comandos acima; PR = `feature/relatorio-descontos`, commit `5f2e475`).

| regra | `main` | PR | gabarito | o que pega no PR |
|---|---|---|---|---|
| sem-fetch-em-plugin | 0 | 1 | 0 | `src/plugins/relatorio/relatorio.ts:57` (o envio para a planilha externa) |
| sem-todo | 0 | 1 | 0 | `src/plugins/relatorio/relatorio.plugin.ts:14` (o TODO da paginação) |
| sem-new-date-em-promocao | 0 | 1 | 0 | `src/plugins/relatorio/relatorio.plugin.ts:17` (o `fim` padrão inventado) |
| sem-any | 0 | 2 | 0 | `src/plugins/relatorio/relatorio.plugin.ts:13` e `:18` |

Controle: as mesmas quatro com alvo `src` disparam na `main` 5 vezes (`sem-todo` em `src/misc/preco.ts:1` e `src/stuff/carrinho-antigo.ts:27`; `sem-new-date-em-promocao` em `src/stuff/carrinho-antigo.ts:10` e `src/utils/data.ts:2`; `sem-any` em `src/plugins/registro.ts:10`). É o erro mais comum da Intermediária: a regra está certa e o alvo está largo.

## O que costuma aparecer como hard e é soft

"Código legível", "boa cobertura", "seguir a arquitetura", "não mandar dado pessoal para fora", "paginar direito". Não dá para escrever o check sem falso positivo; vai para `docs/regras-do-time.md` e para o revisor. Regra de bolso: se você não consegue escrever o `check`, não é hard. A `funcao-curta` é o caso contrário: dá para escrever o check, e o time decidiu que não vale bloquear (seção "Calibração").
