# [Desafio S4] seu-usuario

Copie este arquivo para `entregas/<seu-usuario>.md`, preencha e apague as seções dos níveis que não fez. Regras completas: card 06 e «Como entregar o Desafio» no Trello.

- **Repositório:** `loja-legado` | repositório do time (anonimizado: só o relatório, sem código)
- **Trilha:** dev | líder
- **Níveis que declaro no grau mínimo da rubrica:** N1 | N2 | N3

## 🛡️ N1 · Guardrail Engineer

- Regras hard × soft do time (arquivo ou trecho anonimizado):
- As hard como código no loop do agente (hook, linter ou `guardrails.js`):
- O PR ruim de propósito barrado, com `arquivo:linha` (link para a branch no seu fork):
- A régua dando 0 na branch principal (comando e saída):

## 🔍 N2 · Revisor Confirmador

- Guardrails fora do agente (pre-commit ou CI), com o run vermelho e o verde (links):
- `/review-pr` em duas camadas (registro da revisão):
- Falso positivo calibrado: disparos antes → depois na branch principal e no PR ruim, com o comando:

## 📊 N3 · Medidor

- Opção: A Stryker | B Semgrep | C DORA via API do GitHub
- Fontes (URLs):
- Evidência (métrica real só como variação relativa):
- Decisão que os dados sustentam:

## Autoavaliação

- [ ] Cada regra hard tem um check que eu consigo apontar, e ela dá 0 na branch principal.
- [ ] Um PR ruim de propósito foi barrado com `arquivo:linha`, e o agente não conseguiu encerrar com ele vermelho.
- [ ] A régua também roda fora do agente (pre-commit ou CI).
- [ ] A revisão para na camada determinística quando ela falha, e a decisão é APPROVE ou REQUEST_CHANGES.
- [ ] A regra calibrada tem os números antes e depois, com o comando.
- [ ] Todo número que eu cito vem com o comando que o gerou e, se é métrica, com o baseline.
- [ ] No N3, cito as fontes com URL.
- [ ] Nada da minha empresa aparece sem anonimizar; métrica real só como variação relativa. A PR é pública: na dúvida, deixei de fora.

O compromisso de 30 dias ("amanhã eu…") vai na issue «Compromisso de 30 dias» deste repositório, não aqui.
