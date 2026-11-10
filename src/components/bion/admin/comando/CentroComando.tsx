"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  HeartPulse,
  Inbox,
  Info,
  LifeBuoy,
  RefreshCw,
  Stethoscope,
  Undo2,
  Wallet,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { Logo } from "@/components/bion/brand";
import { urlDa, type View } from "@/lib/rotas";
import { CardAdmin, KpiAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { useCamadasAdmin } from "../AdminShell";
import { useDadosAdmin } from "../dados";
import { especialidades30d, resumoHoje, resumoMedicos, serieDiaria } from "../metricas";
import { avisosRecebimento, estadoConsulta, type Estado } from "../rotulos";
import { brl, dataLonga, hora, saudacao } from "../tempo";
import "../admin.css";

/** Teto do bootstrap do admin (server/dados.ts: take 500 nas consultas).
 *  Mesmo limite e mesmo aviso do AgendamentosModulo: sem ele, os números
 *  abaixo subcontam em silêncio quando a carga trunca. */
const LIMITE_BOOTSTRAP = 500;

/** Ordem de exibição dos avisos de recebimento (mesmos rótulos de avisosRecebimento). */
const AVISOS_PIX: Estado[] = [
  { rotulo: "Sem chave PIX", tom: "critico" },
  { rotulo: "CNPJ divergente", tom: "critico" },
  { rotulo: "Chave trocada < 24 h", tom: "atencao" },
];

/**
 * Centro de Comando (/painel do admin) — só dados REAIS:
 * store do bootstrap (consultas, médicos, pacientes, chamados) +
 * /api/admin/repasses?status=fechado + /api/admin/reembolsos.
 * "Hoje" = dia no fuso da clínica (America/Sao_Paulo).
 */
export function CentroComando() {
  const router = useRouter();
  const { sessao, consultas, medicos, pacientes, tickets } = useBion();
  const { agora, fila, filaPronta, repasses, reembolsos, atualizar, atualizando } = useDadosAdmin();
  const { fechar, abrirFila } = useCamadasAdmin();
  const ir = (v: View, consulta?: string) => {
    fechar();
    router.push(consulta ? `${urlDa(v)}?${consulta}` : urlDa(v));
  };

  const hoje = useMemo(() => resumoHoje(consultas, agora), [consultas, agora]);
  const serie = useMemo(() => serieDiaria(consultas, agora, 14), [consultas, agora]);
  const especialidades = useMemo(() => especialidades30d(consultas, agora), [consultas, agora]);
  const med = resumoMedicos(medicos);
  const chamadosAbertos = tickets.filter((t) => t.status !== "resolvido").length;
  const pacientesAtivos = pacientes.filter((p) => p.status === "ativo").length;
  const avisosRepasse = (repasses.dados?.repasses ?? []).reduce(
    (acc, r) => {
      for (const a of avisosRecebimento(r.recebimento)) acc[a.rotulo] = (acc[a.rotulo] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const primeiroNome = (sessao.nome || "").split(" ").filter(Boolean)[0] ?? "";
  const maxSerie = Math.max(1, ...serie.map((s) => s.total));
  const totalSerie = serie.reduce((a, s) => a + s.total, 0);

  return (
    <div className="px-4 lg:px-8 pt-[max(1.25rem,env(safe-area-inset-top))] lg:pt-6 pb-28 lg:pb-10 max-w-[1400px] mx-auto w-full space-y-6">
      <header className="flex items-center gap-3">
        {/* Logo oficial no cabeçalho mobile (e também no desktop).
            O visual final depende do PR #166: lá o Logo size="sm" vira o
            círculo de 40 px. Até lá, o monograma atual aparece inteiro. */}
        <span className="shrink-0 inline-flex items-center justify-center">
          <Logo size="sm" />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl lg:text-3xl font-black leading-tight break-words">
            {saudacao(agora)}
            {primeiroNome ? `, ${primeiroNome}` : ""}
          </h1>
          <p className="text-sm ba-texto-2 first-letter:uppercase">{dataLonga(agora)} · horário de Brasília</p>
        </div>
        <button type="button" onClick={() => void atualizar()} disabled={atualizando} className="ba-icone-botao shrink-0" aria-label={atualizando ? "Atualizando…" : "Atualizar dados"}>
          <RefreshCw className={`w-5 h-5 ${atualizando ? "motion-safe:animate-spin" : ""}`} aria-hidden />
        </button>
      </header>

      {consultas.length >= LIMITE_BOOTSTRAP ? (
        <div className="ba-aviso" data-tom="atencao">
          <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>O servidor carrega no máximo {LIMITE_BOOTSTRAP} consultas para o admin. Pode haver consultas fora dessa carga que não entram nos números abaixo.</p>
        </div>
      ) : null}

      {/* ---------------- Agora ---------------- */}
      <section aria-labelledby="cc-agora" className="space-y-3">
        <h2 id="cc-agora" className="ba-rotulo">Agora</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 bion-surgir-lista">
          <KpiAdmin
            icone={CalendarDays}
            rotulo="Consultas hoje"
            valor={hoje.total - hoje.canceladas}
            // O detalhe precisa SOMAR o valor: agendadas + concluídas +
            // reagendar + faltas = total − canceladas (as canceladas ficam
            // fora do número e do detalhe; antes reagendar/faltas sumiam
            // da conta e a soma não fechava).
            detalhe={`${hoje.agendadas} a realizar · ${hoje.concluidas} concluídas${hoje.reagendar ? ` · ${hoje.reagendar} aguardando reagendamento` : ""}${hoje.faltas ? ` · ${hoje.faltas} ${hoje.faltas === 1 ? "falta do paciente" : "faltas do paciente"}` : ""}`}
            onAbrir={() => ir("admin-agendamentos")}
          />
          <KpiAdmin
            icone={CalendarClock}
            rotulo="Agora ± 30 min"
            valor={hoje.aoVivo.length}
            tom={hoje.aoVivo.length ? "sinal" : undefined}
            detalhe={hoje.aoVivo.length ? "em sala ou prestes a começar" : "nenhuma neste horário"}
          />
          <KpiAdmin
            icone={Inbox}
            rotulo="Decisões pendentes"
            valor={fila.length}
            carregando={!filaPronta && fila.length === 0}
            tom={fila.length ? "atencao" : "ok"}
            detalhe={fila.length ? "toque para abrir a Fila" : "tudo em ordem"}
            className="col-span-2 lg:col-span-1"
            onAbrir={abrirFila}
          />
          <KpiAdmin
            icone={Wallet}
            rotulo="Repasses a pagar"
            className="col-span-2 lg:col-span-1"
            onAbrir={() => ir("admin-repasses")}
            valor={repasses.erro ? "—" : brl(repasses.dados?.totalLiquidoCentavos ?? 0)}
            carregando={repasses.carregando}
            tom="dinheiro"
            detalhe={
              repasses.erro
                ? "não foi possível carregar"
                : `${repasses.dados?.total ?? 0} ${repasses.dados?.total === 1 ? "repasse" : "repasses"} fechados`
            }
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-3 bion-surgir-lista">
          <CardAdmin
            className="lg:col-span-2"
            titulo="Agenda de hoje"
            icone={CalendarDays}
            acao={
              <button type="button" onClick={() => ir("admin-agendamentos")} className="ba-botao ba-botao-secundario !min-h-9 !px-3 !text-xs">
                Agendamentos <ChevronRight className="w-4 h-4" aria-hidden />
              </button>
            }
          >
            {hoje.proximas.length === 0 ? (
              <p className="text-sm ba-texto-2 py-2">Nenhuma consulta restante hoje.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--ba-borda)]">
                {hoje.proximas.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <span className="ba-numero text-base w-12 shrink-0">{hora(c.ts)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{c.paciente}</p>
                      <p className="text-xs ba-texto-2 truncate">
                        {c.medico}
                        {c.especialidade ? ` · ${c.especialidade}` : ""}
                      </p>
                      <ChipEstado estado={estadoConsulta(c.status)} className="mt-1 sm:hidden" />
                    </div>
                    <ChipEstado estado={estadoConsulta(c.status)} className="shrink-0 hidden sm:inline-flex" />
                  </li>
                ))}
              </ul>
            )}
            {hoje.proximas.length > 6 ? <p className="text-xs ba-texto-3 mt-2">e mais {hoje.proximas.length - 6} hoje</p> : null}
          </CardAdmin>

          <CardAdmin titulo="Últimos 14 dias" icone={Activity}>
            <div
              role="img"
              aria-label={`${totalSerie} consultas não canceladas nos últimos 14 dias; hoje: ${serie[serie.length - 1]?.total ?? 0}.`}
              className="flex items-end gap-1 h-24"
            >
              {serie.map((s, i) => (
                <div key={i} className="flex-1 h-full flex items-end" title={`${s.rotulo}: ${s.total}`}>
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${s.total ? Math.max(6, (s.total / maxSerie) * 100) : 3}%`,
                      background: i === serie.length - 1 ? "var(--ba-sinal)" : "color-mix(in srgb, var(--ba-sinal) 45%, transparent)",
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs ba-texto-2 mt-2">
              {totalSerie} consultas no período · hoje {serie[serie.length - 1]?.total ?? 0}
            </p>
          </CardAdmin>
        </div>
      </section>

      {/* ---------------- Operação ---------------- */}
      <section aria-labelledby="cc-operacao" className="space-y-3">
        <h2 id="cc-operacao" className="ba-rotulo">Operação</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 bion-surgir-lista">
          <CardAdmin
            titulo="Médicos"
            icone={Stethoscope}
            tom={med.validacao ? "atencao" : undefined}
            acao={<AbrirModulo onClick={() => ir("admin-medicos", med.validacao ? "aba=validacao" : undefined)} rotulo={med.validacao ? "Validar médicos" : "Abrir Médicos"} />}
          >
            <div className="ba-numero text-3xl">{med.ativos}</div>
            <p className="text-xs ba-texto-2">ativos</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {med.validacao ? <ChipEstado tom="atencao">{med.validacao} em validação</ChipEstado> : null}
              {med.suspensos ? <ChipEstado tom="critico">{med.suspensos} suspensos</ChipEstado> : null}
              {!med.validacao && !med.suspensos ? <ChipEstado tom="ok">nenhuma pendência</ChipEstado> : null}
            </div>
          </CardAdmin>
          <CardAdmin titulo="Pacientes" icone={HeartPulse} acao={<AbrirModulo onClick={() => ir("admin-pacientes")} rotulo="Abrir Pacientes" />}>
            <div className="ba-numero text-3xl">{pacientes.length}</div>
            <p className="text-xs ba-texto-2">
              cadastrados · {pacientesAtivos} {pacientesAtivos === 1 ? "ativo" : "ativos"}
            </p>
          </CardAdmin>
          <CardAdmin
            titulo="Chamados"
            icone={LifeBuoy}
            tom={chamadosAbertos ? "atencao" : undefined}
            acao={<AbrirModulo onClick={() => ir("suporte", chamadosAbertos ? "status=nao_resolvidos" : undefined)} rotulo="Abrir Chamados" />}
          >
            <div className="ba-numero text-3xl">{chamadosAbertos}</div>
            <p className="text-xs ba-texto-2">{chamadosAbertos === 1 ? "aberto ou em atendimento" : "abertos ou em atendimento"}</p>
          </CardAdmin>
          <CardAdmin titulo="Especialidades · 30 dias" icone={Activity}>
            {especialidades.length === 0 ? (
              <p className="text-sm ba-texto-2">Sem consultas nos últimos 30 dias.</p>
            ) : (
              <ul className="space-y-2">
                {especialidades.slice(0, 4).map((e) => (
                  <li key={e.nome}>
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="font-bold truncate">{e.nome}</span>
                      <span className="ba-texto-2 shrink-0 tabular-nums">
                        {e.total} · {e.pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1" style={{ background: "color-mix(in srgb, var(--ba-texto) 10%, transparent)" }} aria-hidden>
                      <div className="h-full rounded-full" style={{ width: `${e.pct}%`, background: "var(--ba-sinal)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardAdmin>
        </div>
      </section>

      {/* ---------------- Dinheiro ---------------- */}
      <section aria-labelledby="cc-dinheiro" className="space-y-3">
        <h2 id="cc-dinheiro" className="ba-rotulo">Dinheiro</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <CardAdmin titulo="Pagas hoje" icone={Wallet} tom="dinheiro">
            <div className="ba-numero text-3xl">{hoje.pagas}</div>
            <p className="text-xs ba-texto-2">
              {brl(hoje.brutoPagoCentavos)} bruto (valor de tabela, antes de taxas e repasse)
            </p>
          </CardAdmin>
          <CardAdmin
            titulo="Repasses a pagar"
            icone={Wallet}
            tom={Object.keys(avisosRepasse).length ? "critico" : "dinheiro"}
            acao={<AbrirModulo onClick={() => ir("admin-repasses")} rotulo="Abrir Repasses" />}
          >
            {repasses.carregando ? (
              <div className="ba-esqueleto h-8 w-28" aria-hidden />
            ) : repasses.erro ? (
              <p className="text-sm ba-texto-2" role="alert">
                Não foi possível carregar: {repasses.erro}
              </p>
            ) : (
              <>
                <div className="ba-numero text-3xl">{brl(repasses.dados?.totalLiquidoCentavos ?? 0)}</div>
                <p className="text-xs ba-texto-2">
                  {repasses.dados?.total ?? 0} fechados aguardando pagamento
                </p>
                {Object.keys(avisosRepasse).length ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {AVISOS_PIX.filter((a) => avisosRepasse[a.rotulo])
                      .map((a) => (
                        <ChipEstado key={a.rotulo} estado={a}>
                          {avisosRepasse[a.rotulo]} · {a.rotulo}
                        </ChipEstado>
                      ))}
                  </div>
                ) : null}
              </>
            )}
          </CardAdmin>
          <CardAdmin
            titulo="Reembolsos em análise"
            icone={Undo2}
            tom={reembolsos.dados?.total ? "atencao" : undefined}
            acao={<AbrirModulo onClick={() => ir("admin-agendamentos", "aba=reembolsos")} rotulo="Abrir reembolsos em Agendamentos" />}
          >
            {reembolsos.carregando ? (
              <div className="ba-esqueleto h-8 w-16" aria-hidden />
            ) : reembolsos.erro ? (
              <p className="text-sm ba-texto-2" role="alert">
                Não foi possível carregar: {reembolsos.erro}
              </p>
            ) : (
              <>
                <div className="ba-numero text-3xl">{reembolsos.dados?.total ?? 0}</div>
                <p className="text-xs ba-texto-2">pedidos de pacientes aguardando decisão</p>
              </>
            )}
          </CardAdmin>
        </div>
      </section>
    </div>
  );
}

function AbrirModulo({ onClick, rotulo }: { onClick: () => void; rotulo: string }) {
  return (
    <button type="button" onClick={onClick} className="ba-icone-botao !w-9 !h-9" aria-label={rotulo} title={rotulo}>
      <ChevronRight className="w-4 h-4" aria-hidden />
    </button>
  );
}
