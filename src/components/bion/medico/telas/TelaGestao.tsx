"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarRange, ChevronDown, Clock, Tag } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { CardFaturamento } from "../cards/CardFaturamento";
import {
  fmtBRL,
  fmtCentavos,
  janelasComparacao,
  metricasPeriodo,
  receitaPrevista,
  variacaoPct,
  type RespostaReceita,
} from "../metricas";
import type { DadosMedico } from "../useDadosMedico";

/** Tela 2 — receita líquida (30 dias) + preço/promoções + agenda. */
export function TelaGestao({
  dados,
  onAbrirPreco,
  onAbrirAgenda,
  onAbrirPromocoes,
}: {
  dados: DadosMedico;
  onAbrirPreco: () => void;
  onAbrirAgenda: () => void;
  onAbrirPromocoes: () => void;
}) {
  const { medico, receita } = dados;
  // medico undefined durante o bootstrap NÃO é "em validação": o
  // diretório só traz médicos ativos, então um médico pendente também
  // aparece como undefined — mas só depois que o carregamento termina.
  // Enquanto carrega, mostramos carregamento, não validação.
  const { carregando } = useBion();
  const horarios = medico ? [...medico.horariosDisponiveis].sort() : [];

  return (
    <section className="bm-tela bm-tela-2 flex flex-col px-5 pt-10 pb-20" aria-labelledby="bm-t2-titulo">
      <h2 id="bm-t2-titulo" className="text-2xl font-black text-white">
        Gestão
      </h2>
      <p className="text-sm text-white/85 mb-5">Receita líquida, preço e agenda.</p>

      <CardFaturamento {...receita} />

      {medico ? <PainelGestao dados={dados} /> : null}

      {carregando ? (
        <div className="bp-glass p-5 mt-3 text-sm text-bion-ink/75 dark:text-bion-paper/75">
          Carregando seu cadastro…
        </div>
      ) : medico ? (
        <>
          <div className="bp-glass p-5 mt-3 w-full text-left">
            <button
              type="button"
              onClick={onAbrirPreco}
              className="w-full text-left"
              aria-label={`Preço da consulta: ${fmtBRL(medico.valor)}. Alterar preço`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                  <Tag className="w-4 h-4" /> Preço da consulta
                </span>
                <span className="text-xs font-bold text-bion-sea dark:text-sky-300">Alterar</span>
              </div>
              <div className="mt-1 text-2xl font-black tabular-nums">{fmtBRL(medico.valor)}</div>
            </button>
            <div className="mt-2 flex items-center gap-2 text-sm text-bion-ink/75 dark:text-bion-paper/75">
              {/* Irmão do botão de preço — antes era <button> dentro de <button> (HTML inválido). */}
              <button type="button" onClick={onAbrirPromocoes} className="text-xs font-bold text-bion-sea dark:text-sky-300">Promoções</button>
            </div>
          </div>

          <button
            type="button"
            onClick={onAbrirAgenda}
            className="bp-glass p-5 mt-3 w-full text-left"
            aria-label={`Agenda: ${horarios.length} horários por dia. Configurar agenda`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <CalendarRange className="w-4 h-4" /> Agenda
              </span>
              <span className="text-xs font-bold text-bion-sea dark:text-sky-300">Configurar</span>
            </div>
            {horarios.length ? (
              <>
                <div className="mt-1 text-lg font-black">
                  {horarios.length} horários por dia · {horarios[0]}–{horarios[horarios.length - 1]}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {horarios.slice(0, 8).map((h) => (
                    <span key={h} className="text-xs font-bold tabular-nums px-2 py-1 rounded-full bg-bion-ink/8 dark:bg-white/10">
                      {h}
                    </span>
                  ))}
                  {horarios.length > 8 ? <span className="text-xs font-bold px-2 py-1">+{horarios.length - 8}</span> : null}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Nenhum horário cadastrado ainda.
              </div>
            )}
          </button>
        </>
      ) : (
        <div className="bp-glass p-5 mt-3 text-sm text-bion-ink/75 dark:text-bion-paper/75">
          Seu cadastro ainda está em validação pela equipe BION. Preço e agenda ficam disponíveis assim que o CRM for aprovado.
        </div>
      )}

      <div className="mt-auto pt-8 flex flex-col items-center gap-1 text-white/90" aria-hidden>
        <span className="text-xs font-semibold">Seu perfil público abaixo</span>
        <ChevronDown className="w-5 h-5 motion-safe:animate-bounce" />
      </div>
    </section>
  );
}

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
] as const;

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtPct1 = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

/** Variação vs. período anterior: "+12% vs. anterior" / "−8% vs. anterior" / sem base. */
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const v = variacaoPct(atual, anterior);
  if (v === null) return <span className="text-xs text-bion-ink/60 dark:text-bion-paper/60">sem base no período anterior</span>;
  const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
  return (
    <span className={`text-xs font-bold ${v > 0 ? "text-emerald-600 dark:text-emerald-300" : v < 0 ? "text-red-600 dark:text-red-300" : "text-bion-ink/60 dark:text-bion-paper/60"}`}>
      {sinal}
      {Math.abs(v).toFixed(0)}% vs. anterior
    </span>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  variacao,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  variacao?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-bion-ink/5 dark:bg-white/10 px-3 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70">{rotulo}</div>
      <div className="mt-0.5 text-xl font-black tabular-nums">{valor}</div>
      {detalhe ? <div className="text-xs text-bion-ink/70 dark:text-bion-paper/70">{detalhe}</div> : null}
      {variacao}
    </div>
  );
}

/**
 * Indicadores de prática por período (7/30/90 dias) com comparação ao
 * período anterior. Ocupação/falta/ticket saem das consultas que o cliente
 * já carrega (funções puras de metricas.ts); a receita líquida vem da API
 * de receita (que aceita de/ate) nos dois períodos — nunca estimada aqui.
 */
function PainelGestao({ dados }: { dados: DadosMedico }) {
  const { medico, minhas, agora } = dados;
  const [dias, setDias] = useState<number>(30);
  const janelas = useMemo(() => janelasComparacao(agora, dias), [agora, dias]);
  const grade = useMemo(
    () => ({ slotsPorDia: medico?.horariosDisponiveis.length ?? 0, diasAtendimento: medico?.diasAtendimento ?? [] }),
    [medico?.horariosDisponiveis, medico?.diasAtendimento],
  );
  const atual = useMemo(() => metricasPeriodo(minhas, grade, janelas.atual), [minhas, grade, janelas]);
  const anterior = useMemo(() => metricasPeriodo(minhas, grade, janelas.anterior), [minhas, grade, janelas]);
  const prevista = useMemo(() => receitaPrevista(minhas, agora), [minhas, agora]);

  const [receitas, setReceitas] = useState<{ atual: number | null; anterior: number | null }>({ atual: null, anterior: null });
  const [receitaErro, setReceitaErro] = useState(false);
  const { deISO: deA, ateISO: ateA } = janelas.atual;
  const { deISO: deP, ateISO: ateP } = janelas.anterior;
  useEffect(() => {
    const ctrl = new AbortController();
    const buscar = async (de: string, ate: string) => {
      const res = await fetch(`/api/medico/receita?de=${de}&ate=${ate}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error("receita");
      const json = (await res.json()) as RespostaReceita;
      return json.totais.totalCentavos;
    };
    Promise.all([buscar(deA, ateA), buscar(deP, ateP)])
      .then(([a, p]) => {
        if (ctrl.signal.aborted) return;
        setReceitas({ atual: a, anterior: p });
        setReceitaErro(false);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        setReceitaErro(true); // mantém o último valor bom, se houver
      });
    return () => ctrl.abort();
  }, [deA, ateA, deP, ateP]);

  return (
    <div className="bp-glass p-5 mt-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-bion-ink/75 dark:text-bion-paper/75 inline-flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" /> Indicadores da prática
        </span>
        <div className="flex gap-1" role="group" aria-label="Período dos indicadores">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              aria-pressed={dias === p.dias}
              className={`text-xs font-bold px-2.5 py-1.5 rounded-full ${
                dias === p.dias
                  ? "bg-bion-sea text-white dark:bg-sky-400 dark:text-bion-ink"
                  : "bg-bion-ink/8 dark:bg-white/10"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Indicador
          rotulo="Receita líquida"
          valor={receitas.atual !== null ? fmtCentavos(receitas.atual) : receitaErro ? "—" : "…"}
          detalhe={`no período de ${dias} dias`}
          variacao={
            receitas.atual !== null && receitas.anterior !== null ? (
              <Variacao atual={receitas.atual} anterior={receitas.anterior} />
            ) : undefined
          }
        />
        <Indicador
          rotulo="Atendimentos"
          valor={String(atual.atendimentos)}
          detalhe="consultas concluídas"
          variacao={<Variacao atual={atual.atendimentos} anterior={anterior.atendimentos} />}
        />
        <Indicador
          rotulo="Ticket médio"
          valor={atual.ticketMedio !== null ? fmtBRL(atual.ticketMedio) : "—"}
          detalhe={atual.consultasPagas ? `de ${atual.consultasPagas} consultas pagas` : "sem consulta paga no período"}
          variacao={
            atual.ticketMedio !== null && anterior.ticketMedio !== null ? (
              <Variacao atual={atual.ticketMedio} anterior={anterior.ticketMedio} />
            ) : undefined
          }
        />
        <Indicador
          rotulo="Ocupação da grade"
          valor={atual.ocupacao !== null ? fmtPct(atual.ocupacao) : "—"}
          detalhe={
            atual.ofertados
              ? `${atual.ocupados} de ${atual.ofertados} horários`
              : "grade sem horários cadastrados"
          }
        />
        <Indicador
          rotulo="Falta do paciente"
          valor={atual.taxaFalta !== null ? fmtPct1(atual.taxaFalta) : "—"}
          detalhe={
            atual.atendimentos + atual.faltas
              ? `${atual.faltas} falta(s) em ${atual.atendimentos + atual.faltas} desfechos`
              : "sem desfechos no período"
          }
        />
        <Indicador
          rotulo="Receita prevista"
          valor={fmtBRL(prevista.total)}
          detalhe={
            prevista.qtd
              ? `${prevista.qtd} consulta(s) futura(s) já paga(s) — bruto`
              : "nenhuma consulta futura paga"
          }
        />
      </div>
      <p className="mt-3 text-xs text-bion-ink/60 dark:text-bion-paper/60">
        Ocupação conta os horários da sua grade nos dias de atendimento; cancelamentos não ocupam. A receita
        prevista é o bruto das próximas consultas já pagas (comissão e taxas entram quando a consulta acontece).
      </p>
    </div>
  );
}
