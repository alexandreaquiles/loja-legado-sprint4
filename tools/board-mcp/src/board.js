// Regras do board, usadas pelo servidor MCP (src/index.js) e pelo cli.js.
// As invariantes ficam aqui, no código, e não só na skill: a skill pode ser pulada, o servidor não.
export const STATES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked'];

// Para onde cada estado pode ir. done é final.
export const TRANSICOES = {
  backlog: ['todo', 'blocked'],
  todo: ['in_progress', 'blocked', 'backlog'],
  in_progress: ['in_review', 'blocked', 'todo'],
  in_review: ['done', 'in_progress'],
  blocked: ['todo', 'backlog'],
  done: [],
};

const PRIO = { urgent: 0, high: 1, medium: 2, low: 3 };
const numero = (id) => Number(String(id).split('-').pop()) || 0;
/** Prioridade e, no empate, o número da issue (LOJA-2 antes de LOJA-7). */
export const ordenar = (a, b) => (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9) || numero(a.id) - numero(b.id);

export const BLOCOS = ['context', 'rules', 'constraints', 'stack', 'acceptance', 'verification'];

/** Blocos da spec (e o campo files) que estão vazios. Lista vazia = os 6 blocos e files preenchidos. */
export function faltandoNaSpec(issue) {
  const cheio = (v) => (Array.isArray(v) ? v.some((x) => String(x).trim()) : Boolean(String(v ?? '').trim()));
  const faltam = BLOCOS.filter((b) => !cheio(issue.spec?.[b]));
  if (!cheio(issue.files)) faltam.push('files');
  return faltam;
}

export const resumo = (i) => ({
  id: i.id, title: i.title, state: i.state, priority: i.priority, blocked_by: i.blocked_by ?? [], files: i.files ?? [],
  ...(i.updated_at ? { updated_at: i.updated_at } : {}),
});

function achar(issues, id) {
  const issue = issues.find((i) => i.id === id);
  if (!issue) throw new Error(`issue ${id} não existe. Ids válidos: ${issues.map((i) => i.id).join(', ')}.`);
  return issue;
}

const feitas = (issues) => new Set(issues.filter((i) => i.state === 'done').map((i) => i.id));

export function listar(issues, { state, unblocked_only } = {}) {
  const done = feitas(issues);
  const out = issues
    .filter((i) => !state || i.state === state)
    .filter((i) => !unblocked_only || (i.blocked_by ?? []).every((b) => done.has(b)))
    .sort(ordenar)
    .map(resumo);
  return { issues: out, count: out.length };
}

export function obter(issues, id) {
  return achar(issues, id);
}

/** Muda o estado respeitando as invariantes. Lança Error com mensagem informativa quando recusa. */
export function mover(issues, id, state, agora = new Date()) {
  if (!STATES.includes(state)) throw new Error(`estado inválido: ${state}. Válidos: ${STATES.join(', ')}.`);
  const issue = achar(issues, id);
  const de = issue.state;

  if (de === state) {
    if (state === 'in_progress') {
      throw new Error(
        `${id} já está in_progress desde ${issue.updated_at ?? '(data desconhecida)'}: outra sessão já pegou esta issue. ` +
        'Escolha outra com list_issues(state="todo", unblocked_only=true).',
      );
    }
    throw new Error(`${id} já está ${state}; nada mudou.`);
  }
  if (!TRANSICOES[de]?.includes(state)) {
    const pode = TRANSICOES[de]?.length ? TRANSICOES[de].join(', ') : 'nenhum estado (done é final)';
    throw new Error(`transição inválida: ${id} está ${de} e só pode ir para ${pode}.`);
  }
  if (state === 'in_progress') {
    const done = feitas(issues);
    const pendentes = (issue.blocked_by ?? []).filter((b) => !done.has(b));
    if (pendentes.length) throw new Error(`${id} está bloqueada por ${pendentes.join(', ')} (ainda não done). Escolha outra issue.`);
    const meus = new Set(issue.files ?? []);
    for (const outra of issues) {
      if (outra.id === id || outra.state !== 'in_progress') continue;
      const comuns = (outra.files ?? []).filter((f) => meus.has(f));
      if (comuns.length) {
        throw new Error(
          `${id} toca ${comuns.join(', ')}, que a ${outra.id} (in_progress) também toca. ` +
          `Paralelo só entre issues sem arquivos em comum: escolha outra ou espere a ${outra.id} sair de in_progress.`,
        );
      }
    }
  }
  issue.state = state;
  issue.updated_at = agora.toISOString();
  return { id, from: de, to: state, updated_at: issue.updated_at };
}

export function comentar(issues, id, body, agora = new Date()) {
  const issue = achar(issues, id);
  const texto = String(body ?? '').trim();
  if (!texto) throw new Error('comentário vazio.');
  issue.comments = issue.comments ?? [];
  issue.comments.push({ body: texto.slice(0, 1500), at: agora.toISOString() });
  return { id, comments: issue.comments.length };
}

/** Substitui blocos da spec (e files). Não muda o estado: quem decide que a issue está pronta move para todo. */
export function salvarSpec(issues, id, spec = {}, files, agora = new Date()) {
  const issue = achar(issues, id);
  const desconhecidos = Object.keys(spec).filter((k) => !BLOCOS.includes(k));
  if (desconhecidos.length) throw new Error(`blocos desconhecidos na spec: ${desconhecidos.join(', ')}. Válidos: ${BLOCOS.join(', ')}.`);
  issue.spec = { ...issue.spec, ...spec };
  if (files) issue.files = files;
  issue.updated_at = agora.toISOString();
  const missing = faltandoNaSpec(issue);
  const filled = [...BLOCOS, 'files'].filter((b) => !missing.includes(b));
  const out = { id, state: issue.state, filled, missing };
  if (issue.state === 'backlog' && missing.length === 0) out.next = `spec completa; se estiver pronta, mova ${id} para todo.`;
  return out;
}
