"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { fmtCentavos } from "../metricas";
import {
  useRepasses,
  type ItemRepasseDetalhe,
  type PreviaRepasseWire,
  type RepasseDetalhe,
  type RepasseResumo,
} from "../useDadosMedico";
import { SheetMedico } from "./SheetMedico";

const FUSO = "America/Sao_Paulo";

/** "2026-10-04" → "04/10/2026" (competência já é dia SP). */
function fmtCompetencia(dia: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: FUSO,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const ROTULO_TIPO: Record<string, string> = {
  consulta: "Consulta",
  multa_cancelamento: "Multa de cancelamento",
  multa_remarcacao: "Multa de remarcação",
};

const ROTULO_STATUS: Record<string, string> = {
  fechado: "Aguardando pagamento",
  pago: "Pago",
};

const ROTULO_MOTIVO: Record<string, string> = {
  reembolso: "Reembolso após o fechamento",
  saldo_anterior: "Saldo de ajuste anterior",
};

function SeloStatus({ status }: { status: string }) {
  const pago = status === "pago";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
        pago
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
          : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
      }`}
    >
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

function LinhaValor({
  rotulo,
  valor,
  destaque,
  sinal,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
  /** Prefixo visual: "−" desconto, "+" acréscimo. O valor é sempre positivo. */
  sinal?: "−" | "+";
}) {
  if (valor === 0 && !destaque) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-bion-ink/75 dark:text-bion-paper/75">{rotulo}</span>
      <span className={`font-bold tabular-nums ${destaque ? "text-base" : ""}`}>
        {sinal ? `${sinal}${fmtCentavos(valor)}` : fmtCentavos(valor)}
      </span>
    </div>
  );
}

function TotaisCard({
  totais,
  titulo,
}: {
  totais: {
    brutoCentavos: number;
    comissaoCentavos: number;
    taxasCentavos: number;
    reembolsosCentavos: number;
    multasCentavos: number;
    ajustesCentavos: number;
    liquidoCentavos: number;
  };
  titulo?: string;
}) {
  return (
    <div className="bp-glass p-4 space-y-1.5">
      {titulo ? <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 mb-2">{titulo}</div> : null}
      <LinhaValor rotulo="Bruto das consultas" valor={totais.brutoCentavos} />
      <LinhaValor rotulo="Comissão do app (10%)" valor={totais.comissaoCentavos} sinal="−" />
      <LinhaValor rotulo="Taxa do gateway" valor={totais.taxasCentavos} sinal="−" />
      <LinhaValor rotulo="Reembolsos (sua parte)" valor={totais.reembolsosCentavos} sinal="−" />
      <LinhaValor rotulo="Multas (sua parte, 50%)" valor={totais.multasCentavos} sinal="+" />
      <LinhaValor rotulo="Ajustes" valor={totais.ajustesCentavos} sinal="−" />
      <div className="border-t border-bion-ink/10 dark:border-white/10 pt-2 mt-2">
        <LinhaValor rotulo="Líquido" valor={totais.liquidoCentavos} destaque />
      </div>
    </div>
  );
}

function ItemLinha({
  tipo,
  data,
  paciente,
  liquidoCentavos,
}: {
  tipo: string;
  data: string;
  paciente?: string;
  liquidoCentavos: number;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-bold">{ROTULO_TIPO[tipo] ?? tipo}</div>
        {paciente ? <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75 truncate">{paciente}</div> : null}
        <div className="text-xs text-bion-ink/70 dark:text-bion-paper/70">{fmtDataHora(data)}</div>
      </div>
      <div className="text-sm font-bold tabular-nums shrink-0">{fmtCentavos(liquidoCentavos)}</div>
    </li>
  );
}

function PreviaBloco({ previa }: { previa: PreviaRepasseWire }) {
  const vazia = previa.itens.length === 0 && previa.ajustes.every((a) => a.aplicadoCentavos === 0);
  if (vazia && previa.totais.liquidoCentavos === 0 && previa.ajustesPendentesRestantesCentavos === 0) {
    return (
      <div className="bp-glass p-4 text-sm text-bion-ink/75 dark:text-bion-paper/75">
        Nada a fechar hoje ainda. Consultas pagas de hoje entram no fechamento das 23:30 (horário de Brasília).
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <TotaisCard totais={previa.totais} titulo={`Prévia de hoje · ${fmtCompetencia(previa.competencia)}`} />
      {previa.itens.length > 0 ? (
        <ul className="bp-glass divide-y divide-bion-ink/10 dark:divide-white/10 overflow-hidden">
          {previa.itens.map((i, idx) => (
            <ItemLinha key={`${i.tipo}-${i.data}-${idx}`} tipo={i.tipo} data={i.data} liquidoCentavos={i.liquidoCentavos} />
          ))}
        </ul>
      ) : null}
      {previa.ajustesPendentesRestantesCentavos > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 px-1">
          Ainda restam {fmtCentavos(previa.ajustesPendentesRestantesCentavos)} de ajustes para descontar nos próximos
          repasses (cada fechado é pago inteiro).
        </p>
      ) : null}
    </div>
  );
}

function DetalheView({
  detalhe,
  onVoltar,
}: {
  detalhe: RepasseDetalhe;
  onVoltar: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1 text-sm font-bold text-bion-sea dark:text-sky-300"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden /> Voltar à lista
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">{fmtCompetencia(detalhe.competencia)}</div>
          <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">
            Fechado em {fmtDataHora(detalhe.fechadoEm)}
            {detalhe.pagoEm ? ` · Pago em ${fmtDataHora(detalhe.pagoEm)}` : ""}
          </div>
        </div>
        <SeloStatus status={detalhe.status} />
      </div>

      <TotaisCard totais={detalhe} />

      {detalhe.pixUsado ? (
        <div className="bp-glass p-4 text-sm space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">PIX usado</div>
          <div className="font-bold">{detalhe.pixUsado.chaveMascarada}</div>
          {detalhe.pixUsado.titularNome ? (
            <div className="text-xs text-bion-ink/75 dark:text-bion-paper/75">{detalhe.pixUsado.titularNome}</div>
          ) : null}
        </div>
      ) : null}

      {detalhe.comprovanteUrl ? (
        <a
          href={detalhe.comprovanteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bp-acao w-full py-3 text-sm inline-flex items-center justify-center gap-2"
        >
          Ver comprovante <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      ) : null}

      {detalhe.itens.length > 0 ? (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 px-1 mb-2">
            Itens ({detalhe.itens.length})
          </div>
          <ul className="bp-glass divide-y divide-bion-ink/10 dark:divide-white/10 overflow-hidden">
            {detalhe.itens.map((i: ItemRepasseDetalhe, idx) => (
              <ItemLinha
                key={`${i.tipo}-${i.data}-${i.paciente}-${idx}`}
                tipo={i.tipo}
                data={i.data}
                paciente={i.paciente}
                liquidoCentavos={i.liquidoCentavos}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {detalhe.ajustes.length > 0 ? (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 px-1 mb-2">
            Ajustes aplicados
          </div>
          <ul className="bp-glass divide-y divide-bion-ink/10 dark:divide-white/10 overflow-hidden">
            {detalhe.ajustes.map((a, idx) => (
              <li key={`${a.motivo}-${a.criadoEm}-${idx}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{ROTULO_MOTIVO[a.motivo] ?? a.motivo}</div>
                  <div className="text-xs text-bion-ink/70 dark:text-bion-paper/70">{fmtDataHora(a.criadoEm)}</div>
                </div>
                <div className="text-sm font-bold tabular-nums shrink-0">−{fmtCentavos(a.valorAplicadoCentavos)}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Histórico de repasses do médico: saldo, prévia de hoje, lista de fechados/pagos
 * e detalhe por competência. Abre a partir do perfil.
 */
export function RepassesSheet({
  aberto,
  onFechar,
  onAbrirRecebimento,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Atalho para cadastrar a chave PIX quando ainda não tem. */
  onAbrirRecebimento: () => void;
}) {
  const {
    lista,
    carregando,
    erro,
    recarregar,
    detalhe,
    detalheCarregando,
    detalheErro,
    carregarDetalhe,
    limparDetalhe,
  } = useRepasses();
  const [vista, setVista] = useState<"lista" | "detalhe">("lista");

  const abrirDetalhe = async (id: string) => {
    const r = await carregarDetalhe(id);
    if (r) setVista("detalhe");
  };

  const voltar = () => {
    setVista("lista");
    limparDetalhe();
  };

  return (
    <SheetMedico
      aberto={aberto}
      onFechar={onFechar}
      titulo="Histórico de repasses"
      subtitulo="Fechamento diário às 23:30 (horário de Brasília)"
    >
      {vista === "detalhe" && detalhe ? (
        <DetalheView detalhe={detalhe} onVoltar={voltar} />
      ) : (
        <div className="space-y-4" aria-busy={carregando}>
          {lista?.aviso ? (
            <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 leading-relaxed">{lista.aviso}</p>
          ) : null}

          {!lista && carregando ? (
            <div className="bp-glass p-5 space-y-3" role="status">
              <div className="h-8 w-40 rounded-lg bg-bion-ink/10 dark:bg-white/10 motion-safe:animate-pulse" />
              <div className="h-20 rounded-2xl bg-bion-ink/10 dark:bg-white/10 motion-safe:animate-pulse" />
              <span className="sr-only">Carregando repasses…</span>
            </div>
          ) : !lista && erro ? (
            <div className="bp-glass p-4" role="alert">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">{erro}</p>
              <button
                type="button"
                onClick={recarregar}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-bion-sea dark:text-sky-300 underline underline-offset-2"
              >
                <RefreshCw className="w-4 h-4" aria-hidden /> Tentar de novo
              </button>
            </div>
          ) : lista ? (
            <>
              <div className="bp-glass-marinho p-5 text-white">
                <div className="text-xs font-bold uppercase tracking-wider text-white/80">Saldo a receber</div>
                <div className="mt-1 text-3xl font-black tabular-nums">{fmtCentavos(lista.saldoCentavos)}</div>
                <p className="mt-2 text-xs text-white/80 leading-relaxed">
                  Soma dos repasses fechados (ainda não pagos) e da prévia de hoje, já descontados os ajustes que cabem
                  agora.
                </p>
              </div>

              {!lista.temChavePix ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3" role="status">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-amber-900 dark:text-amber-100">Cadastre sua chave PIX</div>
                    <p className="text-xs text-amber-900/80 dark:text-amber-100/80 mt-1">
                      Sem chave cadastrada o admin não consegue pagar o repasse.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onFechar();
                        onAbrirRecebimento();
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-bion-sea dark:text-sky-300"
                    >
                      <Wallet className="w-4 h-4" aria-hidden /> Ir para Recebimento (PIX)
                    </button>
                  </div>
                </div>
              ) : null}

              <PreviaBloco previa={lista.previa} />

              <div>
                <div className="flex items-center justify-between gap-2 px-1 mb-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75">
                    Histórico
                  </div>
                  <button
                    type="button"
                    onClick={recarregar}
                    disabled={carregando}
                    aria-label="Atualizar lista de repasses"
                    className="p-2 rounded-full bg-bion-ink/8 dark:bg-white/10"
                  >
                    <RefreshCw className={`w-4 h-4 ${carregando ? "motion-safe:animate-spin" : ""}`} />
                  </button>
                </div>

                {lista.repasses.length === 0 ? (
                  <div className="bp-glass p-5 text-sm text-bion-ink/75 dark:text-bion-paper/75 text-center">
                    Nenhum repasse ainda.
                  </div>
                ) : (
                  <ul className="bp-glass divide-y divide-bion-ink/10 dark:divide-white/10 overflow-hidden">
                    {lista.repasses.map((r: RepasseResumo) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => void abrirDetalhe(r.id)}
                          disabled={detalheCarregando}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold">{fmtCompetencia(r.competencia)}</span>
                              <SeloStatus status={r.status} />
                            </span>
                            <span className="block text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">
                              {r.itens} {r.itens === 1 ? "item" : "itens"}
                              {r.pagoEm ? ` · pago em ${fmtDataHora(r.pagoEm)}` : r.fechadoEm ? ` · fechado em ${fmtDataHora(r.fechadoEm)}` : ""}
                            </span>
                          </span>
                          <span className="text-sm font-black tabular-nums shrink-0">{fmtCentavos(r.liquidoCentavos)}</span>
                          <ChevronRight className="w-4 h-4 opacity-70 shrink-0" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {detalheErro ? (
                  <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300" role="alert">
                    {detalheErro}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      )}
    </SheetMedico>
  );
}
