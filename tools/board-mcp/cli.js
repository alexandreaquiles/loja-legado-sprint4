#!/usr/bin/env node
// O board no terminal, para quem não é o agente (o dev, o Piloto na aula, os scripts).
//   node tools/board-mcp/cli.js                       lista
//   node tools/board-mcp/cli.js show LOJA-2           issue completa (spec, files, comentários)
//   node tools/board-mcp/cli.js mover LOJA-2 done     muda o estado (mesmas regras do update_issue_state)
//   node tools/board-mcp/cli.js spec LOJA-3 arq.json  grava spec e files a partir de um JSON ({ "spec": {...}, "files": [...] }); "-" lê do stdin
//   node tools/board-mcp/cli.js reset                 volta ao seed (apaga estados e comentários)
//   node tools/board-mcp/cli.js caminho               onde o arquivo do board está
import { readFileSync } from 'node:fs';
import { load, update, resetBoard, boardFile } from './src/store.js';
import { listar, obter, mover, salvarSpec, faltandoNaSpec, STATES } from './src/board.js';

const [cmd, ...args] = process.argv.slice(2);
const sair = (msg, code = 1) => { console.error(msg); process.exit(code); };

try {
  if (cmd === 'reset') {
    console.log('board resetado em', resetBoard());
  } else if (cmd === 'caminho') {
    console.log(boardFile());
  } else if (cmd === 'show') {
    console.log(JSON.stringify(obter(load(), args[0]), null, 2));
  } else if (cmd === 'mover') {
    const [id, estado] = args;
    if (!id || !estado) sair(`uso: cli.js mover <ID> <estado>   (estados: ${STATES.join(', ')})`);
    const r = update((issues) => mover(issues, id, estado));
    console.log(`${r.id}: ${r.from} → ${r.to}`);
  } else if (cmd === 'spec') {
    const [id, arquivo] = args;
    if (!id || !arquivo) sair('uso: cli.js spec <ID> <arquivo.json | ->');
    const dado = JSON.parse(readFileSync(arquivo === '-' ? 0 : arquivo, 'utf8'));
    const r = update((issues) => salvarSpec(issues, id, dado.spec ?? {}, dado.files));
    console.log(JSON.stringify(r));
  } else if (!cmd || cmd === 'lista') {
    const icon = { backlog: '·', todo: '○', in_progress: '◐', in_review: '◑', done: '●', blocked: '⊘' };
    const todas = load();
    console.log(`board (${boardFile()})\n`);
    for (const i of listar(todas).issues) {
      const pendentes = i.blocked_by.filter((b) => todas.find((x) => x.id === b)?.state !== 'done');
      const blk = pendentes.length ? `  ⟵ bloqueada por ${pendentes.join(', ')}` : '';
      const faltam = faltandoNaSpec(todas.find((x) => x.id === i.id));
      const spec = faltam.length ? `  (spec sem: ${faltam.join(', ')})` : '';
      console.log(`${icon[i.state] ?? '?'} ${i.id.padEnd(7)} ${i.state.padEnd(11)} ${i.priority.padEnd(6)} ${i.title}${blk}${spec}`);
    }
  } else {
    sair(`comando desconhecido: ${cmd}. Use: lista, show, mover, spec, reset, caminho.`);
  }
} catch (e) {
  sair(`erro: ${e.message}`);
}
