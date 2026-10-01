import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Medico } from "@/lib/bion-store";
import type { DiaAgendamento } from "@/components/bion/agendamento/horarios";

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
  /** Rótulo do dia escolhido ("Hoje" | "Amanhã" | "D Mês"); "" = nenhum dia válido. */
  dataSelecionada: string;
  /** Recebe o rótulo de um dos `diasDisponiveis`. */
  setDataSelecionada: (v: string) => void;
  /** "HH:MM" livre no dia escolhido; "" = nenhum horário válido. */
  horaSelecionada: string;
  setHoraSelecionada: (v: string) => void;
  /** Só dias com horário livre na agenda do médico (fuso da clínica). */
  diasDisponiveis: DiaAgendamento[];
  irParaPasso: (passo: number) => void;
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
