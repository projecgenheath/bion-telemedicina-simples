"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Clock, Loader2, RotateCcw, ShieldAlert, UserRound, XCircle } from "lucide-react";
import { BotaoPagarStripe } from "./BotaoPagarStripe";
import {
  contagemFalada,
  formatarContagem,
  mensagemErroEspera,
  mostrarPainelEspera,
  segundosAte,
  textoDiferenca,
  type CobrancaEspera,
  type EsperaWire,
  type MedicoLivre,
} from "./espera-medico-ui";

/**
 * Espera do médico na chamada do PACIENTE (9:16).
 *
 * Quando o paciente atende, o servidor abre a espera (10 min). Esta camada
 * consulta GET .../espera a cada ~5 s, mostra a contagem e, quando a espera
 * vence (podeEscolher), oferece:
 *  - "Cancelar com reembolso" (POST .../espera/cancelar, reembolso integral);
 *  - "Remarcar com outro médico" (GET /api/medicos/livres-agora?consultaId=…
 *    → POST .../espera/remarcar), mostrando a diferença ANTES de confirmar.
 *    Mais caro: cobra a diferença com cartão (checkout Stripe) e a consulta
 *    atual só é cancelada depois do pagamento confirmado (reserva de 10 min); dá para desistir
 *    (POST .../espera/desistir-remarcacao).
 * Some sozinha quando o médico entra. Sem dado de saúde nos textos.
 */

const INTERVALO_MS = 5000;
const base = (consultaId: string) => `/api/telemedicina/${encodeURIComponent(consultaId)}/espera`;

type Falha = { codigo?: string; erro?: string; diferencaAtualCentavos?: number };
type Resposta<T> = { ok: true; dados: T } | { ok: false; status: number; falha: Falha };

async function chamar<T>(url: string, init?: RequestInit): Promise<Resposta<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    const corpo = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, dados: corpo as T };
    return { ok: false, status: res.status, falha: (corpo ?? {}) as Falha };
  } catch {
    return { ok: false, status: 0, falha: {} };
  }
}

/** Polling da espera + relógio local de 1 s. */
function useEsperaMedico(consultaId: string | undefined, ativo: boolean) {
  const [espera, setEspera] = useState<EsperaWire | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  // M16: 401/402/403 do polling NÃO são "sem espera" — são recusa definitiva
  // (sessão expirada, pagamento, acesso) e a tela mostra o erro em vez de o
  // painel sumir em silêncio. Uma resposta boa limpa o estado.
  const [erroStatus, setErroStatus] = useState<number | null>(null);
  const recarregar = useCallback(async () => {
    if (!consultaId) return;
    const r = await chamar<{ espera: EsperaWire | null }>(base(consultaId));
    if (r.ok) {
      setEspera(r.dados.espera);
      setErroStatus(null);
    } else if (r.status === 401 || r.status === 402 || r.status === 403) {
      setErroStatus(r.status);
    }
  }, [consultaId]);

  useEffect(() => {
    if (!consultaId || !ativo) return;
    let vivo = true;
    const tick = async () => {
      if (vivo && document.visibilityState !== "hidden") await recarregar();
    };
    void tick();
    const t = setInterval(() => void tick(), INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [consultaId, ativo, recarregar]);

  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo]);

  return { espera, setEspera, agora, recarregar, erroStatus };
}

type Etapa =
  | { tipo: "inicio" }
  | { tipo: "confirmar_cancelar" }
  | { tipo: "escolher_medico" }
  | { tipo: "confirmar_remarcar"; medico: MedicoLivre; diferenca: number; avisoPreco?: boolean };

export function EsperaMedicoPainel({
  consultaId,
  medicoConectado,
  onSair,
  onSairDaChamada,
  onResolvida,
}: {
  consultaId: string | undefined;
  medicoConectado: boolean;
  /** Depois do desfecho: volta ao início. */
  onSair: () => void;
  /** Enquanto espera: sai da chamada (o mesmo do botão Sair da barra). */
  onSairDaChamada: () => void;
  /** Cancelada ou remarcada: o app recarrega o estado (lista de consultas). */
  onResolvida?: () => void;
}) {
  const { espera, setEspera, agora, recarregar, erroStatus } = useEsperaMedico(consultaId, !medicoConectado);
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "inicio" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [medicos, setMedicos] = useState<MedicoLivre[] | null>(null);
  const [carregandoMedicos, setCarregandoMedicos] = useState(false);
  const [cobranca, setCobranca] = useState<CobrancaEspera | null>(null);
  const [devolucao, setDevolucao] = useState<number | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  // Desfecho (cancelada/remarcada): avisa o app uma vez.
  const avisouRef = useRef(false);
  useEffect(() => {
    if (!espera || avisouRef.current) return;
    if (espera.status === "cancelada" || espera.status === "remarcada") {
      avisouRef.current = true;
      onResolvida?.();
    }
  }, [espera, onResolvida]);

  // Foco no título a cada etapa nova (leitor de tela acompanha a troca).
  useEffect(() => {
    tituloRef.current?.focus();
  }, [etapa.tipo, espera?.status]);

  const carregarMedicos = useCallback(async () => {
    if (!consultaId) return;
    setCarregandoMedicos(true);
    setErro(null);
    const r = await chamar<{ medicos: MedicoLivre[] }>(`/api/medicos/livres-agora?consultaId=${encodeURIComponent(consultaId)}`);
    setCarregandoMedicos(false);
    if (r.ok) setMedicos(r.dados.medicos);
    else {
      setMedicos([]);
      setErro(mensagemErroEspera(r.falha.codigo, r.falha.erro));
    }
  }, [consultaId]);

  // M16: o polling da espera foi recusado (401/402/403) — mostra o erro no
  // lugar do painel, mesmo sem `espera` carregada; sumir em silêncio faria o
  // paciente esperar uma contagem que não está sendo atualizada.
  if (consultaId && erroStatus && !medicoConectado) {
    const textos =
      erroStatus === 402
        ? { titulo: "Pagamento pendente", detalhe: "O pagamento desta consulta ainda não foi confirmado, por isso a espera não pode continuar." }
        : erroStatus === 403
          ? { titulo: "Acesso negado", detalhe: "A conta que está aberta não participa desta consulta. Confira se você entrou com a conta certa." }
          : { titulo: "Sua sessão expirou", detalhe: "A espera parou de atualizar porque o seu acesso venceu. Entre de novo no app para continuar." };
    return (
      <div className="absolute inset-0 z-40 grid place-items-center bg-bion-night/80 p-6 text-white backdrop-blur-sm">
        <section aria-labelledby="titulo-espera-medico" className="flex w-full max-w-xs flex-col items-center text-center">
          <Cabecalho refTitulo={tituloRef} icone={<ShieldAlert className="size-7" aria-hidden />} titulo={textos.titulo}>
            {textos.detalhe}
          </Cabecalho>
          <Acoes>
            <Botao onClick={onSairDaChamada}>Sair da chamada</Botao>
          </Acoes>
        </section>
      </div>
    );
  }

  if (!consultaId || !mostrarPainelEspera(espera, medicoConectado) || !espera) return null;

  const tratarFalha = (f: Falha) => {
    if (f.codigo === "medico_entrou") {
      void recarregar();
      return;
    }
    setErro(mensagemErroEspera(f.codigo, f.erro));
    void recarregar();
  };

  const cancelar = async () => {
    setEnviando(true);
    setErro(null);
    const r = await chamar<{ espera: EsperaWire }>(`${base(consultaId)}/cancelar`, { method: "POST" });
    setEnviando(false);
    if (r.ok) setEspera(r.dados.espera);
    else {
      setEtapa({ tipo: "inicio" });
      tratarFalha(r.falha);
    }
  };

  const remarcar = async (medico: MedicoLivre, diferenca: number) => {
    setEnviando(true);
    setErro(null);
    const r = await chamar<{ espera: EsperaWire; cobranca: CobrancaEspera | null }>(`${base(consultaId)}/remarcar`, {
      method: "POST",
      body: JSON.stringify({ medicoId: medico.id, diferencaEsperadaCentavos: diferenca }),
    });
    setEnviando(false);
    if (r.ok) {
      setCobranca(r.dados.cobranca);
      setDevolucao(diferenca < 0 ? -diferenca : null);
      setEspera(r.dados.espera);
      setEtapa({ tipo: "inicio" });
      return;
    }
    const f = r.falha;
    if (f.codigo === "preco_mudou" && typeof f.diferencaAtualCentavos === "number") {
      // Mostra o valor novo e pede outra confirmação (nada foi cobrado).
      setEtapa({ tipo: "confirmar_remarcar", medico, diferenca: f.diferencaAtualCentavos, avisoPreco: true });
      setErro(mensagemErroEspera("preco_mudou"));
      return;
    }
    if (f.codigo === "medico_indisponivel") {
      setEtapa({ tipo: "escolher_medico" });
      setErro(mensagemErroEspera(f.codigo));
      void carregarMedicos();
      return;
    }
    setEtapa({ tipo: "inicio" });
    tratarFalha(f);
  };

  const desistir = async () => {
    setEnviando(true);
    setErro(null);
    const r = await chamar<{ espera: EsperaWire }>(`${base(consultaId)}/desistir-remarcacao`, { method: "POST" });
    setEnviando(false);
    if (r.ok) {
      setCobranca(null);
      setEspera(r.dados.espera);
      setEtapa({ tipo: "inicio" });
    } else tratarFalha(r.falha);
  };

  const status = espera.status === "aguardando" && segundosAte(espera.expiraEm, agora) === 0 ? "expirada" : espera.status;
  const podeEscolher = espera.podeEscolher || status === "expirada";

  let conteudo: React.ReactNode;
  if (status === "aguardando") {
    const s = segundosAte(espera.expiraEm, agora);
    conteudo = (
      <>
        <Cabecalho refTitulo={tituloRef} icone={<Clock className="size-7" aria-hidden />} titulo="Aguardando o médico entrar">
          Ele tem até 10 minutos. Se não entrar, você pode cancelar com reembolso integral ou remarcar com outro médico.
        </Cabecalho>
        <p className="mt-4 text-4xl font-semibold tabular-nums" aria-hidden>
          {formatarContagem(s)}
        </p>
        <p className="sr-only" role="timer" aria-live="off">
          Faltam {contagemFalada(s)}
        </p>
        <Acoes>
          <Botao onClick={onSairDaChamada}>Sair da chamada</Botao>
        </Acoes>
      </>
    );
  } else if (status === "expirada" && podeEscolher) {
    if (etapa.tipo === "confirmar_cancelar") {
      conteudo = (
        <>
          <Cabecalho refTitulo={tituloRef} icone={<XCircle className="size-7" aria-hidden />} titulo="Cancelar com reembolso?">
            A consulta será cancelada e o valor pago volta integralmente para você.
          </Cabecalho>
          <Acoes>
            <Botao primario onClick={() => void cancelar()} disabled={enviando} carregando={enviando}>
              Confirmar cancelamento
            </Botao>
            <Botao onClick={() => setEtapa({ tipo: "inicio" })} disabled={enviando}>
              Voltar
            </Botao>
          </Acoes>
        </>
      );
    } else if (etapa.tipo === "escolher_medico") {
      conteudo = (
        <>
          <Cabecalho refTitulo={tituloRef} icone={<UserRound className="size-7" aria-hidden />} titulo="Escolha outro médico">
            Médicos da mesma especialidade livres agora. A diferença de preço aparece antes de confirmar.
          </Cabecalho>
          <div className="mt-4 w-full">
            {carregandoMedicos || medicos === null ? (
              <p role="status" className="flex items-center justify-center gap-2 text-sm text-white/80">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Procurando médicos livres…
              </p>
            ) : medicos.length === 0 ? (
              <p role="status" className="text-sm text-white/80">
                Nenhum médico livre agora. Você pode tentar de novo em instantes ou cancelar com reembolso.
              </p>
            ) : (
              <ul className="flex max-h-[38dvh] flex-col gap-2 overflow-y-auto text-left" aria-label="Médicos livres agora">
                {medicos.map((m) => {
                  const dif = textoDiferenca(m.diferencaCentavos ?? 0);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setErro(null);
                          setEtapa({ tipo: "confirmar_remarcar", medico: m, diferenca: m.diferencaCentavos ?? 0 });
                        }}
                        aria-label={`${m.nome}, ${dif.curto}`}
                        className="bpp-toque flex w-full items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{m.nome}</span>
                          <span className="block truncate text-xs text-white/70">{m.especialidade}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{dif.curto}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Acoes>
            <Botao onClick={() => void carregarMedicos()} disabled={carregandoMedicos}>
              <RotateCcw className="size-4" aria-hidden /> Atualizar lista
            </Botao>
            <Botao onClick={() => setEtapa({ tipo: "inicio" })}>Voltar</Botao>
          </Acoes>
        </>
      );
    } else if (etapa.tipo === "confirmar_remarcar") {
      const dif = textoDiferenca(etapa.diferenca);
      conteudo = (
        <>
          <Cabecalho refTitulo={tituloRef} icone={<UserRound className="size-7" aria-hidden />} titulo="Confirmar remarcação">
            Nova consulta agora com {etapa.medico.nome}.
          </Cabecalho>
          <div className="mt-4 w-full rounded-2xl border border-white/15 bg-white/10 p-4 text-left">
            <p className="text-xs uppercase tracking-wide text-white/70">Diferença</p>
            <p className="text-2xl font-semibold tabular-nums">{dif.curto}</p>
            <p className="mt-1 text-sm text-white/80">{dif.detalhe}</p>
          </div>
          <Acoes>
            <Botao primario onClick={() => void remarcar(etapa.medico, etapa.diferenca)} disabled={enviando} carregando={enviando}>
              {dif.acao === "cobrar" ? "Confirmar e pagar com cartão" : "Confirmar remarcação"}
            </Botao>
            <Botao onClick={() => setEtapa({ tipo: "escolher_medico" })} disabled={enviando}>
              Escolher outro
            </Botao>
          </Acoes>
        </>
      );
    } else {
      conteudo = (
        <>
          <Cabecalho refTitulo={tituloRef} icone={<Clock className="size-7" aria-hidden />} titulo="O médico não entrou">
            Passaram os 10 minutos de espera. Escolha como prefere seguir. Se o médico entrar antes da sua escolha, a consulta começa normalmente.
          </Cabecalho>
          <Acoes>
            <Botao primario onClick={() => setEtapa({ tipo: "confirmar_cancelar" })}>
              Cancelar com reembolso
            </Botao>
            <Botao
              onClick={() => {
                setEtapa({ tipo: "escolher_medico" });
                void carregarMedicos();
              }}
            >
              Remarcar com outro médico
            </Botao>
            <Botao onClick={onSairDaChamada}>Sair da chamada</Botao>
          </Acoes>
        </>
      );
    }
  } else if (status === "remarcando") {
    const s = segundosAte(espera.reservaExpiraEm, agora);
    const valor = cobranca?.valorCentavos ?? espera.diferencaCentavos ?? 0;
    conteudo = (
      <>
        <Cabecalho refTitulo={tituloRef} icone={<Clock className="size-7" aria-hidden />} titulo="Pague a diferença com cartão">
          {textoDiferenca(valor).curto.replace("+ ", "")} para confirmar a nova consulta. A consulta atual só é cancelada depois que o pagamento for confirmado.
        </Cabecalho>
        <p className="mt-3 text-sm text-white/80">
          Horário reservado por <span className="font-semibold tabular-nums" aria-hidden>{formatarContagem(s)}</span>
          <span className="sr-only">{contagemFalada(s)}</span>
        </p>
        {cobranca?.pagamentoId || espera.consultaNovaId ? (
          <div className="mt-3 w-full">
            <BotaoPagarStripe
              {...(cobranca?.pagamentoId ? { pagamentoId: cobranca.pagamentoId } : { consultaId: espera.consultaNovaId! })}
              rotulo="Pagar com cartão"
              className="w-full"
            />
          </div>
        ) : null}
        <p role="status" className="mt-3 text-sm text-white/80">
          {cobranca?.status === "confirmado" ? "Pagamento confirmado." : "O pagamento é só com cartão. Depois de pagar, esta tela atualiza sozinha."}
        </p>
        <Acoes>
          <Botao onClick={() => void desistir()} disabled={enviando} carregando={enviando}>
            Desistir da remarcação
          </Botao>
        </Acoes>
      </>
    );
  } else if (status === "cancelada") {
    conteudo = (
      <>
        <Cabecalho refTitulo={tituloRef} icone={<Check className="size-7" aria-hidden />} titulo="Consulta cancelada">
          O reembolso foi pedido. Ele é integral e automático.
        </Cabecalho>
        <Acoes>
          <Botao primario onClick={onSair}>
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao início
          </Botao>
        </Acoes>
      </>
    );
  } else if (status === "remarcada") {
    conteudo = (
      <>
        <Cabecalho refTitulo={tituloRef} icone={<Check className="size-7" aria-hidden />} titulo="Consulta remarcada">
          {devolucao ? `A nova consulta já está marcada. A diferença de ${textoDiferenca(-devolucao).curto.replace("− ", "")} volta para você.` : "A nova consulta já está marcada. Volte ao início para entrar nela."}
        </Cabecalho>
        <Acoes>
          <Botao primario onClick={onSair}>
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao início
          </Botao>
        </Acoes>
      </>
    );
  } else {
    return null;
  }

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-bion-night/80 p-6 text-white backdrop-blur-sm">
      <section aria-labelledby="titulo-espera-medico" className="flex w-full max-w-xs flex-col items-center text-center">
        {conteudo}
        {erro ? (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-50">
            {erro}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Cabecalho({
  refTitulo,
  icone,
  titulo,
  children,
}: {
  refTitulo: React.RefObject<HTMLHeadingElement | null>;
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="grid size-16 place-items-center rounded-full border border-white/25 bg-white/10">{icone}</div>
      <h2 id="titulo-espera-medico" ref={refTitulo} tabIndex={-1} className="mt-4 text-xl font-semibold outline-none">
        {titulo}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-white/75">{children}</p>
    </>
  );
}

function Acoes({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex w-full flex-col gap-2.5">{children}</div>;
}

function Botao({
  primario,
  carregando,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean; carregando?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-busy={carregando || undefined}
      className={`bpp-toque inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 disabled:opacity-50 ${
        primario ? "bg-white text-bion-night hover:bg-white/90" : "border border-white/25 bg-white/10 hover:bg-white/20"
      }`}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
