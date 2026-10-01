"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useBion, type Documento } from "@/lib/bion-store";
import { Campo, SheetMedico } from "./SheetMedico";

export type TipoEmissao = Documento["tipo"] | "arquivo";

const ROTULO: Record<TipoEmissao, string> = {
  receita: "Receita",
  atestado: "Atestado",
  exame_solicitado: "Exame",
  arquivo: "Arquivo",
};
const PREFIXO: Record<Documento["tipo"], string> = {
  receita: "Receita",
  atestado: "Atestado",
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
  const { emitirDocumento, adicionarArquivo, sessao } = useBion();
  const [tipo, setTipo] = useState<TipoEmissao>(base?.tipo ?? "receita");
  const [titulo, setTitulo] = useState(base ? tituloBase(base.titulo) : "");
  const [medicamento, setMedicamento] = useState(base?.medicamento ?? "");
  const [posologia, setPosologia] = useState(base?.posologia ?? "");
  const [duracao, setDuracao] = useState(base?.duracao ?? "");
  const [conteudo, setConteudo] = useState(base?.conteudo ?? "");
  const [observacoes, setObservacoes] = useState(base?.observacoes ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [tipoArquivo, setTipoArquivo] = useState("Exame");
  const [erros, setErros] = useState<Record<string, string>>({});

  const salvar = () => {
    const e: Record<string, string> = {};
    if (tipo === "arquivo") {
      if (!arquivo) e.arquivo = "Escolha um arquivo.";
      else if (arquivo.size > ARQUIVO_MAX) e.arquivo = "Arquivo maior que 20 MB.";
      if (nomeArquivo.trim().length < 2) e.nomeArquivo = "Informe um nome para o arquivo.";
      setErros(e);
      if (Object.keys(e).length || !arquivo) return;
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
      onFechar();
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
    emitirDocumento(
      {
        tipo,
        titulo: `${PREFIXO[tipo]} — ${titulo.trim()}`,
        medico: sessao.nome,
        paciente: pacienteNome,
        conteudo: conteudo.trim(),
        ...(tipo === "receita" ? { medicamento: medicamento.trim(), posologia: posologia.trim() } : {}),
        ...(duracao.trim() ? { duracao: duracao.trim() } : {}),
        ...(observacoes.trim() ? { observacoes: observacoes.trim() } : {}),
      },
      pacienteId,
    );
    toast.message("Emitindo documento…", { description: `${PREFIXO[tipo]} para ${pacienteNome}` });
    onFechar();
  };

  const entrada = "bp-entrada w-full px-4 py-2.5 text-sm";

  return (
    <SheetMedico
      aberto
      onFechar={onFechar}
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
          <Campo rotulo="Título" erro={erros.titulo}>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={entrada}
              maxLength={120}
              placeholder={tipo === "receita" ? "Ex.: Tratamento de rinite" : tipo === "atestado" ? "Ex.: Afastamento" : "Ex.: Hemograma completo"}
            />
          </Campo>
          {tipo === "receita" ? (
            <>
              <Campo rotulo="Medicamento" erro={erros.medicamento}>
                <input value={medicamento} onChange={(e) => setMedicamento(e.target.value)} className={entrada} maxLength={200} />
              </Campo>
              <Campo rotulo="Posologia" erro={erros.posologia}>
                <input value={posologia} onChange={(e) => setPosologia(e.target.value)} className={entrada} maxLength={200} />
              </Campo>
            </>
          ) : null}
          {tipo !== "exame_solicitado" ? (
            <Campo rotulo={tipo === "receita" ? "Duração do tratamento" : "Período de afastamento"} erro={erros.duracao}>
              <input value={duracao} onChange={(e) => setDuracao(e.target.value)} className={entrada} maxLength={80} />
            </Campo>
          ) : null}
          <Campo rotulo={tipo === "exame_solicitado" ? "Exames e justificativa" : "Conteúdo"} erro={erros.conteudo}>
            <textarea value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={4} className={`${entrada} !rounded-2xl`} maxLength={4000} />
          </Campo>
          <Campo rotulo="Observações (opcional)" erro={erros.observacoes} ajuda={`${observacoes.length}/500`}>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className={`${entrada} !rounded-2xl`} />
          </Campo>
        </div>
      )}

      <button type="button" onClick={salvar} className="bp-acao w-full py-3 text-sm mt-5">
        {tipo === "arquivo" ? "Enviar arquivo" : base ? "Emitir renovação" : `Emitir ${ROTULO[tipo].toLowerCase()}`}
      </button>
    </SheetMedico>
  );
}
