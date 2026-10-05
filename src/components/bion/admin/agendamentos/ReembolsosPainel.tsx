"use client";

import { useState } from "react";
import { Check, ShieldAlert, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { estadoReembolso } from "../rotulos";
import { brl, dataLonga, hora as horaDe, relativo } from "../tempo";
import { chamarApi, useRecurso } from "../repasses/recurso";
import { explicarErro, validarRespostaNegar } from "./agenda";

type Pedido = {
  id: string;
  status: string;
  valorCentavos: number;
  justificativa: string;
  respostaAdmin: string | null;
  criadoEm: string;
  decididoEm: string | null;
  decididoPor?: string | null;
  consulta: { id: string; especialidade: string; dataInicio: string; valor?: number; medicoId?: string; medico: string; pacienteId?: string; paciente: string } | null;
};

const FILTROS = [
  ["em_analise", "Em análise"],
  ["aprovado", "Aprovados"],
  ["negado", "Negados"],
  ["todos", "Todos"],
] as const;

/**
 * Pedidos MANUAIS de reembolso (faltas do paciente): GET/PATCH
 * /api/admin/reembolsos. Aprovar (dinheiro) e negar (resposta obrigatória ao
 * paciente) sempre passam por confirmação; nunca por gesto.
 */
export function ReembolsosPainel({ agora, onMudou }: { agora: number; onMudou: () => void }) {
  const [filtro, setFiltro] = useState<string>("em_analise");
  const lista = useRecurso<{ total: number; reembolsos: Pedido[] }>(`/api/admin/reembolsos?status=${filtro}`);
  const [decidindo, setDecidindo] = useState<{ p: Pedido; decisao: "aprovar" | "negar" } | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-sm ba-texto-2">O paciente pede em até 7 dias depois de uma falta. Aprovado, o valor volta para ele e a consulta sai do repasse do médico.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Situação dos pedidos">
        {FILTROS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v} className="ba-aba ba-aba-solta">
            {l}
          </button>
        ))}
      </div>
      {!lista.dados && lista.carregando ? (
        <Esqueleto variante="cards" quantidade={2} rotulo="Carregando pedidos…" />
      ) : !lista.dados ? (
        <EstadoErro mensagem={lista.erro} onTentar={lista.recarregar} />
      ) : lista.dados.reembolsos.length === 0 ? (
        <EstadoVazio icone={Undo2} tom="ok" titulo={filtro === "em_analise" ? "Nenhum pedido para analisar" : "Nenhum pedido neste filtro"} />
      ) : (
        <>
          {lista.dados.total > lista.dados.reembolsos.length ? (
            <p className="text-xs ba-texto-2">
              Mostrando {lista.dados.reembolsos.length} de {lista.dados.total}.
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {lista.dados.reembolsos.map((p) => (
              <article key={p.id} className="ba-card space-y-2" data-tom={estadoReembolso(p.status).tom} data-denso="true">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold break-words">{p.consulta?.paciente ?? "Paciente"}</p>
                    {p.consulta ? (
                      <p className="text-xs ba-texto-2">
                        {p.consulta.especialidade} com {p.consulta.medico} · {dataLonga(Date.parse(p.consulta.dataInicio))} às {horaDe(Date.parse(p.consulta.dataInicio))}
                      </p>
                    ) : null}
                  </div>
                  <span className="ba-numero text-xl shrink-0">{brl(p.valorCentavos)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ChipEstado estado={estadoReembolso(p.status)} />
                  <span className="text-xs ba-texto-3">pedido {relativo(Date.parse(p.criadoEm), agora)}</span>
                </div>
                <blockquote className="text-sm whitespace-pre-wrap break-words border-l-2 pl-3" style={{ borderColor: "var(--ba-borda)" }}>
                  “{p.justificativa}”
                </blockquote>
                {p.status === "em_analise" ? (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button type="button" onClick={() => setDecidindo({ p, decisao: "negar" })} className="ba-botao ba-botao-secundario">
                      <X className="w-4 h-4" aria-hidden /> Negar…
                    </button>
                    <button type="button" onClick={() => setDecidindo({ p, decisao: "aprovar" })} className="ba-botao ba-botao-primario">
                      <Check className="w-4 h-4" aria-hidden /> Aprovar…
                    </button>
                  </div>
                ) : p.respostaAdmin ? (
                  <p className="text-xs ba-texto-2 break-words">Resposta: {p.respostaAdmin}</p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
      <Decisao
        alvo={decidindo}
        agora={agora}
        onFechar={() => setDecidindo(null)}
        onDecidido={() => {
          setDecidindo(null);
          lista.recarregar();
          onMudou();
        }}
      />
    </div>
  );
}

function Decisao({
  alvo,
  agora,
  onFechar,
  onDecidido,
}: {
  alvo: { p: Pedido; decisao: "aprovar" | "negar" } | null;
  agora: number;
  onFechar: () => void;
  onDecidido: () => void;
}) {
  const [resposta, setResposta] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const k = alvo ? `${alvo.p.id}:${alvo.decisao}` : null;
  if (k !== chave) {
    setChave(k);
    setResposta("");
    setEntendi(false);
    setErro(null);
  }
  const aprovar = alvo?.decisao === "aprovar";
  const erroResposta = !aprovar ? validarRespostaNegar(resposta) : null;

  const enviar = async () => {
    if (!alvo || !entendi || erroResposta) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<unknown>(`/api/admin/reembolsos/${encodeURIComponent(alvo.p.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisao: alvo.decisao, resposta: resposta.trim() }),
    });
    setEnviando(false);
    if (!r.dados) return setErro(explicarErro(r.status, r.erro));
    toast.success(aprovar ? `Reembolso de ${brl(alvo.p.valorCentavos)} aprovado.` : "Reembolso negado. O paciente recebe a sua resposta.");
    onDecidido();
  };

  return (
    <SheetAdmin
      aberto={Boolean(alvo)}
      onFechar={onFechar}
      titulo={aprovar ? "Aprovar reembolso" : "Negar reembolso"}
      descricao={alvo?.p.consulta ? `${alvo.p.consulta.paciente} · pedido ${relativo(Date.parse(alvo.p.criadoEm), agora)}` : undefined}
      alteracoesPendentes={Boolean(resposta.trim()) || entendi}
    >
      {alvo ? (
        <div className="space-y-4">
          <div className="ba-card" data-tom={aprovar ? "dinheiro" : "neutro"} data-denso="true">
            <p className="ba-numero text-3xl">{brl(alvo.p.valorCentavos)}</p>
            {alvo.p.consulta ? (
              <p className="text-sm ba-texto-2">
                {alvo.p.consulta.especialidade} com {alvo.p.consulta.medico} · {dataLonga(Date.parse(alvo.p.consulta.dataInicio))}
              </p>
            ) : null}
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">“{alvo.p.justificativa}”</p>
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
                ? `O reembolso de ${brl(alvo.p.valorCentavos)} ao paciente é aprovado e a consulta sai do repasse do médico.`
                : "O paciente é avisado com a sua resposta e o valor continua no repasse do médico."}{" "}
              A decisão não pode ser desfeita.
            </p>
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
            <span>{aprovar ? `Entendi: devolver ${brl(alvo.p.valorCentavos)} ao paciente.` : "Entendi: negar este pedido."}</span>
          </label>
          {erro ? (
            <div className="ba-aviso" data-tom="critico" role="alert">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <p>{erro}</p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} disabled={enviando} className="ba-botao ba-botao-secundario">
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={!entendi || Boolean(erroResposta) || enviando}
              className={`ba-botao flex-1 ${aprovar ? "ba-botao-primario" : "ba-botao-perigo"}`}
            >
              {aprovar ? <Check className="w-4 h-4" aria-hidden /> : <X className="w-4 h-4" aria-hidden />}
              {enviando ? "Enviando…" : aprovar ? `Aprovar ${brl(alvo.p.valorCentavos)}` : "Negar pedido"}
            </button>
          </div>
        </div>
      ) : null}
    </SheetAdmin>
  );
}
