"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useBion, type Documento } from "@/lib/bion-store";
import { gerarConteudoDocumento } from "@/lib/conteudo-documento";
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
          {tipo === "receita" ? (
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
              <input value={cid} onChange={(e) => setCid(e.target.value)} className={entrada} maxLength={20} placeholder="Ex.: J30.1" />
            </Campo>
          ) : null}
          {tipo !== "exame_solicitado" ? (
            <Campo rotulo={tipo === "receita" ? "Duração do tratamento" : "Período de afastamento"} erro={erros.duracao}>
              <input value={duracao} onChange={(e) => setDuracao(e.target.value)} className={entrada} maxLength={80} />
            </Campo>
          ) : null}
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
      <button type="button" onClick={salvar} disabled={emitindo} className="bp-acao w-full py-3 text-sm mt-5 disabled:opacity-50">
        {emitindo
          ? "Emitindo…"
          : tipo === "arquivo"
            ? "Enviar arquivo"
            : base
              ? "Emitir renovação"
              : `Emitir ${ROTULO[tipo].toLowerCase()}`}
      </button>
    </SheetMedico>
  );
}
