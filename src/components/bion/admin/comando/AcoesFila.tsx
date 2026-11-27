"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Gavel, MessageSquareReply, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { CorrigirDesfecho } from "../agendamentos/CorrigirDesfecho";
import { validarRespostaNegar } from "../agendamentos/agenda";
import { useAcoesMedico } from "../medicos/acoes";
import { useEnviosPendentes } from "../medicos/adiadas";
import { statusDe } from "../medicos/medicos";
import { ROTULO_CATEGORIA, type ItemFila, type ReembolsoWire } from "../metricas";
import { chamarApi } from "../repasses/recurso";
import { validarResposta } from "../suporte/chamados";
import { CardDeslizavel } from "../ui/CardDeslizavel";
import { ChipEstado } from "../ui/ChipEstado";
import { SheetAdmin } from "../ui/SheetAdmin";
import { useDadosAdmin } from "../dados";
import { brl, relativo } from "../tempo";

/**
 * Item da Fila com a decisão no próprio card, quando a rota já existe:
 * aprovar médico, decidir reembolso, responder chamado, corrigir desfecho.
 * Pagar repasse continua só no módulo de Repasses.
 */
export function ItemResolvivel({ item, agora, onAbrir }: { item: ItemFila; agora: number; onAbrir: () => void }) {
  const ref = item.ref;
  const { medicos, tickets, aplicarDelta } = useBion();
  const { reembolsos, atualizar } = useDadosAdmin();
  const { aprovarComDesfazer, desfazerAprovacao } = useAcoesMedico();
  const pendentes = useEnviosPendentes();
  const [folha, setFolha] = useState<null | "aprovar" | "negar" | "chamado" | "desfecho">(null);

  const medico = ref?.tipo === "medico" ? medicos.find((m) => m.id === ref.id) : undefined;
  const pendenteMedico = medico ? pendentes.has(`medico:${medico.id}`) : false;
  const reembolso = ref?.tipo === "reembolso"
    ? (reembolsos.dados?.reembolsos ?? []).find((r) => r.id === ref.id)
    : undefined;
  const chamado = ref?.tipo === "chamado" ? tickets.find((t) => t.id === ref.id) : undefined;

  const corpo = (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="ba-rotulo !text-[10px] mb-0.5">{ROTULO_CATEGORIA[item.categoria]}</p>
          <p className="font-bold leading-snug break-words">{item.titulo}</p>
        </div>
      </div>
      {item.detalhe ? <p className="text-sm ba-texto-2 mt-0.5 break-words">{item.detalhe}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {item.chips.map((c) => (
          <ChipEstado key={c.rotulo} estado={c} />
        ))}
        {item.ts ? <span className="text-xs ba-texto-3">{relativo(item.ts, agora)}</span> : null}
        {pendenteMedico ? (
          <button type="button" className="ba-botao ba-botao-secundario !min-h-8 !px-2 !text-xs" onClick={() => medico && desfazerAprovacao(medico)}>
            Desfazer
          </button>
        ) : null}
      </div>
    </>
  );

  if (!ref) {
    if (!item.destino) {
      return (
        <div className="ba-card cursor-default" data-tom={item.tom} data-denso="true">
          {corpo}
          {item.categoria === "renovacao" ? (
            <p className="text-sm ba-texto-2 mt-2">Sem ação no admin: a resposta é do médico, no app dele.</p>
          ) : null}
        </div>
      );
    }
    return (
      <button type="button" onClick={onAbrir} className="ba-card w-full text-left" data-tom={item.tom} data-denso="true">
        {corpo}
      </button>
    );
  }

  return (
    <>
      <CardDeslizavel
        rotulo={item.titulo}
        tom={item.tom}
        denso
        onAbrir={item.destino ? onAbrir : undefined}
        direita={
          ref.tipo === "medico" && medico && !pendenteMedico && statusDe(medico) === "pendente"
            ? { id: "aprovar", rotulo: "Aprovar", icone: CheckCircle2, tom: "ok", modo: "direto", executar: () => aprovarComDesfazer(medico, "aprovar") }
            : ref.tipo === "reembolso"
              ? { id: "aprovar", rotulo: "Aprovar…", icone: CheckCircle2, tom: "ok", modo: "confirmar", executar: () => setFolha("aprovar") }
              : ref.tipo === "chamado"
                ? { id: "responder", rotulo: "Responder…", icone: MessageSquareReply, tom: "ok", modo: "confirmar", executar: () => setFolha("chamado") }
                : ref.tipo === "desfecho"
                  ? { id: "desfecho", rotulo: "Corrigir desfecho…", icone: Gavel, tom: "atencao", modo: "confirmar", executar: () => setFolha("desfecho") }
                  : undefined
        }
        esquerda={
          ref.tipo === "medico" && medico
            ? { id: "suspender", rotulo: "Abrir suspensão…", icone: Ban, tom: "critico", modo: "confirmar", executar: onAbrir }
            : ref.tipo === "reembolso"
              ? { id: "negar", rotulo: "Negar…", icone: Ban, tom: "critico", modo: "confirmar", executar: () => setFolha("negar") }
              : undefined
        }
      >
        {corpo}
      </CardDeslizavel>

      {folha === "aprovar" || folha === "negar" ? (
        <DecidirReembolso
          decisao={folha}
          pedido={reembolso}
          agora={agora}
          onFechar={() => setFolha(null)}
          onDecidido={() => {
            setFolha(null);
            void atualizar();
          }}
        />
      ) : null}

      {folha === "chamado" && ref.tipo === "chamado" ? (
        <ResponderChamado
          id={ref.id}
          assunto={chamado?.assunto || item.titulo}
          onFechar={() => setFolha(null)}
          onEnviado={(dados) => {
            aplicarDelta(dados);
            setFolha(null);
            void atualizar();
          }}
        />
      ) : null}

      {folha === "desfecho" && ref.tipo === "desfecho" ? (
        <SheetAdmin aberto onFechar={() => setFolha(null)} titulo="Corrigir desfecho" descricao={item.titulo} familia={false}>
          <CorrigirDesfecho
            consultaId={ref.id}
            onVoltar={() => setFolha(null)}
            onCorrigido={() => {
              setFolha(null);
              void atualizar();
            }}
            onSujo={() => {}}
          />
        </SheetAdmin>
      ) : null}
    </>
  );
}

function DecidirReembolso({
  decisao,
  pedido,
  agora,
  onFechar,
  onDecidido,
}: {
  decisao: "aprovar" | "negar";
  pedido: ReembolsoWire | undefined;
  agora: number;
  onFechar: () => void;
  onDecidido: () => void;
}) {
  const [resposta, setResposta] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const aprovar = decisao === "aprovar";
  const erroResposta = aprovar ? null : validarRespostaNegar(resposta);
  const justificativa = pedido?.justificativa ?? "";

  const enviar = async () => {
    if (!pedido || !entendi || erroResposta) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi(`/api/admin/reembolsos/${encodeURIComponent(pedido.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisao, resposta: resposta.trim() }),
    });
    setEnviando(false);
    if (!r.dados) return setErro(r.erro || "Não foi possível decidir o reembolso.");
    toast.success(aprovar ? `Reembolso de ${brl(pedido.valorCentavos)} aprovado.` : "Reembolso negado. O paciente recebe a sua resposta.");
    onDecidido();
  };

  return (
    <SheetAdmin
      aberto
      onFechar={onFechar}
      titulo={aprovar ? "Aprovar reembolso" : "Negar reembolso"}
      descricao={pedido?.consulta ? `${pedido.consulta.paciente} · pedido ${relativo(Date.parse(pedido.criadoEm), agora)}` : "Pedido de reembolso"}
      alteracoesPendentes={Boolean(resposta.trim()) || entendi}
      familia={false}
    >
      {!pedido ? (
        <p className="text-sm ba-texto-2">Este pedido não está mais na lista. Atualize a fila.</p>
      ) : (
        <div className="space-y-4">
          <div className="ba-card" data-tom={aprovar ? "dinheiro" : "neutro"} data-denso="true">
            <p className="ba-numero text-3xl">{brl(pedido.valorCentavos)}</p>
            {pedido.consulta ? (
              <p className="text-sm ba-texto-2">
                {pedido.consulta.especialidade} com {pedido.consulta.medico}
              </p>
            ) : null}
            {justificativa ? <p className="text-sm mt-2 whitespace-pre-wrap break-words">“{justificativa}”</p> : null}
          </div>
          <label className="block">
            <span className="ba-rotulo">{aprovar ? "Resposta ao paciente (opcional)" : "Motivo ao paciente (obrigatório)"}</span>
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={aprovar ? "Ex.: Pedido aprovado." : "Explique por que o pedido foi negado (mínimo de 10 caracteres)."}
              className="ba-entrada mt-1 w-full !rounded-2xl py-2"
            />
            {!aprovar && resposta && erroResposta ? <span className="block text-xs mt-1 ba-texto-2">{erroResposta}</span> : null}
          </label>
          <div className="ba-aviso" data-tom={aprovar ? "dinheiro" : "atencao"}>
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <p>
              {aprovar
                ? `O reembolso de ${brl(pedido.valorCentavos)} é aprovado e a consulta sai do repasse do médico.`
                : "O paciente é avisado com a sua resposta e o valor continua no repasse do médico."}{" "}
              A decisão não pode ser desfeita.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
            <span>{aprovar ? `Entendi: devolver ${brl(pedido.valorCentavos)} ao paciente.` : "Entendi: negar este pedido."}</span>
          </label>
          {erro ? (
            <div className="ba-aviso" data-tom="critico" role="alert">
              <p>{erro}</p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} disabled={enviando} className="ba-botao ba-botao-secundario">
              Voltar
            </button>
            <button type="button" onClick={() => void enviar()} disabled={enviando || !entendi || !!erroResposta} className="ba-botao ba-botao-primario">
              {enviando ? "Enviando…" : aprovar ? "Aprovar" : "Negar"}
            </button>
          </div>
        </div>
      )}
    </SheetAdmin>
  );
}

function ResponderChamado({
  id,
  assunto,
  onFechar,
  onEnviado,
}: {
  id: string;
  assunto: string;
  onFechar: () => void;
  onEnviado: (dados: Record<string, unknown>) => void;
}) {
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const validacao = validarResposta(resposta);

  const enviar = async () => {
    if (!validacao.ok) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<Record<string, unknown>>(`/api/tickets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resposta: resposta.trim() }),
    });
    setEnviando(false);
    if (!r.dados) return setErro(r.erro || "Não foi possível responder o chamado.");
    toast.success("Chamado respondido.");
    onEnviado(r.dados);
  };

  return (
    <SheetAdmin aberto onFechar={onFechar} titulo="Responder chamado" descricao={assunto} alteracoesPendentes={Boolean(resposta.trim())} familia={false}>
      <div className="space-y-4">
        <label className="block">
          <span className="ba-rotulo">Resposta e solução</span>
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="Escreva a resposta e a solução para este chamado…"
            className="ba-entrada mt-1 w-full !rounded-2xl py-2"
          />
          {!validacao.ok && resposta ? <span className="block text-xs mt-1 ba-texto-2">{validacao.erro}</span> : null}
        </label>
        <p className="text-sm ba-texto-2">A resposta fecha o chamado e avisa quem abriu.</p>
        {erro ? (
          <div className="ba-aviso" data-tom="critico" role="alert">
            <p>{erro}</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onFechar} disabled={enviando} className="ba-botao ba-botao-secundario">
            Voltar
          </button>
          <button type="button" onClick={() => void enviar()} disabled={enviando || !validacao.ok} className="ba-botao ba-botao-primario">
            {enviando ? "Enviando…" : "Responder e fechar"}
          </button>
        </div>
      </div>
    </SheetAdmin>
  );
}
