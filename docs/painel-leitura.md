# Leitura do painel de adoção (referência do gabarito)

Fonte: `npm run metricas` (dados simulados de `metrics/semanas.json`). Cada time comparado com o próprio baseline, semanas 1-6 contra 11-16.

**Pergunta:** o time pagamentos mergeia mais PRs por semana do que o time loja depois da adoção. Se eu só pudesse colocar energia de liderança em um time na próxima semana, qual seria, o que eu faria lá e qual número sustenta a decisão?

**Decisão:** vou colocar a energia no time **pagamentos**. Na próxima semana, reduzo a velocidade (a Ferrari a 70 km/h): o time passa a rodar o mesmo stop-gate com `npm run verify` e o CI do time loja, faz o treino que o loja fez na semana 10 e toda mudança no checkout volta a ter revisão humana priorizada. Reviso o painel em 4 semanas.

**Número que sustenta:** change fail rate do pagamentos foi de 15,4% para 40,5% (+163%), e o retrabalho (hotfixes por deploy) de 7,7% para 28,6%. Quatro em cada dez deploys pedem intervenção, num sistema que mexe com pagamento. No mesmo período o time loja, com guardrails e treino, caiu de 15,2% para 7,4% (−51%) entregando mais (PRs +62%, deploys +64%).

**A métrica que engana:** PRs sozinhos. Pagamentos tem +153% de PRs e parece o time mais produtivo, mas veio junto com +325% de incidentes por semana e +51% de lead time do PR: volume não é valor. Tokens também enganam: o pagamentos gasta 43,8 mi de tokens por semana contra 22,0 mi do loja; num painel de tokens ele pareceria o melhor. Tokens entram como custo (FinOps), não como valor.

**Cuidados:** 6 semanas de incidentes são poucas (ruído); a curva das semanas 7-10 piorou nos dois times, então olhei a fase depois dela. O lead time do PR é aproximação (abertura → merge), não o change lead time do DORA. O que não sei pelo painel e vou perguntar ao time: se os incidentes vêm de código gerado por IA ou de outra causa.
