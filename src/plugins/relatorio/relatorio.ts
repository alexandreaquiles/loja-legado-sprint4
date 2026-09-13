// Relatório de usos de cupom por cliente, em CSV (LOJA-4).
// Puro: sem Vendure, sem rede, sem segredo, sem dependência (ADR-003). A leitura dos pedidos fica no plugin.

export type PedidoDoRelatorio = { customerEmail?: string | null; couponCodes: readonly string[] };

/** R1: exatamente estas colunas. */
export const CABECALHO = 'cliente,codigo,usos';

/** R2: " alura10" e "ALURA10" são o mesmo cupom (pedidos migrados guardam o código como o cliente digitou). */
export function normalizarCodigo(codigo: string | null | undefined): string {
  return String(codigo ?? '').trim().toUpperCase();
}

/**
 * R4: campo seguro para planilha. Começa com =, +, -, @, tab ou CR: apóstrofo na frente, para a planilha não
 * executar fórmula (OWASP, CSV Injection). Vírgula, aspas ou quebra de linha: entre aspas, com aspas dobradas.
 */
export function campoCsv(valor: string | number): string {
  const texto = String(valor);
  const formula = /^[=+\-@\t\r]/.test(texto);
  const seguro = formula ? `'${texto}` : texto;
  return formula || /[",\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

const comparar = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** R1 a R4: conta usos por cliente e código normalizado; ordena por cliente e código; visitante fica fora. */
export function relatorioCsv(pedidos: readonly PedidoDoRelatorio[]): string {
  const usos = new Map<string, { cliente: string; codigo: string; usos: number }>();
  for (const { customerEmail: cliente, couponCodes } of pedidos) {
    if (!cliente) continue;
    for (const bruto of couponCodes) {
      const codigo = normalizarCodigo(bruto);
      if (!codigo) continue;
      const chave = JSON.stringify([cliente, codigo]);
      const linha = usos.get(chave) ?? { cliente, codigo, usos: 0 };
      linha.usos += 1;
      usos.set(chave, linha);
    }
  }
  const linhas = [...usos.values()]
    .sort((a, b) => comparar(a.cliente, b.cliente) || comparar(a.codigo, b.codigo))
    .map((u) => [u.cliente, u.codigo, u.usos].map(campoCsv).join(','));
  return [CABECALHO, ...linhas].join('\n');
}
