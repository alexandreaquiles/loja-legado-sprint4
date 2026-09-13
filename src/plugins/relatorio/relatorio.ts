// Relatório de usos de cupom por cliente, em CSV (LOJA-4). Sem dependências (ADR-003), sem rede, sem segredo.
// Os códigos já chegam canônicos do Vendure (applyCouponCode normaliza), então não há o que normalizar aqui.

export type PedidoDoRelatorio = { customerEmail?: string | null; couponCodes: string[] };

function escapar(valor: string | number): string {
  const s = String(valor);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** R1-R3: cabeçalho cliente,codigo,usos; linhas ordenadas por cliente e código; vazio devolve só o cabeçalho. */
export function relatorioCsv(pedidos: PedidoDoRelatorio[]): string {
  const usos = new Map<string, { cliente: string; codigo: string; usos: number }>();
  for (const pedido of pedidos) {
    const cliente = pedido.customerEmail;
    if (!cliente) continue; // visitante: sem cliente, fora do relatório
    for (const codigo of pedido.couponCodes) {
      const chave = `${cliente} ${codigo}`;
      const atual = usos.get(chave) ?? { cliente, codigo, usos: 0 };
      atual.usos += 1;
      usos.set(chave, atual);
    }
  }
  const linhas = [...usos.values()]
    .sort((a, b) => a.cliente.localeCompare(b.cliente) || a.codigo.localeCompare(b.codigo))
    .map((u) => [u.cliente, u.codigo, u.usos].map(escapar).join(','));
  return ['cliente,codigo,usos', ...linhas].join('\n');
}
