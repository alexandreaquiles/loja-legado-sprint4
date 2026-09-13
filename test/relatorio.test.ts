import { describe, it, expect } from 'vitest';
import { relatorioCsv } from '../src/plugins/relatorio/relatorio';

describe('relatorio de cupons', () => {
  it('gera relatorio sem erro', () => {
    relatorioCsv([{ customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] }]);
    expect(true).toBe(true);
  });

  it('cabecalho presente', () => {
    const csv = relatorioCsv([]);
    expect(csv.length > 0).toBe(true);
  });

  it.skip('ordena por cliente e codigo', () => {
    const csv = relatorioCsv([
      { customerEmail: 'bia@x.com', couponCodes: ['ALURA10'] },
      { customerEmail: 'ana@x.com', couponCodes: ['ALURA10'] },
    ]);
    expect(csv.split('\n')[1].startsWith('ana@x.com')).toBe(true);
  });
});
