"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVoltarFecha } from "./useVoltarFecha";
import { useFocoDialogo } from "./useFocoDialogo";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useBion } from "@/lib/bion-store";
import { ETAPAS_ANAMNESE, type RespostaAnamnese } from "./chat-bion-types";

const ATALHOS: Record<string, string[]> = {
  identificacao: ["Está certo", "Preciso atualizar peso", "Preciso atualizar telefone"],
  queixa: ["Dor", "Cansaço", "Falta de ar", "Check-up"],
  historia: ["Começou hoje", "Há alguns dias", "Há semanas"],
  sistemas: ["Nada além disso", "Também febre", "Também náusea"],
  antecedentes: ["Nenhuma doença", "Hipertensão", "Diabetes"],
  familia: ["Nada relevante", "Coração na família", "Diabetes na família"],
  habitos: ["Não fumo nem bebo", "Fumo", "Bebo socialmente"],
  gineco: ["Não se aplica", "Ciclo regular", "Gestante"],
  psicossocial: ["Durmo bem", "Ando ansioso", "Durmo mal"],
  medicamentos: ["Não tomo nada", "Uso contínuo", "Alérgico a remédio"],
  documentos: ["Não tenho exame agora", "Vou enviar depois"],
  fechamento: ["Pode enviar ao médico", "Quero revisar"],
};

const DICAS: Record<string, string> = {
  identificacao: "Os dados do seu perfil estão certos?",
  queixa: "O que mais te incomoda hoje?",
  historia: "Quando começou, o que piora e o que alivia?",
  sistemas: "Além disso, sentiu mais alguma coisa?",
  antecedentes: "Doenças, cirurgias ou alergias importantes?",
  familia: "Algo na família que importe para esta consulta?",
  habitos: "Cigarro, álcool, exercício, sono?",
  gineco: "Faz sentido falar de história ginecológica?",
  psicossocial: "Como estão o humor, o sono e a rotina?",
  medicamentos: "O que você toma hoje?",
  documentos: "Tem exame para anexar depois?",
  fechamento: "Pode enviar o resumo ao médico?",
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
  const { aplicarDelta, pularAnamnese, concluirAnamnese, anamneses } = useBion();
  const faixaRef = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ x: number; y: number } | null>(null);
  const [indice, setIndice] = useState(0);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [respondidos, setRespondidos] = useState<Record<string, string>>({});
  const [etapaServidor, setEtapaServidor] = useState("identificacao");
  const [pronta, setPronta] = useState(false);

  const idxServidor = Math.max(0, ETAPAS_ANAMNESE.findIndex((e) => e.id === etapaServidor));

  const textoColeta = (bloco: Record<string, unknown> | undefined) => {
    if (!bloco) return "";
    const pedaco = Object.entries(bloco)
      .filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim())
      .map(([, v]) => String(v));
    return pedaco[0] ?? "";
  };

  const hidratar = (etapa: string | undefined, coleta: Record<string, Record<string, unknown>> | undefined, concluida?: boolean) => {
    if (etapa) setEtapaServidor(etapa);
    if (concluida) setPronta(true);
    const feitos: Record<string, string> = {};
    for (const e of ETAPAS_ANAMNESE) {
      const t = textoColeta(coleta?.[e.id]);
      if (t) feitos[e.id] = t;
    }
    if (Object.keys(feitos).length) setRespondidos((r) => ({ ...feitos, ...r }));
    const i = Math.max(0, ETAPAS_ANAMNESE.findIndex((e) => e.id === (etapa ?? "identificacao")));
    setIndice(i < 0 ? 0 : i);
    requestAnimationFrame(() => {
      const el = faixaRef.current?.children[i < 0 ? 0 : i] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  };

  const aplicarRespostaApi = (json: RespostaAnamnese) => {
    aplicarDelta(json);
    const ana = json.anamnese as { etapa?: string; coleta?: Record<string, Record<string, unknown>>; status?: string } | undefined;
    hidratar(json.etapa ?? ana?.etapa, ana?.coleta, json.concluida || ana?.status === "concluida");
  };

  useEffect(() => {
    const a = anamneses.find((x) => x.consultaId === consultaId);
    if (a) hidratar(a.etapa, a.coleta, a.status === "concluida");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultaId]);

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
        if (vivo && res.ok) aplicarRespostaApi(json);
      } catch {
        toast.error("Não abri a triagem agora.");
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
    const etapaAtual = ETAPAS_ANAMNESE[idxServidor]?.id ?? etapaServidor;
    setRespondidos((r) => ({ ...r, [etapaAtual]: t }));
    setRascunhos((r) => ({ ...r, [etapaAtual]: "" }));
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
      toast.error("Não enviei essa resposta.");
    } finally {
      setEnviando(false);
    }
  };

  const concluir = async () => {
    setEnviando(true);
    const ok = await concluirAnamnese(consultaId);
    setEnviando(false);
    if (ok) {
      toast.success("Triagem enviada ao médico");
      onFechar();
    }
  };

  // Fase 3: o botão "Pular" do topo chamava `void pularTudo` (sem os
  // parênteses) e não fazia nada. Agora chama de verdade e evita clique duplo.
  const [confirmandoPulo, setConfirmandoPulo] = useState(false);
  const pularTudo = async () => {
    if (enviando) return;
    // Pular dispensa a triagem inteira: pede um segundo toque para confirmar.
    if (!confirmandoPulo) {
      setConfirmandoPulo(true);
      return;
    }
    setEnviando(true);
    const ok = await pularAnamnese(consultaId);
    setEnviando(false);
    setConfirmandoPulo(false);
    if (ok) {
      toast.success("Triagem pulada — consulta segue confirmada");
      onFechar();
    }
  };

  const irPara = (i: number) => {
    const n = Math.max(0, Math.min(ETAPAS_ANAMNESE.length - 1, i));
    setIndice(n);
    requestAnimationFrame(() => {
      const el = faixaRef.current?.children[n] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  };

  const etapa = ETAPAS_ANAMNESE[indice] ?? ETAPAS_ANAMNESE[0];
  const progresso = useMemo(() => {
    const n = pronta ? ETAPAS_ANAMNESE.length : Math.max(idxServidor, Object.keys(respondidos).length);
    return Math.min(100, Math.round((n / ETAPAS_ANAMNESE.length) * 100));
  }, [idxServidor, respondidos, pronta]);

  const dialogoRef = useRef<HTMLDivElement>(null);
  useVoltarFecha(true, onFechar);
  useFocoDialogo(true, onFechar, dialogoRef);

  return (
    <div ref={dialogoRef} className="absolute inset-0 z-[70] flex flex-col bpp-sheet" role="dialog" aria-modal="true" aria-label="Triagem">
      <header className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button type="button" onClick={onFechar} className="rounded-full p-2 bpp-sheet-chip" aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider bpp-sheet-suave">Triagem</div>
          <div className="text-sm font-bold truncate">{especialidade}</div>
          <div className="text-xs bpp-sheet-suave truncate">
            {medico} · {quando}
          </div>
        </div>
        <button type="button" onClick={() => void pularTudo()} disabled={enviando} className="bpp-toque min-h-11 rounded-full px-3 text-xs font-semibold bpp-sheet-suave disabled:opacity-40"
          aria-label={confirmandoPulo ? "Confirmar: pular a triagem inteira" : "Pular a triagem"}
        >
          {confirmandoPulo ? "Pular tudo?" : "Pular"}
        </button>
      </header>

      <div className="px-4 pb-2">
        <div className="h-1.5 rounded-full bpp-sheet-chip overflow-hidden">
          <div className="h-full bg-sky-700 dark:bg-sky-400 transition-all" style={{ width: `${progresso}%` }} />
        </div>
        <div className="mt-1 text-xs bpp-sheet-suave">
          {indice + 1} / {ETAPAS_ANAMNESE.length} · {etapa.rotulo}
        </div>
      </div>

      <div
        ref={faixaRef}
        className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex gap-3 px-4 pb-4 touch-pan-x"
        style={{ WebkitOverflowScrolling: "touch" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          const card = el.children[0] as HTMLElement | undefined;
          const passo = (card?.offsetWidth ?? el.clientWidth) + 12;
          const i = Math.round(el.scrollLeft / Math.max(1, passo));
          if (i !== indice && i >= 0 && i < ETAPAS_ANAMNESE.length) setIndice(i);
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("textarea, input, button")) return;
          gesto.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!gesto.current) return;
          const dx = e.clientX - gesto.current.x;
          const dy = e.clientY - gesto.current.y;
          gesto.current = null;
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
          irPara(indice + (dx < 0 ? 1 : -1));
        }}
      >
        {ETAPAS_ANAMNESE.map((item, i) => (
          <article
            key={item.id}
            className={`snap-center shrink-0 w-[86vw] max-w-md h-full rounded-3xl border p-5 flex flex-col ${
              i === indice ? "bpp-sheet-sel bpp-sheet-cartao" : "bpp-sheet-borda bpp-sheet-cartao"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                {String(i + 1).padStart(2, "0")} · {item.rotulo}
              </span>
              {respondidos[item.id] ? <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" /> : <Sparkles className="w-4 h-4 bpp-sheet-suave" />}
            </div>
            <p className="text-[17px] font-semibold leading-snug">
              {pronta && i === ETAPAS_ANAMNESE.length - 1
                ? "Tudo certo. Envie ao médico quando quiser."
                : DICAS[item.id]}
            </p>
            {respondidos[item.id] ? <p className="mt-3 text-sm bpp-sheet-suave">Você: {respondidos[item.id]}</p> : null}

            {i === idxServidor && !pronta ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(ATALHOS[item.id] ?? []).map((atalho) => (
                    <button
                      key={atalho}
                      type="button"
                      disabled={enviando}
                      onClick={() => void enviar(atalho)}
                      className="rounded-full px-3 py-2 text-xs font-semibold bpp-sheet-chip border bpp-sheet-borda"
                    >
                      {atalho}
                    </button>
                  ))}
                </div>
                <textarea
                  value={rascunhos[item.id] ?? ""}
                  onChange={(e) => setRascunhos((r) => ({ ...r, [item.id]: e.target.value }))}
                  rows={3}
                  placeholder="Ou escreva aqui…"
                  className="mt-4 w-full rounded-2xl border bpp-sheet-borda p-3 text-sm bpp-sheet-campo"
                />
              </>
            ) : i > idxServidor && !pronta ? (
              <p className="mt-4 text-sm bpp-sheet-suave">Responda o card atual para chegar aqui.</p>
            ) : null}

            <div className="mt-auto pt-4 flex items-center gap-2">
              <button type="button" disabled={i === 0} onClick={() => irPara(i - 1)} className="rounded-full p-2.5 bpp-sheet-chip disabled:opacity-30" aria-label="Anterior">
                <ArrowLeft className="w-4 h-4" />
              </button>
              {pronta || i === ETAPAS_ANAMNESE.length - 1 ? (
                <button type="button" onClick={() => void concluir()} className="flex-1 rounded-2xl py-3 text-sm font-bold bg-emerald-400 text-zinc-950">
                  Enviar ao médico
                </button>
              ) : i === idxServidor ? (
                <>
                  <button type="button" onClick={() => void enviar("Pode pular esta etapa.")} className="text-xs font-semibold bpp-sheet-suave px-2">
                    Pular
                  </button>
                  <button type="button" disabled={enviando || !(rascunhos[item.id] ?? "").trim()} onClick={() => void enviar(rascunhos[item.id] ?? "")} className="flex-1 rounded-2xl py-3 text-sm font-bold bpp-sheet-primario disabled:opacity-40">
                    {enviando ? "Enviando…" : "Continuar"}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => irPara(i)} className="flex-1 rounded-2xl py-3 text-sm font-bold bpp-sheet-chip">
                  Abrir este card
                </button>
              )}
              <button type="button" disabled={i >= ETAPAS_ANAMNESE.length - 1} onClick={() => irPara(i + 1)} className="rounded-full p-2.5 bpp-sheet-chip disabled:opacity-30" aria-label="Próximo">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
