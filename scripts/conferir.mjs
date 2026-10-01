#!/usr/bin/env node
// npm run conferir                confere os cards 00 a 04 da Sprint 4
// npm run conferir -- 02          confere só um card
// npm run conferir -- --estrito   sai com 1 se houver algum ✘ (usado na verificação do curso)
//
// Feedback, não prova: Node puro, sem dependências próprias, sem LLM. Nunca lê o conteúdo do .env.
// Roda os guardrails (tools/guardrails.js --json, também com --ref na branch do PR) e o vitest da loja;
// lê o board de verdade (.git/board/issues.json) só para consultar o estado da LOJA-4.
// ✔ feito · ✘ falta fazer (com a dica do que olhar) · … pendente (depende de outro item ainda não feito)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const estrito = args.includes('--estrito');
const filtro = args.filter((a) => /^\d{1,2}$/.test(a)).map((a) => a.padStart(2, '0'));

const PR = 'feature/relatorio-descontos';
const ISSUE = 'LOJA-4';
const TESTE_PR = 'test/relatorio.test.ts';
const REVISAO = 'docs/revisoes/LOJA-4.md';
const LEITURA = 'docs/painel-leitura.md';
const SKILL = '.claude/skills/review-pr/SKILL.md';
const REVISOR = '.claude/agents/revisor-codigo.md';

// ---------- utilitários ----------
const arq = (...p) => path.join(raiz, ...p);
const existe = (...p) => fs.existsSync(arq(...p));
const ler = (...p) => { try { return fs.readFileSync(arq(...p), 'utf8'); } catch { return null; } };
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const virgula = (n) => n.toFixed(1).replace('.', ',');

function git(...a) {
  const r = spawnSync('git', a, { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
const temRef = (ref) => git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`) !== null;
const temBranch = (nome) => git('rev-parse', '--verify', '--quiet', `refs/heads/${nome}`) !== null;
const branchAtual = () => (git('branch', '--show-current') ?? '').trim();
const naRef = (ref, p) => (ref ? git('show', `${ref}:${p}`) : ler(...p.split('/')));

function lerJson(...p) {
  const t = ler(...p);
  if (t === null) return { falta: true };
  try { return { json: JSON.parse(t) }; } catch (e) { return { invalido: e.message }; }
}

const cacheTestes = new Map();
function rodarTestes(cwd = raiz) {
  if (cacheTestes.has(cwd)) return cacheTestes.get(cwd);
  const bin = arq('node_modules', 'vitest', 'vitest.mjs');
  if (!fs.existsSync(bin)) return { rodou: false, motivo: 'node_modules/vitest não existe (npm install)' };
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [bin, 'run', '--config', 'vitest.config.mts'], {
    cwd, encoding: 'utf8', timeout: 60000, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
  });
  const saida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  const linha = saida.match(/^\s*Tests\s+(.+)$/m)?.[1] ?? '';
  const num = (rotulo) => Number(linha.match(new RegExp(`(\\d+) ${rotulo}`))?.[1] ?? 0);
  const t = {
    rodou: linha !== '', verde: r.status === 0 && linha !== '',
    passaram: num('passed'), falharam: num('failed'), pulados: num('skipped') + num('todo'),
    segundos: (Date.now() - inicio) / 1000,
    motivo: linha ? '' : saida.trim().split('\n').slice(-3).join(' '),
  };
  cacheTestes.set(cwd, t);
  return t;
}

// Testes de outra ref sem mexer na árvore do aluno: worktree temporário dentro de .claude/worktrees/ (no .gitignore),
// de onde o node_modules da raiz é encontrado.
function rodarTestesNaRef(ref) {
  const dir = arq('.claude', 'worktrees', `conferir-${process.pid}`);
  if (git('worktree', 'add', '--detach', dir, ref) === null) return { rodou: false, motivo: `não consegui criar um worktree temporário de ${ref}` };
  try { return rodarTestes(dir); } finally { git('worktree', 'remove', '--force', dir); }
}

const cacheGuard = new Map();
function guardrails(ref) {
  const chave = ref ?? '(árvore)';
  if (cacheGuard.has(chave)) return cacheGuard.get(chave);
  const r = spawnSync(process.execPath, [arq('tools', 'guardrails.js'), '--json', ...(ref ? ['--ref', ref] : [])], { cwd: raiz, encoding: 'utf8', timeout: 30000 });
  let g;
  try { g = { rodou: true, ...JSON.parse(r.stdout) }; } catch { g = { rodou: false, motivo: (r.stderr || r.stdout || 'sem saída').trim().split('\n').pop() }; }
  cacheGuard.set(chave, g);
  return g;
}
const idsDe = (g) => [...new Set(g.achados.map((a) => a.regra))];

let cacheBoard;
function lerBoard() {
  if (cacheBoard) return cacheBoard;
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const f = process.env.BOARD_FILE ? path.resolve(process.env.BOARD_FILE) : common ? path.join(common.trim(), 'board', 'issues.json') : null;
  if (f && fs.existsSync(f)) {
    try { return (cacheBoard = { issues: JSON.parse(fs.readFileSync(f, 'utf8')), doSeed: false }); }
    catch (e) { return (cacheBoard = { erro: `board ilegível: ${e.message}` }); }
  }
  return (cacheBoard = { issues: lerJson('tools', 'board-mcp', 'data', 'issues.seed.json').json ?? [], doSeed: true });
}

// A "branch do PR" que os cards 02 e 03 conferem: a árvore atual se ela for o PR (ou o gabarito, que vale como o PR
// corrigido), senão a branch do PR lida pelo git, sem checkout.
function alvoDoPr() {
  const atual = branchAtual();
  if (atual === PR || atual === 'gabarito') return { ref: null, nome: atual === PR ? `${PR} (esta árvore)` : 'gabarito (vale como o PR corrigido)' };
  return temRef(PR) ? { ref: PR, nome: PR } : null;
}

// ---------- cards ----------
const cards = [];
const card = (id, titulo, checagens) => cards.push({ id, titulo, checagens });
const ok = (texto) => ({ estado: 'ok', texto });
const falha = (texto, dica) => ({ estado: 'falha', texto, dica });
const pendente = (texto, dica) => ({ estado: 'pendente', texto, dica });

card('00', 'Preparar o ambiente', () => {
  const r = [];
  const [maj, min] = process.versions.node.split('.').map(Number);
  r.push(maj > 22 || (maj === 22 && min >= 12)
    ? ok(`Node ${process.versions.node} (precisa de 22.12 ou mais novo)`)
    : falha(`Node ${process.versions.node} é antigo`, 'instale o Node 22.12+ (nvm install 22)'));
  r.push(existe('node_modules', '@vendure', 'core') ? ok('dependências da loja instaladas (node_modules)') : falha('node_modules não existe', 'rode npm install (uns 2 minutos)'));
  r.push(existe('tools', 'revisor-mcp', 'node_modules', '@modelcontextprotocol', 'sdk') ? ok('dependências do servidor revisor instaladas (tools/revisor-mcp/node_modules)') : falha('tools/revisor-mcp sem node_modules', 'rode npm run setup'));
  r.push(existe('.env') && existe('vendure.sqlite') ? ok('.env e vendure.sqlite existem (o conferir não lê o .env)') : falha('falta .env ou vendure.sqlite', 'rode npm run setup'));
  const faltam = ['main', 'gabarito', PR].filter((b) => !temBranch(b));
  r.push(faltam.length === 0 ? ok(`branches locais main, gabarito e ${PR}`) : falha(`faltam as branches locais: ${faltam.join(', ')}`, 'rode npm run setup (cria as branches a partir do origin)'));

  const s = lerJson('.claude', 'settings.json').json;
  const harness = s?.permissions?.deny?.includes('Read(./.env)') && s?.permissions?.deny?.includes('Edit(./.env)')
    && ['PreToolUse', 'PostToolUse', 'Stop'].every((e) => s?.hooks?.[e]?.length) && existe('.claude', 'statusline.mjs') && existe(...REVISOR.split('/'));
  r.push(harness ? ok('harness das sprints anteriores (deny do .env, 3 hooks, statusline, revisor-codigo)') : falha('harness incompleto', 'git checkout main -- .claude'));
  const mcp = Object.keys(lerJson('.mcp.json').json?.mcpServers ?? {});
  const aprovados = s?.enabledMcpjsonServers ?? [];
  r.push(['board', 'revisor'].every((n) => mcp.includes(n) && aprovados.includes(n))
    ? ok('.mcp.json com board e revisor, aprovados em enabledMcpjsonServers (vale depois de confiar na pasta)')
    : falha(`servidores: ${mcp.join(', ') || 'nenhum'}; aprovados: ${aprovados.join(', ') || 'nenhum'}`, 'git checkout main -- .mcp.json .claude/settings.json'));

  const pkg = lerJson('package.json').json ?? {};
  const lock = lerJson('package-lock.json').json?.packages ?? {};
  const declaradas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const semLock = declaradas.filter((d) => !lock[`node_modules/${d}`]);
  r.push(semLock.length === 0
    ? ok(`package-lock.json tem as ${declaradas.length} dependências declaradas (npm ci no CI encontra todas)`)
    : falha(`package-lock.json sem: ${semLock.join(', ')}`, 'npm ci falha no CI; quem adicionou a dependência não atualizou o lockfile'));

  const b = lerBoard();
  const l4 = b.issues?.find((i) => i.id === ISSUE);
  if (b.erro) r.push(falha(b.erro, 'node tools/board-mcp/cli.js reset'));
  else if (l4?.state === 'in_review') r.push(ok(`board: ${ISSUE} em in_review, esperando revisão${b.doSeed ? ' (seed)' : ''}`));
  else if (['in_progress', 'done'].includes(l4?.state)) r.push(ok(`board: ${ISSUE} em ${l4.state} (a revisão já andou; node tools/board-mcp/cli.js reset volta ao início)`));
  else r.push(falha(`board: ${ISSUE} em ${l4?.state ?? '?'}`, 'node tools/board-mcp/cli.js reset'));

  const g = guardrails();
  if (branchAtual() === PR && !(g.rodou && g.violacoes === 0)) {
    r.push(pendente(`você está na ${PR} antes da correção: aqui o npm run verify fica vermelho`, 'o card 00 confere a main: git checkout main && npm run conferir -- 00'));
    return r;
  }
  if (!g.rodou) r.push(falha('tools/guardrails.js não rodou', g.motivo));
  else r.push(g.violacoes === 0 ? ok(`guardrails: 0 violações (${g.regras} regras hard)${branchAtual() === PR ? ` na ${PR} (já corrigida no card 02)` : ''}`) : falha(`guardrails: ${g.violacoes} violação(ões) nesta branch`, 'node tools/guardrails.js mostra arquivo e linha'));
  const t = rodarTestes();
  if (!t.rodou) r.push(falha('npm test não rodou', t.motivo || 'veja a saída de npm test'));
  else if (t.verde) r.push(ok(`npm test: ${t.passaram} testes verdes em ${virgula(t.segundos)} s: npm run verify verde`));
  else r.push(falha(`npm test vermelho: ${t.passaram} verdes, ${t.falharam} falhando`, 'a main chega verde; sem isso o stop-gate segura cada turno do claude'));
  return r;
});

card('01', 'Sentir o problema: o PR com testes verdes', () => {
  const r = [];
  if (!temRef(PR)) return [pendente(`a branch ${PR} não existe aqui`, 'rode npm run setup')];
  const g = guardrails(PR);
  if (!g.rodou) return [pendente(`não consegui rodar os guardrails em ${PR}`, g.motivo)];
  r.push(ok(g.violacoes
    ? `guardrails da main na branch do PR: ${g.violacoes} violações em ${idsDe(g).length} regras hard (${idsDe(g).join(', ')}), sem checkout: node tools/guardrails.js --ref ${PR}`
    : `a branch do PR já passa nos guardrails (corrigida no card 02); o que eles pegavam está no histórico: git log ${PR}`));
  r.push(ok(g.avisos?.length
    ? `${g.avisos.length} aviso(s) soft na branch do PR (${[...new Set(g.avisos.map((a) => a.regra))].join(', ')}): não bloqueiam; ver "Calibração" em docs/regras-do-time.md`
    : '0 avisos soft na branch do PR (node tools/guardrails.js --avisos)'));
  const teste = naRef(PR, TESTE_PR) ?? '';
  const pulados = (teste.match(/\b(it|test|describe)\.(skip|todo)\(/g) ?? []).length;
  r.push(ok(pulados
    ? `${TESTE_PR} na branch do PR tem ${pulados} teste(s) pulado(s): "verde" no npm test não diz o que ficou de fora`
    : `${TESTE_PR} na branch do PR sem teste pulado`));
  r.push(ok('o resto você acha revisando o diff contra a spec da LOJA-4 (node tools/board-mcp/cli.js show LOJA-4); a revisão em duas camadas é o card 03'));
  return r;
});

card('02', 'Guardrails no loop: a branch do PR até o verify verde', () => {
  const r = [];
  const gate = ler('.claude', 'hooks', 'stop-gate.sh') ?? '';
  r.push(/npm run verify|tools\/guardrails\.js/.test(gate)
    ? ok('stop-gate.sh roda npm run verify (guardrails + testes) antes de deixar o agente encerrar')
    : falha('stop-gate.sh não chama os guardrails', 'git checkout main -- .claude/hooks/stop-gate.sh'));
  const verify = lerJson('package.json').json?.scripts?.verify ?? '';
  const ci = ler('.github', 'workflows', 'verify.yml') ?? '';
  r.push(/guardrails\.js/.test(verify) && /vitest/.test(verify) && /npm ci/.test(ci) && /npm run verify/.test(ci)
    ? ok('npm run verify = guardrails + vitest, e o CI (.github/workflows/verify.yml) roda o mesmo depois de npm ci')
    : falha('npm run verify ou o CI não rodam guardrails e testes', 'git checkout main -- package.json .github'));

  const alvo = alvoDoPr();
  if (!alvo) return [...r, pendente(`a branch ${PR} não existe aqui`, 'rode npm run setup')];
  const g = guardrails(alvo.ref);
  if (!g.rodou) return [...r, falha(`guardrails não rodaram em ${alvo.nome}`, g.motivo)];
  if (g.violacoes) {
    r.push(falha(`${alvo.nome}: ${g.violacoes} violação(ões) hard (${idsDe(g).join(', ')})`,
      `git checkout ${PR} e peça ao agente para corrigir até npm run verify passar, sem enfraquecer os testes (curso, seção «Guardrails de qualidade», aula «Análise estática»)`));
  } else {
    r.push(ok(`${alvo.nome}: guardrails com 0 violações`));
  }
  const regua = naRef(alvo.ref, 'tools/guardrails.js') ?? '';
  const idsMain = (naRef('main', 'tools/guardrails.js') ?? ler('tools', 'guardrails.js') ?? '').match(/^\s{4}id: '([\w-]+)'/gm)?.map((l) => l.match(/'([\w-]+)'/)[1]) ?? [];
  const sumiram = idsMain.filter((id) => !regua.includes(`'${id}'`));
  r.push(sumiram.length === 0 ? ok('a régua não foi afrouxada: as regras da main continuam no guardrails.js da branch') : falha(`a branch removeu regra(s) da main: ${sumiram.join(', ')}`, 'corrigir o código, não a regra'));

  const teste = naRef(alvo.ref, TESTE_PR);
  if (teste === null) return [...r, falha(`${TESTE_PR} não existe em ${alvo.nome}`, 'a spec da LOJA-4 pede os testes nesse arquivo')];
  const semSkip = !/\b(it|test|describe)\.(skip|todo)\(/.test(teste);
  const semTrue = !/expect\(\s*(true|1)\s*\)/.test(teste);
  const ordena = /orden/i.test(semAcento(teste));
  r.push(semSkip && ordena ? ok('o teste de ordenação voltou e nenhum teste está pulado') : falha(semSkip ? 'nenhum teste fala de ordenação (R3)' : 'ainda há teste pulado', 'o teste pulado precisa voltar e passar, não sumir'));
  r.push(semTrue ? ok('nenhum expect(true) nos testes do relatório') : falha('ainda há expect(true) nos testes do relatório', 'cada teste verifica um comportamento da spec'));

  let t;
  if (alvo.ref === null) t = rodarTestes();
  else if (g.violacoes === 0) t = rodarTestesNaRef(alvo.ref);
  if (!t) r.push(pendente(`testes de ${alvo.nome}: rodam quando os guardrails passarem`, `ou rode npm test na ${PR}`));
  else if (!t.rodou) r.push(falha(`testes de ${alvo.nome} não rodaram`, t.motivo));
  else if (t.verde && t.pulados === 0) r.push(ok(`testes de ${alvo.nome}: ${t.passaram} verdes, 0 pulados`));
  else r.push(falha(`testes de ${alvo.nome}: ${t.passaram} verdes, ${t.falharam} falhando, ${t.pulados} pulado(s)`, 'npm run verify precisa ficar verde sem pular teste'));
  return r;
});

card('03', 'Revisão em duas camadas: /review-pr', () => {
  const r = [];
  const skill = semAcento(ler(...SKILL.split('/')));
  const marcas = [
    [/guardrails\.js/.test(skill) && /npm test/.test(skill), 'camada 1: guardrails e testes'],
    [/revisor-codigo/.test(skill), 'camada 2: subagente revisor-codigo'],
    [/approve/.test(skill) && /request_changes/.test(skill), 'decisão APPROVE ou REQUEST_CHANGES'],
    [/vira hard/.test(skill), 'pergunta "vira hard?"'],
  ];
  const faltaSkill = marcas.filter(([p]) => !p).map(([, t]) => t);
  r.push(faltaSkill.length === 0 ? ok(`skill review-pr: ${marcas.map(([, t]) => t).join('; ')}`) : falha(`${SKILL}: falta ${faltaSkill.join('; ')}`, 'git checkout main -- .claude/skills/review-pr'));
  const revisor = ler(...REVISOR.split('/')) ?? '';
  const ferramentas = revisor.match(/^tools:\s*(.+)$/m)?.[1] ?? '';
  r.push(revisor && !/bash/i.test(ferramentas) && /regras-do-time\.md/.test(revisor)
    ? ok(`revisor-codigo só lê (tools: ${ferramentas.trim()}) e usa docs/regras-do-time.md como régua`)
    : falha('revisor-codigo com Bash ou sem docs/regras-do-time.md', `git checkout main -- ${REVISOR}`));
  const semHooks = lerJson('.claude', 'settings.sem-hooks.json').json;
  r.push(semHooks?.disableAllHooks === true
    ? ok('sessão de revisão sem stop-gate: claude --settings .claude/settings.sem-hooks.json')
    : falha('.claude/settings.sem-hooks.json não desliga os hooks', 'o stop-gate empurraria o revisor a "corrigir"; git checkout main -- .claude/settings.sem-hooks.json'));

  const rev = ler(...REVISAO.split('/'));
  if (rev === null) {
    r.push(falha(`${REVISAO} não existe`, `rode /review-pr ${PR} numa sessão sem hooks; a skill grava a decisão lá (curso, seção «Guardrails de qualidade», aula «Revisão de código»)`));
    return r;
  }
  const t = semAcento(rev);
  const decisao = rev.match(/decis[aã]o:?\**\s*(APPROVE|REQUEST_CHANGES)/i)?.[1];
  r.push(decisao ? ok(`${REVISAO}: decisão ${decisao.toUpperCase()}`) : falha(`${REVISAO} sem "Decisão: APPROVE" ou "Decisão: REQUEST_CHANGES"`, 'aprovado com ressalvas não existe'));
  r.push(/camada determin/.test(t) && /\d+\s+violac/.test(t) ? ok('registra a camada determinística com o número de violações') : falha('não registra a camada determinística (violações e testes)', 'a camada 1 vem antes e custa quase nada'));
  const achados = rev.match(/[\w./-]+\.(ts|json|md|yml):\d+/g) ?? [];
  r.push(achados.length >= 2 ? ok(`${achados.length} achados com arquivo:linha`) : falha('menos de 2 achados com arquivo:linha', 'achado sem evidência não entra'));
  r.push(/vira hard/.test(t) && /\b(sim|nao)\b/.test(t) ? ok('responde "vira hard?" para os achados') : falha('falta a seção "Vira hard?" com sim/não por achado', 'dá para escrever o check? se sim, é hard'));
  return r;
});

card('04', 'Medir sem vaidade', () => {
  const r = [];
  const m = spawnSync(process.execPath, [arq('tools', 'metricas.mjs'), '--json'], { cwd: raiz, encoding: 'utf8', timeout: 10000 });
  let painel;
  try { painel = JSON.parse(m.stdout); } catch { painel = null; }
  const times = painel ? Object.keys(painel.times) : [];
  r.push(painel && times.length >= 2 && painel.pergunta
    ? ok(`npm run metricas roda: ${times.length} times (${times.join(', ')}), antes × depois e a pergunta de interpretação`)
    : falha('npm run metricas não rodou', (m.stderr || '').trim().split('\n').pop() || 'git checkout main -- tools/metricas.mjs metrics'));
  const leitura = ler(...LEITURA.split('/'));
  if (leitura === null) {
    r.push(falha(`${LEITURA} não existe`, 'rode npm run metricas, responda a pergunta do fim em poucas linhas (curso, seção «Estratégias de adoção», aula «Métricas para avaliação»)'));
    return r;
  }
  const t = semAcento(leitura);
  r.push(times.some((n) => t.includes(semAcento(n))) && /(decid|decisao|energia|piloto|vou |faria)/.test(t)
    ? ok('a leitura escolhe um time e diz o que fazer') : falha('a leitura não diz qual time nem o que fazer', 'uma decisão, não um resumo do painel'));
  r.push(/\d+([.,]\d+)?\s*(%|h\b)/.test(leitura) ? ok('a decisão se apoia em um número do painel') : falha('nenhum número (%, h) sustenta a decisão', 'ex.: change fail rate antes e depois'));
  r.push(/(vaidade|tokens?|so prs|prs sozinh|linhas)/.test(t) ? ok('nomeia a métrica que engana (tokens ou PRs sozinhos) e por quê') : falha('não nomeia a métrica de vaidade', 'tokens medem gasto; PRs sozinhos premiam retrabalho'));
  return r;
});

// ---------- saída ----------
const simbolo = { ok: '✔', falha: '✘', pendente: '…' };
const total = { ok: 0, falha: 0, pendente: 0 };
const escolhidos = cards.filter((c) => filtro.length === 0 || filtro.includes(c.id));
if (escolhidos.length === 0) {
  console.log(`Card desconhecido: ${filtro.join(', ')}. Use 00, 01, 02, 03 ou 04.`);
  process.exit(estrito ? 1 : 0);
}
const inicio = Date.now();
for (const c of escolhidos) {
  console.log(`\nCard ${c.id} · ${c.titulo}`);
  let itens;
  try { itens = c.checagens(); } catch (e) { itens = [falha(`erro ao conferir: ${e.message}`)]; }
  for (const i of itens) {
    total[i.estado]++;
    console.log(`  ${simbolo[i.estado]} ${i.texto}`);
    if (i.dica && i.estado !== 'ok') console.log(`      → ${i.dica}`);
  }
}
console.log(`\nResumo: ${total.ok} ✔ · ${total.falha} ✘ · ${total.pendente} … (${virgula((Date.now() - inicio) / 1000)} s)`);
if (!estrito) console.log('Travou? Cada card do Trello tem Dica 1, Dica 2 e Gabarito (checkpoint do dia 5). Corrija e rode de novo.');
process.exit(estrito && total.falha > 0 ? 1 : 0);
