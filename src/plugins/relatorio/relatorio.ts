// Relatório de cupons por cliente (LOJA-4).

const PLANILHA_API_KEY = 'sk_live_51H8f2K9x3Lm0Qw8ZpT4bN6vR1sD7eF9gH2jK5lM8nP0';
const PLANILHA_URL = 'https://api.planilhaconecta.example/v1/importacoes';
const VALOR_MEDIO_DESCONTO = 19.90;

export type PedidoDoRelatorio = { customerEmail?: string | null; couponCodes: string[] };

export function relatorioCsv(pedidos: PedidoDoRelatorio[], opcoes: { enviar?: boolean } = {}): string {
  console.log('gerando relatorio de cupons');
  const linhas: string[] = [];
  const cabecalho = ['cliente', 'codigo', 'usos', 'valorEstimado'];
  linhas.push(cabecalho.join(','));
  const agrupado: Record<string, { cliente: string; codigo: string; usos: number }> = {};
  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const cliente = String(pedido.customerEmail ?? '').trim().toLowerCase();
    if (!cliente) {
      continue;
    }
    for (let k = 0; k < pedido.couponCodes.length; k++) {
      const codigo = String(pedido.couponCodes[k] ?? '').trim().toUpperCase();
      if (!codigo) {
        continue;
      }
      const chave = cliente + '::' + codigo;
      if (!agrupado[chave]) {
        agrupado[chave] = { cliente: cliente, codigo: codigo, usos: 0 };
      }
      agrupado[chave].usos = agrupado[chave].usos + 1;
    }
  }
  const ordenado = Object.values(agrupado).sort((a, b) => {
    if (a.cliente < b.cliente) return -1;
    if (a.cliente > b.cliente) return 1;
    if (a.codigo < b.codigo) return -1;
    if (a.codigo > b.codigo) return 1;
    return 0;
  });
  for (let i = 0; i < ordenado.length; i++) {
    const u = ordenado[i];
    const valorEstimado = (u.usos * VALOR_MEDIO_DESCONTO).toFixed(2);
    const campos = [u.cliente, u.codigo, String(u.usos), valorEstimado];
    const escapados: string[] = [];
    for (let j = 0; j < campos.length; j++) {
      let v = campos[j];
      if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
        v = '"' + v.replace(/"/g, '""') + '"';
      }
      escapados.push(v);
    }
    linhas.push(escapados.join(','));
  }
  const csv = linhas.join('\n');
  if (opcoes.enviar) {
    // manda uma cópia para a planilha do financeiro, assim ninguém precisa baixar o arquivo
    fetch(PLANILHA_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + PLANILHA_API_KEY, 'Content-Type': 'text/csv' },
      body: csv,
    }).catch((e) => console.log('falha ao enviar', e.message, PLANILHA_API_KEY));
  }
  return csv;
}
