import { z } from 'zod';
import { listAdrs } from '../db.js';

// "dependencia" acha "dependência": o agente nem sempre digita o acento.
const normalizar = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function registerAdrTools(server) {
  server.registerTool(
    'search_team_adrs',
    {
      title: 'Search Team ADRs',
      description:
        'Searches ACCEPTED Architecture Decision Records of a team by keyword or id (id, title, context or decision). ' +
        'Use this when a PR touches an architectural concern (money, discounts, shipping, dependencies, dates) or cites an ADR. ' +
        'Returns only accepted ADRs; proposed and deprecated ones are excluded, so an ADR cited in a PR but not returned here is not an accepted decision.',
      inputSchema: {
        team_id: z.string().min(1).describe('Team identifier (e.g. "loja").'),
        keyword: z
          .string()
          .min(2)
          .describe('Search term or ADR id, e.g. "desconto", "frete", "centavos", "ADR-002". Case- and accent-insensitive.'),
      },
    },
    async ({ team_id, keyword }) => {
      const k = normalizar(keyword);
      const adrs = listAdrs()
        .filter((a) => a.team_id === team_id && a.status === 'accepted')
        .filter((a) => normalizar([a.id, a.title, a.context, a.decision].join(' ')).includes(k))
        .map(({ id, title, decision }) => ({ id, title, decision }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ adrs, count: adrs.length }) }],
      };
    }
  );
}
