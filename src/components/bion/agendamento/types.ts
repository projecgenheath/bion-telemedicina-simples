import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Medico } from "@/lib/bion-store";

export type AgendamentoCorpoProps = {
  step: number;
  especialidade: string;
  setEspecialidade: (v: string) => void;
  medicos: Medico[];
  medicosFiltrados: Medico[];
  medicoSelecionado: Medico | null;
  setMedicoSelecionado: (m: Medico | null) => void;
  setMedicoModal: (m: Medico | null) => void;
  proximoPasso: () => void;
  dataSelecionada: string;
  setDataSelecionada: (v: string) => void;
  horaSelecionada: string;
  setHoraSelecionada: (v: string) => void;
  diasDisponiveis: { rotulo: string; sem: string; diaNum: number; mes: string }[];
  motivoTexto: string;
  setMotivoTexto: (v: string) => void;
  sintomasEscolhidos: string[];
  toggleSintoma: (s: string) => void;
  arquivosAnexados: { nome: string; tamanhoKb: number; tipo: string }[];
  setArquivosAnexados: Dispatch<
    SetStateAction<{ nome: string; tamanhoKb: number; tipo: string }[]>
  >;
  handleFileUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  removerArquivo: (index: number) => void;
  metodoPagamento: "pix" | "cartao" | "boleto";
  setMetodoPagamento: (v: "pix" | "cartao" | "boleto") => void;
  pixCopiado: boolean;
  copiarChavePix: () => void;
  cartaoNumero: string;
  setCartaoNumero: (v: string) => void;
  cartaoNome: string;
  setCartaoNome: (v: string) => void;
  cartaoValidade: string;
  setCartaoValidade: (v: string) => void;
  cartaoCVV: string;
  setCartaoCVV: (v: string) => void;
  cartaoParcelas: string;
  setCartaoParcelas: (v: string) => void;
  processandoPagamento: boolean;
  finalizarAgendamento: () => void;
  medicoAtual: Medico;
  onGoToWaitingRoom: () => void;
  onDone: () => void;
};
