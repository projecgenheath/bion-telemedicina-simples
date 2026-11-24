"use client";

import { useState } from "react";
import { ArrowLeft, CalendarClock, ChevronRight, FilePlus2, Ruler, Search } from "lucide-react";
import { iniciais, type PacienteDoMedico } from "../metricas";
import { SheetMedico } from "./SheetMedico";

export type AcaoRapida = "emitir" | "medicao";

/** Mesma regra da ficha (ConversaPaciente): emitir pede pacienteId; o pedido
 *  de medição pede também uma consulta não cancelada do vínculo. */
export const podeEmitir = (p: PacienteDoMedico) => Boolean(p.pacienteId);
export const podePedirMedicao = (p: PacienteDoMedico) =>
  Boolean(p.pacienteId) && p.consultas.some((c) => c.status !== "cancelada");

/**
 * Etapa 5 — botão "+" da barra inferior: atalhos para ações que já existem.
 * "Emitir receita ou documento" e "Pedir medição" escolhem o paciente e
 * abrem a ficha dele com a ação aberta; "Horários e bloqueios" abre o sheet
 * de agenda. "Pedir medição" só aparece se algum paciente cumpre a regra.
 */
export function AcoesRapidasSheet({
  aberto,
  onFechar,
  pacientes,
  onAcao,
  onHorarios,
}: {
  aberto: boolean;
  onFechar: () => void;
  pacientes: PacienteDoMedico[];
  onAcao: (acao: AcaoRapida, p: PacienteDoMedico) => void;
  onHorarios: () => void;
}) {
  const [passo, setPasso] = useState<AcaoRapida | null>(null);
  const [busca, setBusca] = useState("");
  const paraEmitir = pacientes.filter(podeEmitir);
  const paraMedicao = pacientes.filter(podePedirMedicao);
  const lista = passo === "medicao" ? paraMedicao : paraEmitir;
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtrada = termo ? lista.filter((p) => p.nome.toLocaleLowerCase("pt-BR").includes(termo)) : lista;

  const opcao = (Icone: typeof FilePlus2, titulo: string, sub: string, onClick: () => void, desabilitada = false) => (
    <li>
      <button type="button" onClick={onClick} disabled={desabilitada} className="bm2-acao-linha">
        <span className="bm2-acao-icone" aria-hidden>
          <Icone className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs bm2-acao-sub">{sub}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
      </button>
    </li>
  );

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo={passo === "emitir" ? "Emitir para qual paciente?" : passo === "medicao" ? "Pedir medição a qual paciente?" : "Novo"}
      subtitulo={passo ? "Abre a ficha do paciente com a ação pronta" : "Atalhos para o que você faz no dia a dia"}
    >
      {passo === null ? (
        <ul className="bm2-acoes space-y-2">
          {opcao(
            FilePlus2,
            "Emitir receita ou documento",
            paraEmitir.length ? "Receita, atestado, pedido de exame ou relatório" : "Nenhum paciente com cadastro ainda",
            () => setPasso("emitir"),
            paraEmitir.length === 0,
          )}
          {paraMedicao.length
            ? opcao(Ruler, "Pedir medição", "Pressão, glicemia e outras, pelo app do paciente", () => setPasso("medicao"))
            : null}
          {opcao(CalendarClock, "Horários e bloqueios", "Semana de atendimento e dias bloqueados", onHorarios)}
        </ul>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => { setPasso(null); setBusca(""); }} className="inline-flex items-center gap-1.5 text-sm font-medium bm2-acao-voltar">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar aos atalhos
          </button>
          {lista.length > 6 ? (
            <label className="relative block">
              <span className="sr-only">Buscar paciente</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" aria-hidden />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar paciente"
                className="bp-entrada w-full rounded-full py-2.5 pl-9 pr-4 text-sm"
              />
            </label>
          ) : null}
          <ul className="bm2-acoes space-y-1.5" aria-label="Pacientes">
            {filtrada.map((p) => (
              <li key={p.chave}>
                <button type="button" onClick={() => onAcao(passo, p)} className="bm2-acao-linha">
                  <span className="bm2-acao-avatar" aria-hidden>
                    {iniciais(p.nome)}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{p.nome}</span>
                    <span className="block text-xs bm2-acao-sub">
                      {p.proxima ? `Próxima consulta: ${p.proxima.data} às ${p.proxima.hora}` : p.ultima ? `Última consulta: ${p.ultima.data}` : "Sem consulta registrada"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                </button>
              </li>
            ))}
            {filtrada.length === 0 ? <li className="py-4 text-center text-sm bm2-acao-sub">Nenhum paciente com esse nome.</li> : null}
          </ul>
        </div>
      )}
    </SheetMedico>
  );
}
