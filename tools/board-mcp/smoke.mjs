// Teste de fumaça do board-mcp, sem LLM e sem SDK: fala JSON-RPC 2.0 por stdio na mão, do mesmo jeito
// que o Claude Code fala com o servidor, e roda processos concorrentes contra o mesmo arquivo.
// Usa um board temporário (BOARD_FILE) semeado com data/issues.smoke.json (BOARD_SEED): o cenário das invariantes
// (claim, bloqueio, sobreposição de files) é fixo e não depende do seed da sprint; o board da demo (.git/board/issues.json) não muda.
//   npm run smoke:board
//   node tools/board-mcp/smoke.mjs --json     saída em JSON (o npm run conferir usa)
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// ---- modo filho: um processo concorrente (sessão 2, 3, ...) ------------------------------
if (args[0] === '--filho') {
  const { update } = await import('./src/store.js');
  const { mover, comentar } = await import('./src/board.js');
  const [, op, quantos, inicio] = args;
  const espera = Number(inicio) - Date.now();
  if (espera > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, espera);
  if (op === 'comentar') {
    for (let n = 0; n < Number(quantos); n++) update((issues) => comentar(issues, 'LOJA-1', `pid ${process.pid} #${n}`));
    console.log('ok');
  } else if (op === 'claim') {
    try { update((issues) => mover(issues, quantos, 'in_progress')); console.log('ok'); } catch (e) { console.log(`recusado: ${e.message}`); }
  }
  process.exit(0);
}

const comoJson = args.includes('--json');
const dir = mkdtempSync(path.join(os.tmpdir(), 'board-smoke-'));
const BOARD_FILE = path.join(dir, 'issues.json');
const env = { ...process.env, BOARD_FILE, BOARD_SEED: path.join(HERE, 'data', 'issues.smoke.json') };
const inicio = Date.now();
const checagens = [];
const checar = (id, ok, texto, falhou) => checagens.push({ id, ok: Boolean(ok), texto: ok ? texto : falhou ?? texto });

const srv = spawn(process.execPath, [path.join(HERE, 'src', 'index.js')], { env, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map();
createInterface({ input: srv.stdout }).on('line', (line) => {
  const msg = JSON.parse(line);
  if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
let seq = 0;
const send = (msg) => srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
  send({ id, method, params });
});
const tool = async (name, a) => {
  const r = await call('tools/call', { name, arguments: a });
  const text = r.content.map((c) => c.text).join('');
  return { isError: Boolean(r.isError), text, json: r.isError ? null : JSON.parse(text) };
};
const cli = (...a) => spawnSync(process.execPath, [path.join(HERE, 'cli.js'), ...a], { env, encoding: 'utf8' });
const board = () => JSON.parse(readFileSync(BOARD_FILE, 'utf8'));

try {
  await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.0' } });
  send({ method: 'notifications/initialized' });
  const { tools } = await call('tools/list');
  const nomes = tools.map((t) => t.name);
  checar('tools', nomes.length === 5, `5 tools: ${nomes.join(', ')}`, `esperava 5 tools, vieram ${nomes.length}: ${nomes.join(', ')}`);

  // seed
  const todas = (await tool('list_issues', {})).json.issues;
  const ach = (id) => todas.find((i) => i.id === id);
  const l2 = ach('LOJA-2'); const l7 = ach('LOJA-7');
  const comuns = l2 && l7 ? l7.files.filter((f) => l2.files.includes(f)) : [];
  const seedOk = todas.length === 7 && ach('LOJA-1')?.state === 'done' && ach('LOJA-3')?.state === 'backlog'
    && ach('LOJA-4')?.blocked_by.join() === 'LOJA-3' && ach('LOJA-6')?.blocked_by.join() === 'LOJA-2'
    && l7?.blocked_by.length === 0 && comuns.length > 0;
  checar('seed', seedOk, `cenário do smoke (data/issues.smoke.json): 7 issues; LOJA-1 done, LOJA-3 backlog (rascunho), LOJA-4 ⟵ LOJA-3, LOJA-6 ⟵ LOJA-2, LOJA-7 livre e com ${comuns.join(', ')} em comum com a LOJA-2`,
    'cenário do smoke diferente do esperado (git checkout main -- tools/board-mcp/data/issues.smoke.json)');

  const proxima = (await tool('list_issues', { state: 'todo', unblocked_only: true })).json.issues.map((i) => i.id);
  checar('proxima', proxima.join() === 'LOJA-5,LOJA-2,LOJA-7', `todo e não bloqueadas, por prioridade: ${proxima.join(' ')}`, `ordem inesperada: ${proxima.join(' ')}`);

  // invariantes do update_issue_state
  const bloq = await tool('update_issue_state', { id: 'LOJA-4', state: 'in_progress' });
  checar('bloqueio', bloq.isError && bloq.text.includes('LOJA-3'), 'LOJA-4 → in_progress recusado: bloqueada pela LOJA-3', `LOJA-4 bloqueada não foi recusada: ${bloq.text}`);
  const claim = await tool('update_issue_state', { id: 'LOJA-2', state: 'in_progress' });
  checar('claim', !claim.isError, 'LOJA-2 → in_progress (claim)', `claim da LOJA-2 falhou: ${claim.text}`);
  const duplo = await tool('update_issue_state', { id: 'LOJA-2', state: 'in_progress' });
  checar('claim_duplo', duplo.isError && /já está in_progress desde/.test(duplo.text), `claim duplo recusado: ${duplo.text.slice(0, 90)}…`, `claim duplo da LOJA-2 não foi recusado: ${duplo.text}`);
  const sobre = await tool('update_issue_state', { id: 'LOJA-7', state: 'in_progress' });
  checar('sobreposicao', sobre.isError && sobre.text.includes('src/plugins/compartilhado/uf.ts') && sobre.text.includes('LOJA-2'),
    'LOJA-7 → in_progress recusado: toca src/plugins/compartilhado/uf.ts, que a LOJA-2 (in_progress) também toca', `sobreposição de files não foi recusada: ${sobre.text}`);
  const final = await tool('update_issue_state', { id: 'LOJA-1', state: 'todo' });
  const rascunho = await tool('update_issue_state', { id: 'LOJA-3', state: 'in_progress' });
  checar('transicao', final.isError && rascunho.isError && /done é final/.test(final.text),
    'transições inválidas recusadas (done → todo; backlog → in_progress)', `transição inválida aceita: ${final.text} | ${rascunho.text}`);

  // spec
  const vaga = await tool('save_issue_spec', { id: 'LOJA-5', spec: { context: 'Clientes acham os cupons confusos.' } });
  const completa = await tool('save_issue_spec', {
    id: 'LOJA-3',
    spec: { rules: ['R1'], constraints: ['C1'], stack: 'Vendure', acceptance: ['A1'], verification: 'npm test' },
    files: ['src/plugins/primeira-compra/index.ts'],
  });
  checar('spec', vaga.json?.state === 'todo' && vaga.json.missing.includes('rules') && completa.json?.missing.length === 0 && completa.json.state === 'backlog',
    'save_issue_spec não muda estado e diz o que falta (LOJA-5 continua todo; LOJA-3 completa continua backlog)', `save_issue_spec inesperado: ${vaga.text} | ${completa.text}`);
  const coment = await tool('add_comment', { id: 'LOJA-2', body: 'entregue' });
  checar('comentario', coment.json?.comments === 1, 'add_comment grava', `add_comment: ${coment.text}`);

  // concorrência: processos separados escrevendo no mesmo arquivo ao mesmo tempo
  const filhos = (op, n, cada) => {
    const t0 = String(Date.now() + 400);
    return Promise.all(Array.from({ length: n }, (_, k) => new Promise((resolve) => {
      const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--filho', op, typeof cada === 'function' ? cada(k) : cada, t0], { env });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out.trim()));
    })));
  };
  const antes = board().find((i) => i.id === 'LOJA-1').comments.length;
  await filhos('comentar', 6, '10');
  const depois = board().find((i) => i.id === 'LOJA-1').comments.length;
  checar('lock', depois - antes === 60, '6 processos × 10 escritas concorrentes: 60 de 60 gravadas (lock + gravação atômica)', `só ${depois - antes} de 60 escritas gravadas: as outras se perderam`);

  const r2 = await tool('update_issue_state', { id: 'LOJA-2', state: 'in_review' });
  const disputa = await filhos('claim', 2, 'LOJA-7');
  const ganhou = disputa.filter((s) => s === 'ok').length;
  checar('claim_concorrente', !r2.isError && ganhou === 1 && disputa.some((s) => /já está in_progress/.test(s)),
    'duas sessões disputando a LOJA-7 ao mesmo tempo: 1 pega, a outra é recusada', `disputa da LOJA-7: ${disputa.join(' | ')}`);

  // cli
  const m1 = cli('mover', 'LOJA-2', 'done');
  const m2 = cli('mover', 'LOJA-2', 'todo');
  checar('cli_mover', m1.status === 0 && /in_review → done/.test(m1.stdout) && m2.status !== 0 && /done é final/.test(m2.stderr),
    'cli.js mover LOJA-2 done funciona; mover de volta para todo é recusado', `cli mover: ${m1.stdout}${m1.stderr} | ${m2.stdout}${m2.stderr}`);
  const rs = cli('reset');
  checar('cli_reset', rs.status === 0 && board().find((i) => i.id === 'LOJA-2').state === 'todo', 'cli.js reset volta ao seed (aqui, o do smoke)', `cli reset: ${rs.stderr}`);
} catch (e) {
  checar('execucao', false, '', `o smoke quebrou: ${e.message}`);
} finally {
  srv.stdin.end();
  srv.kill();
  rmSync(dir, { recursive: true, force: true });
}

const falhas = checagens.filter((c) => !c.ok);
const segundos = (Date.now() - inicio) / 1000;
if (comoJson) {
  console.log(JSON.stringify({ ok: falhas.length === 0, segundos, checagens }, null, 2));
} else {
  for (const c of checagens) console.log(`  ${c.ok ? '✔' : '✘'} ${c.texto}`);
  console.log(falhas.length ? `\n✘ ${falhas.length} falha(s) no board-mcp` : `\n✔ board-mcp ok (${checagens.length} checagens, ${segundos.toFixed(1)} s)`);
}
process.exitCode = falhas.length ? 1 : 0;
