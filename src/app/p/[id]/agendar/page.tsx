"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { agendaLivreDoMedico } from "@/components/bion/paciente/agenda-medico";
import { separarPorTurno } from "@/components/bion/agendamento/horarios";
import { AvisoCartaoIndisponivel } from "@/components/bion/paciente/BotaoPagarStripe";
import { OfertaInstalarApp } from "@/components/bion/paciente/OfertaInstalarApp";
import { PagamentoNoApp } from "@/components/bion/paciente/PagamentoNoApp";
import { situacaoCheckoutStripe, type SituacaoCheckout } from "@/components/bion/paciente/pagamento-stripe-cliente";
import {
  consultasOcupadas,
  guardarEscolha,
  lerAgendaPublica,
  lerEscolha,
  lerSeguirParaPagamento,
  limparEscolha,
  limparSeguirParaPagamento,
  marcarSeguirParaPagamento,
  medicoDaAgenda,
  type AgendaPublica,
  type EscolhaAgenda,
} from "@/lib/agendar-publico";

type Etapa = "agenda" | "pagar" | "pronto";
type Papel = "paciente" | "outro" | "nenhum";

async function papelDaSessao(): Promise<Papel> {
  try {
    const r = await fetch("/api/auth/sessao", { cache: "no-store", credentials: "include" });
    if (!r.ok) return "nenhum";
    const j = (await r.json()) as { autenticado?: boolean; usuario?: { role?: string } };
    if (!j.autenticado) return "nenhum";
    return String(j.usuario?.role ?? "").toUpperCase() === "PACIENTE" ? "paciente" : "outro";
  } catch {
    return "nenhum";
  }
}

export default function PaginaAgendarMedica() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [agenda, setAgenda] = useState<AgendaPublica | null>(null);
  const temAgenda = useRef(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [minuto, setMinuto] = useState(() => Math.floor(Date.now() / 60_000));
  const [diaIso, setDiaIso] = useState("");
  const [hora, setHora] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("agenda");
  const [escolha, setEscolha] = useState<EscolhaAgenda | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoPronto, setAvisoPronto] = useState("");
  const [consultaParaPagar, setConsultaParaPagar] = useState<string | null>(null);
  const [cartao, setCartao] = useState<SituacaoCheckout | "carregando">("carregando");

  useEffect(() => {
    const t = setInterval(() => setMinuto(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (etapa !== "pagar") return;
    let vivo = true;
    void situacaoCheckoutStripe().then((s) => {
      if (vivo) setCartao(s);
    });
    return () => {
      vivo = false;
    };
  }, [etapa]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    temAgenda.current = false;
    setCarregando(true);
    const carregar = async () => {
      try {
        const r = await fetch(`/api/publico/medico/${encodeURIComponent(id)}/agenda`, { cache: "no-store" });
        if (!r.ok) throw new Error("Médica não encontrada");
        const lida = lerAgendaPublica(await r.json());
        if (!lida || lida.id !== id) throw new Error("Médica não encontrada");
        if (!vivo) return;
        temAgenda.current = true;
        setAgenda(lida);
        setErroCarga(null);
      } catch (e) {
        if (!vivo || temAgenda.current) return;
        setErroCarga(e instanceof Error ? e.message : "Médica não encontrada");
      } finally {
        if (vivo) setCarregando(false);
      }
    };
    void carregar();
    const t = setInterval(() => void carregar(), 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    const escolhaGuardada = lerEscolha(id);
    if (escolhaGuardada) {
      setEscolha(escolhaGuardada);
      setDiaIso(escolhaGuardada.iso);
      setHora(escolhaGuardada.hora);
    }
    if (!lerSeguirParaPagamento()) return;
    void papelDaSessao().then((papel) => {
      if (!vivo) return;
      if (papel === "paciente" && escolhaGuardada) {
        limparSeguirParaPagamento();
        setEtapa("pagar");
      }
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  const dias = useMemo(() => {
    if (!agenda) return [];
    return agendaLivreDoMedico(
      medicoDaAgenda(agenda),
      consultasOcupadas(agenda.id, agenda.nome, agenda.ocupadosIso),
      undefined,
      14,
      agenda.diasBloqueados,
    );
    // minuto: a antecedência de 5 min tira da lista o horário que acabou de passar.
  }, [agenda, minuto]);

  const dia = dias.find((d) => d.iso === diaIso) ?? null;
  const horaOk = dia && hora && dia.horarios.includes(hora) ? hora : "";
  const turnos = dia ? separarPorTurno(dia.horarios) : { manha: [], tarde: [] };

  const irParaCadastro = (proxima: EscolhaAgenda) => {
    guardarEscolha(proxima);
    marcarSeguirParaPagamento();
    window.location.assign(`/entrar?cadastro=1&voltar=${encodeURIComponent(`/p/${id}/agendar`)}`);
  };

  const continuar = async () => {
    if (!agenda || !dia || !horaOk) return;
    const proxima: EscolhaAgenda = { medicoId: id, rotulo: dia.rotulo, hora: horaOk, iso: dia.iso };
    setEscolha(proxima);
    setErro(null);
    const papel = await papelDaSessao();
    if (papel === "paciente") {
      guardarEscolha(proxima);
      setEtapa("pagar");
      return;
    }
    if (papel === "outro") {
      setErro("Esta agenda é para pacientes. Entre com uma conta de paciente para continuar.");
      return;
    }
    irParaCadastro(proxima);
  };

  const pagar = async () => {
    if (!escolha || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/consultas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicoId: escolha.medicoId,
          data: escolha.rotulo,
          hora: escolha.hora,
          motivoConsulta: "Consulta de rotina",
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        erro?: string;
        consulta?: { id?: string; pago?: boolean };
      };
      if (r.status === 401) {
        irParaCadastro(escolha);
        return;
      }
      if (r.status === 503) {
        limparEscolha();
        setAvisoPronto(
          `${j.erro ?? "Pagamento online indisponível no momento."} Nenhum horário foi reservado e nenhum valor foi cobrado.`,
        );
        setEtapa("pronto");
        return;
      }
      if (!r.ok || !j.consulta?.id) {
        setErro(j.erro ?? "Não foi possível reservar esse horário. Escolha outro.");
        setEtapa("agenda");
        return;
      }
      if (j.consulta.pago === true) {
        limparEscolha();
        setAvisoPronto(`Consulta confirmada${agenda ? ` com ${agenda.nome}` : ""} — ${escolha.rotulo} às ${escolha.hora}.`);
        setEtapa("pronto");
        return;
      }
      limparEscolha();
      setConsultaParaPagar(j.consulta.id);
      setEtapa("pagar");
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  if (!id || carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f1ecfb] text-[#1a1040] dark:bg-[#0a0618] dark:text-[#f4f1fd]">
        <p>Carregando agenda...</p>
      </div>
    );
  }

  if (erroCarga || !agenda) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f1ecfb] p-6 text-[#1a1040] dark:bg-[#0a0618] dark:text-[#f4f1fd]">
        <div className="text-center">
          <p className="text-lg font-bold">Agenda não encontrada</p>
          <p className="mt-2 text-sm opacity-80">{erroCarga}</p>
          <a href={`/p/${id}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold underline">
            Voltar ao perfil
          </a>
        </div>
      </div>
    );
  }

  const preco = agenda.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-[#f1ecfb] text-[#1a1040] dark:bg-[#0a0618] dark:text-[#f4f1fd]">
      <div className="mx-auto max-w-md p-6">
        <a href={`/p/${id}`} className="inline-flex min-h-11 items-center text-sm font-bold opacity-80">
          ← {agenda.nome}
        </a>
        <p className="mt-2 text-xs font-bold uppercase tracking-wide opacity-70">
          {etapa === "agenda" ? "1 de 4 · Agenda" : etapa === "pagar" ? "3 de 4 · Pagamento" : "4 de 4 · Aplicativo, se quiser"}
        </p>
        <h1 className="mt-1 text-xl font-black">
          {etapa === "agenda" ? "Horários disponíveis" : etapa === "pagar" ? "Pagar a consulta" : "Pronto"}
        </h1>
        <p className="mt-1 text-sm opacity-80">
          {agenda.especialidade} · {preco}
        </p>

        {etapa === "agenda" ? (
          <div className="mt-5 space-y-4">
            {dias.length === 0 ? (
              <p className="rounded-3xl bg-white p-5 text-sm leading-relaxed dark:bg-white/[0.06]">
                Não há horário livre nos próximos 14 dias.
              </p>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Dias disponíveis">
                  {dias.map((d) => (
                    <button
                      key={d.iso}
                      type="button"
                      role="option"
                      aria-selected={d.iso === dia?.iso}
                      onClick={() => {
                        setDiaIso(d.iso);
                        setHora("");
                      }}
                      className={`min-w-[4.5rem] rounded-2xl px-3 py-2 text-center ${
                        d.iso === dia?.iso ? "bg-[#24058D] text-white" : "bg-white dark:bg-white/[0.06]"
                      }`}
                    >
                      <span className="block text-[11px] font-bold uppercase opacity-80">{d.sub}</span>
                      <span className="block text-sm font-black">{d.rotulo}</span>
                    </button>
                  ))}
                </div>
                {dia ? (
                  <div className="space-y-3 rounded-3xl bg-white p-4 dark:bg-white/[0.06]">
                    {(["manha", "tarde"] as const).map((turno) =>
                      turnos[turno].length === 0 ? null : (
                        <div key={turno}>
                          <p className="text-xs font-bold uppercase opacity-70">{turno === "manha" ? "Manhã" : "Tarde"}</p>
                          <div className="mt-2 flex flex-wrap gap-2" role="listbox" aria-label={turno === "manha" ? "Manhã" : "Tarde"}>
                            {turnos[turno].map((h) => (
                              <button
                                key={h}
                                type="button"
                                role="option"
                                aria-selected={h === horaOk}
                                onClick={() => setHora(h)}
                                className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                                  h === horaOk ? "bg-[#24058D] text-white" : "bg-[#24058D]/10 text-[#24058D] dark:text-[#DDD6FE]"
                                }`}
                              >
                                {h}
                              </button>
                            ))}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-sm opacity-80">Escolha um dia para ver os horários.</p>
                )}
              </>
            )}
            {erro ? (
              <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
                {erro}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!dia || !horaOk}
              onClick={() => void continuar()}
              className="w-full min-h-11 rounded-full bg-[#24058D] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Continuar
            </button>
            <p className="text-xs leading-relaxed opacity-70">
              Quem já tem conta entra com ela. O pagamento vem em seguida. Baixar o aplicativo é opcional: dá para continuar no navegador.
            </p>
          </div>
        ) : null}

        {etapa === "pagar" && escolha ? (
          <div className="mt-5 space-y-4 rounded-3xl bg-white p-5 dark:bg-white/[0.06]">
            <p className="text-sm leading-relaxed">
              {agenda.nome}
              <br />
              <strong>
                {escolha.rotulo} às {escolha.hora}
              </strong>
              <br />
              {preco}
            </p>
            {cartao === "desligado" ? <AvisoCartaoIndisponivel /> : null}
            {erro ? (
              <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
                {erro}
              </p>
            ) : null}
            {consultaParaPagar ? (
              <PagamentoNoApp alvo={{ consultaId: consultaParaPagar }} consultaIdVolta={consultaParaPagar} />
            ) : (
              <button
                type="button"
                disabled={enviando || cartao === "carregando"}
                onClick={() => void pagar()}
                className="w-full min-h-11 rounded-full bg-[#24058D] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {enviando ? "Aguarde..." : "Pagar a consulta"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setEtapa("agenda")}
              className="w-full min-h-11 text-sm font-bold underline"
            >
              Escolher outro horário
            </button>
          </div>
        ) : null}

        {etapa === "pronto" ? (
          <div className="mt-5 rounded-3xl bg-white p-5 dark:bg-white/[0.06]">
            <p className="text-sm leading-relaxed">{avisoPronto}</p>
            <OfertaInstalarApp />
          </div>
        ) : null}
      </div>
    </div>
  );
}
