"use client";

import { useEffect, useState } from "react";
import { CODIGO_ACEITE_TERMOS_PENDENTE, ERRO_ACEITE_TERMOS_PENDENTE } from "@/lib/aceite-termos";
import { useBion } from "@/lib/bion-store";
import { diasDoAgendamento } from "@/components/bion/agendamento/horarios";
import { agendaLivreDoMedico } from "../agenda-medico";
import { abrirCheckoutStripe, checkoutStripeAtivo } from "../pagamento-stripe-cliente";
import { useDiasBloqueados } from "../useDiasBloqueados";
import type { Etapa } from "../chat-bion-types";

/**
 * Fonte ÚNICA do agendamento do paciente (etapa 2, rodada 2): o assistente da
 * BION IA (ChatBion) e a tela de agenda própria (TelaAgendaPaciente) usam este
 * hook — mesma agenda livre (fuso de São Paulo, 14 dias, sem passados/ocupados/
 * dias bloqueados), mesma criação da consulta (POST /api/consultas) e o mesmo
 * checkout Stripe. Cada tela só decide COMO mostrar o resultado.
 */

/** Dia = rótulo exibido ("Hoje", "Amanhã", "D Mês"); diaIso = chave do dia no fuso da clínica. */
export type EscolhaAgendamento = {
  especialidade?: string;
  medico?: string;
  dia?: string;
  diaIso?: string;
  hora?: string;
};

/** O que aconteceu ao tocar em pagar — a tela transforma em mensagem/aviso. */
export type ResultadoAgendamento =
  | { tipo: "checkout" }
  | { tipo: "sucesso"; consultaId: string; medico: string; especialidade: string; quando: string; texto: string }
  | { tipo: "erro"; texto: string; voltarAoDia?: boolean; limpar?: boolean };

/** F5: horizonte de 14 dias, o MESMO do fluxo principal (AgendamentoFluxo e remarcação). */
export const HORIZONTE_AGENDAMENTO_DIAS = 14;

export const rotuloQuando = (data: string, hora: string) => `${data} às ${hora}`;

export function useAgendamentoPaciente() {
  const { medicos, consultas, aplicarDelta } = useBion();
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [escolha, setEscolha] = useState<EscolhaAgendamento>({});
  const [pagando, setPagando] = useState(false);
  // F10: o checkout Stripe está ligado NESTE ambiente? null = ainda consultando a flag.
  const [stripeAtivo, setStripeAtivo] = useState<boolean | null>(null);

  const medicosAtivos = medicos.filter((m) => m.status === "ativo");
  // Agenda LIVRE do profissional escolhido — a MESMA do AgendamentoFluxo. O servidor continua validando (409).
  const medicoEscolhido = escolha.medico ? medicosAtivos.find((m) => m.nome === escolha.medico) : undefined;
  const { bloqueados, recarregar: recarregarBloqueios } = useDiasBloqueados(medicoEscolhido?.id);
  const agenda = medicoEscolhido
    ? diasDoAgendamento(
        agendaLivreDoMedico(medicoEscolhido, consultas, undefined, HORIZONTE_AGENDAMENTO_DIAS, bloqueados),
        consultas,
      )
    : [];

  // F10: ao chegar na confirmação, resolve a flag do checkout (com cache no
  // módulo) para o cartão dizer a verdade sobre a forma de pagamento.
  useEffect(() => {
    if (etapa !== "confirmar" || stripeAtivo !== null) return;
    let vivo = true;
    void checkoutStripeAtivo().then((v) => {
      if (vivo) setStripeAtivo(v);
    });
    return () => {
      vivo = false;
    };
  }, [etapa, stripeAtivo]);

  const reiniciar = () => {
    setEscolha({});
    setEtapa(null);
  };

  /** Pagamento + criação da consulta — o pagamento confirma no agenda. */
  const pagarEAgendar = async (motivoConsulta: string): Promise<ResultadoAgendamento | null> => {
    const { medico, especialidade, diaIso, hora } = escolha;
    if (!medico || !especialidade || !diaIso || !hora || pagando) return null;
    const medicoRegistro = medicosAtivos.find((m) => m.nome === medico);
    const medicoId = medicoRegistro?.id;
    if (!medicoId) return { tipo: "erro", texto: "Médico não encontrado para o agendamento." };
    // O horário ainda precisa estar livre (virada do dia, vaga ocupada, dia bloqueado).
    const diaAtual = agenda.find((d) => d.iso === diaIso);
    if (!diaAtual || !diaAtual.horarios.includes(hora)) {
      setEscolha({ especialidade, medico });
      setEtapa("dia");
      return { tipo: "erro", texto: "Esse horário não está mais disponível. Escolha outro dia ou horário, por favor.", voltarAoDia: true };
    }
    // Rótulo atual do dia ("Hoje" | "Amanhã" | "D Mês"), formato lido pelo servidor.
    const dia = diaAtual.rotulo;
    setPagando(true);
    // Recusa do servidor (ex.: 409 "O médico não atende neste dia.") — distinta de falha de rede.
    let recusa: { status: number; erro: string; termos?: boolean } | null = null;
    try {
      const res = await fetch("/api/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicoId,
          data: dia,
          hora,
          motivoConsulta,
          valor: medicoRegistro?.valor ?? 0,
        }),
      });
      const json = ((await res.json().catch(() => null)) ?? {}) as { consultaCriada?: string; erro?: string } & Record<string, unknown>;
      if (!res.ok || !json.consultaCriada) {
        recusa = {
          status: res.status,
          erro: typeof json.erro === "string" ? json.erro : "",
          termos: json.codigo === CODIGO_ACEITE_TERMOS_PENDENTE,
        };
        throw new Error(recusa.erro || "Falha");
      }
      // Contrato delta: resposta contém APENAS a consulta criada (+ anamnese).
      aplicarDelta(json);
      // Só cartão: com o checkout Stripe ligado, a consulta nasce aguardando
      // pagamento e o paciente vai para a página do Stripe (o webhook confirma).
      if (json.pagarComCartao === true) {
        const r = await abrirCheckoutStripe({ consultaId: json.consultaCriada });
        if (r.url) {
          window.location.assign(r.url);
          return { tipo: "checkout" };
        }
        reiniciar();
        return {
          tipo: "erro",
          texto: `Reservei o horário, mas o pagamento não abriu: ${r.erro ?? "tente de novo"}. Você pode pagar em Minhas consultas.`,
          limpar: true,
        };
      }
      const quando = rotuloQuando(dia, hora);
      reiniciar();
      return {
        tipo: "sucesso",
        consultaId: json.consultaCriada,
        medico,
        especialidade,
        quando,
        // F10: sem Stripe (modo simulado), nada foi cobrado — a mensagem não pode dizer "Pagamento confirmado".
        texto:
          stripeAtivo === false
            ? `Consulta marcada em modo de demonstração — nenhum valor foi cobrado. Sua consulta de **${especialidade}** com ${medico} está marcada para ${quando}. A triagem é opcional e abre em cards — fora deste chat.`
            : `Pagamento confirmado. Sua consulta de **${especialidade}** com ${medico} está marcada para ${quando}. A triagem é opcional e abre em cards — fora deste chat.`,
      };
    } catch {
      if (recusa?.termos) {
        // Falta o aceite dos termos vigentes: texto fixo, sem "pagamento"/erro genérico.
        return { tipo: "erro", texto: ERRO_ACEITE_TERMOS_PENDENTE };
      }
      if (recusa?.status === 409) {
        // Horário/dia recusado (ocupado, dia bloqueado pelo médico…): mostra o
        // motivo do servidor e volta para a escolha do dia com a agenda atualizada.
        const motivo = recusa.erro || "Esse horário não está mais disponível.";
        recarregarBloqueios();
        setEscolha({ especialidade, medico });
        setEtapa("dia");
        return { tipo: "erro", texto: `${motivo} Escolha outro dia ou horário, por favor — seu pagamento não foi debitado.`, voltarAoDia: true };
      }
      if (recusa?.erro) {
        return { tipo: "erro", texto: `Não consegui concluir o agendamento: ${recusa.erro} Seu pagamento não foi debitado.` };
      }
      return { tipo: "erro", texto: "Não consegui concluir o agendamento agora. Verifique sua conexão e tente novamente — seu pagamento não foi debitado." };
    } finally {
      setPagando(false);
    }
  };

  return {
    etapa,
    setEtapa,
    escolha,
    setEscolha,
    pagando,
    stripeAtivo,
    medicosAtivos,
    medicoEscolhido,
    agenda,
    reiniciar,
    pagarEAgendar,
  };
}
