#!/usr/bin/env node
// Painel de adoção de IA no terminal, a partir de metrics/semanas.json. Node puro, sem dependências.
//   npm run metricas                 os dois times, semana a semana, médias por fase e a pergunta de interpretação
//   node tools/metricas.mjs --json   os mesmos números em JSON (conferir e revisão)
//
// Métricas (seção 3 do curso, aula «Métricas para avaliação»; DORA: https://dora.dev/guides/dora-metrics/):
//   PRs/semana ................ volume; ajuda, mas engana sozinho (mais PRs pode ser mais retrabalho)
//   lead time do PR (h) ....... abertura → merge; aproximação do change lead time do DORA
//   deploys/semana ............ deployment frequency
//   change fail rate .......... incidentes / deploys (aproximação: incidente atribuído a um deploy)
//   retrabalho ................ hotfixes / deploys (deployment rework rate)
//   recuperação (h) ........... horas até restaurar, por incidente (failed deployment recovery time)
//   tokens (mi) ............... custo para FinOps; NÃO é métrica de valor
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = JSON.parse(readFileSync(path.join(raiz, 'metrics', 'semanas.json'), 'utf8'));
const comoJson = process.argv.includes('--json');

const soma = (ws, k) => ws.reduce((a, w) => a + w[k], 0);
const naFase = (ws, [de, ate]) => ws.filter((w) => w.semana >= de && w.semana <= ate);

function indicadores(ws) {
  const deploys = soma(ws, 'deploys');
  const incidentes = soma(ws, 'incidentes');
  return {
    prs_semana: soma(ws, 'prs') / ws.length,
    lead_time_pr_h: soma(ws, 'lead_time_pr_h') / ws.length,
    deploys_semana: deploys / ws.length,
    incidentes_semana: incidentes / ws.length,
    change_fail_rate: deploys ? incidentes / deploys : 0,
    retrabalho: deploys ? soma(ws, 'hotfixes') / deploys : 0,
    recuperacao_h: incidentes ? soma(ws, 'horas_recuperacao') / incidentes : 0,
    tokens_milhoes_semana: soma(ws, 'tokens_milhoes') / ws.length,
  };
}

const variacao = (antes, depois) => (antes ? (depois / antes - 1) * 100 : null);

const LINHAS = [
  ['prs_semana', 'PRs/semana', (v) => v.toFixed(1), 'volume (engana sozinho)'],
  ['lead_time_pr_h', 'Lead time do PR (h)', (v) => v.toFixed(1), 'fluxo'],
  ['deploys_semana', 'Deploys/semana', (v) => v.toFixed(1), 'DORA: frequência'],
  ['incidentes_semana', 'Incidentes/semana', (v) => v.toFixed(2), 'qualidade'],
  ['change_fail_rate', 'Change fail rate', (v) => `${(v * 100).toFixed(1)}%`, 'DORA: incidentes/deploys'],
  ['retrabalho', 'Retrabalho', (v) => `${(v * 100).toFixed(1)}%`, 'DORA: hotfixes/deploys'],
  ['recuperacao_h', 'Recuperação (h)', (v) => v.toFixed(1), 'DORA: por incidente'],
  ['tokens_milhoes_semana', 'Tokens (mi)/semana', (v) => v.toFixed(1), 'CUSTO, não valor'],
];

const resultado = { fases: d.fases, marcos: d.marcos, times: {}, pergunta: d.pergunta };
for (const [nome, time] of Object.entries(d.times)) {
  const fases = Object.fromEntries(Object.entries(d.fases).map(([f, faixa]) => [f, indicadores(naFase(time.semanas, faixa))]));
  const variacoes = Object.fromEntries(
    Object.keys(fases.antes).map((k) => [k, variacao(fases.antes[k], fases.depois[k])]),
  );
  resultado.times[nome] = { descricao: time.descricao, fases, variacao_antes_depois_pct: variacoes };
}

if (comoJson) {
  console.log(JSON.stringify(resultado, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padStart(n);
const fmtPct = (v) => (v === null ? '   n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`);
const faixa = (f) => `sem. ${d.fases[f][0]}-${d.fases[f][1]}`;

console.log(`\nAdoção de IA · ${Object.keys(d.times).length} times · ${Math.max(...Object.values(d.times).map((t) => t.semanas.length))} semanas (dados simulados)`);
console.log(`Marcos: ${Object.entries(d.marcos).map(([s, m]) => `semana ${s}: ${m}`).join(' · ')}`);

for (const [nome, time] of Object.entries(d.times)) {
  console.log(`\n== Time ${nome} (${time.descricao})\n`);
  console.log('sem.  PRs  lead(h)  deploys  incid.  hotfix  tokens(mi)');
  for (const w of time.semanas) {
    const marca = d.marcos[w.semana] ? `  ◀ ${d.marcos[w.semana]}` : '';
    console.log(`${pad(w.semana, 4)} ${pad(w.prs, 4)} ${pad(w.lead_time_pr_h, 8)} ${pad(w.deploys, 8)} ${pad(w.incidentes, 7)} ${pad(w.hotfixes, 7)} ${pad(w.tokens_milhoes, 11)}${marca}`);
  }
  const r = resultado.times[nome];
  console.log(`\n${''.padEnd(22)}${pad(`antes (${faixa('antes')})`, 18)}${pad(`curva (${faixa('curva')})`, 19)}${pad(`depois (${faixa('depois')})`, 20)}${pad('antes→depois', 14)}`);
  for (const [k, titulo, fmt, leitura] of LINHAS) {
    console.log(`${titulo.padEnd(22)}${pad(fmt(r.fases.antes[k]), 18)}${pad(fmt(r.fases.curva[k]), 19)}${pad(fmt(r.fases.depois[k]), 20)}${pad(k === 'tokens_milhoes_semana' ? 'n/a' : fmtPct(r.variacao_antes_depois_pct[k]), 14)}   ${leitura}`);
  }
}

console.log(`
Como ler:
- Compare cada time com o próprio baseline (semanas ${d.fases.antes[0]}-${d.fases.antes[1]}), não um time com o outro. Quatro a seis semanas de incidentes têm ruído: olhe a fase, não a semana.
- A curva (semanas ${d.fases.curva[0]}-${d.fases.curva[1]}) costuma piorar antes de melhorar: revisão vira gargalo e o time aprende a ferramenta.
- Tokens entram no painel como custo (FinOps). Se a métrica fosse tokens, quem mais gasta pareceria quem mais produz.

Pergunta para você responder em docs/painel-leitura.md:
${d.pergunta}
`);
