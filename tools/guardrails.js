#!/usr/bin/env node
// guardrails.js: análise estática do time loja, sem dependências.
// Só regras HARD (as que o time nunca aceita quebrar). Regras soft ficam para a revisão (ver docs/regras-do-time.md).
// Cada regra é um objeto: adicionar uma regra nova é adicionar um item na lista REGRAS (feito ao vivo na aula).
//   node tools/guardrails.js            -> analisa src/, test/ e package.json; exit 1 se houver violação
//   node tools/guardrails.js --json     -> saída em JSON (para hooks e para o agente ler)
const { readFileSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const asJson = process.argv.includes('--json');

function arquivos(dir, ext = '.ts') {
  const out = [];
  if (!statSync(path.join(ROOT, dir), { throwIfNoEntry: false })) return out;
  for (const nome of readdirSync(path.join(ROOT, dir))) {
    const p = path.join(dir, nome);
    if (statSync(path.join(ROOT, p)).isDirectory()) out.push(...arquivos(p, ext));
    else if (nome.endsWith(ext) && !nome.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// Encontra funções e métodos e mede o corpo em linhas (heurística de chaves; suficiente para TS simples).
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
    let depth = 0, corpo = [];
    for (let j = i; j < linhas.length; j++) {
      corpo.push(linhas[j]);
      for (const ch of linhas[j]) { if (ch === '{') depth++; if (ch === '}') depth--; }
      if (depth === 0 && j > i) break;
    }
    blocos.push({ nome: m[1], linha: i + 1, corpo: corpo.join('\n') });
  });
  return blocos;
}

const porLinha = (conteudo, regex, msg) =>
  conteudo.split('\n').flatMap((l, i) => (regex.test(l) ? [{ linha: i + 1, msg: msg(l) }] : []));

// Dependências que o Vendure trouxe no create. Qualquer outra precisa de ADR (ADR-003).
const DEPS_PERMITIDAS = /^(@vendure\/.*|better-sqlite3|dotenv)$/;

const REGRAS = [
  {
    id: 'sem-console-log',
    alvo: 'src',
    regra: 'Nenhum console.log em src/ (R-05).',
    check: (c) => porLinha(c, /console\.log\(/, () => 'console.log em código de produção'),
  },
  {
    id: 'sem-segredo',
    alvo: 'src+test',
    regra: 'Nenhuma credencial no código: chaves, senhas, URLs com senha (R-02).',
    check: (c) => porLinha(c, /(sk_(live|test)_|api[_-]?key\s*[:=]\s*['"][^'"]{8,}|password\s*[:=]\s*['"]|:\/\/\w+:[^@\s]+@)/i, () => 'parece uma credencial hardcoded'),
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
    id: 'funcao-curta',
    alvo: 'src',
    regra: 'Funções com no máximo 40 linhas.',
    check: (c) => funcoes(c).filter((f) => f.linhas > 40).map((f) => ({ linha: f.inicio, msg: `${f.nome} tem ${f.linhas} linhas (máx. 40)` })),
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

function rodar() {
  const achados = [];
  const alvos = {
    src: arquivos('src'),
    test: arquivos('test'),
    package: ['package.json'],
  };
  for (const regra of REGRAS) {
    for (const g of regra.alvo.split('+')) {
      for (const arq of alvos[g]) {
        const conteudo = readFileSync(path.join(ROOT, arq), 'utf8');
        for (const a of regra.check(conteudo)) achados.push({ regra: regra.id, arquivo: arq, ...a });
      }
    }
  }
  return achados;
}

module.exports = { REGRAS, rodar, porLinha };

if (require.main === module) {
  const achados = rodar();
  if (asJson) {
    console.log(JSON.stringify({ violacoes: achados.length, achados }, null, 2));
  } else if (!achados.length) {
    console.log(`🟢 guardrails: 0 violações (${REGRAS.length} regras hard)`);
  } else {
    console.log(`🔴 guardrails: ${achados.length} violação(ões)\n`);
    for (const a of achados) console.log(`  [${a.regra}] ${a.arquivo}:${a.linha}  ${a.msg}`);
    console.log('\nRegras hard do time: docs/regras-do-time.md. Corrija antes de abrir o PR.');
  }
  process.exit(achados.length ? 1 : 0);
}
