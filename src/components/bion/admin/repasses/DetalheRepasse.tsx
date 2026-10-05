"use client";

import { useState } from "react";
import { ExternalLink, FileCheck2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { SheetAdmin } from "../ui/SheetAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { Esqueleto, EstadoErro } from "../ui/Estados";
import { estadoConsulta, estadoRepasse } from "../rotulos";
import { brl, competenciaCurta } from "../tempo";
import { AvisosRecebimento, ChavePix, Composicao, Titular, quando } from "./partes";
import { PagarRepasse } from "./PagarRepasse";
import { useRecurso } from "./recurso";
import { podePagar, rotuloAjuste, rotuloItem, type ErroExplicado } from "./formatos";
import type { RepasseDetalhe } from "./tipos";

/** Detalhe do repasse (GET /api/admin/repasses/[id]) e, no mesmo painel, o pagamento em 3 passos. */
export function DetalheRepasse({ id, agora, onFechar, onMudou }: { id: string | null; agora: number; onFechar: () => void; onMudou: () => void }) {
  const det = useRecurso<{ repasse: RepasseDetalhe }>(id ? `/api/admin/repasses/${encodeURIComponent(id)}` : null);
  const [modo, setModo] = useState<"detalhe" | "pagar">("detalhe");
  const [sujo, setSujo] = useState(false);
  const [erroPagamento, setErroPagamento] = useState<ErroExplicado | null>(null);
  const [idAntes, setIdAntes] = useState(id);
  if (id !== idAntes) {
    setIdAntes(id);
    setModo("detalhe");
    setSujo(false);
    setErroPagamento(null);
  }
  const r = det.dados?.repasse ?? null;

  const recarregar = () => {
    det.recarregar();
    onMudou();
  };

  return (
    <SheetAdmin
      aberto={Boolean(id)}
      onFechar={onFechar}
      titulo={modo === "pagar" ? "Pagar repasse" : (r?.medico ?? "Repasse")}
      descricao={r ? `Competência ${competenciaCurta(r.competencia, agora)}` : undefined}
      alteracoesPendentes={modo === "pagar" && sujo}
    >
      {!r && det.carregando ? (
        <Esqueleto variante="lista" quantidade={3} rotulo="Carregando o repasse…" />
      ) : det.erro && !r ? (
        <EstadoErro mensagem={det.erro} onTentar={det.recarregar} />
      ) : r && modo === "pagar" ? (
        <PagarRepasse
          key={`${r.id}:${r.recebimento?.pixChave ?? ""}:${r.status}`}
          repasse={r}
          agora={agora}
          erroInicial={erroPagamento}
          onErro={setErroPagamento}
          onSujo={setSujo}
          onCancelar={() => {
            setModo("detalhe");
            setSujo(false);
            setErroPagamento(null);
          }}
          onRecarregar={recarregar}
          onPago={() => {
            toast.success(`Repasse de ${r.medico} marcado como pago`);
            setModo("detalhe");
            setSujo(false);
            setErroPagamento(null);
            recarregar();
          }}
        />
      ) : r ? (
        <ConteudoDetalhe r={r} agora={agora} onPagar={() => setModo("pagar")} />
      ) : null}
    </SheetAdmin>
  );
}

function ConteudoDetalhe({ r, agora, onPagar }: { r: RepasseDetalhe; agora: number; onPagar: () => void }) {
  const pode = podePagar(r);
  const pago = r.status === "pago";
  return (
    <div className="space-y-4">
      <div className="ba-card" data-tom={pago ? "ok" : "dinheiro"} data-denso="true">
        <div className="flex items-center justify-between gap-2">
          <ChipEstado estado={estadoRepasse(r.status)} />
          <span className="text-xs ba-texto-2">{r.fechadoEm ? `fechado ${quando(r.fechadoEm, agora).toLowerCase()}` : null}</span>
        </div>
        <p className="ba-numero text-3xl mt-2">{brl(r.liquidoCentavos)}</p>
        <p className="text-xs ba-texto-2">
          {r.itens.length} {r.itens.length === 1 ? "item" : "itens"} · bruto {brl(r.brutoCentavos)}
        </p>
      </div>

      {!pago ? (
        <div className="space-y-2">
          <AvisosRecebimento rec={r.recebimento} />
          <button type="button" onClick={onPagar} disabled={!pode.ok} className="ba-botao ba-botao-primario w-full">
            <Wallet className="w-4 h-4" aria-hidden /> Pagar este repasse
          </button>
          <p className="text-xs ba-texto-2 text-center">{pode.ok ? "Em 3 passos: conferir a chave, anexar o comprovante e confirmar." : pode.motivo}</p>
        </div>
      ) : null}

      <section className="ba-card space-y-3" data-denso="true" aria-label="Recebimento">
        <h3 className="ba-rotulo">{pago ? "Chave usada no pagamento" : "Recebimento do médico"}</h3>
        {pago && r.pixUsado ? (
          <>
            <ChavePix tipo={r.pixUsado.pixTipo} chave={r.pixUsado.pixChave} />
            <Titular rec={r.pixUsado} />
            <p className="text-xs ba-texto-2">
              Pago {quando(r.pagoEm, agora).toLowerCase()}
              {r.pagoPor ? ` por ${r.pagoPor}` : ""}
            </p>
            {r.comprovanteUrl ? (
              <a href={r.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="ba-botao ba-botao-secundario w-full">
                <FileCheck2 className="w-4 h-4" aria-hidden /> Abrir comprovante <ExternalLink className="w-3.5 h-3.5" aria-hidden />
              </a>
            ) : (
              <p className="text-xs ba-texto-2">Comprovante guardado, mas o link não pôde ser gerado agora. Tente atualizar.</p>
            )}
            {r.comprovanteUrl ? <p className="text-[11px] ba-texto-3 text-center">O link do comprovante vale por 10 minutos.</p> : null}
          </>
        ) : r.recebimento ? (
          <>
            <ChavePix tipo={r.recebimento.pixTipo} chave={r.recebimento.pixChave} />
            <Titular rec={r.recebimento} cnpjPerfil={r.cnpj} />
            <p className="text-xs ba-texto-2">Chave atualizada {quando(r.recebimento.atualizadoEm, agora).toLowerCase()}</p>
          </>
        ) : (
          <p className="text-sm ba-texto-2">O médico ainda não cadastrou a chave PIX.</p>
        )}
      </section>

      <section className="ba-card" data-denso="true" aria-label="Composição do valor">
        <h3 className="ba-rotulo mb-2">Composição</h3>
        <Composicao t={r} />
      </section>

      <section className="ba-card" data-denso="true" aria-label="Itens do repasse">
        <h3 className="ba-rotulo mb-2">Itens ({r.itens.length})</h3>
        {r.itens.length === 0 ? (
          <p className="text-sm ba-texto-2">Sem itens (só ajustes).</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ba-borda)]">
            {r.itens.map((i) => (
              <li key={i.id} className="py-2 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold break-words">{i.paciente}</p>
                  <p className="text-xs ba-texto-2">
                    {rotuloItem(i.tipo)} · {i.especialidade} · {quando(i.dataConsulta, agora)}
                  </p>
                  <ChipEstado estado={estadoConsulta(i.statusConsulta)} className="mt-1" />
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{brl(i.liquidoCentavos)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {r.ajustes.length ? (
        <section className="ba-card" data-denso="true" aria-label="Descontos aplicados">
          <h3 className="ba-rotulo mb-2">Descontos ({r.ajustes.length})</h3>
          <ul className="divide-y divide-[color:var(--ba-borda)]">
            {r.ajustes.map((a) => (
              <li key={a.id} className="py-2 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{rotuloAjuste(a.motivo)}</p>
                  <p className="text-xs ba-texto-2">
                    {quando(a.criadoEm, agora)}
                    {a.valorAplicadoCentavos != null && a.valorAplicadoCentavos !== a.valorCentavos ? ` · aplicado ${brl(a.valorAplicadoCentavos)} de ${brl(a.valorCentavos)}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">− {brl(a.valorAplicadoCentavos ?? a.valorCentavos)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
