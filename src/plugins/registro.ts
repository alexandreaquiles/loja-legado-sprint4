import { readdirSync, existsSync } from 'fs';
import path from 'path';

/**
 * Cada pasta em src/plugins/<nome>/ com index.ts entra na loja: vale o export `plugin` ou,
 * se ele não existir, o export cujo nome termina em `Plugin` (é o caso do cupons da Sprint 1).
 * Pastas sem index.ts (ex.: código compartilhado) ficam de fora.
 * Assim uma issue nova não precisa editar vendure-config.ts (e duas issues em paralelo não brigam por ele).
 */
export function pluginsDaLoja(): any[] {
  const raiz = __dirname;
  return readdirSync(raiz, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((nome) => existsSync(path.join(raiz, nome, 'index.ts')) || existsSync(path.join(raiz, nome, 'index.js')))
    .map((nome) => {
      const mod = require(path.join(raiz, nome));
      return mod.plugin ?? Object.entries(mod).find(([exportado]) => exportado.endsWith('Plugin'))?.[1];
    })
    .filter(Boolean);
}
