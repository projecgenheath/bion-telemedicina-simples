"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, Lock, Wallet } from "lucide-react";
import { TelaModulo } from "../ui/TelaModulo";
import { EstadoErro, EstadoVazio, Esqueleto } from "../ui/Estados";
import { useDadosAdmin } from "../dados";
import { brl, competenciaCurta } from "../tempo";
import { CardRepasse, quando, type DadosCard } from "./partes";
import { DetalheRepasse } from "./DetalheRepasse";
import { FecharAgora } from "./FecharAgora";
import { useRecurso } from "./recurso";
import { agruparPorCompetencia } from "./formatos";
import type { RepasseLista, RespostaLista, RespostaPrevia } from "./tipos";

type Aba = "hoje" | "apagar" | "pagos";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "apagar", rotulo: "A pagar" },
  { id: "pagos", rotulo: "Pagos" },
];

/**
 * Repasses aos médicos (só admin): prévia de hoje, a pagar (fechados) e pagos.
 * O detalhe abre por ?repasse=ID (a Fila do Centro de Comando leva direto a ele).
 * Pagar é sempre pelo passo a passo do detalhe, nunca por gesto.
 */
export function RepassesModulo() {
  const router = useRouter();
  const params = useSearchParams();
  const idAberto = params.get("repasse");
  const { agora, atualizar } = useDadosAdmin();
  const [aba, setAba] = useState<Aba>(params.get("aba") === "hoje" ? "hoje" : params.get("aba") === "pagos" ? "pagos" : "apagar");
  const [fechando, setFechando] = useState(false);

  const fechados = useRecurso<RespostaLista>("/api/admin/repasses?status=fechado");
  const pagos = useRecurso<RespostaLista>(aba === "pagos" ? "/api/admin/repasses?status=pago" : null);
  const previa = useRecurso<RespostaPrevia>(aba === "hoje" ? "/api/admin/repasses?previa=1" : null);

  const recarregarTudo = () => {
    fechados.recarregar();
    pagos.recarregar();
    previa.recarregar();
    void atualizar();
  };
  const abrir = (id: string) => router.replace(`/admin-repasses?repasse=${encodeURIComponent(id)}`, { scroll: false });
  const fecharDetalhe = () => router.replace("/admin-repasses", { scroll: false });

  const teclaAbas = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ABAS.findIndex((a) => a.id === aba);
    const prox = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (prox == null) return;
    e.preventDefault();
    const nova = ABAS[(prox + ABAS.length) % ABAS.length].id;
    setAba(nova);
    document.getElementById(`aba-${nova}`)?.focus();
  };

  const total = fechados.dados?.total ?? 0;
  const bloqueados = (fechados.dados?.repasses ?? []).filter((r) => !r.recebimento || r.recebimento.cnpjDivergente).length;

  return (
    <TelaModulo
      titulo="Repasses"
      icone={Wallet}
      subtitulo="Prévia de hoje, a pagar e pagos"
      onAtualizar={recarregarTudo}
      atualizando={fechados.carregando}
      ferramentas={
        <div className="space-y-3">
          <div className="ba-card flex flex-wrap items-center gap-3" data-tom="dinheiro" data-denso="true">
            <div className="flex-1 min-w-0">
              <p className="ba-rotulo">A pagar</p>
              {fechados.erro && !fechados.dados ? (
                <p className="text-sm ba-texto-2" role="alert">
                  Não foi possível carregar: {fechados.erro}
                </p>
              ) : fechados.dados ? (
                <>
                  <p className="ba-numero text-3xl">{brl(fechados.dados.totalLiquidoCentavos)}</p>
                  <p className="text-xs ba-texto-2">
                    {total} {total === 1 ? "repasse fechado" : "repasses fechados"} aguardando pagamento
                    {bloqueados ? ` · ${bloqueados} ${bloqueados === 1 ? "bloqueado" : "bloqueados"} (sem PIX ou CNPJ divergente)` : ""}
                  </p>
                </>
              ) : (
                <div className="ba-esqueleto h-8 w-32 mt-1" aria-hidden />
              )}
            </div>
            <button type="button" onClick={() => setFechando(true)} className="ba-botao ba-botao-secundario shrink-0">
              <Lock className="w-4 h-4" aria-hidden /> Fechar agora
            </button>
          </div>
          <div role="tablist" aria-label="Situação dos repasses" className="ba-abas" onKeyDown={teclaAbas}>
            {ABAS.map((a) => (
              <button
                key={a.id}
                id={`aba-${a.id}`}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                aria-controls={`painel-${a.id}`}
                tabIndex={aba === a.id ? 0 : -1}
                onClick={() => setAba(a.id)}
                className="ba-aba"
              >
                {a.rotulo}
                {a.id === "apagar" && total ? <span className="ml-1 tabular-nums opacity-80">· {total}</span> : null}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} className="mt-4">
        {aba === "hoje" ? <AbaHoje r={previa} agora={agora} /> : null}
        {aba === "apagar" ? <AbaLista r={fechados} agora={agora} tipo="fechado" onAbrir={abrir} /> : null}
        {aba === "pagos" ? <AbaLista r={pagos} agora={agora} tipo="pago" onAbrir={abrir} /> : null}
      </div>

      <DetalheRepasse id={idAberto} agora={agora} onFechar={fecharDetalhe} onMudou={recarregarTudo} />
      <FecharAgora
        aberto={fechando}
        agora={agora}
        competenciaPadrao={fechados.dados?.competenciaPadraoParaFechar ?? previa.dados?.competenciaPadraoParaFechar ?? null}
        onFechar={() => {
          setFechando(false);
          setAba("apagar");
        }}
        onFechou={recarregarTudo}
      />
    </TelaModulo>
  );
}

type Recurso<T> = { dados: T | null; erro: string | null; carregando: boolean; recarregar: () => void };

function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function AbaHoje({ r, agora }: { r: Recurso<RespostaPrevia>; agora: number }) {
  if (!r.dados && r.carregando) return <Esqueleto variante="cards" quantidade={3} rotulo="Calculando a prévia…" />;
  if (!r.dados) return <EstadoErro mensagem={r.erro} onTentar={r.recarregar} />;
  const previas = r.dados.previas;
  const soma = previas.reduce((s, p) => s + p.totais.liquidoCentavos, 0);
  return (
    <div className="space-y-3">
      <div className="ba-aviso" data-tom="neutro">
        <Eye className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>
          <b>Prévia: nada foi fechado.</b> É o que entraria se o dia fosse fechado agora ({brl(soma)} em {previas.length}{" "}
          {previas.length === 1 ? "médico" : "médicos"}). O fechamento automático é às 23:00; até lá os valores podem mudar.
        </p>
      </div>
      {previas.length === 0 ? (
        <EstadoVazio icone={Wallet} titulo="Nada elegível hoje até agora" texto="Quando houver consultas concluídas e liberadas, elas aparecem aqui." />
      ) : (
        <Grade>
          {previas.map((p) => {
            const d: DadosCard = {
              chave: p.medicoId,
              medico: p.medico,
              competencia: p.competencia,
              status: "previa",
              totais: p.totais,
              itens: p.itens,
              pix: p.recebimento ? { tipo: p.recebimento.pixTipo, chave: p.recebimento.pixChave } : null,
              rec: p.recebimento,
              linhaExtra:
                p.ajustesPendentesRestantesCentavos > 0
                  ? `${brl(p.ajustesPendentesRestantesCentavos)} em descontos ficam para os próximos repasses`
                  : `Corte: ${quando(p.corte, agora).toLowerCase()}`,
            };
            return <CardRepasse key={d.chave} d={d} agora={agora} />;
          })}
        </Grade>
      )}
    </div>
  );
}

function AbaLista({ r, agora, tipo, onAbrir }: { r: Recurso<RespostaLista>; agora: number; tipo: "fechado" | "pago"; onAbrir: (id: string) => void }) {
  if (!r.dados && r.carregando) return <Esqueleto variante="cards" quantidade={3} rotulo="Carregando repasses…" />;
  if (!r.dados) return <EstadoErro mensagem={r.erro} onTentar={r.recarregar} />;
  const lista = r.dados.repasses;
  if (lista.length === 0)
    return tipo === "fechado" ? (
      <EstadoVazio icone={CheckCircle2} tom="ok" titulo="Nenhum repasse a pagar" texto="Os repasses fechados aparecem aqui até serem pagos." />
    ) : (
      <EstadoVazio icone={Wallet} titulo="Nenhum repasse pago ainda" />
    );
  const grupos = agruparPorCompetencia(lista);
  return (
    <div className="space-y-5">
      {grupos.map((g) => {
        const soma = g.itens.reduce((s, x) => s + x.liquidoCentavos, 0);
        return (
          <section key={g.competencia} aria-label={`Competência ${competenciaCurta(g.competencia, agora)}`}>
            <h2 className="ba-rotulo mb-2 flex items-baseline justify-between gap-2">
              <span>Competência {competenciaCurta(g.competencia, agora)}</span>
              <span className="tabular-nums">
                {g.itens.length} · {brl(soma)}
              </span>
            </h2>
            <Grade>
              {g.itens.map((x) => (
                <CardRepasse key={x.id} d={paraCard(x, agora)} agora={agora} onAbrir={() => onAbrir(x.id)} />
              ))}
            </Grade>
          </section>
        );
      })}
    </div>
  );
}

function paraCard(x: RepasseLista, agora: number): DadosCard {
  const pago = x.status === "pago";
  const pix = pago ? x.pixUsado : x.recebimento;
  return {
    chave: x.id,
    medico: x.medico,
    competencia: x.competencia,
    status: x.status,
    totais: x,
    itens: x.itens,
    pix: pix ? { tipo: pix.pixTipo, chave: pix.pixChave } : null,
    rec: x.recebimento,
    linhaExtra: pago
      ? `Pago ${quando(x.pagoEm, agora).toLowerCase()}${x.pagoPor ? ` por ${x.pagoPor}` : ""}`
      : x.fechadoEm
        ? `Fechado ${quando(x.fechadoEm, agora).toLowerCase()}`
        : undefined,
  };
}
