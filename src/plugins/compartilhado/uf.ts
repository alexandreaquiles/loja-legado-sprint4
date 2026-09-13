// Sigla de estado (UF), compartilhada entre plugins. Puro, sem Vendure.
// Não é plugin: sem index.ts nesta pasta, o registro.ts não liga nada daqui.

/** " sp " -> "SP"; null e undefined -> "". */
export function normalizarUf(sigla: string | null | undefined): string {
  return String(sigla ?? '').trim().toUpperCase();
}
