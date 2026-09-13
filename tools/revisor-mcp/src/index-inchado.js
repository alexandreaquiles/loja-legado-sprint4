// revisor-mcp INCHADO: o anti-exemplo. Mesmos dados, design ruim de propósito.
// O que está errado aqui (para apontar na aula):
//   1. 63 tools genéricas: o agente não sabe qual escolher e paga tokens por todas em toda mensagem.
//   2. Nomes e descrições vagos ("getData", "Gets data."), sem "quando usar" nem "o que retorna".
//   3. Parâmetros sem tipo (string livre em vez de enum), sem default, sem limite.
//   4. Retorno verboso: metadata, timestamps, ids internos, dados duplicados, regras inativas.
//   5. Escopo largo demais: uma tool "run_sql" que executa qualquer coisa, sem read-only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRules, listAdrs, listHistory } from './db.js';

const DEFAULT_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPO = process.env.LOJA_REPO ? path.resolve(process.env.LOJA_REPO) : DEFAULT_REPO;

const server = new McpServer({ name: 'revisor-inchado', version: '0.0.1' });

const LONG =
  'This tool is part of the DevReview integration layer and provides comprehensive access to the underlying data model, ' +
  'including but not limited to all associated entities, relationships, metadata, audit information, timestamps and internal identifiers. ' +
  'It supports a wide range of use cases across the development lifecycle and can be invoked at any time during a session. ' +
  'Please refer to the documentation for the complete list of parameters, return values, edge cases and known limitations. ' +
  'Note that this operation may require elevated permissions depending on the configured authentication scope, and results may be paginated, ' +
  'cached, rate-limited or filtered according to organization policies; in such cases the caller should retry with an appropriate backoff strategy, ' +
  'inspect the returned headers and metadata, and consult the audit log for additional context. Deprecated fields are still returned for backward ' +
  'compatibility but should not be relied upon by new integrations; see the migration guide for the recommended replacements and timelines. ' +
  'This description intentionally mirrors what large third-party MCP servers ship by default when toolsets are not filtered.';

// 1) A tool "faz-tudo": retorna o banco inteiro, com tudo que o agente não pediu.
server.registerTool(
  'getData',
  {
    title: 'Get Data',
    description: 'Gets data. ' + LONG,
    inputSchema: { type: z.string().optional().describe('type') },
  },
  async () => {
    const payload = {
      meta: { generated_at: new Date().toISOString(), server: 'revisor-inchado', version: '0.0.1', request_id: Math.random().toString(36).slice(2), cache: false, ttl_seconds: 0 },
      rules: listRules().map((r) => ({ ...r, _raw: { ...r }, updated_at: '2026-01-01T00:00:00Z', created_by: 'seed', tags: ['legacy', 'imported', r.category] })),
      adrs: listAdrs().map((a) => ({ ...a, _raw: { ...a }, updated_at: '2026-01-01T00:00:00Z', created_by: 'seed', revision: 1 })),
      history: listHistory(),
      stats: { rules_total: listRules().length, adrs_total: listAdrs().length, history_total: listHistory().length },
    };
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  }
);

// 2) Diff sem limite e sem aviso de dado não confiável.
server.registerTool(
  'fetchDiff',
  { title: 'Fetch Diff', description: 'Fetches the diff. ' + LONG, inputSchema: { branch: z.string().optional() } },
  async ({ branch }) => {
    const diff = execFileSync('git', ['diff', `main...${branch ?? 'HEAD'}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return { content: [{ type: 'text', text: diff }] };
  }
);

// 3) Escopo largo demais (não executa de verdade, mas o agente não sabe disso).
server.registerTool(
  'run_sql',
  { title: 'Run SQL', description: 'Runs any SQL statement against the database. ' + LONG, inputSchema: { query: z.string() } },
  async ({ query }) => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, executed: query, rows_affected: 0 }) }] })
);

// 4) Ruído: 60 tools genéricas geradas, cada uma com descrição longa. É o que acontece quando
//    você liga um MCP grande sem filtrar toolsets.
const entities = ['repository', 'branch', 'commit', 'issue', 'label', 'milestone', 'webhook', 'gist', 'release', 'workflow', 'secret', 'collaborator', 'star', 'discussion', 'project'];
const verbs = ['list', 'get', 'create', 'delete'];
let n = 0;
for (const e of entities) {
  for (const v of verbs) {
    n += 1;
    server.registerTool(
      `${v}_${e}`,
      { title: `${v} ${e}`, description: `${v[0].toUpperCase() + v.slice(1)}s ${e}s. ${LONG}`, inputSchema: { id: z.string().optional(), payload: z.string().optional() } },
      async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, tool: `${v}_${e}` }) }] })
    );
  }
}
console.error(`revisor-inchado: ${n + 3} tools registradas`);

const transport = new StdioServerTransport();
await server.connect(transport);
