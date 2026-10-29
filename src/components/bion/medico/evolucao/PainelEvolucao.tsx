"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, X, Check, Ruler, Lock } from "lucide-react";

/**
 * Painel da Evolução do médico (Teleconsulta v2). Gaveta que entra pela
 * direita: abre ao DESLIZAR da borda direita da tela da consulta para a
 * esquerda (ou pelo botão). Autosave do rascunho no servidor
 * (PUT /api/medico/consultas/[id]/evolucao, 1,2 s depois da última edição).
 * Histórico do paciente com outros médicos: somente leitura.
 */

type Secao = "dados" | "triagem" | "exames" | "medicamentos" | "conduta";
type Estado = {
  evolucao: null | { status: "rascunho" | "concluida"; cid: string | null } & Record<Secao, { texto?: string }>;
  paciente: { nome: string; alergias: string[]; comorbidades: string[]; peso: string | null; altura: string | null };
  medicoes: { id: string; tipo: string; valor1: number; valor2: number | null; criadoEm: string }[];
  exames: { id: string; titulo: string; dataColeta: string }[];
  medicamentosEmUso: { id: string; nome: string; dose: string | null; controlado: boolean }[];
  pedidosMedicao: { id: string; tipos: string[]; status: string }[];
  historico: {
    consultaId: string; dataInicio: string; especialidade: string; medico: string; deOutroMedico: boolean;
    anamnese: { status: string } | null; evolucao: { conduta: { texto?: string }; cid: string | null } | null;
  }[];
};

const ABAS: { id: Secao | "historico"; rotulo: string }[] = [
  { id: "dados", rotulo: "Dados" },
  { id: "triagem", rotulo: "Triagem" },
  { id: "exames", rotulo: "Exames" },
  { id: "medicamentos", rotulo: "Medicamentos" },
  { id: "conduta", rotulo: "Conduta" },
  { id: "historico", rotulo: "Histórico" },
];

export function PainelEvolucao({
  consultaId,
  aberto,
  onAbrir,
  onFechar,
  onConcluida,
}: {
  consultaId: string;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onConcluida?: () => void;
}) {
  const base = `/api/medico/consultas/${encodeURIComponent(consultaId)}/evolucao`;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aba, setAba] = useState<Secao | "historico">("dados");
  const [textos, setTextos] = useState<Record<Secao, string>>({ dados: "", triagem: "", exames: "", medicamentos: "", conduta: "" });
  const [cid, setCid] = useState("");
  const [salvo, setSalvo] = useState<"ok" | "salvando" | "erro">("ok");
  const [erroCarga, setErroCarga] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const concluida = estado?.evolucao?.status === "concluida";

  const buscar = useCallback(async (): Promise<Estado | null> => {
    const res = await fetch(base, { cache: "no-store" }).catch(() => null);
    return res?.ok ? ((await res.json()) as Estado) : null;
  }, [base]);
  const aplicar = useCallback((j: Estado | null) => {
    if (!j) {
      // M-8: erro de carga é ESTADO VISÍVEL — antes o painel ficava vazio com
      // o botão de concluir ativo, permitindo concluir evolução que não carregou.
      setErroCarga(true);
      return;
    }
    setErroCarga(false);
    setEstado(j);
    if (j.evolucao) {
      setTextos({
        dados: j.evolucao.dados?.texto ?? "",
        triagem: j.evolucao.triagem?.texto ?? "",
        exames: j.evolucao.exames?.texto ?? "",
        medicamentos: j.evolucao.medicamentos?.texto ?? "",
        conduta: j.evolucao.conduta?.texto ?? "",
      });
      setCid(j.evolucao.cid ?? "");
    }
  }, []);
  const carregar = useCallback(() => buscar().then(aplicar), [buscar, aplicar]);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    buscar().then((j) => {
      if (vivo) aplicar(j);
    });
    return () => {
      vivo = false;
    };
  }, [aberto, buscar, aplicar]);

  // M-8: o timer do autosave (1,2 s) é limpo na desmontagem — antes, edições
  // feitas até 1,2 s antes de fechar a tela eram perdidas (timer morto
  // disparando em componente desmontado).
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Deslizar da borda direita (últimos 24 px) para a esquerda abre o painel.
  useEffect(() => {
    let x0: number | null = null;
    const ini = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = t && t.clientX > window.innerWidth - 24 ? t.clientX : null;
    };
    const fim = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (x0 !== null && t && x0 - t.clientX > 60) onAbrir();
      x0 = null;
    };
    window.addEventListener("touchstart", ini, { passive: true });
    window.addEventListener("touchend", fim, { passive: true });
    return () => {
      window.removeEventListener("touchstart", ini);
      window.removeEventListener("touchend", fim);
    };
  }, [onAbrir]);

  const salvar = useCallback(
    async (t: Record<Secao, string>, c: string) => {
      setSalvo("salvando");
      const corpo = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { texto: v }]));
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, cid: c }),
      }).catch(() => null);
      setSalvo(res?.ok ? "ok" : "erro");
    },
    [base],
  );

  const editar = (s: Secao, v: string) => {
    const novo = { ...textos, [s]: v };
    setTextos(novo);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(novo, cid), 1200);
  };
  const editarCid = (v: string) => {
    setCid(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(textos, v), 1200);
  };

  const pedirMedicao = async (tipos: string[]) => {
    try {
      const res = await fetch("/api/medico/pedidos-medicao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId, tipos }),
      });
      if (res.ok) {
        toast.success("Pedido enviado ao paciente");
        void carregar();
      } else toast.error("Não foi possível pedir a medição");
    } catch {
      toast.error("Falha de conexão", { description: "O pedido de medição não foi enviado." });
    }
  };
  const cancelarPedido = async (id: string) => {
    try {
      const res = await fetch(`/api/medico/pedidos-medicao?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Pedido cancelado");
        void carregar();
      } else {
        // M-8: antes o cancelamento falhava em silêncio total.
        toast.error("Não foi possível cancelar o pedido");
      }
    } catch {
      toast.error("Falha de conexão", { description: "O cancelamento não foi enviado." });
    }
  };

  const concluir = async () => {
    // M-8: conclusão é IRREVERSÍVEL — exige conteúdo mínimo em conduta e
    // confirmação explícita; desabilita durante o envio (duplo clique gerava
    // segundo POST e 409 confuso).
    if (!textos.conduta.trim()) {
      toast.error("Preencha a conduta antes de concluir", { description: "A conduta é obrigatória para encerrar a evolução." });
      setAba("conduta");
      return;
    }
    // Ato único: o POST de concluir a evolução conclui também a consulta
    // na mesma transação do servidor — NÃO há segundo POST para concluir
    // a consulta, e um erro aqui significa que nenhum dos dois concluiu
    // (nunca "evolução ok, consulta pendente" nem o inverso).
    if (!window.confirm("Concluir a evolução? A consulta correspondente também será concluída. Depois de concluída, a evolução não pode mais ser editada.")) return;
    setConcluindo(true);
    try {
      if (timer.current) clearTimeout(timer.current);
      await salvar(textos, cid);
      const res = await fetch(`${base}/concluir`, { method: "POST" });
      if (res.ok) {
        const j = (await res.json().catch(() => ({}))) as { consultaConcluidaAgora?: boolean; consulta?: { status?: string } | null };
        if (j.consultaConcluidaAgora) {
          toast.success("Evolução e consulta concluídas");
        } else if (j.consulta?.status === "concluida") {
          toast.success("Evolução concluída", { description: "A consulta já estava concluída." });
        } else {
          toast.success("Evolução concluída");
        }
        await carregar();
        onConcluida?.();
      } else {
        const j = (await res.json().catch(() => ({}))) as { erro?: string; mensagem?: string };
        toast.error(j.mensagem ?? j.erro ?? "Não foi possível concluir a evolução");
      }
    } catch {
      toast.error("Falha de conexão", { description: "A evolução não foi concluída." });
    } finally {
      setConcluindo(false);
    }
  };

  return (
    <>
      {!aberto ? (
        <button
          type="button"
          onClick={onAbrir}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 rounded-l-2xl bg-primary text-primary-foreground px-2 py-4 shadow-lg"
          aria-label="Abrir evolução"
        >
          <ClipboardList className="w-5 h-5" />
        </button>
      ) : null}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card text-foreground border-l shadow-2xl flex flex-col transition-transform duration-300 ${aberto ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!aberto}
        inert={!aberto}
        aria-label="Evolução"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="font-bold">Evolução {estado?.paciente.nome ? `— ${estado.paciente.nome}` : ""}</div>
            <div className="text-xs opacity-70">
              {concluida ? "Concluída" : salvo === "salvando" ? "Salvando…" : salvo === "erro" ? "Não salvou — tente de novo" : "Rascunho salvo"}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar evolução"><X className="w-5 h-5" /></button>
        </header>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 border-b text-sm">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => setAba(a.id)}
              className={`px-3 py-1 rounded-full whitespace-nowrap ${aba === a.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {a.rotulo}
            </button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {estado && aba === "dados" ? (
            <div className="space-y-2">
              <div>Peso: {estado.paciente.peso ?? "—"} · Altura: {estado.paciente.altura ?? "—"}</div>
              <div>Alergias: {estado.paciente.alergias.join(", ") || "nenhuma"}</div>
              <div>Comorbidades: {estado.paciente.comorbidades.join(", ") || "nenhuma"}</div>
              <div className="text-xs opacity-70">Últimas medições: {estado.medicoes.slice(0, 5).map((m) => `${m.tipo} ${m.valor1}${m.valor2 != null ? `/${m.valor2}` : ""}`).join(" · ") || "nenhuma"}</div>
              {!concluida ? (
                <div className="flex flex-wrap gap-2">
                  {[["peso"], ["altura"], ["pressao"], ["peso", "altura", "pressao"]].map((t) => (
                    <button key={t.join()} type="button" onClick={() => void pedirMedicao(t)} className="px-3 py-1 rounded-full border flex items-center gap-1">
                      <Ruler className="w-3 h-3" /> Pedir {t.length > 1 ? "todas" : t[0] === "pressao" ? "pressão" : t[0]}
                    </button>
                  ))}
                </div>
              ) : null}
              {estado.pedidosMedicao.filter((p) => p.status === "pendente").map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs bg-muted rounded-xl px-3 py-2">
                  <span>Aguardando paciente: {p.tipos.join(", ")}</span>
                  {!concluida ? <button type="button" onClick={() => void cancelarPedido(p.id)} className="underline">cancelar</button> : null}
                </div>
              ))}
            </div>
          ) : null}
          {estado && aba === "exames" ? (
            <ul className="text-xs space-y-1">
              {estado.exames.map((e) => <li key={e.id}>{e.titulo} — {new Date(e.dataColeta).toLocaleDateString("pt-BR")}</li>)}
              {estado.exames.length === 0 ? <li className="opacity-70">Nenhum exame.</li> : null}
            </ul>
          ) : null}
          {estado && aba === "medicamentos" ? (
            <ul className="text-xs space-y-1">
              {estado.medicamentosEmUso.map((m) => <li key={m.id}>{m.nome}{m.dose ? ` ${m.dose}` : ""}{m.controlado ? " (controlado)" : ""}</li>)}
              {estado.medicamentosEmUso.length === 0 ? <li className="opacity-70">Nenhum medicamento em uso.</li> : null}
            </ul>
          ) : null}
          {aba !== "historico" ? (
            <textarea
              value={textos[aba]}
              onChange={(e) => editar(aba, e.target.value)}
              readOnly={concluida}
              rows={8}
              maxLength={8000}
              placeholder={`Anotações de ${ABAS.find((a) => a.id === aba)?.rotulo.toLowerCase()}`}
              className="w-full rounded-2xl border bg-background p-3"
            />
          ) : null}
          {aba === "conduta" ? (
            <input value={cid} onChange={(e) => editarCid(e.target.value)} readOnly={concluida} maxLength={20}
              placeholder="CID-10" className="w-full rounded-2xl border bg-background p-3" />
          ) : null}
          {estado && aba === "historico" ? (
            <div className="space-y-2">
              <div className="text-xs opacity-70 flex items-center gap-1"><Lock className="w-3 h-3" /> Somente leitura. O acesso a consultas de outros médicos fica na Auditoria.</div>
              {estado.historico.map((h) => (
                <div key={h.consultaId} className="rounded-2xl border p-3">
                  <div className="font-semibold">{new Date(h.dataInicio).toLocaleDateString("pt-BR")} · {h.especialidade}</div>
                  <div className="text-xs opacity-70">{h.medico}{h.deOutroMedico ? " (outro médico)" : ""} · anamnese {h.anamnese?.status ?? "—"}</div>
                  {h.evolucao ? <div className="text-xs mt-1 whitespace-pre-wrap">{h.evolucao.conduta?.texto ?? ""}{h.evolucao.cid ? ` · CID ${h.evolucao.cid}` : ""}</div> : null}
                </div>
              ))}
              {estado.historico.length === 0 ? <div className="text-xs opacity-70">Sem outras consultas.</div> : null}
            </div>
          ) : null}
        </div>
        {!concluida ? (
          <footer className="p-4 border-t">
            {erroCarga ? (
              <p className="text-xs text-center opacity-70 mb-2">A evolução não carregou — reabra o painel antes de concluir.</p>
            ) : null}
            <button type="button" onClick={() => void concluir()} disabled={concluindo || erroCarga}
              className="w-full rounded-full bg-primary text-primary-foreground py-3 font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Check className="w-4 h-4" /> {concluindo ? "Concluindo…" : "Concluir evolução"}
            </button>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
