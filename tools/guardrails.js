#!/usr/bin/env node
// guardrails.js: as regras HARD do time loja como código, sem dependências.
// Hard = o time nunca aceita quebrar e dá para escrever o check. O resto é revisão (docs/regras-do-time.md).
// Adicionar uma regra é adicionar um item em REGRAS: { id, alvo, regra, check(conteudo) => [{ linha, msg }] }.
//
//   node tools/guardrails.js                    analisa a árvore de trabalho; exit 1 se houver violação
//   node tools/guardrails.js --ref main         analisa outra branch ou commit sem checkout nem stash
//                                               (lê com git ls-tree e git show; as regras são as DESTE arquivo)
//   node tools/guardrails.js --regra sem-skip   só as regras com esse id (repita a flag ou separe por vírgula)
//   node tools/guardrails.js --avisos           lista também os avisos soft (não bloqueiam; ver "Calibração")
//   node tools/guardrails.js --json             saída em JSON (hooks, conferir, agente)
//
// Alvos: src (src/**/*.ts), plugins (src/plugins/<dominio>/**: o código dos plugins do time, sem o
// registro.ts e sem o legado de src/misc, src/stuff e src/utils), test (test/**/*.ts), package (package.json).
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = process.cwd();

// ---------- leitura: árvore de trabalho ou uma ref do git ----------
function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function fonteDaArvore() {
  const listar = (dir) => {
    const out = [];
    if (!statSync(path.join(ROOT, dir), { throwIfNoEntry: false })) return out;
    for (const nome of readdirSync(path.join(ROOT, dir))) {
      const p = path.posix.join(dir, nome);
      if (statSync(path.join(ROOT, p)).isDirectory()) out.push(...listar(p));
      else out.push(p);
    }
    return out;
  };
  return {
    arquivos: [...listar('src'), ...listar('test'), ...(statSync(path.join(ROOT, 'package.json'), { throwIfNoEntry: false }) ? ['package.json'] : [])],
    ler: (arq) => readFileSync(path.join(ROOT, arq), 'utf8'),
  };
}

function fonteDaRef(ref) {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    throw new Error(`ref "${ref}" não existe (git branch -a; num clone novo, rode npm run setup)`);
  }
  return {
    arquivos: git('ls-tree', '-r', '--name-only', ref, '--', 'src', 'test', 'package.json').split('\n').filter(Boolean),
    ler: (arq) => git('show', `${ref}:${arq}`),
  };
}

const ALVOS = {
  src: (a) => /^src\/.*\.ts$/.test(a) && !a.endsWith('.d.ts'),
  plugins: (a) => /^src\/plugins\/[^/]+\/.*\.ts$/.test(a) && !a.endsWith('.d.ts'),
  test: (a) => /^test\/.*\.ts$/.test(a),
  package: (a) => a === 'package.json',
};

// ---------- ajudantes para escrever checks ----------
const porLinha = (conteudo, regex, msg) =>
  conteudo.split('\n').flatMap((l, i) => (regex.test(l) ? [{ linha: i + 1, msg: msg(l) }] : []));

// Funções e métodos com o tamanho do corpo em linhas (heurística de chaves; suficiente para TS simples).
function funcoes(conteudo) {
  const linhas = conteudo.split('\n');
  const found = [];
  linhas.forEach((l, i) => {
    const m = l.match(/(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(?[\w\s,{}=:<>\[\]|]*\)?\s*(?::\s*[\w<>\[\]|, ]+)?\s*=>|^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>\[\]|, ]+)?\s*\{)/);
    if (!m || !l.includes('{')) return;
    const nome = m[1] || m[2] || m[3] || 'anônima';
    if (['if', 'for', 'while', 'switch', 'catch'].includes(nome)) return;
    let depth = 0;
    for (let j = i; j < linhas.length; j++) {
      for (const ch of linhas[j]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth === 0 && j > i) {
        found.push({ nome, inicio: i + 1, linhas: j - i + 1 });
        break;
      }
    }
  });
  return found;
}

// Cada bloco it('...', () => { ... }) / test('...') do vitest e o que tem dentro.
function blocosDeTeste(conteudo) {
  const linhas = conteudo.split('\n');
  const blocos = [];
  linhas.forEach((l, i) => {
    const m = l.match(/^\s*(?:it|test)(?:\.\w+)?\(\s*['"`](.+?)['"`]/);
    if (!m) return;
    let depth = 0;
    const corpo = [];
    for (let j = i; j < linhas.length; j++) {
      corpo.push(linhas[j]);
      for (const ch of linhas[j]) { if (ch === '{') depth++; if (ch === '}') depth--; }
      if (depth === 0 && j > i) break;
    }
    blocos.push({ nome: m[1], linha: i + 1, corpo: corpo.join('\n') });
  });
  return blocos;
}

// Dependências que o Vendure trouxe no create. Qualquer outra precisa de ADR (ADR-003).
const DEPS_PERMITIDAS = /^(@vendure\/.*|better-sqlite3|dotenv)$/;

// ---------- regras hard: bloqueiam (exit 1), rodam no stop-gate e no CI ----------
// Os ids entre parênteses são os do time no servidor revisor (tools/revisor-mcp/data/rules.json e adrs.json; docs/adr/).
const REGRAS = [
  {
    id: 'sem-segredo',
    alvo: 'src+test',
    regra: 'Nenhuma credencial no código: chaves, senhas, URLs com senha (R-02).',
    check: (c) => porLinha(c, /(sk_(live|test)_|api[_-]?key\s*[:=]\s*['"][^'"]{8,}|password\s*[:=]\s*['"]|:\/\/\w+:[^@\s]+@)/i, () => 'parece uma credencial hardcoded'),
  },
  {
    id: 'sem-console-log',
    alvo: 'src',
    regra: 'Nenhum console.log em src/ (R-05).',
    check: (c) => porLinha(c, /console\.log\(/, () => 'console.log em código de produção'),
  },
  {
    id: 'sem-dependencias-novas',
    alvo: 'package',
    regra: 'Sem dependências de runtime além das que o Vendure trouxe (ADR-003).',
    check: (c) => {
      const pkg = JSON.parse(c);
      const extras = Object.keys(pkg.dependencies ?? {}).filter((d) => !DEPS_PERMITIDAS.test(d));
      return extras.length ? [{ linha: 1, msg: `dependência(s) fora da lista do Vendure: ${extras.join(', ')}` }] : [];
    },
  },
  {
    id: 'dinheiro-em-centavos',
    alvo: 'src',
    regra: 'Dinheiro em centavos inteiros: sem toFixed(2), sem literais com 2 casas decimais (ADR-001).',
    check: (c) => porLinha(c, /toFixed\(\s*2\s*\)|\b\d+\.\d{2}\b/, (l) => `valor em reais/float: ${l.trim().slice(0, 60)}`),
  },
  {
    id: 'teste-com-assert',
    alvo: 'test',
    regra: 'Todo it()/test() tem ao menos um expect que compara algo (nada de expect(true).toBe(true)).',
    check: (c) =>
      blocosDeTeste(c)
        .filter((b) => !/expect\((?!true\)|1\))[^\n]*\)\s*\.(to|resolves|rejects|not)/.test(b.corpo))
        .map((b) => ({ linha: b.linha, msg: `"${b.nome}" não verifica nada` })),
  },
  {
    id: 'sem-skip',
    alvo: 'test',
    regra: 'Nenhum teste pulado (it.skip / test.skip / todo) chega ao PR.',
    check: (c) => porLinha(c, /\b(it|test|describe)\.(skip|todo)\(/, () => 'teste pulado'),
  },
];

// ---------- avisos soft: têm check, mas NÃO bloqueiam (calibração; docs/regras-do-time.md) ----------
const AVISOS = [
  {
    id: 'funcao-longa',
    alvo: 'src',
    regra: 'Função com mais de 40 linhas: olhe na revisão se dá para quebrar (era hard até a Sprint 4; ver "Calibração").',
    check: (c) => funcoes(c).filter((f) => f.linhas > 40).map((f) => ({ linha: f.inicio, msg: `${f.nome} tem ${f.linhas} linhas` })),
  },
];

function aplicar(lista, fonte) {
  const achados = [];
  for (const regra of lista) {
    const testes = regra.alvo.split('+').map((g) => {
      if (!ALVOS[g]) throw new Error(`regra ${regra.id}: alvo desconhecido "${g}" (use ${Object.keys(ALVOS).join(', ')})`);
      return ALVOS[g];
    });
    for (const arq of fonte.arquivos.filter((a) => testes.some((t) => t(a)))) {
      for (const a of regra.check(fonte.ler(arq))) achados.push({ regra: regra.id, arquivo: arq, ...a });
    }
  }
  return achados;
}

/** Roda as regras. opcoes: { ref, regras: [ids] }. Devolve { violacoes: [...], avisos: [...] }. */
function rodar(opcoes = {}) {
  const fonte = opcoes.ref ? fonteDaRef(opcoes.ref) : fonteDaArvore();
  const filtro = opcoes.regras?.length ? (r) => opcoes.regras.includes(r.id) : () => true;
  return { violacoes: aplicar(REGRAS.filter(filtro), fonte), avisos: aplicar(AVISOS.filter(filtro), fonte) };
}

module.exports = { REGRAS, AVISOS, ALVOS, rodar, porLinha, funcoes, blocosDeTeste };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const valor = (flag) => argv.flatMap((a, i) => (a === flag ? [argv[i + 1]] : a.startsWith(`${flag}=`) ? [a.slice(flag.length + 1)] : []));
  const asJson = argv.includes('--json');
  const ref = valor('--ref').pop();
  const regras = valor('--regra').flatMap((v) => String(v ?? '').split(',')).filter(Boolean);
  const conhecidas = [...REGRAS, ...AVISOS].map((r) => r.id);
  const desconhecidas = regras.filter((r) => !conhecidas.includes(r));
  if (desconhecidas.length) {
    console.error(`guardrails: regra desconhecida: ${desconhecidas.join(', ')}. Existem: ${conhecidas.join(', ')}`);
    process.exit(2);
  }
  let r;
  try {
    r = rodar({ ref, regras });
  } catch (e) {
    console.error(`guardrails: ${e.message}`);
    process.exit(2);
  }
  const ativas = REGRAS.filter((x) => !regras.length || regras.includes(x.id)).length;
  const onde = ref ? ` em ${ref}` : '';
  if (asJson) {
    console.log(JSON.stringify({ ref: ref ?? null, regras: ativas, violacoes: r.violacoes.length, achados: r.violacoes, avisos: r.avisos }, null, 2));
  } else {
    if (!r.violacoes.length) {
      console.log(`🟢 guardrails${onde}: 0 violações (${ativas} regra(s) hard)`);
    } else {
      console.log(`🔴 guardrails${onde}: ${r.violacoes.length} violação(ões) em ${new Set(r.violacoes.map((a) => a.regra)).size} regra(s) hard\n`);
      for (const a of r.violacoes) console.log(`  [${a.regra}] ${a.arquivo}:${a.linha}  ${a.msg}`);
      console.log('\nRegras hard do time: docs/regras-do-time.md. Corrija antes de abrir o PR.');
    }
    if (argv.includes('--avisos')) {
      for (const a of r.avisos) console.log(`  aviso (soft) [${a.regra}] ${a.arquivo}:${a.linha}  ${a.msg}`);
    } else if (r.avisos.length) {
      console.log(`  (${r.avisos.length} aviso(s) soft, não bloqueiam: node tools/guardrails.js --avisos${ref ? ` --ref ${ref}` : ''})`);
    }
  }
  process.exit(r.violacoes.length ? 1 : 0);
}
