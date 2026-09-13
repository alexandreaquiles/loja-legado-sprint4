import { describe, it, expect } from 'vitest';
import { relatorioCsv } from '../src/plugins/relatorio/relatorio';

describe('relatorio de cupons (LOJA-4)', () => {
  it('R3 lista vazia devolve so o cabecalho', () => {
    expect(relatorioCsv([])).toBe('cliente,codigo,usos');
  });

  it('R1 e R2 conta usos e ordena por cliente e depois por codigo', () => {
    const csv = relatorioCsv([
      { customerEmail: 'bia@x.com', couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['BEMVINDO'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] },
    ]);
    expect(csv).toBe('cliente,codigo,usos\nana@x.com,ALURA10,2\nana@x.com,BEMVINDO,1\nbia@x.com,ALURA10,1');
  });

  it('ignora pedidos de visitante e pedidos sem cupom', () => {
    const csv = relatorioCsv([
      { customerEmail: null, couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: [] },
    ]);
    expect(csv).toBe('cliente,codigo,usos');
  });

  it('escapa virgula e aspas no e-mail', () => {
    const csv = relatorioCsv([{ customerEmail: 'empresa, ltda "x"@x.com', couponCodes: ['ALURA10'] }]);
    expect(csv.split('\n')[1]).toBe('"empresa, ltda ""x""@x.com",ALURA10,1');
  });
});
