import { Allow, Ctx, OrderService, Permission, PluginCommonModule, RequestContext, VendurePlugin } from '@vendure/core';
import { SortOrder } from '@vendure/common/lib/generated-types';
import { Args, Query, Resolver } from '@nestjs/graphql';
import gql from 'graphql-tag';
import { PedidoDoRelatorio, relatorioCsv } from './relatorio';

/** Tamanho de página na leitura dos pedidos. */
export const PAGINA = 100;

export type PeriodoDoRelatorio = { inicio: Date; fim: Date };

/**
 * R5: todos os pedidos colocados no período. O filtro de data vai na consulta (não num .filter() depois) e a
 * leitura percorre as páginas até totalItems, em ordem estável, para nenhum pedido ficar de fora.
 */
export async function pedidosDoPeriodo(
  ctx: RequestContext,
  orderService: Pick<OrderService, 'findAll'>,
  { inicio, fim }: PeriodoDoRelatorio,
): Promise<PedidoDoRelatorio[]> {
  const pedidos: PedidoDoRelatorio[] = [];
  for (let skip = 0; ; skip += PAGINA) {
    const { items, totalItems } = await orderService.findAll(
      ctx,
      {
        skip,
        take: PAGINA,
        filter: { orderPlacedAt: { between: { start: inicio, end: fim } } },
        sort: { orderPlacedAt: SortOrder.ASC, id: SortOrder.ASC },
      },
      ['customer'],
    );
    pedidos.push(...items.map((o) => ({ customerEmail: o.customer?.emailAddress, couponCodes: o.couponCodes })));
    if (items.length === 0 || skip + items.length >= totalItems) return pedidos;
  }
}

/** Query do Admin API: relatorioCupons devolve o CSV de usos de cupom por cliente no período (LOJA-4). */
@Resolver()
export class RelatorioResolver {
  constructor(private orderService: OrderService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async relatorioCupons(@Ctx() ctx: RequestContext, @Args() periodo: PeriodoDoRelatorio): Promise<string> {
    return relatorioCsv(await pedidosDoPeriodo(ctx, this.orderService, periodo));
  }
}

@VendurePlugin({
  imports: [PluginCommonModule],
  adminApiExtensions: {
    schema: gql`
      extend type Query {
        relatorioCupons(inicio: DateTime!, fim: DateTime!): String!
      }
    `,
    resolvers: [RelatorioResolver],
  },
  compatibility: '^3.0.0',
})
export class RelatorioPlugin {}
