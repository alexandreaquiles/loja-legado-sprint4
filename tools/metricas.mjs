#!/usr/bin/env node
// metricas.js: painel de adoção do time, no terminal. Lê metrics/semanas.json.
// Compara três fases: baseline (sem IA), IA sem guardrails, IA com guardrails no loop.
// Mostra de propósito as métricas de vaidade (tokens, linhas) ao lado das que importam.
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('metrics/semanas.json', 'utf8'));
const s = d.semanas;
const marcos = Object.entries(d.marcos).map(([k, v]) => `${k}: ${v}`).join(' · ');

const fases = [
  { nome: 'baseline (sem IA)', de: 1, ate: 4 },
  { nome: 'IA sem guardrails', de: 5, ate: 8 },
  { nome: 'IA + guardrails no loop', de: 9, ate: 12 },
];
const media = (arr, k) => arr.reduce((a, x) => a + x[k], 0) / arr.length;
const fmt = (n, dec = 1) => n.toFixed(dec).padStart(7);

const colunas = [
  ['prs', 'PRs/semana', 'importa: entrega'],
  ['lead_time_h', 'Lead time (h)', 'importa: fluxo'],
  ['incidentes', 'Incidentes', 'importa: qualidade'],
  ['rollbacks', 'Rollbacks', 'importa: qualidade'],
  ['tokens_milhoes', 'Tokens (mi)', 'VAIDADE: mede gasto, não valor'],
  ['linhas_adicionadas', 'Linhas add.', 'VAIDADE: mais linhas ≠ mais valor'],
];

console.log(`\nAdoção de IA · time ${d.time} · 12 semanas · marcos ${marcos}\n`);
console.log('semana '.padEnd(8) + colunas.map(([, t]) => t.padStart(14)).join(''));
for (const w of s) {
  const marca = d.marcos[w.semana] ? ' ◀ ' + d.marcos[w.semana] : '';
  console.log(String(w.semana).padEnd(8) + colunas.map(([k]) => String(w[k]).padStart(14)).join('') + marca);
}

console.log('\nMédias por fase:\n');
console.log(''.padEnd(26) + fases.map((f) => f.nome.padStart(26)).join(''));
for (const [k, titulo, leitura] of colunas) {
  const vals = fases.map((f) => media(s.filter((w) => w.semana >= f.de && w.semana <= f.ate), k));
  console.log(titulo.padEnd(26) + vals.map((v) => fmt(v).padStart(26)).join('') + '   ' + leitura);
}

const [b, semG, comG] = fases.map((f) => s.filter((w) => w.semana >= f.de && w.semana <= f.ate));
const pct = (a, c) => { const v = (media(c, a) / media(b, a) - 1) * 100; return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`; };
console.log(`
Leitura para a liderança:
- PRs: ${pct('prs', semG)} logo após a IA, ${pct('prs', comG)} com guardrails. A velocidade veio de qualquer jeito.
- Incidentes: ${pct('incidentes', semG)} sem guardrails (a Ferrari a 300 sem saber dirigir), ${pct('incidentes', comG)} depois.
- Lead time: ${pct('lead_time_h', semG)} sem guardrails (revisão virou gargalo), ${pct('lead_time_h', comG)} quando o feedback voltou ao agente antes do PR.
- Tokens e linhas subiram nas duas fases. Se a métrica fosse tokens, a fase ruim pareceria a melhor.
`);
