"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  HeartPulse,
  Inbox,
  Info,
  LifeBuoy,
  Plus,
  RefreshCw,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { urlDa, type View } from "@/lib/rotas";
import { CampoBusca } from "../ui/CampoBusca";
import { CardAdmin } from "../ui/CardAdmin";
import { ChipEstado } from "../ui/ChipEstado";
import { useCamadasAdmin } from "../AdminShell";
import { useDadosAdmin } from "../dados";
import { especialidades30d, resumoHoje, resumoMedicos, serieDiaria } from "../metricas";
import { avisosRecebimento, estadoConsulta, type Estado } from "../rotulos";
import { brl, dataLonga, hora, saudacao } from "../tempo";
import { consultas30d, estadoMedicoAdmin, statusDe } from "../medicos/medicos";
import "../admin.css";

/** Teto do bootstrap do admin (server/dados.ts: take 500 nas consultas). */
const LIMITE_BOOTSTRAP = 500;
const LIMITE_TABELA = 6;

const AVISOS_PIX: Estado[] = [
  { rotulo: "Sem chave PIX", tom: "critico" },
  { rotulo: "CNPJ divergente", tom: "critico" },
  { rotulo: "Chave trocada < 24 h", tom: "atencao" },
];

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function AvatarIniciais({ nome, tamanho = "md" }: { nome: string; tamanho?: "sm" | "md" | "lg" }) {
  const t = tamanho === "lg" ? "h-12 w-12 text-sm" : tamanho === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden className={`ba2-avatar ${t} grid shrink-0 place-items-center rounded-full font-medium`}>
      {iniciais(nome) || "?"}
    </span>
  );
}

function BotaoSeta({ rotulo, onClick, disabled = false }: { rotulo: string; onClick: () => void; disabled?: boolean }) {
  return (
    <span className="ba2-recorte">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={rotulo}
        title={rotulo}
        className="ba2-seta grid h-10 w-10 place-items-center rounded-full disabled:opacity-40"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
}

/**
 * Centro de Comando (/painel do admin) no visual do redesign azul de
 * Médicos e Pacientes: saudação + 3 números no topo, coluna "Hoje na
 * clínica", 3 cartões pastéis com recorte no canto (Requer sua atenção,
 * Repasses a pagar, Reembolsos e chamados) e a tabela/visão operacional.
 */
export function CentroComando() {
  const router = useRouter();
  const { sessao, consultas, medicos, pacientes, tickets } = useBion();
  const { agora, fila, repasses, reembolsos, painel, atualizar, atualizando } = useDadosAdmin();
  const { fechar, abrirFila } = useCamadasAdmin();
  const [buscaMed, setBuscaMed] = useState("");
  const [soValidacao, setSoValidacao] = useState(false);

  const ir = (v: View, consulta?: string) => {
    fechar();
    router.push(consulta ? `${urlDa(v)}?${consulta}` : urlDa(v));
  };

  const hojeLoja = useMemo(() => resumoHoje(consultas, agora), [consultas, agora]);
  const serieLoja = useMemo(() => serieDiaria(consultas, agora, 14), [consultas, agora]);
  const especialidadesLoja = useMemo(() => especialidades30d(consultas, agora), [consultas, agora]);
  const painelDados = painel.erro ? null : painel.dados;
  const usandoLoja = Boolean(painel.erro);
  const carregandoNumeros = !painelDados && !usandoLoja;
  const hoje = painelDados?.hoje ?? (usandoLoja ? hojeLoja : null);
  const serie = painelDados?.serie ?? (usandoLoja ? serieLoja : []);
  const especialidades = painelDados?.especialidades ?? (usandoLoja ? especialidadesLoja : []);
  const med = resumoMedicos(medicos);
  const chamadosAbertos = tickets.filter((t) => t.status !== "resolvido").length;
  const pacientesCadastrados = painelDados ? painelDados.pacientesCadastrados : usandoLoja ? pacientes.length : null;
  const pacientesAtivos = painelDados ? painelDados.pacientesAtivos : usandoLoja ? pacientes.filter((p) => p.status === "ativo").length : null;
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

  const aoVivo = (hoje?.aoVivo.length ?? 0) > 0;
  const destaque = hoje?.aoVivo[0] ?? hoje?.proximas[0];
  const contagemHoje = hoje ? hoje.agendadas + hoje.concluidas + hoje.reagendar + hoje.faltas : 0;
  const outrasHoje = (hoje?.proximas ?? []).filter((c) => c.id !== destaque?.id);

  // Lista de médicos priorizando quem aguarda validação, filtrada por busca/botão.
  const medicosTabela = useMemo(() => {
    const t = buscaMed.trim().toLocaleLowerCase("pt-BR");
    return [...medicos]
      .filter((m) => {
        const st = statusDe(m);
        if (soValidacao && st !== "pendente") return false;
        if (!t) return true;
        return `${m.nome} ${m.crm} ${m.especialidade}`.toLocaleLowerCase("pt-BR").includes(t);
      })
      .sort((a, b) => {
        const pa = statusDe(a) === "pendente" ? 0 : statusDe(a) === "ativo" ? 1 : 2;
        const pb = statusDe(b) === "pendente" ? 0 : statusDe(b) === "ativo" ? 1 : 2;
        if (pa !== pb) return pa - pb;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [medicos, buscaMed, soValidacao]);

  const linhasMedicos = medicosTabela.slice(0, LIMITE_TABELA);
  const pilhaFila = fila.slice(0, 4);

  const numerosTopo = [
    {
      valor: carregandoNumeros || !hoje ? "—" : String(hoje.total - hoje.canceladas),
      rotulo: "Consultas hoje",
      titulo: "Consultas de hoje (sem as canceladas)",
    },
    {
      valor: String(med.ativos),
      rotulo: "Médicos ativos",
      titulo: `${med.ativos} ativos · ${med.validacao} em validação`,
    },
    {
      valor: pacientesCadastrados === null ? "—" : String(pacientesCadastrados),
      rotulo: "Pacientes",
      titulo: pacientesAtivos === null ? "Contando no banco" : `${pacientesAtivos} ativos`,
    },
  ];

  /* ---------------------- Coluna esquerda: Hoje ---------------------- */
  const colunaHoje = (
    <section className="ba2-hoje flex flex-col ba-animar ba-animar-d1" aria-labelledby="ba2-hoje-titulo">
      <div className="ba2-hoje-cab flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] ba-texto-2 first-letter:uppercase lg:text-xs">{dataLonga(agora)}</p>
          <h2 id="ba2-hoje-titulo" className="mt-0.5 text-base font-medium">
            {carregandoNumeros ? "Carregando agenda…" : `${contagemHoje} ${contagemHoje === 1 ? "consulta" : "consultas"}`}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void atualizar()}
            disabled={atualizando}
            aria-label={atualizando ? "Atualizando…" : "Atualizar dados"}
            title="Atualizar dados"
            className="ba-icone-botao !w-9 !h-9 lg:!w-10 lg:!h-10"
          >
            <RefreshCw className={`h-4 w-4 ${atualizando ? "motion-safe:animate-spin" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => ir("admin-agendamentos")}
            aria-label="Abrir Agendamentos"
            title="Abrir Agendamentos"
            className="ba2-mais grid h-9 w-9 place-items-center rounded-full lg:h-10 lg:w-10"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="ba2-hoje-destaque">
        {carregandoNumeros ? (
          <div className="ba2-destaque rounded-[0.9rem] p-4" aria-busy="true">
            <div className="text-sm font-medium">Calculando a agenda de hoje…</div>
          </div>
        ) : hoje && destaque ? (
          <div className="ba2-destaque flex flex-col rounded-[0.9rem] p-4">
            <div className="flex items-center gap-3">
              <AvatarIniciais nome={destaque.paciente} tamanho="lg" />
              <div className="min-w-0 flex-1">
                <div className="min-w-0 text-[15px] font-medium">{destaque.paciente}</div>
                <div className="ba2-destaque-rotulo min-w-0 text-xs">
                  {destaque.medico}
                  {destaque.especialidade ? ` · ${destaque.especialidade}` : ""}
                </div>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
              <dt className="text-[11px] ba2-destaque-rotulo lg:text-xs">Situação</dt>
              <dt className="text-[11px] ba2-destaque-rotulo lg:text-xs">
                {aoVivo ? "Ao vivo" : "Horário"}
              </dt>
              <dd className="min-w-0 text-[14px] font-medium">{estadoConsulta(destaque.status).rotulo}</dd>
              <dd className="text-[14px] font-medium tabular-nums">
                {hora(destaque.ts)} · {destaque.data}
              </dd>
            </dl>

            {aoVivo ? (
              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                </span>
                {hoje.aoVivo.length} na janela ±30 min
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => ir("admin-agendamentos", `consulta=${encodeURIComponent(destaque.id)}`)}
                className="ba2-botao-azul inline-flex h-10 flex-1 items-center justify-center rounded-[0.6rem] px-3 text-[13px]"
              >
                Ver consulta
              </button>
              <button
                type="button"
                onClick={abrirFila}
                className="ba2-botao-contorno-dest inline-flex h-10 items-center justify-center rounded-[0.6rem] px-3 text-[13px]"
              >
                Fila{fila.length ? ` (${fila.length})` : ""}
              </button>
            </div>
          </div>
        ) : (
          <div className="ba2-destaque rounded-[0.9rem] p-4" aria-label="Nenhuma consulta restante hoje">
            <div className="text-[15px] font-medium">
              {contagemHoje > 0 ? "As consultas de hoje já correram" : "Nenhuma consulta hoje"}
            </div>
            <p className="mt-1 text-xs ba2-destaque-rotulo">
              {contagemHoje > 0
                ? `Foram ${contagemHoje} ao longo do dia.`
                : "Quando o primeiro paciente agendar, o atendimento aparece aqui."}
            </p>
            <button
              type="button"
              onClick={() => ir("admin-agendamentos")}
              className="ba2-botao-azul mt-3 h-10 w-full rounded-[0.6rem] px-4 text-[13px]"
            >
              Abrir Agendamentos
            </button>
          </div>
        )}
      </div>

      {outrasHoje.length > 0 ? (
        <ul className="ba2-hoje-lista space-y-2" aria-label="Outras consultas de hoje">
          {outrasHoje.slice(0, 5).map((c) => {
            const st = estadoConsulta(c.status);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => ir("admin-agendamentos", `consulta=${encodeURIComponent(c.id)}`)}
                  className="ba2-item flex w-full items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2.5 text-left hover:opacity-90 transition-opacity"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block min-w-0 text-sm font-medium">{c.paciente}</span>
                    <span className="block min-w-0 text-[11px] ba-texto-2">
                      {c.medico}
                      {c.especialidade ? ` · ${c.especialidade}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-medium tabular-nums">{hora(c.ts)}</span>
                    <span className="block text-[11px] ba-texto-2">{st.rotulo}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="ba2-hoje-rodape mt-auto pt-2 text-[11px] ba-texto-2">
        {hoje ? (
          <p className="inline-flex items-start gap-1.5">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {hoje.agendadas} a realizar · {hoje.concluidas} concluídas · {hoje.pagas} pagas ({brl(hoje.brutoPagoCentavos)})
              {hoje.reagendar ? ` · ${hoje.reagendar} reagendar` : ""}
              {hoje.faltas ? ` · ${hoje.faltas} faltas` : ""}
            </span>
          </p>
        ) : (
          <span>Calculando resumo do dia…</span>
        )}
      </div>
    </section>
  );

  /* ---------------- 3 Cartões coloridos com recorte ---------------- */
  const cartoes = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 ba-animar ba-animar-d2">
      <section className="ba2-cor ba2-lavanda col-span-2 lg:col-span-1" aria-labelledby="ba2-atencao-t">
        <h2 id="ba2-atencao-t" className="ba2-cor-titulo ba2-t-cor">
          Requer sua atenção
        </h2>
        <p className="ba2-barra-esq ba2-cor-texto mt-2.5 max-w-[24rem] !text-[15px]" role={fila.length ? "status" : undefined}>
          {fila.length
            ? `${fila.length} ${fila.length === 1 ? "decisão aguardando" : "decisões aguardando"} na Fila.`
            : "Tudo em ordem. Nenhuma decisão pendente na Fila."}
        </p>
        {fila[0] ? (
          <p className="mt-2 pl-[0.7rem] text-xs ba2-t-cor min-w-0">
            Prioridade: <span className="font-medium text-[#242424]">{fila[0].titulo}</span>
          </p>
        ) : null}
        <div className="mt-auto pt-4">
          {pilhaFila.length > 0 ? (
            <button type="button" onClick={abrirFila} className="flex items-center" aria-label={`Abrir Fila com ${fila.length} decisões`}>
              {pilhaFila.map((item, i) => (
                <span key={item.chave} className={`ba2-pilha-item ${i ? "-ml-2" : ""}`}>
                  <span aria-hidden className="ba2-avatar grid h-7 w-7 place-items-center rounded-full text-[10px] font-medium">
                    {iniciais(item.titulo)}
                  </span>
                </span>
              ))}
              {fila.length > pilhaFila.length ? (
                <span aria-hidden className="ba2-pilha-item -ml-2 grid h-7 w-7 place-items-center rounded-full bg-[#242424] text-[10px] font-medium text-white">
                  +{fila.length - pilhaFila.length}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
        <BotaoSeta rotulo="Abrir Fila de decisões" onClick={abrirFila} />
      </section>

      <section className="ba2-cor ba2-azul-suave" aria-labelledby="ba2-repasses-t">
        <h2 id="ba2-repasses-t" className="ba2-cor-titulo ba2-t-cor">
          Repasses a pagar
        </h2>
        <p className="ba2-barra-esq ba2-cor-texto mt-2.5">
          {repasses.erro
            ? "Erro ao carregar"
            : `${repasses.dados?.total ?? 0} ${repasses.dados?.total === 1 ? "fechado aguardando" : "fechados aguardando"}`}
        </p>
        {Object.keys(avisosRepasse).length > 0 ? (
          <p className="mt-1.5 pl-[0.7rem] text-[11px] font-medium text-[#9a3f0a]">
            {AVISOS_PIX.filter((a) => avisosRepasse[a.rotulo])
              .map((a) => `${avisosRepasse[a.rotulo]} ${a.rotulo.toLowerCase()}`)
              .join(" · ")}
          </p>
        ) : null}
        <span className="ba2-numero-grande mt-auto pt-3 !text-[1.65rem] lg:!text-[2rem]">
          {repasses.carregando ? "…" : repasses.erro ? "—" : brl(repasses.dados?.totalLiquidoCentavos ?? 0)}
        </span>
        <BotaoSeta rotulo="Abrir Repasses" onClick={() => ir("admin-repasses")} />
      </section>

      <section className="ba2-cor ba2-pessego" aria-labelledby="ba2-reembolsos-t">
        <h2 id="ba2-reembolsos-t" className="ba2-cor-titulo ba2-t-cor">
          Reembolsos e chamados
        </h2>
        <p className="ba2-barra-esq ba2-cor-texto mt-2.5">
          {chamadosAbertos} {chamadosAbertos === 1 ? "chamado aberto" : "chamados abertos"}
        </p>
        <div className="mt-auto pt-3 flex items-baseline gap-2">
          <span className="ba2-numero-grande">
            {reembolsos.carregando ? "…" : reembolsos.erro ? "—" : (reembolsos.dados?.total ?? 0)}
          </span>
          <span className="text-[11px] ba2-t-cor">reembolsos</span>
        </div>
        <BotaoSeta
          rotulo={reembolsos.dados?.total ? "Abrir reembolsos" : "Abrir chamados"}
          onClick={() =>
            reembolsos.dados?.total
              ? ir("admin-agendamentos", "aba=reembolsos")
              : ir("suporte", chamadosAbertos ? "status=nao_resolvidos" : undefined)
          }
        />
      </section>
    </div>
  );

  /* ---------------- Tabela principal de operação (Médicos) ---------------- */
  const tabela = (
    <section className="ba2-cartao min-w-0 px-4 pb-4 pt-4 lg:px-5 lg:pt-5 ba-animar ba-animar-d3" aria-labelledby="ba2-med-t">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="ba2-med-t" className="mr-auto text-[14px] font-medium lg:text-[15px]">
          Corpo clínico <span className="ba-texto-2">· {medicos.length}</span>
          {med.validacao > 0 ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-[#fadbca] px-2 py-0.5 text-[11px] font-medium text-[#242424]">
              {med.validacao} em validação
            </span>
          ) : null}
        </h2>
        <CampoBusca
          className="order-last sm:order-none sm:max-w-xs"
          valor={buscaMed}
          onChange={setBuscaMed}
          dica="Buscar médico ou CRM…"
          rotulo="Buscar médico"
        />
        <button
          type="button"
          onClick={() => setSoValidacao((v) => !v)}
          aria-pressed={soValidacao}
          className="h-9 rounded-full border px-3 text-xs font-medium transition-colors"
          style={{
            background: soValidacao ? "var(--ba-azul-ativo)" : "var(--ba-card)",
            color: soValidacao ? "var(--ba-sinal)" : "var(--ba-texto)",
            borderColor: soValidacao ? "transparent" : "var(--ba-borda)",
          }}
        >
          Em validação ({med.validacao})
        </button>
        <button
          type="button"
          onClick={() => ir("admin-medicos", med.validacao ? "aba=validacao" : undefined)}
          aria-label="Abrir módulo Médicos"
          title="Abrir módulo Médicos"
          className="ba2-mais grid h-9 w-9 place-items-center rounded-full"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {linhasMedicos.length === 0 ? (
        <p className="py-6 text-center text-sm ba-texto-2">
          {soValidacao ? "Nenhum médico aguardando validação." : "Nenhum médico encontrado."}
        </p>
      ) : (
        <>
          <table className="hidden w-full table-fixed text-left md:table">
            <thead>
              <tr className="text-[12px] ba-texto-2">
                <th scope="col" className="w-[30%] px-3 pb-2 font-normal">Nome</th>
                <th scope="col" className="w-[24%] px-3 pb-2 font-normal">Especialidade</th>
                <th scope="col" className="w-[14%] px-3 pb-2 font-normal">CRM</th>
                <th scope="col" className="w-[18%] px-3 pb-2 font-normal">Situação</th>
                <th scope="col" className="w-[14%] px-3 pb-2 text-right font-normal">30 dias</th>
              </tr>
            </thead>
            <tbody className="text-xs xl:text-[13px]">
              {linhasMedicos.map((m, i) => {
                const st = statusDe(m);
                const est = estadoMedicoAdmin(st);
                const qtd30 = consultas30d(consultas, m.id, agora);
                return (
                  <tr
                    key={m.id}
                    onClick={() => ir("admin-medicos", `medico=${encodeURIComponent(m.id)}`)}
                    className={`ba2-tr cursor-pointer ${i === 0 ? "ba2-tr-destaque" : ""}`}
                  >
                    <td className="min-w-0 rounded-l-[0.6rem] px-3 py-2.5 font-medium">{m.nome}</td>
                    <td className="min-w-0 px-3 ba-texto-2">{m.especialidade}</td>
                    <td className="min-w-0 px-3 tabular-nums ba-texto-2">{m.crm}</td>
                    <td className="min-w-0 px-3">
                      <ChipEstado estado={est} />
                    </td>
                    <td className="rounded-r-[0.6rem] px-3 text-right tabular-nums ba-texto-2">
                      {qtd30} {qtd30 === 1 ? "consulta" : "consultas"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="space-y-2 md:hidden">
            {linhasMedicos.map((m) => {
              const est = estadoMedicoAdmin(statusDe(m));
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => ir("admin-medicos", `medico=${encodeURIComponent(m.id)}`)}
                    className="ba2-item flex w-full items-center gap-3 rounded-[0.9rem] px-3 py-2.5 text-left"
                  >
                    <AvatarIniciais nome={m.nome} />
                    <span className="min-w-0 flex-1">
                      <span className="block min-w-0 text-[13px] font-medium">{m.nome}</span>
                      <span className="block min-w-0 text-[11px] ba-texto-2">{m.especialidade} · {m.crm}</span>
                    </span>
                    <ChipEstado estado={est} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );

  return (
    <div className="ba2-conteudo space-y-5">
      {/* Cabeçalho: saudação + 3 números + atalhos */}
      <div className="ba2-cabecalho flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between ba-animar">
        <h1 className="ba2-saudacao">
          <span className="ba2-saudacao-1">{saudacao(agora)},</span>
          <span className="ba2-saudacao-2">{primeiroNome || "Administrador"}</span>
        </h1>
        <div className="flex items-end gap-4">
          <dl className="ba2-numeros grid flex-1 grid-cols-3 lg:flex lg:flex-none lg:items-end">
            {numerosTopo.map((n) => (
              <div key={n.rotulo} className="ba2-numero" title={n.titulo}>
                <dt className="ba2-numero-rotulo">{n.rotulo}</dt>
                <dd className="ba2-numero-valor">{n.valor}</dd>
              </div>
            ))}
          </dl>
          <div className="hidden gap-2 pb-0.5 lg:flex">
            <button
              type="button"
              onClick={() => ir("relatorios")}
              aria-label="Abrir Relatórios"
              title="Relatórios"
              className="ba2-botao-quadrado grid h-9 w-9 place-items-center rounded-[0.6rem]"
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => ir("admin-agendamentos")}
              aria-label="Abrir Agendamentos"
              title="Agendamentos"
              className="ba2-mais grid h-9 w-9 place-items-center rounded-[0.6rem]"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Avisos de teto ou falha do servidor */}
      {painel.erro ? (
        <div className="ba-aviso" data-tom="critico" role="alert">
          <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            Não foi possível calcular os números no servidor ({painel.erro}). Os números abaixo usam a carga do navegador, no máximo {LIMITE_BOOTSTRAP} consultas.
          </p>
        </div>
      ) : null}
      {usandoLoja && consultas.length >= LIMITE_BOOTSTRAP ? (
        <div className="ba-aviso" data-tom="atencao">
          <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            O servidor carrega no máximo {LIMITE_BOOTSTRAP} consultas para o admin. Pode haver consultas fora dessa carga que não entram nos números abaixo.
          </p>
        </div>
      ) : null}
      {painelDados && !painelDados.completo ? (
        <div className="ba-aviso" data-tom="atencao">
          <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            A janela de 30 dias passou do teto do painel. A contagem de pacientes continua exata. A agenda de hoje e a série podem estar incompletas.
          </p>
        </div>
      ) : null}

      {/* Grade principal idêntica ao Início de Médico e Paciente */}
      <div className="ba2-grade">
        <div className="ba2-area-hoje">{colunaHoje}</div>
        <div className="ba2-area-cartoes">{cartoes}</div>
        <div className="ba2-area-tabela min-w-0">{tabela}</div>
      </div>

      {/* Indicadores operacionais e financeiros complementares */}
      <div className="grid gap-4 lg:grid-cols-3 ba-animar ba-animar-d4">
        <CardAdmin titulo="Últimos 14 dias" icone={Activity}>
          {carregandoNumeros ? (
            <p className="text-sm ba-texto-2">Calculando no servidor.</p>
          ) : (
            <>
              <div
                role="img"
                aria-label={`${totalSerie} consultas não canceladas nos últimos 14 dias; hoje: ${serie[serie.length - 1]?.total ?? 0}.`}
                className="flex items-end gap-1.5 h-24 pt-2"
              >
                {serie.map((s, i) => (
                  <div key={i} className="flex-1 h-full flex items-end" title={`${s.rotulo}: ${s.total}`}>
                    <div
                      className={`w-full rounded-t-md ba-barra-14d ${i === serie.length - 1 ? "ba2-barra-hoje" : "ba2-barra-dia"}`}
                      style={{
                        height: `${s.total ? Math.max(8, (s.total / maxSerie) * 100) : 4}%`,
                        animationDelay: `${i * 0.03}s`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs ba-texto-2 mt-3">
                {totalSerie} consultas no período · hoje {serie[serie.length - 1]?.total ?? 0}
              </p>
            </>
          )}
        </CardAdmin>

        <CardAdmin titulo="Especialidades · 30 dias" icone={Stethoscope}>
          {carregandoNumeros ? (
            <p className="text-sm ba-texto-2">Calculando no servidor.</p>
          ) : especialidades.length === 0 ? (
            <p className="text-sm ba-texto-2">Sem consultas nos últimos 30 dias.</p>
          ) : (
            <ul className="space-y-2.5">
              {especialidades.slice(0, 4).map((e) => (
                <li key={e.nome}>
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="font-medium min-w-0">{e.nome}</span>
                    <span className="ba-texto-2 shrink-0 tabular-nums">
                      {e.total} · {e.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1" style={{ background: "var(--ba-linha)" }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${e.pct}%`, background: "var(--ba-azul)" }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardAdmin>

        <CardAdmin titulo="Resumo da plataforma" icone={Wallet}>
          <ul className="space-y-2.5 text-sm">
            <li>
              <button
                type="button"
                onClick={() => ir("admin-agendamentos")}
                className="ba2-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:opacity-90"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <CalendarDays className="h-4 w-4 ba-texto-2 shrink-0" aria-hidden />
                  <span className="min-w-0">Pagas hoje</span>
                </span>
                <span className="font-medium tabular-nums shrink-0">
                  {carregandoNumeros || !hoje ? "—" : `${hoje.pagas} · ${brl(hoje.brutoPagoCentavos)}`}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => ir("admin-pacientes")}
                className="ba2-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:opacity-90"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <HeartPulse className="h-4 w-4 ba-texto-2 shrink-0" aria-hidden />
                  <span className="min-w-0">Pacientes ativos</span>
                </span>
                <span className="font-medium tabular-nums shrink-0 inline-flex items-center gap-1">
                  {pacientesAtivos === null ? "—" : `${pacientesAtivos} / ${pacientesCadastrados}`}
                  <ChevronRight className="h-3.5 w-3.5 ba-texto-2" aria-hidden />
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => ir("suporte", chamadosAbertos ? "status=nao_resolvidos" : undefined)}
                className="ba2-item flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:opacity-90"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <LifeBuoy className="h-4 w-4 ba-texto-2 shrink-0" aria-hidden />
                  <span className="min-w-0">Chamados abertos</span>
                </span>
                <span className="font-medium tabular-nums shrink-0 inline-flex items-center gap-1">
                  {chamadosAbertos}
                  <ChevronRight className="h-3.5 w-3.5 ba-texto-2" aria-hidden />
                </span>
              </button>
            </li>
          </ul>
        </CardAdmin>
      </div>
    </div>
  );
}
