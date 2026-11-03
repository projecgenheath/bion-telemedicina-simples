"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, X, Check, Ruler, Lock, Download, ChevronDown, ChevronRight, Bookmark, Trash2 } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { gerarDocumentoPDF } from "@/lib/receita-pdf";
import { BotaoDitado } from "@/components/bion/BotaoDitado";
import { CampoCidBusca } from "@/components/bion/medico/campo-cid-busca";
import {
  adicionarModelo,
  carregarModelos,
  fonteDoHistorico,
  mesclarConteudo,
  novoModelo,
  persistirModelos,
  removerModelo,
  temConteudo,
  type ModeloEvolucao,
} from "./modelos-evolucao";

/**
 * Painel da Evolução do médico (Teleconsulta v2). Gaveta que entra pela
 * direita: abre pelo BOTÃO VISÍVEL "Evolução" na borda direita da tela da
 * consulta, ou ao DESLIZAR da borda direita para a esquerda. Autosave do
 * rascunho no servidor (PUT /api/medico/consultas/[id]/evolucao, 1,2 s
 * depois da última edição). Histórico do paciente com outros médicos:
 * somente leitura.
 *
 * Reaproveitamento (item 16 da auditoria de melhorias): "Usar como base"
 * copia conduta + CID de uma evolução anterior DO PRÓPRIO médico (é tudo
 * o que o GET devolve das evoluções anteriores) e os modelos pessoais
 * guardam um instantâneo das seções. Os dois passam pela MESMA mescla
 * conservadora (modelos-evolucao.ts): campo vazio nunca apaga, e
 * substituir texto já digitado pede confirmação. Aplicar só preenche o
 * rascunho pelo autosave — nunca conclui nada. Modelos pessoais ficam
 * no localStorage deste aparelho (sem servidor), e a UI diz isso.
 */

type Secao = "dados" | "triagem" | "exames" | "medicamentos" | "conduta";
/** Item de exame laboratorial como a API devolve (itens do laudo importado). */
type ItemExamePainel = {
  nome: string;
  valor: number | string;
  unidade?: string;
  refMin?: number;
  refMax?: number;
};
/** Documento anterior do paciente (metadados do GET da evolução). */
type DocumentoPainel = {
  id: string;
  tipo: string;
  titulo: string;
  medicamento: string | null;
  posologia: string | null;
  cid: string | null;
  controlado: boolean;
  consultaId: string | null;
  medico: string;
  createdAt: string;
  deOutroMedico: boolean;
};
type Estado = {
  evolucao: null | { status: "rascunho" | "concluida"; cid: string | null } & Record<Secao, { texto?: string }>;
  paciente: { nome: string; alergias: string[]; comorbidades: string[]; peso: string | null; altura: string | null };
  medicoes: { id: string; tipo: string; valor1: number; valor2: number | null; criadoEm: string }[];
  exames: { id: string; titulo: string; dataColeta: string; itens: ItemExamePainel[] }[];
  documentos: DocumentoPainel[];
  medicamentosEmUso: { id: string; nome: string; dose: string | null; controlado: boolean }[];
  pedidosMedicao: { id: string; tipos: string[]; status: string }[];
  historico: {
    consultaId: string; dataInicio: string; especialidade: string; medico: string; deOutroMedico: boolean;
    anamnese: { status: string } | null; evolucao: { conduta: { texto?: string }; cid: string | null } | null;
  }[];
};

type AbaPainel = Secao | "historico" | "documentos";

const ABAS: { id: AbaPainel; rotulo: string }[] = [
  { id: "dados", rotulo: "Dados" },
  { id: "triagem", rotulo: "Triagem" },
  { id: "exames", rotulo: "Exames" },
  { id: "documentos", rotulo: "Documentos" },
  { id: "medicamentos", rotulo: "Medicamentos" },
  { id: "conduta", rotulo: "Conduta" },
  { id: "historico", rotulo: "Histórico" },
];

/** Os itens chegam como JSON do laudo importado: só vale o que tem nome. */
function itensValidos(bruto: unknown): ItemExamePainel[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (i): i is ItemExamePainel =>
      !!i && typeof i === "object" && typeof (i as { nome?: unknown }).nome === "string",
  );
}

/** Valor numérico fora da faixa de referência (quando a faixa veio). */
function foraDaFaixa(it: ItemExamePainel): boolean {
  if (typeof it.valor !== "number") return false;
  if (typeof it.refMin === "number" && it.valor < it.refMin) return true;
  if (typeof it.refMax === "number" && it.valor > it.refMax) return true;
  return false;
}

const ROTULO_MEDICAO: Record<string, { rotulo: string; unidade: string }> = {
  peso: { rotulo: "Peso", unidade: "kg" },
  altura: { rotulo: "Altura", unidade: "cm" },
  pressao: { rotulo: "Pressão", unidade: "mmHg" },
  pa: { rotulo: "Pressão", unidade: "mmHg" },
};

function textoMedicao(m: { tipo: string; valor1: number; valor2: number | null }): string {
  const u = ROTULO_MEDICAO[m.tipo]?.unidade ?? "";
  const base = m.valor2 != null ? `${m.valor1}/${m.valor2}` : `${m.valor1}`;
  return u ? `${base} ${u}` : base;
}

const ROTULO_TIPO_DOC: Record<string, string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame: "Exame",
  exame_solicitado: "Exame solicitado",
};

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
  const [aba, setAba] = useState<AbaPainel>("dados");
  const [examesAbertos, setExamesAbertos] = useState<ReadonlySet<string>>(new Set());
  // Documentos completos do store (com conteúdo) para gerar o PDF dos
  // documentos listados pela API — a API da evolução devolve só os
  // metadados; sem o documento completo no store, a linha fica sem botão
  // (nunca um botão que não funciona).
  const { documentos: documentosStore } = useBion();
  const documentoCompletoPorId = useMemo(
    () => new Map(documentosStore.map((d) => [d.id, d])),
    [documentosStore],
  );
  const [textos, setTextos] = useState<Record<Secao, string>>({ dados: "", triagem: "", exames: "", medicamentos: "", conduta: "" });
  const [cid, setCid] = useState("");
  const [salvo, setSalvo] = useState<"ok" | "salvando" | "erro">("ok");
  const [erroCarga, setErroCarga] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  // Modelos pessoais (item 16): vivem no localStorage deste aparelho. A
  // leitura é DEPOIS da montagem (mesmo cuidado do IndicadorTelas): ler
  // no inicializador divergia entre servidor e cliente.
  const [modelos, setModelos] = useState<ModeloEvolucao[]>([]);
  const [modeloSel, setModeloSel] = useState("");
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [nomeModelo, setNomeModelo] = useState("");
  useEffect(() => {
    setModelos(carregarModelos());
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const concluida = estado?.evolucao?.status === "concluida";
  // Base/modelos escrevem no rascunho: sem a evolução carregada (ou com a
  // carga em erro), o conteúdo local está vazio e aplicar uma fonte
  // mandaria seções vazias por cima do que está no servidor. Travado.
  const podeMexerModelos = !!estado && !erroCarga;

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

  // Ditado por voz na seção aberta: o trecho entra no FIM do texto da
  // seção (anexa, nunca substitui) e segue o mesmo autosave da digitação.
  const anexarDitado = (trecho: string) => {
    if (aba === "historico" || aba === "documentos") return;
    const atual = textos[aba];
    editar(aba, atual + (atual && !/\s$/.test(atual) ? " " : "") + trecho);
  };

  // Exames com itens começam abertos quando a lista é curta (o comum);
  // recarregar o painel (pedido de medição etc.) não mexe na expansão.
  const examesIniciados = useRef(false);
  useEffect(() => {
    if (!estado || examesIniciados.current) return;
    examesIniciados.current = true;
    if (estado.exames.length <= 5) {
      setExamesAbertos(
        new Set(estado.exames.filter((e) => itensValidos(e.itens).length > 0).map((e) => e.id)),
      );
    }
  }, [estado]);

  const alternarExame = (id: string) => {
    setExamesAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const baixarDocumento = (id: string) => {
    const completo = documentoCompletoPorId.get(id);
    if (!completo) return;
    try {
      gerarDocumentoPDF(completo);
      toast.success("PDF baixado", { description: completo.titulo });
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    }
  };
  const editarCid = (v: string) => {
    setCid(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(textos, v), 1200);
  };

  // ── Reaproveitamento (item 16): base de atendimento anterior + modelos ──
  // Aplicar conteúdo (base ou modelo) usa o MESMO autosave da digitação:
  // atualiza o estado e agenda o salvar em 1,2 s. Nada é concluído.
  const aplicarConteudo = (t: Record<Secao, string>, c: string) => {
    setTextos(t);
    setCid(c);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(t, c), 1200);
  };

  const usarBaseHistorico = (h: Estado["historico"][number]) => {
    // Só evolução do PRÓPRIO médico: a de outro médico é somente leitura
    // (e auditada) — nem o botão aparece nesses cartões.
    const fonte = fonteDoHistorico(h);
    if (!fonte) return;
    const { resultado, aplicou, sobrescreveu } = mesclarConteudo({ textos, cid }, fonte);
    if (!aplicou) return;
    if (
      sobrescreveu &&
      !window.confirm(
        `A evolução atual já tem conduta e/ou CID digitados. Usar o atendimento de ${new Date(h.dataInicio).toLocaleDateString("pt-BR")} como base vai SUBSTITUIR esses trechos pelo texto daquela consulta. As demais seções não mudam e nada é concluído. Continuar?`,
      )
    ) {
      return;
    }
    aplicarConteudo(resultado.textos, resultado.cid);
    setAba("conduta");
    toast.success("Base aplicada ao rascunho", { description: "Conduta e CID copiados — revise e ajuste antes de concluir." });
  };

  const aplicarModeloSelecionado = () => {
    const m = modelos.find((x) => x.id === modeloSel);
    if (!m) return;
    const { resultado, aplicou, sobrescreveu } = mesclarConteudo(
      { textos, cid },
      { textos: m.textos, cid: m.cid },
    );
    if (!aplicou) {
      toast.error("Este modelo está vazio", { description: "Nada foi aplicado." });
      return;
    }
    if (
      sobrescreveu &&
      !window.confirm(
        `A evolução atual já tem trechos que o modelo "${m.nome}" vai substituir (os trechos preenchidos dele). As demais seções não mudam e nada é concluído. Continuar?`,
      )
    ) {
      return;
    }
    aplicarConteudo(resultado.textos, resultado.cid);
    toast.success(`Modelo "${m.nome}" aplicado ao rascunho`);
  };

  const salvarComoModelo = () => {
    if (!nomeModelo.trim()) {
      toast.error("Dê um nome ao modelo", { description: "Ex.: IVAS — retorno em 7 dias." });
      return;
    }
    if (!temConteudo({ textos, cid })) {
      toast.error("A evolução está vazia", { description: "Escreva algo antes de salvar como modelo." });
      return;
    }
    const modelo = novoModelo(nomeModelo, { textos, cid });
    if (!modelo) return;
    const lista = adicionarModelo(modelos, modelo);
    if (!persistirModelos(lista)) {
      toast.error("Não foi possível salvar neste aparelho", { description: "O armazenamento local recusou a gravação." });
      return;
    }
    setModelos(lista);
    setModeloSel(modelo.id);
    setSalvandoModelo(false);
    setNomeModelo("");
    toast.success("Modelo salvo neste aparelho");
  };

  const excluirModeloSelecionado = () => {
    const m = modelos.find((x) => x.id === modeloSel);
    if (!m) return;
    if (!window.confirm(`Excluir o modelo "${m.nome}" deste aparelho?`)) return;
    const lista = removerModelo(modelos, m.id);
    if (!persistirModelos(lista)) {
      toast.error("Não foi possível excluir neste aparelho");
      return;
    }
    setModelos(lista);
    setModeloSel("");
    toast.success("Modelo excluído");
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
        // Botão com RÓTULO VISÍVEL: antes era só um ícone na borda, sem
        // texto — nada na tela dizia que ali ficava a evolução, e só quem
        // conhecia o gesto de borda a encontrava.
        <button
          type="button"
          onClick={onAbrir}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 rounded-l-2xl bg-primary text-primary-foreground px-2 py-4 shadow-lg flex flex-col items-center gap-1"
          aria-label="Abrir evolução"
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[11px] font-bold leading-none">Evolução</span>
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
            <div className="text-xs opacity-70 flex items-center gap-2">
              {concluida ? "Concluída" : salvo === "salvando" ? "Salvando…" : salvo === "erro" ? "Não salvou" : "Rascunho salvo"}
              {salvo === "erro" && !concluida ? (
                // Antes o texto dizia "tente de novo" sem nenhuma ação: o
                // único retry era digitar de novo e esperar o autosave.
                // O botão tenta salvar o conteúdo atual na hora.
                <button
                  type="button"
                  onClick={() => {
                    if (timer.current) clearTimeout(timer.current);
                    void salvar(textos, cid);
                  }}
                  className="underline font-bold"
                >
                  Tentar de novo
                </button>
              ) : null}
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
        {!concluida ? (
          <div className="border-b px-4 py-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold flex items-center gap-1">
                <Bookmark className="w-3.5 h-3.5" /> Modelos
              </span>
              <select
                value={modeloSel}
                onChange={(e) => setModeloSel(e.target.value)}
                className="rounded-full border bg-background px-2 py-1 max-w-[180px]"
                aria-label="Modelo salvo"
              >
                <option value="">Selecione…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
              <button type="button" onClick={aplicarModeloSelecionado} disabled={!modeloSel || !podeMexerModelos}
                className="px-3 py-1 rounded-full border font-bold disabled:opacity-50">
                Aplicar
              </button>
              <button type="button" onClick={excluirModeloSelecionado} disabled={!modeloSel}
                className="p-1.5 rounded-full border disabled:opacity-50" aria-label="Excluir modelo selecionado">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setSalvandoModelo((v) => !v)} disabled={!podeMexerModelos}
                className="px-3 py-1 rounded-full border disabled:opacity-50">
                Salvar atual como modelo
              </button>
            </div>
            {salvandoModelo ? (
              <div className="flex items-center gap-2 text-xs">
                <input
                  value={nomeModelo}
                  onChange={(e) => setNomeModelo(e.target.value)}
                  maxLength={60}
                  placeholder="Nome do modelo (ex.: IVAS — retorno)"
                  className="flex-1 rounded-full border bg-background px-3 py-1"
                  aria-label="Nome do modelo"
                />
                <button type="button" onClick={salvarComoModelo}
                  className="px-3 py-1 rounded-full bg-primary text-primary-foreground font-bold">
                  Salvar
                </button>
                <button type="button" onClick={() => { setSalvandoModelo(false); setNomeModelo(""); }}
                  className="px-3 py-1 rounded-full border">
                  Cancelar
                </button>
              </div>
            ) : null}
            <p className="text-[11px] opacity-60">
              Modelos são atalhos com o texto das suas seções e ficam salvos apenas neste aparelho — não vão para o servidor.
            </p>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {estado && aba === "dados" ? (
            <div className="space-y-2">
              <div>Peso: {estado.paciente.peso ?? "—"} · Altura: {estado.paciente.altura ?? "—"}</div>
              <div>Alergias: {estado.paciente.alergias.join(", ") || "nenhuma"}</div>
              <div>Comorbidades: {estado.paciente.comorbidades.join(", ") || "nenhuma"}</div>
              {/* Medições COM data e unidade: a linha corrida antiga
                  ("peso 80 · pressao 120/80") não dizia quando foi
                  medido — valor sem data não orienta conduta. */}
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wide opacity-70">Últimas medições</div>
                {estado.medicoes.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span>
                      {ROTULO_MEDICAO[m.tipo]?.rotulo ?? m.tipo}{" "}
                      <span className="opacity-60">
                        {new Date(m.criadoEm).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <span className="font-semibold">{textoMedicao(m)}</span>
                  </div>
                ))}
                {estado.medicoes.length === 0 ? (
                  <div className="text-xs opacity-70">Nenhuma medição registrada.</div>
                ) : null}
              </div>
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
            <div className="space-y-2">
              {estado.exames.map((e) => {
                const itens = itensValidos(e.itens);
                const aberto = examesAbertos.has(e.id);
                return (
                  <div key={e.id} className="rounded-2xl border p-3">
                    <button
                      type="button"
                      onClick={() => alternarExame(e.id)}
                      aria-expanded={aberto}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <span className="text-xs font-semibold">
                        {e.titulo} — {new Date(e.dataColeta).toLocaleDateString("pt-BR")}
                      </span>
                      {itens.length > 0 ? (
                        <span className="text-xs opacity-70 flex items-center gap-1 shrink-0">
                          {itens.length} {itens.length === 1 ? "item" : "itens"}
                          {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                      ) : null}
                    </button>
                    {/* Os VALORES do laudo: a API sempre os devolveu, a
                        tela é que mostrava só "título — data". Fora da
                        faixa de referência, o valor ganha destaque. */}
                    {aberto && itens.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs">
                        {itens.map((it, i) => (
                          <li key={`${it.nome}-${i}`} className="flex items-baseline justify-between gap-2">
                            <span>{it.nome}</span>
                            <span className={foraDaFaixa(it) ? "font-bold text-destructive" : "font-semibold"}>
                              {it.valor}
                              {it.unidade ? ` ${it.unidade}` : ""}
                              {typeof it.refMin === "number" || typeof it.refMax === "number" ? (
                                <span className="opacity-60 font-normal">
                                  {" "}
                                  (ref {it.refMin ?? "—"}–{it.refMax ?? "—"})
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              {estado.exames.length === 0 ? <div className="text-xs opacity-70">Nenhum exame.</div> : null}
            </div>
          ) : null}
          {estado && aba === "documentos" ? (
            <div className="space-y-2">
              {/* Documentos que a API já devolvia e o painel descartava
                  (o tipo Estado nem declarava o campo): receitas,
                  atestados e pedidos anteriores consultáveis DURANTE a
                  consulta, sem sair da sala. */}
              {estado.documentos.map((d) => {
                const completo = documentoCompletoPorId.get(d.id);
                return (
                  <div key={d.id} className="rounded-2xl border p-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold">
                        {ROTULO_TIPO_DOC[d.tipo] ?? d.tipo} — {d.titulo}
                      </span>
                      {completo ? (
                        <button
                          type="button"
                          onClick={() => baixarDocumento(d.id)}
                          className="flex items-center gap-1 text-xs font-bold underline shrink-0"
                          aria-label={`Baixar PDF de ${d.titulo}`}
                        >
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                      ) : null}
                    </div>
                    <div className="text-xs opacity-70">
                      {new Date(d.createdAt).toLocaleDateString("pt-BR")} · {d.medico}
                      {d.deOutroMedico ? " (outro médico)" : ""}
                    </div>
                    {d.medicamento ? (
                      <div className="text-xs">
                        {d.medicamento}
                        {d.posologia ? ` — ${d.posologia}` : ""}
                        {d.controlado ? " · controlado" : ""}
                      </div>
                    ) : null}
                    {d.cid ? <div className="text-xs opacity-70">CID {d.cid}</div> : null}
                  </div>
                );
              })}
              {estado.documentos.length === 0 ? (
                <div className="text-xs opacity-70">Nenhum documento anterior.</div>
              ) : null}
            </div>
          ) : null}
          {estado && aba === "medicamentos" ? (
            <ul className="text-xs space-y-1">
              {estado.medicamentosEmUso.map((m) => <li key={m.id}>{m.nome}{m.dose ? ` ${m.dose}` : ""}{m.controlado ? " (controlado)" : ""}</li>)}
              {estado.medicamentosEmUso.length === 0 ? <li className="opacity-70">Nenhum medicamento em uso.</li> : null}
            </ul>
          ) : null}
          {aba !== "historico" && aba !== "documentos" ? (
            <>
              {!concluida ? (
                <div className="flex justify-end">
                  <BotaoDitado onTexto={anexarDitado} rotuloParado="Ditar" />
                </div>
              ) : null}
              <textarea
                value={textos[aba]}
                onChange={(e) => editar(aba, e.target.value)}
                readOnly={concluida}
                rows={8}
                maxLength={8000}
                placeholder={`Anotações de ${ABAS.find((a) => a.id === aba)?.rotulo.toLowerCase()}`}
                className="w-full rounded-2xl border bg-background p-3"
              />
            </>
          ) : null}
          {aba === "conduta" ? (
            <CampoCidBusca valor={cid} onChange={editarCid} readOnly={concluida} maxLength={20}
              placeholder="CID-10 — digite o código ou o diagnóstico" ariaLabel="CID-10"
              className="w-full rounded-2xl border bg-background p-3" />
          ) : null}
          {estado && aba === "historico" ? (
            <div className="space-y-2">
              <div className="text-xs opacity-70 flex items-center gap-1"><Lock className="w-3 h-3" /> Somente leitura. O acesso a consultas de outros médicos fica na Auditoria.</div>
              {estado.historico.map((h) => (
                <div key={h.consultaId} className="rounded-2xl border p-3">
                  <div className="font-semibold">{new Date(h.dataInicio).toLocaleDateString("pt-BR")} · {h.especialidade}</div>
                  <div className="text-xs opacity-70">{h.medico}{h.deOutroMedico ? " (outro médico)" : ""} · anamnese {h.anamnese?.status ?? "—"}</div>
                  {h.evolucao ? <div className="text-xs mt-1 whitespace-pre-wrap">{h.evolucao.conduta?.texto ?? ""}{h.evolucao.cid ? ` · CID ${h.evolucao.cid}` : ""}</div> : null}
                  {/* Reutilizar o PRÓPRIO atendimento anterior como ponto
                      de partida: copia conduta + CID (o que o GET traz
                      das evoluções anteriores) para o rascunho atual.
                      Cartão de outro médico NÃO ganha o botão — aquele
                      histórico é somente leitura. */}
                  {!concluida && !h.deOutroMedico && fonteDoHistorico(h) ? (
                    <button
                      type="button"
                      onClick={() => usarBaseHistorico(h)}
                      className="mt-2 px-3 py-1 rounded-full border text-xs font-bold"
                    >
                      Usar conduta e CID como base
                    </button>
                  ) : null}
                </div>
              ))}
              {estado.historico.length === 0 ? <div className="text-xs opacity-70">Sem outras consultas.</div> : null}
            </div>
          ) : null}
        </div>
        {!concluida ? (
          <footer className="p-4 border-t">
            {erroCarga ? (
              <p className="text-xs text-center opacity-70 mb-2">
                A evolução não carregou —{" "}
                <button type="button" onClick={() => void carregar()} className="underline font-bold">
                  tentar carregar de novo
                </button>{" "}
                antes de concluir.
              </p>
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
