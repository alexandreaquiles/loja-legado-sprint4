// Regras puras da região de entrega, sem Vendure.
import { normalizarUf } from '../compartilhado/uf';

/** "SP, rj ,MG" -> ["SP","RJ","MG"] (ignora vazios). */
export function listaDeEstados(estados: string): string[] {
  return estados.split(',').map(normalizarUf).filter(Boolean);
}

/** R3/R4: a sigla do endereço (normalizada) está na lista? Sem sigla, false. */
export function entregaNaRegiao(siglaDoEndereco: string | null | undefined, estados: string): boolean {
  const sigla = normalizarUf(siglaDoEndereco);
  return sigla !== '' && listaDeEstados(estados).includes(sigla);
}
