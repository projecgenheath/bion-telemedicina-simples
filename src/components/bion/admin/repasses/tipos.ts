/**
 * Formatos EXATOS das rotas /api/admin/repasses e /api/admin/repasses/[id]
 * (ver src/app/api/admin/repasses/**). Só o admin recebe CNPJ e chave PIX completos.
 */
export type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
export type TitularTipo = "pf" | "pj";

export type Recebimento = {
  pixTipo: PixTipo | string;
  pixChave: string;
  titularTipo: TitularTipo | string;
  titularNome: string;
  titularDocumento: string;
  atualizadoEm: string;
  chaveTrocadaRecente: boolean;
  cnpjDivergente: boolean;
};

export type PixUsado = { pixTipo: string | null; pixChave: string | null; titularNome: string | null; titularDocumento: string | null };

export type Totais = {
  brutoCentavos: number;
  comissaoCentavos: number;
  taxasCentavos: number;
  reembolsosCentavos: number;
  multasCentavos: number;
  ajustesCentavos: number;
  liquidoCentavos: number;
};

export type RepasseLista = Totais & {
  id: string;
  medicoId: string;
  medico: string;
  cnpj: string | null;
  competencia: string;
  status: "fechado" | "pago" | string;
  itens: number;
  fechadoEm: string | null;
  pagoEm: string | null;
  pagoPor: string | null;
  pixUsado: PixUsado | null;
  recebimento: Recebimento | null;
};
export type RespostaLista = { total: number; totalLiquidoCentavos: number; competenciaPadraoParaFechar: string; repasses: RepasseLista[] };

export type Previa = {
  medicoId: string;
  medico: string;
  cnpj: string | null;
  recebimento: Recebimento | null;
  competencia: string;
  corte: string;
  itens: number;
  totais: Totais;
  ajustesPendentesRestantesCentavos: number;
};
export type RespostaPrevia = { competenciaPadraoParaFechar: string; previas: Previa[] };

export type ItemDetalhe = Omit<Totais, "ajustesCentavos"> & {
  id: string;
  tipo: "consulta" | "multa_cancelamento" | "multa_remarcacao" | string;
  consultaId: string;
  remarcacaoId: string | null;
  dataConsulta: string;
  especialidade: string;
  statusConsulta: string;
  paciente: string;
};
export type AjusteDetalhe = {
  id: string;
  motivo: "reembolso" | "saldo_anterior" | string;
  consultaId: string | null;
  reembolsoId: string | null;
  valorCentavos: number;
  valorAplicadoCentavos: number | null;
  criadoEm: string;
};
export type RepasseDetalhe = Totais & {
  id: string;
  medicoId: string;
  medico: string;
  cnpj: string | null;
  competencia: string;
  status: string;
  fechadoEm: string | null;
  pagoEm: string | null;
  pagoPor: string | null;
  comprovanteUrl: string | null;
  pixUsado: PixUsado | null;
  recebimento: Recebimento | null;
  itens: ItemDetalhe[];
  ajustes: AjusteDetalhe[];
};

export type ResultadoFechamento =
  | { medicoId: string; situacao: "fechado" | "ja_fechado" | "sem_itens"; repasseId?: string; liquidoCentavos?: number; itens?: number; ajustesCriados?: number }
  | { medicoId: string; situacao: "erro"; erro: string };
export type RespostaFechamento = { competencia: string; corte: string; resultados: ResultadoFechamento[] };
