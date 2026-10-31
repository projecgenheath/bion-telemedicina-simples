"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatarDataNascimento } from "@/lib/idade";
import {
  FileText,
  Download,
  Upload,
  Sparkles,
  Send,
  TriangleAlert,
} from "lucide-react";
import type { AnamneseResumo } from "@/lib/bion-store";
import { ROTULOS_ANAMNESE } from "@/components/bion/consulta/rotulos-anamnese";
import { LIMITE_RESUMO_MEDICO } from "@/lib/resumo-medico";
import type { ResumoClinicoSala } from "@/components/bion/consulta/useSalaConsulta";
import { BotaoDitado } from "@/components/bion/BotaoDitado";

type Role = "paciente" | "medico" | "admin";
type Aba = "prontuario" | "anamnese" | "exames" | "chat" | "ia";

export type ConsultaPainelLateralProps = {
  role: Role;
  aba: Aba;
  setAba: (a: Aba) => void;
  anamneseAtual?: AnamneseResumo;
  contraparteNome: string;
  sessaoNome: string;
  dadosPaciente?: { idade?: number | string; dataNascimento?: string | null; genero?: string } | null;
  /** Resumo clínico (só o médico carrega, via GET da evolução): alergias,
   *  comorbidades, tipo sanguíneo e medicamentos em uso no cartão. */
  resumoClinico?: ResumoClinicoSala | null;
  /** Motivo da consulta declarado no agendamento, quando houver. */
  motivoConsulta?: string;
  anotacoes: string;
  setAnotacoes: (v: string) => void;
  /** Autossalvamento do resumo (item 27): estado exibido sob a caixa. */
  resumoStatus?: "ok" | "salvando" | "erro";
  /** Retry imediato quando o autossalvamento falhou. */
  onTentarSalvarResumo?: () => void;
  arquivos: { id?: string; nome: string; tipo?: string; tamanhoKb?: number; enviadoPor?: string; storagePath?: string | null }[];
  chatMsgs: { id?: string; texto: string; minha?: boolean; hora?: string }[];
  chatInput: string;
  setChatInput: (v: string) => void;
  enviarChat: () => void;
  onAnexarExame: () => void;
  /** Insere o modelo estruturado de evolução (sem conteúdo clínico). */
  inserirModeloResumo: () => void;
};

export function ConsultaPainelLateral({
  role,
  aba,
  setAba,
  anamneseAtual,
  contraparteNome,
  sessaoNome,
  dadosPaciente,
  resumoClinico,
  motivoConsulta,
  anotacoes,
  setAnotacoes,
  resumoStatus = "ok",
  onTentarSalvarResumo,
  arquivos,
  chatMsgs,
  chatInput,
  setChatInput,
  enviarChat,
  onAnexarExame,
  inserirModeloResumo,
}: ConsultaPainelLateralProps) {
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  // Download real do exame (mesmo fluxo de Arquivos.tsx: GET /api/arquivos?id=
  // devolve o link assinado). Sem arquivo no Storage, não há botão — só o
  // texto "Só metadados", nunca um botão sem efeito.
  const baixarArquivo = async (id: string, nome: string) => {
    setBaixandoId(id);
    try {
      const res = await fetch(`/api/arquivos?id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        toast.error(json.erro || "Não foi possível gerar o link.");
        return;
      }
      const a = document.createElement("a");
      a.href = json.url;
      a.download = nome;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch {
      toast.error("Falha ao baixar.");
    } finally {
      setBaixandoId(null);
    }
  };

  // Painel Lateral — abaixo do vídeo no celular, ao lado no desktop
  return (
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
                ? `${dadosPaciente.idade} anos${
                    formatarDataNascimento(dadosPaciente.dataNascimento)
                      ? ` (nasc. ${formatarDataNascimento(dadosPaciente.dataNascimento)})`
                      : ""
                  } • ${dadosPaciente.genero}`
                : "—"}
            </div>
            {motivoConsulta ? (
              <div className="text-slate-200">
                <span className="text-slate-400">Motivo: </span>
                {motivoConsulta}
              </div>
            ) : null}
            {resumoClinico ? (
              <>
                {/* Alergia é a informação de segurança nº 1 da decisão
                    clínica: com alergia registrada, vira faixa de alerta;
                    sem, uma linha discreta de "nenhuma". */}
                {resumoClinico.alergias.length > 0 ? (
                  <div className="flex items-start gap-2 rounded-xl bg-red-500/15 border border-red-400/40 px-2.5 py-2 text-red-200">
                    <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
                    <span>
                      <span className="font-bold">Alergias: </span>
                      {resumoClinico.alergias.join(", ")}
                    </span>
                  </div>
                ) : (
                  <div className="text-slate-300">Alergias: nenhuma registrada</div>
                )}
                <div className="text-slate-300">
                  Comorbidades:{" "}
                  <span className="text-slate-200">
                    {resumoClinico.comorbidades.length > 0
                      ? resumoClinico.comorbidades.join(", ")
                      : "nenhuma registrada"}
                  </span>
                </div>
                <div className="text-slate-300">
                  Medicamentos em uso:
                  {resumoClinico.medicamentosEmUso.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-slate-200">
                      {resumoClinico.medicamentosEmUso.map((m) => (
                        <li key={m.id}>
                          • {m.nome}
                          {m.dose ? ` ${m.dose}` : ""}
                          {m.controlado ? " (controlado)" : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-200"> nenhum registrado</span>
                  )}
                </div>
                {resumoClinico.tipoSanguineo ? (
                  <div className="text-slate-300">
                    Tipo sanguíneo:{" "}
                    <span className="text-slate-200">{resumoClinico.tipoSanguineo}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="text-slate-300">
                  Alergias: {dadosPaciente ? "ver prontuário" : "— não exibido nesta tela"}
                </div>
                <div className="text-slate-300">
                  Medicamentos: {dadosPaciente ? "ver prontuário" : "— não exibido nesta tela"}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-slate-300 uppercase tracking-wider text-xs">
                Resumo da consulta
              </span>
              {role === "medico" && (
                <span className="flex items-center gap-2">
                  {/* Ditado por voz: o trecho reconhecido é ANEXADO às
                      anotações (nunca substitui o que já foi escrito). */}
                  <BotaoDitado
                    onTexto={(trecho) =>
                      setAnotacoes(
                        anotacoes + (anotacoes && !/\s$/.test(anotacoes) ? " " : "") + trecho,
                      )
                    }
                    className="text-slate-200"
                  />
                  <button type="button"
                    onClick={inserirModeloResumo}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Inserir modelo de evolução
                  </button>
                </span>
              )}
            </div>
            {/* Item 27: os dois textos da sala têm destinos DIFERENTES
                e o rótulo agora diz isso — este é o resumo final da
                consulta (vai para o prontuário ao concluir); a evolução
                estruturada (seções e CID) é o painel "Evolução". */}
            {role === "medico" && (
              <p className="text-[11px] leading-relaxed text-slate-400">
                Resumo final desta consulta: salvo automaticamente e exibido no prontuário ao
                concluir. A evolução estruturada (seções e CID) fica no painel{" "}
                <span className="font-bold text-slate-300">Evolução</span>, na borda direita da tela.
              </p>
            )}
            <textarea
            aria-label="Resumo da consulta"
              value={anotacoes}
              onChange={(e) => setAnotacoes(e.target.value)}
              rows={8}
              maxLength={LIMITE_RESUMO_MEDICO}
              disabled={role !== "medico"}
              placeholder="Registre queixa, hipótese diagnóstica e conduta médica..."
              className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 outline-none focus:border-primary text-xs leading-relaxed"
            />
            {/* O2: contador no MESMO teto que o servidor valida ao
                concluir (lib/resumo-medico) — o médico vê o limite
                enquanto escreve, em vez de descobrir num erro (ou, antes,
                num corte silencioso de 300 caracteres).
                Item 27: à esquerda do contador, o estado do
                autossalvamento do resumo — mesmo vocabulário do
                PainelEvolucao ("Salvando…"/"Não salvou" + tentar de
                novo), para o médico nunca chutar se o texto gravou. */}
            {role === "medico" && (
              <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span aria-live="polite" className="flex items-center gap-2">
                  {resumoStatus === "erro" ? (
                    <>
                      <span className="font-bold text-red-300">Não salvou</span>
                      {onTentarSalvarResumo && (
                        <button
                          type="button"
                          onClick={onTentarSalvarResumo}
                          className="font-bold text-primary hover:underline"
                        >
                          Tentar de novo
                        </button>
                      )}
                    </>
                  ) : resumoStatus === "salvando" ? (
                    <span>Salvando…</span>
                  ) : anotacoes ? (
                    <span>Resumo salvo</span>
                  ) : null}
                </span>
                <span aria-live="polite">
                  {anotacoes.length.toLocaleString("pt-BR")} / {LIMITE_RESUMO_MEDICO.toLocaleString("pt-BR")} caracteres
                </span>
              </div>
            )}
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
                {a.id && a.storagePath ? (
                  <button type="button"
                    disabled={baixandoId === a.id}
                    onClick={() => void baixarArquivo(a.id as string, a.nome)}
                    title="Baixar"
                    aria-label={`Baixar ${a.nome}`}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-50 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400 shrink-0" title="Sem arquivo no Storage">
                    Só metadados
                  </span>
                )}
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
                  <span>{m.minha ? "Você" : contraparteNome}</span>
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
          <div className="bg-white/5 rounded-2xl p-3.5 border border-white/10 space-y-1.5">
            <div className="font-bold text-slate-300 uppercase tracking-wider text-xs">
              Transcrição automática
            </div>
            <p className="text-slate-300 leading-relaxed">
              A transcrição automática da consulta ainda não está disponível.
              Nada é gravado nem transcrito nesta sala — registre a evolução
              clínica manualmente na aba Prontuário.
            </p>
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
  );
}
