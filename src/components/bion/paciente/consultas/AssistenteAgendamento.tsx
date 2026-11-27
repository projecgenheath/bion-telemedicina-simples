"use client";

import { ArrowLeft, CalendarDays, ChevronRight, Lock, Star, Stethoscope } from "lucide-react";
import type { Medico } from "@/lib/bion-tipos";
import { textoNota } from "@/lib/medico-exibicao";
import { DURACAO_SLOT_MIN } from "@/lib/teleconsulta-logica";
import type { DiaAgendamento } from "@/components/bion/agendamento/horarios";
import { Avatar } from "../inicio/TelaInicioPaciente";
import { iniciaisNome, plural } from "../inicio/inicio-dados";
import { GradeHorarios, MiniCalendario } from "./AgendaPecas";
import { fimDoHorario } from "./consultas-dados";

/**
 * Agendamento pela BION IA (etapa 2 do redesign): o mesmo assistente de
 * sempre (especialidade → profissional → dia → horário → confirmar), com o
 * desenho da agenda do médico. Só apresentação: as opções, as escolhas e as
 * ações chegam do ChatBion, que continua dono da lógica e do pagamento.
 */

export type EtapaAssistente = "especialidade" | "medico" | "dia" | "hora" | "confirmar";
export type OpcoesAssistente = {
  titulo: string;
  opcoes: { rotulo: string; valor: string; sub?: string }[];
  escolher: (v: string) => void;
};
export type EscolhaAssistente = { especialidade?: string; medico?: string; dia?: string; diaIso?: string; hora?: string };

const PASSOS: { id: EtapaAssistente; nome: string }[] = [
  { id: "especialidade", nome: "Especialidade" },
  { id: "medico", nome: "Profissional" },
  { id: "dia", nome: "Dia" },
  { id: "hora", nome: "Horário" },
  { id: "confirmar", nome: "Confirmar" },
];

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Passos do agendamento: barra de 5 segmentos + "Passo 2 de 5 · Profissional". */
export function PassosAgendamento({ etapa, onVoltar }: { etapa: EtapaAssistente; onVoltar?: () => void }) {
  const i = Math.max(0, PASSOS.findIndex((p) => p.id === etapa));
  return (
    <div className="bp2-passos">
      <div className="flex items-center gap-2">
        <p className="mr-auto text-[12px] bp2-t-2">
          Passo {i + 1} de {PASSOS.length} · <span className="bp2-passos-atual">{PASSOS[i]!.nome}</span>
        </p>
        {onVoltar ? (
          <button type="button" onClick={onVoltar} className="bp2-passos-voltar">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar
          </button>
        ) : null}
      </div>
      <ol className="bp2-passos-barra" aria-label="Passos do agendamento">
        {PASSOS.map((p, k) => (
          <li key={p.id} className={k < i ? "bp2-passo-feito" : k === i ? "bp2-passo-atual" : ""} aria-current={k === i ? "step" : undefined}>
            <span className="sr-only">
              {p.nome}
              {k < i ? " (feito)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AssistenteAgendamento({
  etapa,
  opcoes,
  medicos,
  escolha,
  agenda,
  onVoltar,
  onAbrirAgenda,
}: {
  etapa: Exclude<EtapaAssistente, "confirmar">;
  opcoes: OpcoesAssistente;
  medicos: Medico[];
  escolha: EscolhaAssistente;
  agenda: DiaAgendamento[];
  onVoltar?: () => void;
  /** Atalho: continuar na agenda própria do paciente (mesmas escolhas). */
  onAbrirAgenda?: () => void;
}) {
  const vazio = opcoes.opcoes.length === 1 && opcoes.opcoes[0]!.valor === "";
  const medico = escolha.medico ? medicos.find((m) => m.nome === escolha.medico) : undefined;
  const dia = escolha.diaIso ? agenda.find((d) => d.iso === escolha.diaIso) : undefined;
  const resumo = [escolha.especialidade, escolha.medico, etapa === "hora" ? escolha.dia : undefined].filter(Boolean).join(" · ");

  return (
    <section className="bp2-assist bp2-cartao" aria-labelledby="bp2-assist-t">
      <div className="bp2-assist-cab">
        <h2 id="bp2-assist-t" className="bp2-assist-titulo">
          {etapa === "especialidade" ? "Qual especialidade?" : etapa === "medico" ? "Com quem?" : etapa === "dia" ? "Qual dia?" : "Qual horário?"}
        </h2>
        {resumo ? <p className="bp2-assist-resumo truncate">{resumo}</p> : null}
        {onAbrirAgenda ? (
          <button type="button" onClick={onAbrirAgenda} className="bp2-passos-voltar bp2-assist-agenda" data-abrir-agenda>
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Ver na agenda
          </button>
        ) : null}
      </div>
      <PassosAgendamento etapa={etapa} onVoltar={onVoltar} />

      <div className="bp2-assist-corpo">
        {vazio ? (
          <button type="button" data-opcao="" onClick={() => opcoes.escolher("")} className="bp2-assist-vazio">
            <span>{opcoes.opcoes[0]!.rotulo}</span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        ) : etapa === "especialidade" ? (
          <ul className="bp2-assist-grade">
            {opcoes.opcoes.map((o) => {
              const n = medicos.filter((m) => m.especialidade === o.valor).length;
              return (
                <li key={o.valor}>
                  <button type="button" data-opcao={o.valor} onClick={() => opcoes.escolher(o.valor)} className="bp2-assist-item">
                    <span className="bp2-assist-icone" aria-hidden>
                      <Stethoscope className="h-[1.05rem] w-[1.05rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate bp2-assist-nome">{o.rotulo}</span>
                      <span className="block truncate bp2-assist-sub">{plural(n, "profissional", "profissionais")}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 bp2-t-2" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : etapa === "medico" ? (
          <ul className="flex flex-col gap-2">
            {opcoes.opcoes.map((o) => {
              const m = medicos.find((x) => x.nome === o.valor);
              return (
                <li key={o.valor}>
                  <button type="button" data-opcao={o.valor} onClick={() => opcoes.escolher(o.valor)} className="bp2-assist-item bp2-assist-medico">
                    <Avatar nome={o.rotulo} foto={m?.foto} tamanho="lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate bp2-assist-nome">{o.rotulo}</span>
                      <span className="block truncate bp2-assist-sub bp2-t-azul">{m?.especialidade ?? escolha.especialidade}</span>
                    </span>
                    {m ? (
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="bp2-assist-valor tabular-nums">{fmtBRL(m.valor)}</span>
                        <span className="inline-flex items-center gap-1 bp2-assist-sub">
                          <Star className="h-3 w-3 bp2-estrela" aria-hidden /> {textoNota(m)}
                        </span>
                      </span>
                    ) : (
                      <span className="bp2-assist-sub">{o.sub}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : etapa === "dia" ? (
          <div className="bp2-assist-dia">
            <MiniCalendario dias={agenda} selecionado={escolha.diaIso} onEscolher={(iso) => opcoes.escolher(iso)} rotulo={`Dias com horário livre com ${escolha.medico ?? "o profissional"}`} />
            {medico ? (
              <div className="bp2-assist-lado" role="group" aria-label="Profissional escolhido">
                <div className="flex items-center gap-3">
                  <Avatar nome={medico.nome} foto={medico.foto} tamanho="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{medico.nome}</span>
                    <span className="block truncate text-[12px] bp2-t-azul">{medico.especialidade}</span>
                  </span>
                </div>
                <dl className="bp2-assist-fatos">
                  <div>
                    <dt>Valor</dt>
                    <dd className="tabular-nums">{fmtBRL(medico.valor)}</dd>
                  </div>
                  <div>
                    <dt>Duração</dt>
                    <dd>{DURACAO_SLOT_MIN} min</dd>
                  </div>
                  <div>
                    <dt>Dias livres</dt>
                    <dd>{agenda.length}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        ) : (
          <div>
            {dia ? (
              <p className="mb-2 text-[13px]">
                <span className="font-medium">{dia.rotulo}</span>
                <span className="bp2-t-2"> · {dia.sem}</span>
              </p>
            ) : null}
            <GradeHorarios horarios={opcoes.opcoes.map((o) => o.valor)} onEscolher={(h) => opcoes.escolher(h)} />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Confirmação do agendamento no desenho da "Ficha do paciente" (degradê azul),
 * adaptada: profissional no canto, data/horário/especialidade e o valor em
 * número grande. Os textos e as ações de pagamento são os do ChatBion.
 */
export function ResumoAgendamento({
  escolha,
  medico,
  valor,
  stripeAtivo,
  pagando,
  onPagar,
  onCancelar,
}: {
  escolha: EscolhaAssistente;
  medico?: Medico;
  valor: number;
  stripeAtivo: boolean | null;
  pagando: boolean;
  onPagar: () => void;
  onCancelar: () => void;
}) {
  const [inteiro, centavos] = fmtBRL(valor).replace(/^R\$\s*/, "").split(",");
  return (
    <section className="bp2-resumo bp2-v2" data-resumo-agendamento aria-labelledby="bp2-resumo-t">
      <div className="bp2-ficha-cartao">
        <div className="bp2-ficha-topo">
          <h3 id="bp2-resumo-t" className="bp2-ficha-titulo">
            Resumo do
            <br />
            agendamento
          </h3>
          <PassosAgendamento etapa="confirmar" />
        </div>
        <div className="bp2-ficha-pessoa">
          <span className="bp2-ficha-avatar" aria-hidden>
            {iniciaisNome(escolha.medico ?? "")}
          </span>
          <div className="bp2-ficha-nome">
            <strong>{escolha.medico}</strong>
            <span>{medico?.especialidade ?? escolha.especialidade}</span>
          </div>
        </div>
        <dl className="bp2-ficha-campos">
          <div>
            <dt>Data</dt>
            <dd>{escolha.dia}</dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd className="tabular-nums">{escolha.hora ? `${escolha.hora} – ${fimDoHorario(escolha.hora, DURACAO_SLOT_MIN)}` : "—"}</dd>
          </div>
          <div>
            <dt>Especialidade</dt>
            <dd>{escolha.especialidade}</dd>
          </div>
        </dl>
        <dl className="bp2-ficha-sinais">
          <div>
            <dt>Valor</dt>
            <dd>
              <span className="bp2-ficha-unidade">R$ </span>
              <span className="bp2-ficha-valor tabular-nums">{inteiro}</span>
              <span className="bp2-ficha-unidade">,{centavos}</span>
            </dd>
          </div>
          <div>
            <dt>Pagamento</dt>
            <dd>
              <span className="bp2-ficha-valor bp2-ficha-valor-texto">{stripeAtivo === false ? "Demonstração" : "Cartão"}</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="bp2-resumo-pagar bp2-cartao">
        <p className="bp2-resumo-rotulo">Forma de pagamento</p>
        {/* F10: o texto acompanha o modo real — Stripe ligado, página
            segura; desligado (demonstração), confirmação simulada. */}
        <p className="text-[13px]">
          {stripeAtivo === false
            ? "Demonstração: a confirmação é simulada e nenhum cartão é cobrado."
            : "Cartão de crédito, na página segura do Stripe. Não aceitamos Pix."}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onPagar}
            disabled={pagando}
            className="bp2-botao-azul inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[0.6rem] px-4 text-[13px] font-medium disabled:opacity-60"
          >
            <Lock className="h-4 w-4" aria-hidden /> {stripeAtivo === false ? `Confirmar ${fmtBRL(valor)} (demonstração)` : `Pagar ${fmtBRL(valor)} e agendar`}
          </button>
          <button type="button" onClick={onCancelar} className="bp2-botao-contorno inline-flex h-11 items-center justify-center rounded-[0.6rem] px-5 text-[13px]">
            Cancelar
          </button>
        </div>
        <p className="mt-2 text-[12px] bp2-t-2">O pagamento confirma sua consulta. A triagem é opcional e fica disponível até 5 minutos antes do horário.</p>
      </div>
    </section>
  );
}
