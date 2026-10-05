"use client";

import { useState } from "react";
import { CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { partesFusoClinica } from "@/lib/bion-tipos";
import { SheetAdmin } from "../ui/SheetAdmin";
import { brl, chaveDia, competenciaCurta, dataLonga } from "../tempo";
import { chamarApi } from "./recurso";
import { HORA_FECHAMENTO, resumoFechamento, validarCompetencia } from "./formatos";
import type { RespostaFechamento } from "./tipos";

/**
 * "Fechar agora" (POST /api/admin/repasses): fecha o repasse de um dia
 * antes do fechamento automático. Pede confirmação explícita: o que ficar
 * elegível depois do corte entra no repasse do dia seguinte.
 */
export function FecharAgora({
  aberto,
  agora,
  competenciaPadrao,
  onFechar,
  onFechou,
}: {
  aberto: boolean;
  agora: number;
  competenciaPadrao: string | null;
  onFechar: () => void;
  onFechou: () => void;
}) {
  const { medicos } = useBion();
  const padrao = competenciaPadrao ?? chaveDia(agora - (partesFusoClinica(agora).hora < HORA_FECHAMENTO ? 86_400_000 : 0));
  const [dia, setDia] = useState(padrao);
  const [medicoId, setMedicoId] = useState("");
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaFechamento | null>(null);
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) {
      setDia(padrao);
      setMedicoId("");
      setEntendi(false);
      setErro(null);
      setResultado(null);
    }
  }

  const invalido = validarCompetencia(dia, chaveDia(agora), partesFusoClinica(agora).hora);
  const nomeDe = (id: string) => medicos.find((m) => m.id === id)?.nome ?? "Médico";

  const fechar = async () => {
    if (invalido || !entendi) return;
    setEnviando(true);
    setErro(null);
    const r = await chamarApi<RespostaFechamento>("/api/admin/repasses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competencia: dia, ...(medicoId ? { medicoId } : {}) }),
    });
    setEnviando(false);
    if (!r.dados) {
      setErro(r.status === 0 ? "Sem conexão. Nada foi fechado; tente de novo." : r.status === 403 ? "Só administradores podem fechar repasses." : (r.erro ?? "Não foi possível fechar."));
      return;
    }
    setResultado(r.dados);
    const s = resumoFechamento(r.dados.resultados);
    if (s.fechado) toast.success(`${s.fechado} ${s.fechado === 1 ? "repasse fechado" : "repasses fechados"} · ${brl(s.liquidoCentavos)}`);
    onFechou();
  };

  const resumo = resultado ? resumoFechamento(resultado.resultados) : null;

  return (
    <SheetAdmin
      aberto={aberto}
      onFechar={onFechar}
      titulo={resultado ? "Fechamento concluído" : "Fechar repasses agora"}
      descricao={resultado ? `Competência ${competenciaCurta(resultado.competencia, agora)}` : "Antes do fechamento automático das 23:00"}
      alteracoesPendentes={!resultado && entendi}
    >
      {resultado && resumo ? (
        <div className="space-y-3">
          <div className="ba-card" data-tom={resumo.erro ? "atencao" : "ok"} data-denso="true">
            <p className="ba-numero text-3xl">{brl(resumo.liquidoCentavos)}</p>
            <p className="text-sm ba-texto-2">
              {resumo.fechado} {resumo.fechado === 1 ? "fechado" : "fechados"} · {resumo.ja_fechado} já {resumo.ja_fechado === 1 ? "estava fechado" : "estavam fechados"} · {resumo.sem_itens} sem itens
              {resumo.erro ? ` · ${resumo.erro} com erro` : ""}
            </p>
          </div>
          <ul className="ba-card divide-y divide-[color:var(--ba-borda)]" data-denso="true">
            {resultado.resultados.map((x) => (
              <li key={x.medicoId} className="py-2 flex items-start gap-3 text-sm">
                <span className="flex-1 min-w-0 break-words font-bold">{nomeDe(x.medicoId)}</span>
                <span className="shrink-0 text-right ba-texto-2">
                  {x.situacao === "erro"
                    ? <span style={{ color: "var(--ba-critico)" }}>{x.erro}</span>
                    : x.situacao === "fechado"
                      ? `fechado · ${brl(x.liquidoCentavos ?? 0)}`
                      : x.situacao === "ja_fechado"
                        ? "já estava fechado"
                        : "sem itens"}
                </span>
              </li>
            ))}
            {resultado.resultados.length === 0 ? <li className="py-2 text-sm ba-texto-2">Nenhum médico com itens neste dia.</li> : null}
          </ul>
          <button type="button" onClick={onFechar} className="ba-botao ba-botao-primario w-full">
            <CheckCircle2 className="w-4 h-4" aria-hidden /> Ver repasses a pagar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="ba-rotulo">Dia (competência)</span>
            <input type="date" value={dia} max={chaveDia(agora)} onChange={(e) => setDia(e.target.value)} className="ba-entrada mt-1 w-full" />
          </label>
          {!invalido ? <p className="text-xs ba-texto-2 -mt-2">Dia escolhido: {dataLonga(Date.parse(`${dia}T12:00:00-03:00`))}</p> : null}
          {invalido ? (
            <p className="text-sm font-bold" style={{ color: "var(--ba-critico)" }} role="alert">
              {invalido}
            </p>
          ) : null}
          <label className="block">
            <span className="ba-rotulo">Médico</span>
            <select value={medicoId} onChange={(e) => setMedicoId(e.target.value)} className="ba-entrada mt-1 w-full">
              <option value="">Todos os médicos</option>
              {[...medicos]
                .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </label>
          <div className="ba-aviso" data-tom="atencao">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-1">
              <p className="font-bold">O corte é agora.</p>
              <p>
                Entra no repasse só o que já está elegível neste momento. Consultas, multas e descontos que ficarem elegíveis depois entram no repasse do dia
                seguinte, no fechamento automático. Fechar não paga nada: o pagamento é feito depois, um a um.
              </p>
            </div>
          </div>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 w-5 h-5 accent-[var(--ba-sinal)]" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
            <span>Entendi que o que ficar elegível depois entra no repasse seguinte.</span>
          </label>
          {erro ? (
            <div className="ba-aviso" data-tom="critico" role="alert">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <p>{erro}</p>
            </div>
          ) : null}
          <button type="button" onClick={() => void fechar()} disabled={!entendi || Boolean(invalido) || enviando} className="ba-botao ba-botao-primario w-full">
            <Lock className="w-4 h-4" aria-hidden />
            {enviando ? "Fechando…" : `Fechar ${competenciaCurta(dia, agora)}${medicoId ? ` de ${nomeDe(medicoId)}` : " de todos"}`}
          </button>
        </div>
      )}
    </SheetAdmin>
  );
}
