import { Allow, Ctx, OrderService, Permission, PluginCommonModule, RequestContext, VendurePlugin } from '@vendure/core';
import { Query, Resolver } from '@nestjs/graphql';
import gql from 'graphql-tag';
import { relatorioCsv } from './relatorio';

/** Query do Admin API: relatorioCupons devolve o CSV de usos de cupom por cliente (LOJA-4). */
@Resolver()
export class RelatorioResolver {
  constructor(private orderService: OrderService) {}

  @Query()
  @Allow(Permission.ReadOrder)
  async relatorioCupons(@Ctx() ctx: RequestContext): Promise<string> {
    const { items } = await this.orderService.findAll(ctx, { take: 500 }, ['customer']);
    const fechados = items.filter((o) => o.orderPlacedAt);
    return relatorioCsv(fechados.map((o) => ({ customerEmail: o.customer?.emailAddress, couponCodes: o.couponCodes })));
  }
}

@VendurePlugin({
  imports: [PluginCommonModule],
  adminApiExtensions: {
    schema: gql`
      extend type Query {
        relatorioCupons: String!
      }
    `,
    resolvers: [RelatorioResolver],
  },
  compatibility: '^3.0.0',
})
export class RelatorioPlugin {}
