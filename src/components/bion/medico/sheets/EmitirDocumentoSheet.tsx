"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useBion, type Documento } from "@/lib/bion-store";
import { gerarConteudoDocumento } from "@/lib/conteudo-documento";
import { gerarDocumentoPDF, gerarReceitaCombinadaPDF } from "@/lib/receita-pdf";
import { ultimaReceitaDoPaciente } from "@/lib/documentos-agrupados";
import { frequentesDoMedico, type SugestaoMedicamento } from "@/lib/catalogo-medicamentos";
import type { KitReceita, PacoteExames } from "@/lib/kits-prescricao";
import {
  AlertasPrescricao,
  BannerAlergias,
  CampoMedicamentoBusca,
  SecaoKitsReceita,
  SecaoPacotesExames,
  useDadosSegurancaPaciente,
} from "../prescricao-assistida";
import { Campo, SheetMedico } from "./SheetMedico";
import { CampoCidBusca } from "../campo-cid-busca";

export type TipoEmissao = Documento["tipo"] | "arquivo";

const ROTULO: Record<TipoEmissao, string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame: "Exame",
  exame_solicitado: "Exame",
  arquivo: "Arquivo",
};
const PREFIXO: Record<Documento["tipo"], string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame: "Solicitação de exame",
  exame_solicitado: "Solicitação de exame",
};
const ARQUIVO_MAX = 20 * 1024 * 1024; // limite do POST /api/arquivos

/** Remove o prefixo "Receita — " para reaproveitar o título ao renovar. */
const tituloBase = (t: string) => t.replace(/^(Receita|Atestado|Solicitação de exame)\s+—\s+/, "");

/** Item 25 — receita agrupada: uma linha editável por medicamento. */
type LinhaReceita = {
  chave: number;
  medicamento: string;
  posologia: string;
  duracao: string;
  controlado: boolean;
};

/**
 * Estado de uma emissão agrupada em andamento/concluída: o snapshot das
 * linhas disparadas e, por chave de linha, o Documento confirmado de
 * volta no store. A confirmação é por correspondência (medicamento),
 * nunca presumida — fase "parcial" = o prazo estourou com linhas sem
 * documento correspondente, e a folha mostra exatamente quais faltam.
 */
type EmissaoGrupo = {
  tituloCompleto: string;
  linhas: LinhaReceita[];
  antes: Set<string>;
  confirmadas: Map<number, Documento>;
  fase: "emitindo" | "parcial" | "completa";
};

/**
 * Emissão para UM paciente identificado por id (nunca por nome).
 * Renovação: pré-preenche a partir de uma receita anterior.
 */
export function EmitirDocumentoSheet({
  onFechar,
  pacienteId,
  pacienteNome,
  consultaId,
  base,
}: {
  onFechar: () => void;
  pacienteId: string;
  pacienteNome: string;
  consultaId?: string;
  base?: Documento;
}) {
  const { emitirDocumento, adicionarArquivo, sessao, documentos, arquivos } = useBion();
  // Prescrição assistida (melhorias nº 14–16): segurança do paciente pelo
  // GET da evolução da consulta de referência (o mesmo caminho do cartão
  // clínico da sala) e os frequentes do próprio médico, dos documentos
  // dele no store. Sem consulta identificada, dadosSeguranca fica null e
  // banner/alertas simplesmente não aparecem.
  const dadosSeguranca = useDadosSegurancaPaciente(consultaId);
  const frequentes = useMemo(() => frequentesDoMedico(documentos, sessao.nome), [documentos, sessao.nome]);
  const medicoKitsId = sessao.id || sessao.email || sessao.nome;

  const aplicarSugestaoMedicamento = (s: SugestaoMedicamento) => {
    setMedicamento(s.nome);
    if (s.posologia) setPosologia(s.posologia);
    if (s.duracao) setDuracao(s.duracao);
    if (s.controlado) setControlado(true);
  };
  const aplicarKitReceita = (k: KitReceita) => {
    setMedicamento(k.medicamento);
    setPosologia(k.posologia);
    setDuracao(k.duracao);
    setControlado(k.controlado);
    toast.success(`Kit "${k.nome}" aplicado`, { description: "Confira os campos antes de emitir." });
  };
  const aplicarPacoteExames = (p: PacoteExames) => {
    // A lista vai para o CONTEÚDO (o título do servidor corta em 160
    // caracteres; a lista completa de um pacote passaria disso). Marcar
    // como manual protege a lista da regeneração automática pelo título.
    setConteudo(`Solicito a realização de: ${p.exames}.`);
    setConteudoManual(true);
    if (!titulo.trim()) setTitulo(p.nome);
    toast.success(`Pacote "${p.nome}" aplicado`, { description: "Confira a lista de exames antes de emitir." });
  };
  // "exame" é o tipo legado (B-15): renovação de documento antigo desse tipo
  // emite como "exame_solicitado" (o seletor nunca oferece "exame").
  const [tipo, setTipo] = useState<TipoEmissao>(base?.tipo === "exame" ? "exame_solicitado" : (base?.tipo ?? "receita"));
  const [titulo, setTitulo] = useState(base ? tituloBase(base.titulo) : "");
  const [medicamento, setMedicamento] = useState(base?.medicamento ?? "");
  const [posologia, setPosologia] = useState(base?.posologia ?? "");
  // P1 (auditoria de melhorias): a folha NÃO enviava controlado nem CID —
  // receita de controlado emitida por aqui nascia controlado=false e ficava
  // elegível à renovação curta que o sistema bloqueia para controlados.
  // A API aceita os dois campos e a UI clássica (Receitas.tsx) tem o
  // interruptor; aqui eles passam a existir e ir no payload.
  const [controlado, setControlado] = useState(base?.controlado ?? false);
  const [cid, setCid] = useState(base?.cid ?? "");
  const [duracao, setDuracao] = useState(base?.duracao ?? "");
  const [conteudo, setConteudo] = useState(base?.conteudo ?? "");
  // Melhoria nº 5 (auditoria médica): o conteúdo nasce dos campos já
  // preenchidos (lib/conteudo-documento) e é regenerado enquanto o médico
  // não tocar no texto — a primeira edição manual torna o texto dele e a
  // geração automática para de sobrescrever. Com `base` (renovação), o
  // texto pré-preenchido é o documento anterior INTEIRO: nasce protegido
  // como "manual", senão trocar um campo apagaria o texto herdado.
  const [conteudoManual, setConteudoManual] = useState(!!base?.conteudo);
  useEffect(() => {
    if (conteudoManual || tipo === "arquivo") return;
    setConteudo(gerarConteudoDocumento({ tipo, titulo, medicamento, posologia, duracao, cid, pacienteNome }));
  }, [conteudoManual, tipo, titulo, medicamento, posologia, duracao, cid, pacienteNome]);
  const [observacoes, setObservacoes] = useState(base?.observacoes ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [tipoArquivo, setTipoArquivo] = useState("Exame");
  const [erros, setErros] = useState<Record<string, string>>({});
  // Emissão confirmada, não "disparada e esquecida": emitirDocumento e
  // adicionarArquivo não devolvem o resultado (interface void), então a
  // confirmação é o item novo na lista (delta do servidor). Enquanto não
  // chega, o botão fica em "Emitindo…" e a folha NÃO fecha — em falha, ela
  // fica aberta com erro + retry, em vez de fechar fingindo sucesso.
  const [emitindo, setEmitindo] = useState(false);
  const [erroEmitir, setErroEmitir] = useState<string | null>(null);
  const pendenteRef = useRef<
    | { tipo: "documento"; titulo: string; antes: Set<string> }
    | { tipo: "arquivo"; nome: string; antes: Set<string> }
    | null
  >(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Item 25 — receita agrupada (vários medicamentos, um Documento por
  // linha, sem mudar o schema) e "repetir última receita".
  const [agrupado, setAgrupado] = useState(false);
  const [linhas, setLinhas] = useState<LinhaReceita[]>([
    { chave: 1, medicamento: "", posologia: "", duracao: "", controlado: false },
  ]);
  const [grupo, setGrupo] = useState<EmissaoGrupo | null>(null);
  const chaveLinhaRef = useRef(1);
  const grupoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ultimaReceita = useMemo(
    () => (tipo === "receita" && !base ? ultimaReceitaDoPaciente(documentos, pacienteId, sessao.nome) : null),
    [documentos, pacienteId, sessao.nome, tipo, base],
  );

  const aguardarConfirmacao = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!pendenteRef.current) return;
      pendenteRef.current = null;
      setEmitindo(false);
      setErroEmitir("Não foi possível confirmar a emissão. Verifique sua conexão e toque em Emitir novamente.");
    }, 12_000);
  };

  useEffect(() => {
    const p = pendenteRef.current;
    if (!emitindo || !p) return;
    const chegou =
      p.tipo === "documento"
        ? documentos.some((d) => !p.antes.has(d.id) && d.titulo.trim() === p.titulo.trim())
        : arquivos.some((a) => !p.antes.has(a.id) && a.nome.trim() === p.nome.trim());
    if (chegou) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pendenteRef.current = null;
      setEmitindo(false);
      toast.success(p.tipo === "documento" ? "Documento emitido" : "Arquivo enviado");
      onFechar();
    }
  }, [documentos, arquivos, emitindo, onFechar]);

  // ── Item 25: emissão agrupada ──────────────────────────────────────
  const atualizarLinha = (chave: number, patch: Partial<LinhaReceita>) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...patch } : l)));

  const alternarAgrupado = (ligar: boolean) => {
    if (ligar) {
      // A primeira linha herda o que já foi digitado no modo simples.
      setLinhas([{ chave: ++chaveLinhaRef.current, medicamento, posologia, duracao, controlado }]);
    } else {
      const primeira = linhas[0];
      if (primeira) {
        setMedicamento(primeira.medicamento);
        setPosologia(primeira.posologia);
        setDuracao(primeira.duracao);
        setControlado(primeira.controlado);
      }
    }
    setAgrupado(ligar);
  };

  const aplicarRepetir = () => {
    const itens = ultimaReceita;
    if (!itens?.length) return;
    const primeira = itens[0];
    setTitulo(tituloBase(primeira.titulo));
    if (primeira.cid) setCid(primeira.cid);
    if (primeira.observacoes) setObservacoes(primeira.observacoes);
    if (itens.length === 1 && !agrupado) {
      setMedicamento(primeira.medicamento ?? "");
      setPosologia(primeira.posologia ?? "");
      setDuracao(primeira.duracao ?? "");
      setControlado(primeira.controlado ?? false);
      // O texto volta a ser gerado dos campos repetidos (o conteúdo da
      // receita anterior não é copiado palavra por palavra).
      setConteudoManual(false);
    } else {
      setAgrupado(true);
      setLinhas(
        itens.map((d) => ({
          chave: ++chaveLinhaRef.current,
          medicamento: d.medicamento ?? "",
          posologia: d.posologia ?? "",
          duracao: d.duracao ?? "",
          controlado: d.controlado ?? false,
        })),
      );
    }
    toast.success("Última receita carregada", { description: "Confira todos os campos antes de emitir." });
  };

  /** Dispara as linhas ainda não confirmadas e passa a vigiá-las no store. */
  const dispararLinhas = (
    alvo: LinhaReceita[],
    antes: Set<string>,
    confirmadasBase: Map<number, Documento>,
    tituloCompleto: string,
  ) => {
    setGrupo({ tituloCompleto, linhas: alvo, antes, confirmadas: new Map(confirmadasBase), fase: "emitindo" });
    setEmitindo(true);
    for (const linha of alvo) {
      if (confirmadasBase.has(linha.chave)) continue;
      emitirDocumento(
        {
          tipo: "receita",
          titulo: tituloCompleto,
          medico: sessao.nome,
          paciente: pacienteNome,
          conteudo: gerarConteudoDocumento({
            tipo: "receita",
            medicamento: linha.medicamento,
            posologia: linha.posologia,
            duracao: linha.duracao,
            cid,
          }),
          medicamento: linha.medicamento.trim(),
          posologia: linha.posologia.trim(),
          controlado: linha.controlado,
          ...(cid.trim() ? { cid: cid.trim() } : {}),
          ...(linha.duracao.trim() ? { duracao: linha.duracao.trim() } : {}),
          ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
          ...(consultaId ? { consultaId } : {}),
        },
        pacienteId,
      );
    }
    if (grupoTimeoutRef.current) clearTimeout(grupoTimeoutRef.current);
    const pendentes = alvo.filter((l) => !confirmadasBase.has(l.chave)).length;
    grupoTimeoutRef.current = setTimeout(() => {
      // Prazo estourou: o que não foi confirmado vira "parcial" — a
      // folha mostra quais linhas faltam, sem fingir sucesso total.
      setGrupo((g) => (g && g.fase === "emitindo" ? { ...g, fase: "parcial" } : g));
      setEmitindo(false);
    }, 12_000 + 6_000 * Math.max(0, pendentes - 1));
  };

  // Confirmação da emissão agrupada: casa cada documento novo (mesmo
  // paciente e título) com a linha de mesmo medicamento, na ordem — duas
  // linhas com o mesmo medicamento casam com dois documentos distintos.
  useEffect(() => {
    if (!grupo || grupo.fase !== "emitindo") return;
    const novas = documentos.filter(
      (d) =>
        !grupo.antes.has(d.id) &&
        d.pacienteId === pacienteId &&
        d.tipo === "receita" &&
        d.titulo === grupo.tituloCompleto,
    );
    if (!novas.length) return;
    const usadas = new Set([...grupo.confirmadas.values()].map((d) => d.id));
    const livres = novas.filter((d) => !usadas.has(d.id));
    const confirmadas = new Map(grupo.confirmadas);
    let mudou = false;
    for (const linha of grupo.linhas) {
      if (confirmadas.has(linha.chave)) continue;
      const idx = livres.findIndex(
        (d) => (d.medicamento ?? "").trim().toLowerCase() === linha.medicamento.trim().toLowerCase(),
      );
      if (idx >= 0) {
        confirmadas.set(linha.chave, livres[idx]);
        livres.splice(idx, 1);
        mudou = true;
      }
    }
    if (!mudou) return;
    const completa = confirmadas.size >= grupo.linhas.length;
    if (completa && grupoTimeoutRef.current) clearTimeout(grupoTimeoutRef.current);
    setGrupo({ ...grupo, confirmadas, fase: completa ? "completa" : "emitindo" });
    if (completa) {
      setEmitindo(false);
      toast.success(`Receita emitida com ${grupo.linhas.length} medicamentos`);
    }
  }, [documentos, grupo, pacienteId]);

  const salvarGrupo = () => {
    const e: Record<string, string> = {};
    if (titulo.trim().length < 3) e.titulo = "Informe um título com pelo menos 3 caracteres.";
    if (observacoes.length > 500) e.observacoes = "Máximo de 500 caracteres.";
    for (const linha of linhas) {
      if (linha.medicamento.trim().length < 2) e[`linha-${linha.chave}-medicamento`] = "Informe o medicamento.";
      if (linha.posologia.trim().length < 3) e[`linha-${linha.chave}-posologia`] = "Informe a posologia (ex.: 1 comprimido ao dia).";
      if (linha.duracao.trim().length < 1) e[`linha-${linha.chave}-duracao`] = "Informe a duração do tratamento.";
      // O texto de cada item é gerado dos campos (como no modo simples):
      // sem os campos mínimos, a frase gerada ficaria curta demais.
      const gerado = gerarConteudoDocumento({
        tipo: "receita",
        medicamento: linha.medicamento,
        posologia: linha.posologia,
        duracao: linha.duracao,
        cid,
      });
      if (linha.medicamento.trim().length >= 2 && gerado.trim().length < 10)
        e[`linha-${linha.chave}-posologia`] = "Complete a posologia para gerar o texto do item.";
    }
    setErros(e);
    if (Object.keys(e).length) return;
    setErroEmitir(null);
    if (grupo?.fase === "parcial") {
      // Retry honesto: só as linhas que faltam, sob o MESMO título da
      // emissão original (os já emitidos não são duplicados).
      const idsConfirmadas = new Set([...grupo.confirmadas.values()].map((d) => d.id));
      const antes = new Set(documentos.filter((d) => !idsConfirmadas.has(d.id)).map((d) => d.id));
      dispararLinhas(linhas, antes, grupo.confirmadas, grupo.tituloCompleto);
    } else {
      dispararLinhas(linhas, new Set(documentos.map((d) => d.id)), new Map(), `${PREFIXO.receita} — ${titulo.trim()}`);
    }
  };

  const salvar = () => {
    const e: Record<string, string> = {};
    if (tipo === "arquivo") {
      if (!arquivo) e.arquivo = "Escolha um arquivo.";
      else if (arquivo.size > ARQUIVO_MAX) e.arquivo = "Arquivo maior que 20 MB.";
      if (nomeArquivo.trim().length < 2) e.nomeArquivo = "Informe um nome para o arquivo.";
      setErros(e);
      if (Object.keys(e).length || !arquivo) return;
      setErroEmitir(null);
      setEmitindo(true);
      pendenteRef.current = { tipo: "arquivo", nome: nomeArquivo.trim(), antes: new Set(arquivos.map((a) => a.id)) };
      adicionarArquivo({
        nome: nomeArquivo.trim(),
        tipo: tipoArquivo,
        tamanhoKb: Math.max(1, Math.round(arquivo.size / 1024)),
        enviadoPor: "medico",
        consulta: "",
        pacienteId,
        ...(consultaId ? { consultaId } : {}),
        file: arquivo,
      });
      aguardarConfirmacao();
      return;
    }
    // Item 25: receita agrupada tem validação e emissão próprias.
    if (tipo === "receita" && agrupado) {
      salvarGrupo();
      return;
    }
    if (titulo.trim().length < 3) e.titulo = "Informe um título com pelo menos 3 caracteres.";
    if (tipo === "receita" && medicamento.trim().length < 2) e.medicamento = "Informe o medicamento.";
    if (tipo === "receita" && posologia.trim().length < 3) e.posologia = "Informe a posologia (ex.: 1 comprimido ao dia).";
    if (tipo !== "exame_solicitado" && duracao.trim().length < 1)
      e.duracao = tipo === "receita" ? "Informe a duração do tratamento." : "Informe o período de afastamento.";
    if (conteudo.trim().length < 10) e.conteudo = "Descreva o documento com pelo menos 10 caracteres.";
    if (observacoes.length > 500) e.observacoes = "Máximo de 500 caracteres.";
    setErros(e);
    if (Object.keys(e).length) return;
    setErroEmitir(null);
    setEmitindo(true);
    pendenteRef.current = {
      tipo: "documento",
      titulo: `${PREFIXO[tipo]} — ${titulo.trim()}`,
      antes: new Set(documentos.map((d) => d.id)),
    };
    emitirDocumento(
      {
        tipo,
        titulo: `${PREFIXO[tipo]} — ${titulo.trim()}`,
        medico: sessao.nome,
        paciente: pacienteNome,
        conteudo: conteudo.trim(),
        ...(tipo === "receita" ? { medicamento: medicamento.trim(), posologia: posologia.trim(), controlado } : {}),
        ...(cid.trim() ? { cid: cid.trim() } : {}),
        ...(duracao.trim() ? { duracao: duracao.trim() } : {}),
        ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
        // B-12: documento fica vinculado à consulta em que foi emitido (o
        // prontuário e a conversa agrupam por consulta; antes só o ramo de
        // arquivo levava a consulta).
        ...(consultaId ? { consultaId } : {}),
      },
      pacienteId,
    );
    aguardarConfirmacao();
  };

  const entrada = "bp-entrada w-full px-4 py-2.5 text-sm";

  return (
    <SheetMedico
      aberto
      onFechar={emitindo ? () => {} : onFechar}
      titulo={base ? "Renovar receita" : "Emitir para o paciente"}
      subtitulo={`Paciente: ${pacienteNome}`}
    >
      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-bion-ink/8 dark:bg-white/10 mb-4">
        {(Object.keys(ROTULO) as TipoEmissao[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => {
              setTipo(t);
              // Como na UI clássica: controlado só existe para receita.
              if (t !== "receita") setControlado(false);
              setErros({});
            }}
            className={`py-2 rounded-xl text-xs font-bold ${
              tipo === t ? "bg-white text-bion-ink shadow dark:bg-zinc-800 dark:text-white" : "text-bion-ink/80 dark:text-bion-paper/80"
            }`}
          >
            {ROTULO[t]}
          </button>
        ))}
      </div>

      {tipo === "arquivo" ? (
        <div className="space-y-3">
          <Campo rotulo="Arquivo" erro={erros.arquivo} ajuda="Até 20 MB. Fica visível para o paciente.">
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setArquivo(f);
                if (f && !nomeArquivo) setNomeArquivo(f.name);
              }}
              className="block w-full text-sm"
            />
          </Campo>
          <Campo rotulo="Nome" erro={erros.nomeArquivo}>
            <input value={nomeArquivo} onChange={(e) => setNomeArquivo(e.target.value)} className={entrada} maxLength={120} />
          </Campo>
          <Campo rotulo="Tipo">
            <select value={tipoArquivo} onChange={(e) => setTipoArquivo(e.target.value)} className={entrada}>
              {["Exame", "Laudo", "Imagem", "Documento"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
        </div>
      ) : (
        <div className="space-y-3">
          <BannerAlergias alergias={dadosSeguranca?.alergias} />
          <Campo rotulo="Título" erro={erros.titulo}>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={entrada}
              maxLength={120}
              placeholder={tipo === "receita" ? "Ex.: Tratamento de rinite" : tipo === "atestado" ? "Ex.: Afastamento" : "Ex.: Hemograma completo"}
            />
          </Campo>
          {tipo === "exame_solicitado" ? (
            <SecaoPacotesExames medicoId={medicoKitsId} atualExames={titulo} onAplicar={aplicarPacoteExames} />
          ) : null}
          {tipo === "receita" && !base ? (
            <div className="space-y-2">
              {ultimaReceita ? (
                <button
                  type="button"
                  onClick={aplicarRepetir}
                  disabled={!!grupo}
                  className="text-xs font-bold text-primary disabled:opacity-50"
                >
                  Repetir última receita deste paciente ({ultimaReceita.length}{" "}
                  {ultimaReceita.length === 1 ? "medicamento" : "medicamentos"})
                </button>
              ) : null}
              <label className="flex items-start gap-3 rounded-2xl border border-bion-ink/10 dark:border-white/10 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Vários medicamentos nesta receita"
                  checked={agrupado}
                  disabled={!!grupo}
                  onChange={(e) => alternarAgrupado(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium">Vários medicamentos nesta receita</span>
                  <span className="block text-xs opacity-70 mt-0.5">
                    Um documento por medicamento, emitidos numa única ação, com uma via
                    combinada em PDF para o paciente.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          {tipo === "receita" && agrupado ? (
            <div className="space-y-3">
              {linhas.map((linha, i) => {
                const conf = grupo?.confirmadas.get(linha.chave);
                if (conf) {
                  return (
                    <div
                      key={linha.chave}
                      className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 space-y-1"
                    >
                      <p className="text-sm font-bold">✓ {conf.medicamento} — emitido</p>
                      <p className="text-xs opacity-70">
                        {conf.posologia}
                        {conf.duracao ? ` • ${conf.duracao}` : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => gerarDocumentoPDF(conf)}
                        className="text-xs font-bold text-primary"
                      >
                        Baixar PDF deste item
                      </button>
                    </div>
                  );
                }
                if (grupo?.fase === "emitindo") {
                  return (
                    <div
                      key={linha.chave}
                      className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-4 py-3"
                    >
                      <p className="text-sm font-medium">
                        {linha.medicamento || `Medicamento ${i + 1}`} — aguardando confirmação…
                      </p>
                    </div>
                  );
                }
                return (
                  <div
                    key={linha.chave}
                    className="rounded-2xl border border-bion-ink/10 dark:border-white/10 px-4 py-3 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-wide opacity-60">
                        Medicamento {i + 1}
                      </p>
                      {linhas.length > 1 && !grupo ? (
                        <button
                          type="button"
                          onClick={() => setLinhas((ls) => ls.filter((l) => l.chave !== linha.chave))}
                          className="text-xs font-bold text-red-500"
                        >
                          Remover
                        </button>
                      ) : null}
                    </div>
                    <Campo rotulo="Medicamento" erro={erros[`linha-${linha.chave}-medicamento`]}>
                      <CampoMedicamentoBusca
                        valor={linha.medicamento}
                        onChange={(v) => atualizarLinha(linha.chave, { medicamento: v })}
                        onSelecionar={(s) =>
                          atualizarLinha(linha.chave, {
                            medicamento: s.nome,
                            ...(s.posologia ? { posologia: s.posologia } : {}),
                            ...(s.duracao ? { duracao: s.duracao } : {}),
                            ...(s.controlado ? { controlado: true } : {}),
                          })
                        }
                        frequentes={frequentes}
                        className={entrada}
                        maxLength={200}
                        ariaLabel={`Medicamento ${i + 1}`}
                        placeholder="Busque pelo nome — frequentes e catálogo"
                      />
                    </Campo>
                    <Campo rotulo="Posologia" erro={erros[`linha-${linha.chave}-posologia`]}>
                      <input
                        value={linha.posologia}
                        onChange={(e) => atualizarLinha(linha.chave, { posologia: e.target.value })}
                        className={entrada}
                        maxLength={200}
                      />
                    </Campo>
                    <Campo rotulo="Duração do tratamento" erro={erros[`linha-${linha.chave}-duracao`]}>
                      <input
                        value={linha.duracao}
                        onChange={(e) => atualizarLinha(linha.chave, { duracao: e.target.value })}
                        className={entrada}
                        maxLength={80}
                      />
                    </Campo>
                    <AlertasPrescricao medicamento={linha.medicamento} dados={dadosSeguranca} />
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Medicamento ${i + 1} controlado`}
                        checked={linha.controlado}
                        onChange={(e) => atualizarLinha(linha.chave, { controlado: e.target.checked })}
                        className="h-4 w-4 shrink-0"
                      />
                      <span className="text-sm font-medium">Medicamento controlado</span>
                    </label>
                  </div>
                );
              })}
              {!grupo ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setLinhas((ls) => [
                        ...ls,
                        { chave: ++chaveLinhaRef.current, medicamento: "", posologia: "", duracao: "", controlado: false },
                      ])
                    }
                    className="w-full rounded-2xl border border-dashed border-bion-ink/20 dark:border-white/20 py-2.5 text-sm font-bold"
                  >
                    + Adicionar medicamento
                  </button>
                  <SecaoKitsReceita
                    medicoId={medicoKitsId}
                    atual={{
                      medicamento: linhas[0]?.medicamento ?? "",
                      posologia: linhas[0]?.posologia ?? "",
                      duracao: linhas[0]?.duracao ?? "",
                      controlado: linhas[0]?.controlado ?? false,
                    }}
                    onAplicar={(kit) =>
                      setLinhas((ls) => [
                        ...ls,
                        {
                          chave: ++chaveLinhaRef.current,
                          medicamento: kit.medicamento,
                          posologia: kit.posologia,
                          duracao: kit.duracao,
                          controlado: kit.controlado,
                        },
                      ])
                    }
                  />
                </>
              ) : null}
              <p className="text-xs opacity-70">
                Cada medicamento vira um documento próprio, emitido nesta mesma ação. O texto de
                cada item é gerado dos campos, como no modo simples.
              </p>
            </div>
          ) : null}
          {tipo === "receita" && !agrupado ? (
            <>
              <Campo rotulo="Medicamento" erro={erros.medicamento}>
                <CampoMedicamentoBusca
                  valor={medicamento}
                  onChange={setMedicamento}
                  onSelecionar={aplicarSugestaoMedicamento}
                  frequentes={frequentes}
                  className={entrada}
                  maxLength={200}
                  ariaLabel="Medicamento"
                  placeholder="Busque pelo nome — frequentes e catálogo"
                />
              </Campo>
              <Campo rotulo="Posologia" erro={erros.posologia}>
                <input value={posologia} onChange={(e) => setPosologia(e.target.value)} className={entrada} maxLength={200} />
              </Campo>
              <AlertasPrescricao medicamento={medicamento} dados={dadosSeguranca} />
              <label className="flex items-start gap-3 rounded-2xl border border-bion-ink/10 dark:border-white/10 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Medicamento controlado"
                  checked={controlado}
                  onChange={(e) => setControlado(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium">Medicamento controlado</span>
                  <span className="block text-xs opacity-70 mt-0.5">
                    Receitas de medicamentos controlados só podem ser renovadas numa
                    chamada com o médico, não pela renovação curta.
                  </span>
                </span>
              </label>
              <SecaoKitsReceita
                medicoId={medicoKitsId}
                atual={{ medicamento, posologia, duracao, controlado }}
                onAplicar={aplicarKitReceita}
              />
            </>
          ) : null}
          {tipo === "receita" || tipo === "atestado" ? (
            <Campo rotulo="CID (opcional)" ajuda="Ex.: J30.1 — fica gravado no documento e impresso no PDF.">
              <CampoCidBusca valor={cid} onChange={setCid} className={entrada} maxLength={20} placeholder="Ex.: J30.1 ou “sinusite”" ariaLabel="CID" />
            </Campo>
          ) : null}
          {tipo !== "exame_solicitado" && !agrupado ? (
            <Campo rotulo={tipo === "receita" ? "Duração do tratamento" : "Período de afastamento"} erro={erros.duracao}>
              <input value={duracao} onChange={(e) => setDuracao(e.target.value)} className={entrada} maxLength={80} />
            </Campo>
          ) : null}
          {!agrupado ? (
            <Campo
              rotulo={tipo === "exame_solicitado" ? "Exames e justificativa" : "Conteúdo"}
              erro={erros.conteudo}
              ajuda={conteudoManual ? undefined : "Gerado automaticamente a partir dos campos acima — você pode editar."}
            >
              <textarea
                value={conteudo}
                onChange={(e) => {
                  setConteudo(e.target.value);
                  setConteudoManual(true);
                }}
                rows={4}
                className={`${entrada} !rounded-2xl`}
                maxLength={4000}
              />
            </Campo>
          ) : null}
          <Campo rotulo="Observações (opcional)" erro={erros.observacoes} ajuda={`${observacoes.length}/500`}>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={500} className={`${entrada} !rounded-2xl`} />
          </Campo>
        </div>
      )}

      {erroEmitir ? (
        <p className="text-sm font-semibold text-red-700 dark:text-red-400 mt-5" role="alert">
          {erroEmitir}
        </p>
      ) : null}
      {grupo?.fase === "completa" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">
            Receita emitida com {grupo.linhas.length} medicamentos — todos confirmados.
          </p>
          <button
            type="button"
            onClick={() =>
              gerarReceitaCombinadaPDF(
                grupo.linhas
                  .map((l) => grupo.confirmadas.get(l.chave))
                  .filter((d): d is Documento => !!d),
              )
            }
            className="bp-acao w-full py-3 text-sm"
          >
            Baixar PDF combinado
          </button>
          <button type="button" onClick={onFechar} className="w-full py-3 text-sm font-bold">
            Concluir
          </button>
        </div>
      ) : grupo?.fase === "parcial" ? (
        <div className="mt-5 space-y-3">
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm" role="alert">
            <p className="font-bold">Emissão parcial — nem todos os itens foram confirmados.</p>
            <p className="mt-1">
              Emitidos: {[...grupo.confirmadas.values()].map((d) => d.medicamento).join(", ") || "nenhum"}.
            </p>
            <p className="mt-1">
              Ainda pendentes:{" "}
              {grupo.linhas
                .filter((l) => !grupo.confirmadas.has(l.chave))
                .map((l) => l.medicamento || "(sem nome)")
                .join(", ")}
              . Ajuste as linhas pendentes, se precisar, e emita só os restantes — os já emitidos
              não são duplicados.
            </p>
          </div>
          <button
            type="button"
            onClick={salvar}
            disabled={emitindo}
            className="bp-acao w-full py-3 text-sm disabled:opacity-50"
          >
            Emitir os restantes ({grupo.linhas.length - grupo.confirmadas.size})
          </button>
          <button type="button" onClick={onFechar} className="w-full py-2 text-sm font-bold opacity-70">
            Fechar mesmo assim
          </button>
        </div>
      ) : (
        <button type="button" onClick={salvar} disabled={emitindo} className="bp-acao w-full py-3 text-sm mt-5 disabled:opacity-50">
          {emitindo
            ? "Emitindo…"
            : tipo === "arquivo"
              ? "Enviar arquivo"
              : base
                ? "Emitir renovação"
                : agrupado && tipo === "receita"
                  ? `Emitir receita com ${linhas.length} medicamento${linhas.length > 1 ? "s" : ""}`
                  : `Emitir ${ROTULO[tipo].toLowerCase()}`}
        </button>
      )}
    </SheetMedico>
  );
}
