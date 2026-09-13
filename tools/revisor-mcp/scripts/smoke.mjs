// Teste de fumaça, sem LLM e sem gastar token: sobe os dois servidores (enxuto e inchado) via stdio
// com um client MCP de verdade, lista as tools, chama cada uma e confere as defesas.
//   npm run smoke                 (na raiz do loja-legado ou em tools/revisor-mcp)
//   node scripts/smoke.mjs --json     saída em JSON (o npm run conferir usa)
//   node scripts/smoke.mjs --estrito  itens pendentes de card também reprovam (exit 1)
//   node scripts/smoke.mjs --pr=gabarito  branch usada no get_pr_diff (padrão feature/frete-gratis, o PR da Sprint 2;
//                                         na Sprint 3 o npm run smoke:revisor passa --pr=gabarito)
//
// Tokens estimados = caracteres / 4, arredondado à centena (a mesma conta de revisao/numeros-sprint2.json).
// Inventário = soma de JSON.stringify({ name, title, description, inputSchema }) de cada tool: é o que o
// cliente recebe no tools/list. Com o tool search do Claude Code ligado (padrão), só os nomes entram no
// contexto no início; com ENABLE_TOOL_SEARCH=false entra tudo (.claude/settings.demo-inchado.json).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const comoJson = args.includes('--json');
const estrito = args.includes('--estrito');

const PR = args.find((a) => a.startsWith('--pr='))?.slice('--pr='.length) || 'feature/frete-gratis';
const TIME = 'loja';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'revisor-smoke-'));
const HISTORICO = path.join(tmp, 'review-history.json'); // o histórico da demo (data/review-history.json) não muda
const env = { ...process.env, REVISOR_HISTORY_FILE: HISTORICO };

const tokens = (chars) => Math.round(chars / 4 / 100) * 100;
const texto = (r) => (r.content ?? []).map((c) => c.text ?? '').join('\n');

async function conectar(arquivo) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'src', arquivo)], env, stderr: 'ignore' });
  const client = new Client({ name: 'smoke', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

async function inventario(client) {
  const { tools } = await client.listTools();
  const chars = tools.reduce((s, t) => s + JSON.stringify({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema }).length, 0);
  return { tools: tools.length, caracteres: chars, tokens_estimados: tokens(chars), nomes: tools.map((t) => t.name), definicoes: tools };
}

// callTool devolve isError (erro da tool ou validação do Zod) ou lança (erro de protocolo): tratamos os dois igual.
async function chamar(client, name, a) {
  try {
    const r = await client.callTool({ name, arguments: a });
    return { isError: Boolean(r.isError), text: texto(r) };
  } catch (e) {
    return { isError: true, text: String(e.message ?? e) };
  }
}

const checagens = [];
// card null = núcleo (o smoke reprova); card '03'/'04' = entregável do aluno (pendente até ele fazer)
const checar = (id, card, ok, textoOk, textoFalha, dica) => checagens.push({ id, card, ok: Boolean(ok), texto: ok ? textoOk : textoFalha, dica });

const resultado = { inventario: {}, retornos: {}, prompts: [], checagens };
let enxuto;
let inchado;
try {
  // ---------- inchado ----------
  inchado = await conectar('index-inchado.js');
  const invInchado = await inventario(inchado);
  const getData = await chamar(inchado, 'getData', {});
  resultado.inventario.inchado = { tools: invInchado.tools, caracteres: invInchado.caracteres, tokens_estimados: invInchado.tokens_estimados };
  resultado.retornos.getData = { caracteres: getData.text.length, tokens_estimados: tokens(getData.text.length) };

  // ---------- enxuto ----------
  enxuto = await conectar('index.js');
  const invEnxuto = await inventario(enxuto);
  resultado.inventario.enxuto = { tools: invEnxuto.tools, caracteres: invEnxuto.caracteres, tokens_estimados: invEnxuto.tokens_estimados, nomes: invEnxuto.nomes };
  const defRules = invEnxuto.definicoes.find((t) => t.name === 'get_team_review_rules');
  resultado.get_team_review_rules = defRules ? { description: defRules.description, inputSchema: defRules.inputSchema } : null;

  const semFiltro = await chamar(enxuto, 'get_team_review_rules', { team_id: TIME });
  const comFiltro = await chamar(enxuto, 'get_team_review_rules', { team_id: TIME, severity: 'error' });
  const contagem = (r) => { try { return JSON.parse(r.text).count; } catch { return null; } };
  resultado.retornos.get_team_review_rules_sem_filtro = { regras: contagem(semFiltro), caracteres: semFiltro.text.length, tokens_estimados: tokens(semFiltro.text.length) };
  resultado.retornos.get_team_review_rules_severity_error = { regras: contagem(comFiltro), caracteres: comFiltro.text.length, tokens_estimados: tokens(comFiltro.text.length) };
  checar('rules_loja', null, !semFiltro.isError && contagem(semFiltro) > 0,
    `get_team_review_rules(team_id="${TIME}") devolve ${contagem(semFiltro)} regras`, `get_team_review_rules(team_id="${TIME}") falhou: ${semFiltro.text.slice(0, 120)}`);

  // Card 03: time inexistente é erro informativo (o curso: «Planejando nosso MCP server customizado»).
  const inexistente = await chamar(enxuto, 'get_team_review_rules', { team_id: 'time-que-nao-existe' });
  checar('rules_time_inexistente', '03', inexistente.isError && inexistente.text.includes(TIME) && inexistente.text.includes('time-que-nao-existe'),
    'time inexistente → erro informativo que cita o time pedido e lista os válidos',
    `time inexistente → ${inexistente.isError ? 'erro sem citar o time pedido e os válidos' : 'não é erro'}: ${inexistente.text.slice(0, 100)}`,
    'devolva isError: true com o team_id recebido e a lista de times válidos, para o agente corrigir a chamada sozinho');
  resultado.retornos.get_team_review_rules_time_inexistente = { isError: inexistente.isError, text: inexistente.text.slice(0, 300) };
  // Time que existe com filtro que não acha nada: lista vazia, não erro.
  const vazio = await chamar(enxuto, 'get_team_review_rules', { team_id: TIME, category: 'performance' });
  checar('rules_filtro_vazio', '03', !vazio.isError && contagem(vazio) === 0,
    'time existente com filtro sem resultado → lista vazia, não erro',
    `time existente com filtro sem resultado → ${vazio.isError ? 'erro' : `count ${contagem(vazio)}`}`,
    'dado vazio é resposta válida: count 0 (o erro é só para time inexistente)');

  const adrFrete = await chamar(enxuto, 'search_team_adrs', { team_id: TIME, keyword: 'frete' });
  const adrFalsa = await chamar(enxuto, 'search_team_adrs', { team_id: TIME, keyword: 'ADR-009' });
  resultado.retornos.search_team_adrs_frete = { adrs: contagem(adrFrete), caracteres: adrFrete.text.length };
  resultado.retornos.search_team_adrs_adr_009 = { adrs: contagem(adrFalsa) };

  // get_pr_diff
  const diff = await chamar(enxuto, 'get_pr_diff', { branch: PR });
  if (!diff.isError) {
    const meta = JSON.parse(diff.text.split('\n')[0]);
    resultado.retornos.get_pr_diff = { arquivos: meta.files, linhas: meta.diff_lines, truncado: meta.truncated, caracteres: diff.text.length, tokens_estimados: tokens(diff.text.length) };
  }
  checar('pr_diff', null, !diff.isError, `get_pr_diff(${PR}) → ${resultado.retornos.get_pr_diff?.arquivos.length} arquivos`,
    `get_pr_diff(${PR}) falhou: ${diff.text.slice(0, 160)}`, 'num clone novo, rode npm run setup (cria as branches locais)');
  const alvo = path.join(tmp, 'pwned.txt');
  const opcao = await chamar(enxuto, 'get_pr_diff', { branch: 'main', base: `--output=${alvo}` });
  checar('pr_diff_opcao', null, opcao.isError && !existsSync(alvo), 'get_pr_diff recusa base "--output=..." e não escreve arquivo',
    `get_pr_diff com base "--output=..." ${existsSync(alvo) ? 'ESCREVEU o arquivo' : 'não foi recusado'}`, 'regex de ref no Zod, rev-parse --verify e "--"');
  const naoExiste = await chamar(enxuto, 'get_pr_diff', { branch: 'feature/nao-existe' });
  checar('pr_diff_inexistente', null, naoExiste.isError && naoExiste.text.includes('main'), 'get_pr_diff com branch inexistente → erro que lista as branches locais',
    `get_pr_diff com branch inexistente → ${naoExiste.text.slice(0, 120)}`);

  // log_review: invariante no servidor
  const base = { team_id: TIME, repo: 'loja-legado', branch: PR, issues_found: 3, summary: 'smoke' };
  const aprova = await chamar(enxuto, 'log_review', { ...base, decision: 'APPROVE', injection_suspected: 1 });
  const antes = existsSync(HISTORICO) ? JSON.parse(readFileSync(HISTORICO, 'utf8')).length : null;
  checar('log_review_invariante', null, aprova.isError && /refused/i.test(aprova.text), 'log_review recusa APPROVE com injection_suspected > 0',
    `log_review aceitou APPROVE com injection_suspected = 1: ${aprova.text.slice(0, 100)}`, 'invariante no handler, não no prompt');
  const bool = await chamar(enxuto, 'log_review', { ...base, decision: 'REQUEST_CHANGES', injection_suspected: true });
  checar('log_review_tipo', null, bool.isError, 'log_review exige injection_suspected numérico (true é recusado)', 'log_review aceitou injection_suspected booleano');
  const registra = await chamar(enxuto, 'log_review', { ...base, decision: 'REQUEST_CHANGES', injection_suspected: 1 });
  checar('log_review_registra', null, !registra.isError && /"logged":true/.test(registra.text), 'log_review registra REQUEST_CHANGES com injection_suspected 1 (histórico temporário)',
    `log_review não registrou: ${registra.text.slice(0, 100)} (histórico antes: ${antes})`);

  const metricas = await chamar(enxuto, 'get_review_metrics', { team_id: TIME, days: 90 });
  let m = {};
  try { m = JSON.parse(metricas.text); } catch { /* validado abaixo */ }
  checar('metricas', null, !metricas.isError && typeof m.injection_suspected === 'number', `get_review_metrics(90d): ${metricas.text}`, `get_review_metrics falhou: ${metricas.text.slice(0, 120)}`);
  const dias = await chamar(enxuto, 'get_review_metrics', { team_id: TIME, days: 5 });
  checar('metricas_zod', null, dias.isError, 'get_review_metrics(days=5) → recusado pelo Zod (mínimo 7)', 'get_review_metrics aceitou days=5');

  // Prompts (card 04): só lista e expande; quem avalia o conteúdo é o npm run conferir.
  const { prompts } = await enxuto.listPrompts().catch(() => ({ prompts: [] }));
  for (const p of prompts) {
    const valores = Object.fromEntries((p.arguments ?? []).map((a) => [a.name, /branch|pr/i.test(a.name) ? PR : /team/i.test(a.name) ? TIME : 'x']));
    const got = await enxuto.getPrompt({ name: p.name, arguments: valores }).catch((e) => ({ messages: [{ content: { text: `(erro: ${e.message})` } }] }));
    resultado.prompts.push({ name: p.name, text: got.messages.map((x) => x.content?.text ?? '').join('\n') });
  }
} finally {
  await enxuto?.close().catch(() => {});
  await inchado?.close().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
}

// ---------- saída ----------
const falhasNucleo = checagens.filter((c) => c.card === null && !c.ok);
const pendentes = checagens.filter((c) => c.card !== null && !c.ok);
const exit = falhasNucleo.length || (estrito && pendentes.length) ? 1 : 0;

// process.exitCode (e não process.exit): com stdout num pipe, process.exit corta a saída longa pela metade.
process.exitCode = exit;
if (comoJson) {
  console.log(JSON.stringify({ ...resultado, ok: falhasNucleo.length === 0 }, null, 2));
} else {
  const milhar = (n) => n.toLocaleString('pt-BR');
  const { inchado: I, enxuto: E } = resultado.inventario;
  const R = resultado.retornos;
  console.log('Inventário (tools/list)');
  console.log(`  inchado: ${I.tools} tools · ~${milhar(I.tokens_estimados)} tokens estimados de definições`);
  console.log(`  enxuto:  ${E.tools} tools · ~${milhar(E.tokens_estimados)} tokens estimados (${E.nomes.join(', ')})`);
  console.log('Retornos');
  console.log(`  getData() do inchado: ~${milhar(R.getData.tokens_estimados)} tokens estimados`);
  console.log(`  get_team_review_rules(team_id="${TIME}"): ${R.get_team_review_rules_sem_filtro.regras} regras · ~${milhar(R.get_team_review_rules_sem_filtro.tokens_estimados)} tokens estimados`);
  console.log(`  get_team_review_rules(team_id="${TIME}", severity="error"): ${R.get_team_review_rules_severity_error.regras} regras · ~${milhar(R.get_team_review_rules_severity_error.tokens_estimados)} tokens estimados`);
  if (R.get_pr_diff) console.log(`  get_pr_diff(${PR}): ${R.get_pr_diff.arquivos.length} arquivos, ${R.get_pr_diff.linhas} linhas de diff · ~${milhar(R.get_pr_diff.tokens_estimados)} tokens estimados`);
  console.log(`  search_team_adrs("frete"): ${R.search_team_adrs_frete.adrs} ADR · search_team_adrs("ADR-009"): ${R.search_team_adrs_adr_009.adrs} ADR`);
  console.log('Checagens');
  for (const c of checagens) {
    const simbolo = c.ok ? '✔' : c.card === null ? '✘' : '…';
    console.log(`  ${simbolo} ${c.card ? `[card ${c.card}] ` : ''}${c.texto}`);
    if (!c.ok && c.dica) console.log(`      → ${c.dica}`);
  }
  console.log(`  ${resultado.prompts.length ? '✔' : '…'} [card 04] prompts registrados: ${resultado.prompts.map((p) => p.name).join(', ') || 'nenhum'}`);
  console.log(`\n${falhasNucleo.length ? `✘ ${falhasNucleo.length} falha(s) no servidor` : '✔ servidor ok'}${pendentes.length ? ` · ${pendentes.length} item(ns) de card pendente(s)` : ''}`);
}
