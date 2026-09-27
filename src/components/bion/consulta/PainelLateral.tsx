"use client";

import {
  FileText,
  Download,
  Upload,
  Sparkles,
  Send,
} from "lucide-react";
import type { AnamneseResumo } from "@/lib/bion-store";
import { ROTULOS_ANAMNESE } from "@/components/bion/consulta/rotulos-anamnese";

type Role = "paciente" | "medico" | "admin";
type Aba = "prontuario" | "anamnese" | "exames" | "chat" | "ia";

export type ConsultaPainelLateralProps = {
  role: Role;
  aba: Aba;
  setAba: (a: Aba) => void;
  anamneseAtual?: AnamneseResumo;
  contraparteNome: string;
  sessaoNome: string;
  dadosPaciente?: { idade?: number | string; genero?: string } | null;
  anotacoes: string;
  setAnotacoes: (v: string) => void;
  arquivos: { id?: string; nome: string; tipo?: string; tamanhoKb?: number; enviadoPor?: string }[];
  chatMsgs: { id?: string; texto: string; minha?: boolean; hora?: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  enviarChat: () => void;
  onAnexarExame: () => void;
};

export function ConsultaPainelLateral({
  role,
  aba,
  setAba,
  anamneseAtual,
  contraparteNome,
  sessaoNome,
  dadosPaciente,
  anotacoes,
  setAnotacoes,
  arquivos,
  chatMsgs,
  chatInput,
  setChatInput,
  enviarChat,
  onAnexarExame,
}: ConsultaPainelLateralProps) {
  return (
  {/* Painel Lateral — abaixo do vídeo no celular, ao lado no desktop */}
  <div className="w-full lg:w-96 lg:shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-900/95 flex flex-col min-w-0">
    {/* Abas */}
    <div className="flex border-b border-white/10 text-xs font-bold overflow-x-auto bp-coluna">
      {(
        [
          ["prontuario", "Prontuário"],
          ...(anamneseAtual ? [["anamnese", "Anamnese"]] : []),
          ["exames", "Exames"],
          ["chat", "Chat"],
          ["ia", "IA Transcrição"],
        ] as (["prontuario", "Prontuário"] | ["anamnese", "Anamnese"] | ["exames", "Exames"] | ["chat", "Chat"] | ["ia", "IA Transcrição"])[]
      ).map(([k, t]) => (
        <button type="button"
          key={k}
          onClick={() => setAba(k as Aba)}
          className={`flex-1 py-3.5 transition text-center ${
            aba === k
              ? "border-b-2 border-primary text-white bg-white/5"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {t}
        </button>
      ))}
    </div>

    {/* Conteúdo das Abas */}
    <div className="flex-1 lg:overflow-y-auto p-4 space-y-4 text-xs">
      {/* Aba Prontuário */}
      {aba === "prontuario" && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-2xl p-3.5 space-y-2 border border-white/10">
            <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
              Dados do Paciente
            </div>
            <div className="text-slate-200">
              {role === "medico" ? contraparteNome : sessaoNome} •{" "}
              {dadosPaciente
                ? `${dadosPaciente.idade} anos • ${dadosPaciente.genero}`
                : "—"}
            </div>
            <div className="text-slate-300">
              Alergias: {dadosPaciente ? "ver prontuário" : "— não exibido nesta tela"}
            </div>
            <div className="text-slate-300">
              Medicamentos: {dadosPaciente ? "ver prontuário" : "— não exibido nesta tela"}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                Evolução Clínica
              </span>
              {role === "medico" && (
                <button type="button"
                  onClick={inserirModeloResumo}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Inserir modelo de evolução
                </button>
              )}
            </div>
            <textarea
            aria-label="Anotações da consulta"
              value={anotacoes}
              onChange={(e) => setAnotacoes(e.target.value)}
              rows={8}
              disabled={role !== "medico"}
              placeholder="Registre queixa, hipótese diagnóstica e conduta médica..."
              className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 outline-none focus:border-primary text-xs leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* Aba Anamnese — coleta guiada pela BION IA antes do atendimento */}
      {aba === "anamnese" && anamneseAtual && (
        <div className="space-y-3">
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                Anamnese · BION IA
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  anamneseAtual.status === "concluida"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {anamneseAtual.status === "concluida" ? "Concluída" : `Em andamento · ${anamneseAtual.etapa}`}
              </span>
            </div>
            <div className="text-slate-300 mt-1">
              Documentos anexados: {anamneseAtual.documentos.length || "nenhum"}
            </div>
          </div>

          {anamneseAtual.documentos.map((d, i) => (
            <div key={`${d.nome}-${i}`} className="bg-white/5 rounded-2xl p-3 border border-white/10 flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-white truncate">{d.nome}</div>
                <div className="text-xs text-slate-300 truncate">
                  {d.exameImportado ? `Laudo laboratorial importado${d.resumo ? ` — ${d.resumo}` : ""}` : "Documento anexado na anamnese"}
                </div>
              </div>
            </div>
          ))}

          {Object.entries(anamneseAtual.coleta).length === 0 ? (
            <p className="text-slate-300">
              A anamnese desta consulta ainda não tem dados coletados — eles aparecem aqui conforme o paciente conversa com a BION IA.
            </p>
          ) : (
            Object.entries(anamneseAtual.coleta).map(([etapa, campos]) => (
              <div key={etapa} className="bg-white/5 rounded-2xl p-3.5 border border-white/10 space-y-1.5">
                <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                  {ROTULOS_ANAMNESE[etapa] ?? etapa}
                </div>
                {Object.entries(campos)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
                  .map(([campo, v]) => (
                    <div key={campo} className="text-slate-200">
                      <span className="text-slate-300">{campo.replace(/_/g, " ")}: </span>
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* Aba Exames */}
      {aba === "exames" && (
        <div className="space-y-3">
          <button type="button"
            onClick={onAnexarExame}
            className="w-full py-3 rounded-2xl border border-dashed border-white/20 hover:border-primary text-slate-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-white/5 transition"
          >
            <Upload className="w-4 h-4 text-primary" /> Anexar Novo Exame
          </button>

          <div className="space-y-2">
            {arquivos.map((a) => (
              <div
                key={a.id}
                className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{a.nome}</div>
                    <div className="text-xs text-slate-300">
                      {a.tipo} • {a.tamanhoKb} KB
                    </div>
                  </div>
                </div>
                <button type="button" className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aba Chat */}
      {aba === "chat" && (
        <div className="flex flex-col h-full space-y-3">
          <div className="flex-1 space-y-3 overflow-y-auto">
            {chatMsgs.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-2xl text-xs space-y-1 ${
                  m.minha ? "bg-white/10" : "bg-primary/20 border border-primary/30"
                }`}
              >
                <div className="flex justify-between font-bold text-slate-300 text-xs">
                  <span>{m.minha ? "Você" : role === "medico" ? "Marina Silva" : "Dra. Ana Ribeiro"}</span>
                  <span>{m.hora}</span>
                </div>
                <p className="text-white leading-relaxed">{m.texto}</p>
              </div>
            ))}
            {chatMsgs.length === 0 && (
              <div className="text-slate-400 text-center py-6 text-xs">
                Nenhuma mensagem ainda. As mensagens vão direto para o outro
                participante da consulta.
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t border-white/10">
            <input
            aria-label="Mensagem no chat da consulta"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviarChat();
              }}
              placeholder="Mensagem no chat da consulta..."
              className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-xs text-white outline-none focus:border-primary"
            />
            <button type="button"
              onClick={enviarChat}
              className="px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Aba IA Transcrição */}
      {aba === "ia" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-700 dark:text-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Transcrição Ativa em Tempo Real
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
              demonstração
            </span>
          </div>

          <div className="space-y-2.5">
            {transcricoes.map((t, idx) => (
              <div
                key={idx}
                className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-1"
              >
                <div className="font-bold text-primary text-xs">{t.autor}:</div>
                <p className="text-slate-300 leading-relaxed italic">“{t.fala}”</p>
              </div>
            ))}
          </div>

          {role === "medico" && (
            <button type="button"
              onClick={inserirModeloResumo}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Inserir modelo de evolução no prontuário
            </button>
          )}
        </div>
      )}
    </div>
  </div>
  </div>

  );
}
