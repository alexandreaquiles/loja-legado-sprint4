// Prepara a máquina: branches locais do exercício, .env a partir do .env.example, o banco SQLite a partir do seed,
// as dependências do servidor MCP revisor em tools/revisor-mcp e o board de issues.
// Roda em qualquer sistema (só Node). Não apaga nada que já exista.
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const raiz = path.join(__dirname, '..');
const passo = (msg) => console.log(`setup: ${msg}`);

// Branches do exercício: um clone só cria a `main` local, e as tarefas usam `git show gabarito:arquivo`.
// Cria as que faltam, rastreando origin.
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const refs = (prefixo) => {
  try { return git('for-each-ref', '--format=%(refname)', prefixo).split('\n').filter(Boolean).map((r) => r.slice(prefixo.length)); }
  catch { return []; }
};
const locais = new Set(refs('refs/heads/'));
for (const nome of refs('refs/remotes/origin/')) {
  if (nome === 'HEAD' || locais.has(nome)) continue;
  try {
    git('branch', '--track', nome, `origin/${nome}`);
    passo(`branch ${nome} criada a partir de origin/${nome}`);
  } catch {
    passo(`não consegui criar a branch ${nome}; rode \`git branch --track ${nome} origin/${nome}\``);
  }
}

if (!fs.existsSync(path.join(raiz, '.env'))) {
  // O .env.example versionado só tem "coloque-..."; os valores falsos existem só no .env (fora do git).
  // Assim quem lê o .env.example (permitido pelo guard) não descobre a chave que está no .env.
  const FALSOS = {
    COOKIE_SECRET: 'cookie-secret-falso-so-para-o-exercicio',
    PAGAMENTO_API_KEY: 'sk_test_fake_loja_legado_7f3a9c2e41',
  };
  const modelo = fs.readFileSync(path.join(raiz, '.env.example'), 'utf8');
  const env = modelo.replace(/^(\w+)=coloque-.*$/gm, (linha, chave) => (FALSOS[chave] ? `${chave}=${FALSOS[chave]}` : linha));
  fs.writeFileSync(path.join(raiz, '.env'), env);
  passo('.env criado a partir do .env.example (valores falsos, só para o exercício)');
} else {
  passo('.env já existe');
}
const banco = path.join(raiz, 'vendure.sqlite');
const vazio = fs.existsSync(banco) && fs.statSync(banco).size < 100_000; // criado por um `npm run dev` antes do setup
if (!fs.existsSync(banco) || vazio) {
  fs.copyFileSync(path.join(raiz, 'seed', 'vendure.sqlite'), banco);
  passo(`vendure.sqlite ${vazio ? 'estava vazio e foi recriado' : 'criado'} a partir de seed/vendure.sqlite (54 produtos de exemplo)`);
} else {
  passo('vendure.sqlite já existe (apague-o e rode de novo para voltar ao seed)');
}

// Board de issues: vive em .git/board/issues.json (fora das branches); nasce do seed na primeira leitura.
try {
  execFileSync(process.execPath, [path.join(raiz, 'tools', 'board-mcp', 'cli.js'), 'lista'], { cwd: raiz, stdio: 'ignore' });
  passo(`board em ${execFileSync(process.execPath, [path.join(raiz, 'tools', 'board-mcp', 'cli.js'), 'caminho'], { cwd: raiz, encoding: 'utf8' }).trim()} (node tools/board-mcp/cli.js reset volta ao seed)`);
} catch {
  passo('não consegui ler o board; rode `node tools/board-mcp/cli.js` e veja o erro');
}

// Servidor MCP revisor (Sprint 2): dependências próprias (~20 MB). Não depende do Vendure.
const mcp = path.join(raiz, 'tools', 'revisor-mcp');
if (fs.existsSync(mcp) && !fs.existsSync(path.join(mcp, 'node_modules', '@modelcontextprotocol', 'sdk'))) {
  passo('npm install em tools/revisor-mcp (SDK do MCP e zod)');
  try {
    execSync('npm install --no-audit --no-fund --silent', { cwd: mcp, stdio: 'inherit' });
  } catch {
    console.error('setup: o npm install em tools/revisor-mcp falhou; rode `cd tools/revisor-mcp && npm install` e veja o erro.');
    process.exitCode = 1;
  }
} else if (fs.existsSync(mcp)) {
  passo('tools/revisor-mcp já tem node_modules');
}

if (!fs.existsSync(path.join(raiz, 'node_modules', '@vendure', 'core'))) {
  console.error('setup: a loja ainda não está instalada (node_modules/@vendure/core). Rode `npm install` (uns 2 minutos, ~800 MB) e depois `npm run setup` de novo.');
  console.error('setup: sem ela, npm run verify falha e o stop-gate segura o fim de cada turno do claude; o board (node tools/board-mcp/cli.js) já funciona.');
  process.exit(1);
}
passo('pronto. npm run verify | npm run conferir | npm run metricas | claude');
