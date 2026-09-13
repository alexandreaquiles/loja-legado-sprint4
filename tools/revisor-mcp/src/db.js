// "Banco" local em JSON. No curso isso é o Supabase; aqui é um arquivo para a demo
// não depender de conta, chave nem rede.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
// REVISOR_HISTORY_FILE: o smoke usa um arquivo temporário para não sujar o histórico da demo.
const HISTORY = process.env.REVISOR_HISTORY_FILE
  ? path.resolve(process.env.REVISOR_HISTORY_FILE)
  : path.join(DATA_DIR, 'review-history.json');
const HISTORY_SEED = path.join(DATA_DIR, 'review-history.seed.json');

function readJson(name) {
  return JSON.parse(readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

export function listRules() {
  return readJson('rules.json');
}

export function listAdrs() {
  return readJson('adrs.json');
}

export function listHistory() {
  if (!existsSync(HISTORY)) copyFileSync(HISTORY_SEED, HISTORY);
  return JSON.parse(readFileSync(HISTORY, 'utf8'));
}

export function appendHistory(entry) {
  const all = listHistory();
  all.push(entry);
  writeFileSync(HISTORY, JSON.stringify(all, null, 2) + '\n');
  return all.length;
}
