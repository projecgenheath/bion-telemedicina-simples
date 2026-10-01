"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, Send } from "lucide-react";
import { useBion, type Documento } from "@/lib/bion-store";
import { formatarDataNascimento, idadeDeNascimento } from "@/lib/idade";
import { rotuloStatusMedico, type PacienteDoMedico } from "./metricas";
import { TelaSobreposta } from "./TelaSobreposta";
import { TriagemPaciente } from "./TriagemPaciente";
import { ProntuarioPaciente } from "./ProntuarioPaciente";
import { EmitirDocumentoSheet } from "./sheets/EmitirDocumentoSheet";
import type { DadosMedico } from "./useDadosMedico";

type Aba = "conversa" | "triagem" | "prontuario";
const MAX_TEXTO = 4000; // limite do POST /api/mensagens

const mascararCpf = (cpf: string) => {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `***.***.***-${d.slice(9)}` : "—";
};

function Info({ r, v }: { r: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-bion-ink/70 dark:text-bion-paper/70">{r}</dt>
      <dd className="text-sm font-semibold break-words">{v || "—"}</dd>
    </div>
  );
}

/** Conversa com o paciente; a 1ª "mensagem" é o cartão com os dados dele. */
export function ConversaPaciente({
  paciente,
  dados,
  onFechar,
}: {
  paciente: PacienteDoMedico;
  dados: DadosMedico;
  onFechar: () => void;
}) {
  const { mensagens, documentos, arquivos, enviarMensagem, marcarConversaLida } = useBion();
  const { sessao, anamneses, listaPacientes } = dados;
  const pid = paciente.pacienteId;
  const [aba, setAba] = useState<Aba>("conversa");
  const [texto, setTexto] = useState("");
  const [emitir, setEmitir] = useState<{ base?: Documento } | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  // Mantém a versão mais recente do grupo (consultas novas chegam por delta).
  const atual = listaPacientes.find((p) => p.chave === paciente.chave) ?? paciente;
  const { registro, proxima, ultima, consultas } = atual;

  const conversa = useMemo(
    () =>
      pid
        ? mensagens
            .filter((m) => (m.deId === pid && m.paraId === sessao.id) || (m.deId === sessao.id && m.paraId === pid))
            .sort((a, b) => a.ts - b.ts)
        : [],
    [mensagens, pid, sessao.id],
  );
  const naoLidas = conversa.filter((m) => m.deId === pid && !m.lida).length;

  useEffect(() => {
    if (pid && naoLidas > 0) marcarConversaLida(pid);
  }, [pid, naoLidas]);

  useEffect(() => {
    if (aba === "conversa") fimRef.current?.scrollIntoView({ block: "end" });
  }, [conversa.length, aba]);

  const docs = useMemo(() => documentos.filter((d) => d.paciente === atual.nome), [documentos, atual.nome]);
  const arqs = useMemo(() => (pid ? arquivos.filter((a) => a.pacienteId === pid) : []), [arquivos, pid]);
  const homonimo = listaPacientes.filter((p) => p.nome === atual.nome).length > 1;

  const ref = proxima ?? ultima;
  const anamneseRef = ref ? anamneses.find((a) => a.consultaId === ref.id) : undefined;
  const idade = registro?.dataNascimento ? idadeDeNascimento(registro.dataNascimento) : registro?.idade || null;
  const podeEnviar = Boolean(pid) && consultas.some((c) => c.status !== "cancelada");

  const enviar = () => {
    const t = texto.trim();
    if (!pid || !t || !podeEnviar) return;
    enviarMensagem(pid, t.slice(0, MAX_TEXTO));
    setTexto("");
  };

  const abas: { id: Aba; r: string }[] = [
    { id: "conversa", r: "Conversa" },
    { id: "triagem", r: "Triagem" },
    { id: "prontuario", r: "Prontuário" },
  ];

  return (
    <TelaSobreposta
      titulo={atual.nome}
      subtitulo={proxima ? `Próxima consulta: ${proxima.data} às ${proxima.hora}` : "Sem consulta futura"}
      onFechar={onFechar}
      acoes={
        pid ? (
          <button
            type="button"
            onClick={() => setEmitir({})}
            className="rounded-full px-3 py-2 text-xs font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 inline-flex items-center gap-1"
          >
            <FilePlus2 className="w-4 h-4" /> Emitir
          </button>
        ) : null
      }
      rodape={
        aba === "conversa" ? (
          podeEnviar ? (
            <form
              className="p-3 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
            >
              <label className="flex-1">
                <span className="sr-only">Mensagem para {atual.nome}</span>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar();
                    }
                  }}
                  rows={1}
                  maxLength={MAX_TEXTO}
                  placeholder="Escreva uma mensagem"
                  className="bp-entrada !rounded-2xl w-full px-4 py-2.5 text-sm resize-none max-h-32"
                />
              </label>
              <button
                type="submit"
                disabled={!texto.trim()}
                aria-label="Enviar mensagem"
                className="w-11 h-11 rounded-full bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 inline-flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <p className="p-4 text-xs text-center text-bion-ink/75 dark:text-bion-paper/75">
              {pid
                ? "A conversa fica disponível enquanto houver uma consulta não cancelada com este paciente."
                : "Consulta antiga sem identificação do paciente — mensagens indisponíveis."}
            </p>
          )
        ) : undefined
      }
    >
      <div role="tablist" aria-label="Seções do paciente" className="sticky top-0 z-10 px-4 pt-3 pb-2 bm-sobreposicao">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-bion-ink/8 dark:bg-white/10">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`py-2 rounded-xl text-xs font-bold ${
                aba === a.id ? "bg-white text-bion-ink shadow dark:bg-zinc-800 dark:text-white" : "text-bion-ink/80 dark:text-bion-paper/80"
              }`}
            >
              {a.r}
            </button>
          ))}
        </div>
      </div>

      {aba === "conversa" ? (
        <div className="px-4 pb-4 space-y-3" role="log" aria-live="polite" aria-label={`Conversa com ${atual.nome}`}>
          <article className="bp-glass p-4" aria-label="Dados do paciente">
            <div className="text-xs font-bold uppercase tracking-wider text-bion-sea dark:text-sky-300 mb-2">Ficha do paciente</div>
            {registro ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Info r="Idade" v={idade ? `${idade} anos` : ""} />
                <Info r="Nascimento" v={formatarDataNascimento(registro.dataNascimento) || "Não informada"} />
                <Info r="Gênero" v={registro.genero} />
                <Info r="Convênio" v={registro.convenio} />
                <Info r="Telefone" v={registro.telefone} />
                <Info r="CPF" v={mascararCpf(registro.cpf)} />
              </dl>
            ) : (
              <p className="text-sm text-bion-ink/75 dark:text-bion-paper/75">Dados cadastrais indisponíveis para este paciente.</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-bion-ink/10 dark:border-white/10">
              <Info r="Consulta" v={ref ? `${ref.data} às ${ref.hora} · ${rotuloStatusMedico(ref)}` : ""} />
              <Info r="Pagamento" v={ref ? (ref.pago ? "Pago" : "Pendente") : ""} />
              <Info r="Triagem" v={anamneseRef ? (anamneseRef.status === "concluida" ? "Concluída" : "Em andamento") : "Não iniciada"} />
              <Info r="Motivo" v={ref?.motivoConsulta ?? ""} />
            </dl>
          </article>

          {conversa.length === 0 ? (
            <p className="text-sm text-center text-bion-ink/75 dark:text-bion-paper/75 py-4">Nenhuma mensagem ainda.</p>
          ) : (
            conversa.map((m) => {
              const minha = m.deId === sessao.id;
              return (
                <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      minha
                        ? "bg-bion-sea text-white rounded-br-md dark:bg-sky-300 dark:text-zinc-950"
                        : "bp-glass rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    <p className={`text-[11px] mt-1 ${minha ? "text-white/85 dark:text-zinc-800" : "text-bion-ink/70 dark:text-bion-paper/70"}`}>
                      {m.quando}
                      {minha ? (m.lida ? " · lida" : " · enviada") : ""}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={fimRef} />
        </div>
      ) : aba === "triagem" ? (
        <TriagemPaciente anamneses={anamneses} consultas={consultas} />
      ) : (
        <ProntuarioPaciente
          consultas={consultas}
          documentos={docs}
          arquivos={arqs}
          homonimo={homonimo}
          onRenovar={(d) => setEmitir({ base: d })}
        />
      )}

      {emitir && pid ? (
        <EmitirDocumentoSheet
          onFechar={() => setEmitir(null)}
          pacienteId={pid}
          pacienteNome={atual.nome}
          consultaId={ref?.id}
          base={emitir.base}
        />
      ) : null}
    </TelaSobreposta>
  );
}
