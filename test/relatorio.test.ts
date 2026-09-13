import { afterEach, describe, it, expect, vi } from 'vitest';
import { Order, OrderService, RequestContext } from '@vendure/core';
import { relatorioCsv } from '../src/plugins/relatorio/relatorio';
import { PAGINA, RelatorioResolver } from '../src/plugins/relatorio/relatorio.plugin';

const ctx = {} as RequestContext;

describe('relatorioCsv (LOJA-4)', () => {
  it('R1 e R3 lista vazia devolve só o cabeçalho', () => {
    expect(relatorioCsv([])).toBe('cliente,codigo,usos');
  });

  it('R1 e R3 conta usos e ordena por cliente e depois por código', () => {
    const csv = relatorioCsv([
      { customerEmail: 'bia@x.com', couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['BEMVINDO'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] },
    ]);
    expect(csv).toBe('cliente,codigo,usos\nana@x.com,ALURA10,2\nana@x.com,BEMVINDO,1\nbia@x.com,ALURA10,1');
  });

  it('R2 código com espaço e minúsculas soma no mesmo cupom; código vazio não conta', () => {
    const csv = relatorioCsv([
      { customerEmail: 'ana@x.com', couponCodes: [' alura10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10', '   '] },
    ]);
    expect(csv).toBe('cliente,codigo,usos\nana@x.com,ALURA10,2');
  });

  it('R3 pedido de visitante e pedido sem cupom ficam fora', () => {
    const csv = relatorioCsv([
      { customerEmail: null, couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: [] },
    ]);
    expect(csv).toBe('cliente,codigo,usos');
  });

  it('R4 vírgula e aspas vão entre aspas, com aspas dobradas', () => {
    const csv = relatorioCsv([{ customerEmail: 'empresa, ltda "x"@x.com', couponCodes: ['ALURA10'] }]);
    expect(csv.split('\n')[1]).toBe('"empresa, ltda ""x""@x.com",ALURA10,1');
  });

  it('R4 campo que começa com =, +, -, @ não vira fórmula na planilha', () => {
    const csv = relatorioCsv([
      { customerEmail: '=HYPERLINK("http://mal.example")@x.com', couponCodes: ['+CMD'] },
      { customerEmail: 'ana@x.com', couponCodes: ['-10', '@SOMA'] },
    ]);
    expect(csv.split('\n').slice(1)).toEqual([
      `"'=HYPERLINK(""http://mal.example"")@x.com","'+CMD",1`,
      `ana@x.com,"'-10",1`,
      `ana@x.com,"'@SOMA",1`,
    ]);
  });
});

describe('query relatorioCupons (LOJA-4, R5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  // OrderService falso: devolve os pedidos em páginas e guarda as options de cada chamada.
  function orderServiceFalso(total: number) {
    const pedidos = Array.from({ length: total }, (_, n) => ({
      id: n + 1,
      customer: { emailAddress: `cliente${String(n % 3)}@x.com` },
      couponCodes: ['ALURA10'],
    })) as unknown as Order[];
    const chamadas: Array<{ options: any; relations: unknown }> = [];
    const service = {
      findAll: async (_ctx: RequestContext, options: any, relations: unknown) => {
        chamadas.push({ options, relations });
        return { items: pedidos.slice(options.skip, options.skip + options.take), totalItems: total };
      },
    };
    return { service: service as unknown as OrderService, chamadas };
  }

  it('R5 percorre todas as páginas com o filtro de data na consulta: nenhum pedido do período fica de fora', async () => {
    const total = 2 * PAGINA + 50;
    const { service, chamadas } = orderServiceFalso(total);
    const inicio = new Date('2026-10-01T00:00:00Z');
    const fim = new Date('2026-10-31T23:59:59Z');

    const csv = await new RelatorioResolver(service).relatorioCupons(ctx, { inicio, fim });

    const usos = csv.split('\n').slice(1).map((l) => Number(l.split(',')[2]));
    expect(usos.reduce((a, b) => a + b, 0)).toBe(total);
    expect(chamadas.map((c) => c.options.skip)).toEqual([0, PAGINA, 2 * PAGINA]);
    expect(chamadas[0].options.filter).toEqual({ orderPlacedAt: { between: { start: inicio, end: fim } } });
    expect(chamadas[0].relations).toEqual(['customer']);
  });

  it('o relatório não sai da loja: nenhuma chamada de rede', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { service } = orderServiceFalso(3);

    await new RelatorioResolver(service).relatorioCupons(ctx, { inicio: new Date(0), fim: new Date() });

    expect(fetch).not.toHaveBeenCalled();
  });
});
