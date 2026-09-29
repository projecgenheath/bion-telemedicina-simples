"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { ETAPAS_ANAMNESE, type RespostaAnamnese } from "./chat-bion-types";

const ATALHOS: Record<string, string[]> = {
  identificacao: ["Está certo", "Preciso atualizar peso", "Preciso atualizar telefone"],
  queixa: ["Dor", "Cansaço", "Falta de ar", "Check-up"],
  historia: ["Começou hoje", "Há alguns dias", "Há semanas", "Não sei dizer"],
  sistemas: ["Nada além disso", "Também febre", "Também náusea", "Também tontura"],
  antecedentes: ["Nenhuma doença", "Hipertensão", "Diabetes", "Já fiz cirurgia"],
  familia: ["Nada relevante", "Coração na família", "Diabetes na família"],
  habitos: ["Não fumo nem bebo", "Fumo", "Bebo socialmente", "Pouco exercício"],
  gineco: ["Não se aplica", "Ciclo regular", "Gestante", "Anticoncepcional"],
  psicossocial: ["Durmo bem", "Ando ansioso", "Durmo mal", "Estresse no trabalho"],
  medicamentos: ["Não tomo nada", "Tomos contínuos", "Alérgico a remédio"],
  documentos: ["Não tenho exame agora", "Vou enviar depois"],
  fechamento: ["Pode enviar ao médico", "Quero revisar"],
};

const DICAS: Record<string, string> = {
  identificacao: "Confirme se os dados do seu perfil estão corretos.",
  queixa: "Em uma frase: o que mais te incomoda hoje?",
  historia: "Quando começou, o que piora e o que alivia.",
  sistemas: "Além da queixa, sentiu mais alguma coisa?",
  antecedentes: "Doenças, cirurgias ou alergias importantes.",
  familia: "Algo que rode na família e importe para esta consulta.",
  habitos: "Cigarro, álcool, exercício, sono.",
  gineco: "Só se fizer sentido para você — pode pular.",
  psicossocial: "Como está o humor, o sono e a rotina.",
  medicamentos: "O que você toma hoje, mesmo que seja de vez em quando.",
  documentos: "Se tiver exame em PDF ou foto, envie depois no chat.",
  fechamento: "Revise e envie ao médico — ou volte em um card.",
};

export function TriagemSlides({
  consultaId,
  medico,
  especialidade,
  quando,
  onFechar,
}: {
  consultaId: string;
  medico: string;
  especialidade: string;
  quando: string;
  onFechar: () => void;
}) {
  const { aplicarDelta, pularAnamnese, concluirAnamnese } = useBion();
  const faixaRef = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const [pergunta, setPergunta] = useState("Vamos começar. Confirme seus dados e toque em Continuar.");
  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondidos, setRespondidos] = useState<Record<string, string>>({});
  const [etapaServidor, setEtapaServidor] = useState("identificacao");
  const [pronta, setPronta] = useState(false);

  const idxServidor = Math.max(
    0,
    ETAPAS_ANAMNESE.findIndex((e) => e.id === etapaServidor),
  );

  const irPara = (i: number) => {
    const el = faixaRef.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setIndice(i);
  };

  const aplicarRespostaApi = (json: RespostaAnamnese) => {
    aplicarDelta(json);
    if (json.texto) setPergunta(json.texto.replace(/\*\*/g, ""));
    if (json.etapa) setEtapaServidor(json.etapa);
    if (json.concluida) setPronta(true);
    const novoIdx = Math.max(
      0,
      ETAPAS_ANAMNESE.findIndex((e) => e.id === (json.etapa ?? etapaServidor)),
    );
    setIndice(novoIdx);
    requestAnimationFrame(() => irPara(novoIdx));
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEnviando(true);
      try {
        const res = await fetch("/api/anamnese", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ consultaId, historico: [] }),
        });
        const json = (await res.json()) as RespostaAnamnese;
        if (!vivo) return;
        if (res.ok) aplicarRespostaApi(json);
      } catch {
        toast.error("Não abri a triagem agora. Tente de novo.");
      } finally {
        if (vivo) setEnviando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultaId]);

  const enviar = async (texto: string) => {
    const t = texto.trim();
    if (!t || enviando || pronta) return;
    const etapaAtual = ETAPAS_ANAMNESE[indice]?.id ?? etapaServidor;
    setRespondidos((r) => ({ ...r, [etapaAtual]: t }));
    setResposta("");
    setEnviando(true);
    try {
      const res = await fetch("/api/anamnese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, mensagem: t, historico: [] }),
      });
      const json = (await res.json()) as RespostaAnamnese;
      if (!res.ok) throw new Error(json.erro ?? "Falha");
      aplicarRespostaApi(json);
    } catch {
      toast.error("Não enviei essa resposta. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const pularEtapa = () => void enviar("Pode pular esta etapa e seguir.");

  const concluir = async () => {
    setEnviando(true);
    const ok = await concluirAnamnese(consultaId);
    setEnviando(false);
    if (ok) {
      setPronta(true);
      toast.success("Triagem enviada ao médico");
    }
  };

  const pularTudo = async () => {
    const ok = await pularAnamnese(consultaId);
    if (ok) {
      toast.success("Triagem pulada — consulta segue confirmada");
      onFechar();
    }
  };

  const progresso = useMemo(() => {
    const n = Object.keys(respondidos).length;
    return Math.min(100, Math.round((n / ETAPAS_ANAMNESE.length) * 100));
  }, [respondidos]);

  const etapaVisivel = ETAPAS_ANAMNESE[indice] ?? ETAPAS_ANAMNESE[0];
  const atalhos = ATALHOS[etapaVisivel.id] ?? [];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950 text-white" role="dialog" aria-modal="true" aria-label="Triagem">
      <header className="px-4 pt-3 pb-2 flex items-center gap-3 shrink-0">
        <button type="button" onClick={onFechar} className="rounded-full p-2 bg-white/10" aria-label="Fechar triagem">
          <X className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-white/50">Triagem</div>
          <div className="text-sm font-bold truncate">
            {especialidade} · {medico}
          </div>
          <div className="text-xs text-white/50 truncate">{quando}</div>
        </div>
        <button type="button" onClick={() => void pularTudo} className="text-xs font-semibold text-white/60">
          Pular triagem
        </button>
      </header>

      <div className="px-4 pb-2 shrink-0">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${pronta ? 100 : progresso}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-white/45">
          {pronta ? "Enviada ao médico" : `Card ${indice + 1} de ${ETAPAS_ANAMNESE.length}`}
        </div>
      </div>

      <div
        ref={faixaRef}
        className="shrink-0 overflow-x-auto snap-x snap-mandatory flex gap-3 px-4 py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth * 0.88));
          if (i !== indice && i >= 0 && i < ETAPAS_ANAMNESE.length) setIndice(i);
        }}
      >
        {ETAPAS_ANAMNESE.map((etapa, i) => {
          const ativo = i === indice;
          const feito = Boolean(respondidos[etapa.id]);
          return (
            <article
              key={etapa.id}
              className={`snap-center shrink-0 w-[86vw] max-w-sm rounded-3xl border p-5 ${
                ativo ? "border-sky-400/50 bg-zinc-900" : "border-white/10 bg-zinc-900/70"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                  {String(i + 1).padStart(2, "0")} · {etapa.rotulo}
                </span>
                {feito ? <Check className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4 text-white/30" />}
              </div>
              <p className="text-base font-semibold leading-snug">
                {i === idxServidor ? pergunta : DICAS[etapa.id]}
              </p>
              {feito ? <p className="mt-3 text-sm text-white/60">Sua resposta: {respondidos[etapa.id]}</p> : null}
            </article>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-zinc-950 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            disabled={indice === 0}
            onClick={() => irPara(indice - 1)}
            className="rounded-full p-2 bg-white/10 disabled:opacity-30"
            aria-label="Card anterior"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/45">{etapaVisivel.rotulo}</span>
          <button
            type="button"
            disabled={indice >= ETAPAS_ANAMNESE.length - 1}
            onClick={() => irPara(indice + 1)}
            className="rounded-full p-2 bg-white/10 disabled:opacity-30"
            aria-label="Próximo card"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {pronta ? (
          <button
            type="button"
            onClick={() => void concluir()}
            className="w-full rounded-2xl py-3 text-sm font-bold bg-emerald-400 text-zinc-950"
          >
            Enviar ao médico
          </button>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {atalhos.map((atalho) => (
                <button
                  key={atalho}
                  type="button"
                  disabled={enviando}
                  onClick={() => void enviar(atalho)}
                  className="rounded-full px-3 py-2 text-xs font-semibold bg-white/10 border border-white/15"
                >
                  {atalho}
                </button>
              ))}
            </div>
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              rows={3}
              placeholder="Escreva sua resposta…"
              className="w-full rounded-2xl border border-white/15 bg-zinc-900 p-3 text-sm text-white placeholder:text-white/40"
            />
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={pularEtapa} className="px-3 py-3 text-xs font-semibold text-white/55">
                Pular etapa
              </button>
              <button
                type="button"
                disabled={enviando || !resposta.trim()}
                onClick={() => void enviar(resposta)}
                className="flex-1 rounded-2xl py-3 text-sm font-bold bg-sky-400 text-zinc-950 disabled:opacity-40"
              >
                {enviando ? "Enviando…" : "Responder e continuar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
