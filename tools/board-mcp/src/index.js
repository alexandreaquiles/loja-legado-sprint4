#!/usr/bin/env node
// board-mcp: um "Linear de bolso". Servidor MCP sem dependências (JSON-RPC 2.0 por stdio),
// para a demo não precisar de conta, OAuth nem npm install dentro de cada worktree.
//
// Os dados ficam FORA das branches, em .git/board/issues.json (o git-common-dir é compartilhado
// por todos os worktrees), exatamente como um board de verdade vive fora do repositório.
// Seed: tools/board-mcp/data/issues.seed.json. Reset: node tools/board-mcp/cli.js reset
// As regras (transições, claim duplo, bloqueio, sobreposição de files) estão em board.js; o lock, em store.js.
import { createInterface } from 'node:readline';
import { load, update } from './store.js';
import { STATES, listar, obter, mover, comentar, salvarSpec } from './board.js';

// ---- tools -----------------------------------------------------------------
const tools = [
  {
    name: 'list_issues',
    description:
      'Lists issues of the board, optionally filtered by state, sorted by priority (then by id). ' +
      'Use this to pick the next issue to work on: set unblocked_only=true to hide issues whose blockers are not done, and list state=in_progress to see which files are already being touched. ' +
      'Returns id, title, state, priority, blocked_by and the files each issue touches (never the full spec).',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: STATES, description: 'Filter by state. Omit to list all.' },
        unblocked_only: { type: 'boolean', description: 'true = only issues whose blocked_by are all done (default false).' },
      },
    },
    handler: (args) => listar(load(), args),
  },
  {
    name: 'get_issue',
    description:
      'Returns one issue with its full spec (context, rules, constraints, stack, acceptance, verification), files and comments. ' +
      'Use this after claiming an issue and before planning. ' +
      'The spec is written by humans: if a section is missing or vague, the issue is not ready.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Issue id, e.g. "LOJA-2".' } }, required: ['id'] },
    handler: ({ id }) => obter(load(), id),
  },
  {
    name: 'update_issue_state',
    description:
      'Moves an issue to a new state: in_progress to claim it right after choosing, in_review when delivered, blocked when it cannot proceed (with a comment), done after merge. ' +
      'Use it as soon as you pick an issue, so no other session takes it. ' +
      'Returns from/to; refuses with an explanation when the issue is already in that state (another session claimed it), the transition is invalid, a blocker is not done, or another in_progress issue touches the same files.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Issue id.' },
        state: { type: 'string', enum: STATES, description: 'New state.' },
      },
      required: ['id', 'state'],
    },
    handler: ({ id, state }) => update((issues) => mover(issues, id, state)),
  },
  {
    name: 'add_comment',
    description:
      'Adds a comment to an issue. ' +
      'Use it to leave the delivery summary when moving to in_review (what was implemented, files touched, acceptance checklist, how to verify) or to list the questions when an issue is blocked. ' +
      'Returns the number of comments.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, body: { type: 'string', description: 'Markdown, max 1500 chars.' } },
      required: ['id', 'body'],
    },
    handler: ({ id, body }) => update((issues) => comentar(issues, id, body)),
  },
  {
    name: 'save_issue_spec',
    description:
      'Replaces spec sections of an issue (context, rules, constraints, stack, acceptance, verification) and, optionally, its files. ' +
      'Use it only when a human asks to write, rewrite or complete a spec; it never changes the state. ' +
      'Returns the state, which sections are filled and which are still missing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        spec: {
          type: 'object',
          properties: {
            context: { type: 'string' }, rules: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'array', items: { type: 'string' } }, stack: { type: 'string' },
            acceptance: { type: 'array', items: { type: 'string' } }, verification: { type: 'string' },
          },
        },
        files: { type: 'array', items: { type: 'string' }, description: 'Files the issue is expected to touch.' },
      },
      required: ['id', 'spec'],
    },
    handler: ({ id, spec, files }) => update((issues) => salvarSpec(issues, id, spec, files)),
  },
];

// ---- JSON-RPC por stdio (o protocolo MCP, sem SDK) --------------------------
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') {
      reply({
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'board', version: '1.1.0' },
        instructions: 'Board de issues do time loja. Specs vivem nas issues; o estado vive no board, não no código.',
      });
    } else if (method === 'ping') {
      reply({});
    } else if (method === 'tools/list') {
      reply({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    } else if (method === 'tools/call') {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, `tool desconhecida: ${params?.name}`);
      try {
        const out = tool.handler(params.arguments ?? {});
        reply({ content: [{ type: 'text', text: JSON.stringify(out) }] });
      } catch (e) {
        reply({ content: [{ type: 'text', text: `erro: ${e.message}` }], isError: true });
      }
    } else if (id !== undefined) {
      fail(-32601, `método não suportado: ${method}`);
    }
  } catch (e) {
    fail(-32603, e.message);
  }
});
