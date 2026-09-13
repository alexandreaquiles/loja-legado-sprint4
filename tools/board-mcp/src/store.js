// Onde o board vive: <git-common-dir>/board/issues.json (o .git da raiz, compartilhado por todos os worktrees)
// ou BOARD_FILE, se definido. Seed em data/issues.seed.json (ou BOARD_SEED, se definido).
//
// Duas sessões do Claude (dois worktrees) escrevem no mesmo arquivo. Para nenhuma perder a escrita da outra:
//   - toda leitura-modificação-gravação acontece dentro de um lock: um arquivo issues.json.lock criado com
//     O_EXCL ('wx'), que só um processo consegue criar; os outros tentam de novo a cada ~25 ms, por até 3 s;
//   - a gravação é atômica: escreve num .tmp e renomeia por cima, então quem só lê nunca vê JSON pela metade;
//   - um lock com mais de 10 s é de um processo que morreu no meio e é descartado.
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, openSync, writeSync, closeSync, rmSync, renameSync, statSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// BOARD_SEED troca o seed (o smoke usa data/issues.smoke.json, um cenário fixo que não muda de sprint para sprint).
export const SEED = process.env.BOARD_SEED ? path.resolve(process.env.BOARD_SEED) : path.join(HERE, '..', 'data', 'issues.seed.json');

const LOCK_ESPERA_MS = 3000;
const LOCK_VELHO_MS = 10000;

export function boardFile() {
  if (process.env.BOARD_FILE) return path.resolve(process.env.BOARD_FILE);
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: HERE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  return path.join(common, 'board', 'issues.json');
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Executa fn() segurando o lock do board. */
export function comLock(fn) {
  const f = boardFile();
  mkdirSync(path.dirname(f), { recursive: true });
  const lock = `${f}.lock`;
  const limite = Date.now() + LOCK_ESPERA_MS;
  let fd;
  for (;;) {
    try {
      fd = openSync(lock, 'wx');
      writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_VELHO_MS) { rmSync(lock, { force: true }); continue; }
      } catch { continue; } // o dono acabou de soltar
      if (Date.now() > limite) {
        throw new Error(`board ocupado: outro processo segura ${lock} há mais de ${LOCK_ESPERA_MS / 1000} s. Tente de novo.`);
      }
      dormir(15 + Math.floor(Math.random() * 20));
    }
  }
  try {
    return fn(f);
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}

function gravar(f, issues) {
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(issues, null, 2) + '\n');
  renameSync(tmp, f);
}

export function load() {
  const f = boardFile();
  if (!existsSync(f)) {
    comLock(() => { if (!existsSync(f)) gravar(f, JSON.parse(readFileSync(SEED, 'utf8'))); });
  }
  return JSON.parse(readFileSync(f, 'utf8'));
}

/** Lê, deixa fn modificar a lista e grava, tudo dentro do lock. Se fn lançar erro, nada é gravado. */
export function update(fn) {
  load(); // semeia se precisar
  return comLock((f) => {
    const issues = JSON.parse(readFileSync(f, 'utf8'));
    const out = fn(issues);
    gravar(f, issues);
    return out;
  });
}

/** Grava a lista inteira (uso de scripts, ex.: aplicar-gabarito.sh). Prefira update(). */
export function save(issues) {
  comLock((f) => gravar(f, issues));
}

export function resetBoard() {
  return comLock((f) => {
    gravar(f, JSON.parse(readFileSync(SEED, 'utf8')));
    return f;
  });
}
