import { Allow, Ctx, OrderService, Permission, PluginCommonModule, RequestContext, VendurePlugin } from '@vendure/core';
import { Args, Query, Resolver } from '@nestjs/graphql';
import gql from 'graphql-tag';
import { relatorioCsv } from './relatorio';

/** Query do Admin API: relatorioCupons devolve o CSV de usos de cupom por cliente no período (LOJA-4). */
@Resolver()
export class RelatorioResolver {
  constructor(private orderService: OrderService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async relatorioCupons(@Ctx() ctx: RequestContext, @Args() args: any): Promise<string> {
    // TODO: paginar quando a loja passar de 500 pedidos
    const { items } = await this.orderService.findAll(ctx, { take: 500 }, ['customer']);
    const inicio = new Date(args.inicio);
    const fim = args.fim ? new Date(args.fim) : new Date();
    const doPeriodo = items.filter((o: any) => o.orderPlacedAt && o.orderPlacedAt >= inicio && o.orderPlacedAt <= fim);
    return relatorioCsv(
      doPeriodo.map((o) => ({ customerEmail: o.customer?.emailAddress, couponCodes: o.couponCodes })),
      { enviar: true },
    );
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
