"use client";

import { useState } from "react";
import { CalendarX2, Gavel, Pencil } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { EstadoVazio } from "../ui/Estados";
import { estadoReembolso } from "../rotulos";
import { brl, dataLonga, hora as horaDe, relativo } from "../tempo";
import { centavosDoValor } from "../metricas";
import { CancelarConsulta } from "./CancelarConsulta";
import { EditarConsulta } from "./EditarConsulta";
import { CorrigirDesfecho } from "./CorrigirDesfecho";
import { chipsConsulta, podeCancelar } from "./agenda";
import { desfechoNoStore, podeCorrigirDesfecho } from "./desfecho";

export type ModoDetalhe = "detalhe" | "editar" | "cancelar" | "desfecho";
type Modo = ModoDetalhe;

/**
 * Detalhe de uma consulta (dados reais do estado do app) com editar/remarcar,
 * cancelar e corrigir desfecho no mesmo painel. Consulta fora das carregadas
 * (a Fila abre por id): só o "Corrigir desfecho", que lê tudo do servidor.
 */
export function DetalheConsulta({ id, agora, modoInicial = "detalhe", onFechar }: { id: string | null; agora: number; modoInicial?: Modo; onFechar: () => void }) {
  const { consultas } = useBion();
  const c = id ? consultas.find((x) => x.id === id) : undefined;
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [sujo, setSujo] = useState(false);
  const [chave, setChave] = useState(`${id}:${modoInicial}`);
  if (`${id}:${modoInicial}` !== chave) {
    setChave(`${id}:${modoInicial}`);
    setModo(modoInicial);
    setSujo(false);
  }
  const voltar = () => {
    setModo("detalhe");
    setSujo(false);
  };

  const titulo =
    modo === "editar" ? "Editar ou remarcar" : modo === "cancelar" ? "Cancelar consulta" : modo === "desfecho" ? "Corrigir desfecho" : (c?.paciente ?? "Consulta");
  const desfecho = c ? desfechoNoStore(c, agora) : null;
  return (
    <SheetAdmin
      aberto={Boolean(id)}
      onFechar={onFechar}
      titulo={titulo}
      descricao={c ? `${dataLonga(c.ts)} às ${horaDe(c.ts)}` : undefined}
      alteracoesPendentes={modo !== "detalhe" && sujo}
    >
      {modo === "desfecho" && id ? (
        <CorrigirDesfecho key={id} consultaId={id} onVoltar={voltar} onCorrigido={voltar} onSujo={setSujo} />
      ) : !c ? (
        <EstadoVazio
          titulo="Consulta não encontrada"
          texto="Ela não está entre as consultas carregadas. Atualize a tela ou abra o desfecho direto do servidor."
          tom="atencao"
          acao={
            id ? (
              <button type="button" onClick={() => setModo("desfecho")} className="ba-botao ba-botao-secundario">
                <Gavel className="w-4 h-4" aria-hidden /> Ver e corrigir desfecho
              </button>
            ) : null
          }
        />
      ) : modo === "editar" ? (
        <EditarConsulta key={c.id} consulta={c} agora={agora} onCancelar={voltar} onSalvo={voltar} onSujo={setSujo} />
      ) : modo === "cancelar" ? (
        <CancelarConsulta key={c.id} consulta={c} agora={agora} onVoltar={voltar} onCancelada={voltar} onSujo={setSujo} />
      ) : (
        <div className="space-y-4">
          <div className="ba-card" data-denso="true" data-tom={chipsConsulta(c, agora)[0].tom}>
            <div className="flex items-baseline gap-3">
              <span className="ba-numero text-4xl tabular-nums">{horaDe(c.ts)}</span>
              <span className="text-sm ba-texto-2">{relativo(c.ts, agora)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {chipsConsulta(c, agora).map((e) => (
                <ChipEstado key={e.rotulo} estado={e} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo("editar")} className="ba-botao ba-botao-secundario">
              <Pencil className="w-4 h-4" aria-hidden /> Remarcar
            </button>
            <button type="button" onClick={() => setModo("cancelar")} disabled={!podeCancelar(c)} className="ba-botao ba-botao-perigo">
              <CalendarX2 className="w-4 h-4" aria-hidden /> Cancelar…
            </button>
          </div>
          {!podeCancelar(c) ? <p className="text-xs ba-texto-2 -mt-2">Consulta {c.status === "concluida" ? "concluída" : "cancelada"}: não dá para cancelar.</p> : null}
          {podeCorrigirDesfecho(c, agora) ? (
            <button type="button" onClick={() => setModo("desfecho")} className="ba-botao ba-botao-secundario w-full">
              <Gavel className="w-4 h-4" aria-hidden /> Corrigir desfecho…
            </button>
          ) : null}

          <dl className="ba-card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-denso="true">
            <dt className="ba-texto-2">Paciente</dt>
            <dd className="font-bold break-words">{c.paciente}</dd>
            <dt className="ba-texto-2">Médico</dt>
            <dd className="break-words">{c.medico}</dd>
            <dt className="ba-texto-2">Especialidade</dt>
            <dd className="break-words">{c.especialidade}</dd>
            <dt className="ba-texto-2">Valor</dt>
            <dd className="tabular-nums">{c.valor ? brl(centavosDoValor(c.valor)) : "—"}</dd>
            <dt className="ba-texto-2">Pagamento</dt>
            <dd>{c.pago ? "Pago" : "Não pago"}</dd>
            {desfecho ? (
              <>
                <dt className="ba-texto-2">Desfecho</dt>
                <dd>
                  <ChipEstado estado={desfecho} />
                </dd>
              </>
            ) : null}
            {c.motivoConsulta ? (
              <>
                <dt className="ba-texto-2">Motivo</dt>
                <dd className="break-words">{c.motivoConsulta}</dd>
              </>
            ) : null}
            {c.motivoCancelamento ? (
              <>
                <dt className="ba-texto-2">Cancelamento</dt>
                <dd className="break-words" style={{ color: "var(--ba-critico)" }}>
                  {c.motivoCancelamento}
                </dd>
              </>
            ) : null}
            {c.remarcacaoPendente ? (
              <>
                <dt className="ba-texto-2">Remarcação</dt>
                <dd className="break-words">
                  Nova data reservada: {dataLonga(Date.parse(c.remarcacaoPendente.novaData))} às {horaDe(Date.parse(c.remarcacaoPendente.novaData))}, aguardando a multa de{" "}
                  {brl(c.remarcacaoPendente.multaCentavos)} até {horaDe(Date.parse(c.remarcacaoPendente.expiraEm))}.
                </dd>
              </>
            ) : null}
            {c.reembolsoManual ? (
              <>
                <dt className="ba-texto-2">Reembolso</dt>
                <dd className="break-words">
                  {estadoReembolso(c.reembolsoManual.status).rotulo}
                  {c.reembolsoManual.respostaAdmin ? ` · “${c.reembolsoManual.respostaAdmin}”` : ""}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      )}
    </SheetAdmin>
  );
}
