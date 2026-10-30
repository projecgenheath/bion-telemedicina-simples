"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FilePlus2, Info as InfoIcone, Plus, Ruler, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useBion, type Documento } from "@/lib/bion-store";
import { formatarDataNascimento, idadeDeNascimento } from "@/lib/idade";
import { janelaRespostaPaciente, rotuloStatusMedico, type PacienteDoMedico } from "./metricas";

const FUSO = "America/Sao_Paulo";

/** "30/11/2026" (fuso da clínica) para um timestamp. */
const fmtData = (ts: number) =>
  new Date(ts).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
import { TelaSobreposta } from "./TelaSobreposta";
import { TriagemPaciente } from "./TriagemPaciente";
import { ProntuarioPaciente } from "./ProntuarioPaciente";
import { EmitirDocumentoSheet } from "./sheets/EmitirDocumentoSheet";
import type { DadosMedico } from "./useDadosMedico";

type Aba = "conversa" | "triagem" | "prontuario";
const MAX_TEXTO = 4000; // limite do POST /api/mensagens

/* Item 23 (melhorias): modelos de mensagem — tocar PREENCHE o campo, nunca
 * envia direto; o médico edita antes de enviar. Os pessoais ficam no
 * aparelho (localStorage), sem migração nem servidor. */
const MODELOS_PADRAO: { rotulo: string; texto: string }[] = [
  {
    rotulo: "Saudação",
    texto: "Olá! Tudo bem? Estou acompanhando o seu caso por aqui. Se tiver alguma dúvida ou novidade sobre os sintomas, pode me contar.",
  },
  {
    rotulo: "Orientações pós-consulta",
    texto: "Seguem as orientações: mantenha o repouso indicado, hidrate-se bem e use a medicação exatamente como está na receita. Se algum sintoma piorar, me avise por aqui.",
  },
  {
    rotulo: "Cobrar resultado de exame",
    texto: "Quando o resultado do exame ficar pronto, você pode enviá-lo por aqui (foto ou PDF) para eu avaliar. Assim que eu olhar, te respondo.",
  },
  {
    rotulo: "Sugerir retorno",
    texto: "Recomendo que a gente se fale de novo em alguns dias para reavaliar a sua evolução. Você pode agendar o retorno pelo app quando quiser.",
  },
  {
    rotulo: "Encerramento",
    texto: "Por aqui está tudo certo. Cuide-se e, precisando, é só chamar. Melhoras!",
  },
];

const TIPOS_MEDICAO_CONVERSA = [
  { id: "peso", rotulo: "Peso" },
  { id: "altura", rotulo: "Altura" },
  { id: "pressao", rotulo: "Pressão" },
] as const;

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
  // Item 23: modelos pessoais do médico (só neste aparelho) e pedido de
  // medição a partir da conversa.
  const chaveModelos = `bion:modelos-medico:${sessao.id}`;
  const [modelosPessoais, setModelosPessoais] = useState<string[]>(() => {
    try {
      const v = window.localStorage.getItem(chaveModelos);
      const arr = v ? (JSON.parse(v) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
    } catch {
      return [];
    }
  });
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const [tiposPedido, setTiposPedido] = useState<string[]>(["pressao"]);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  // Envio confirmado, não "disparado e esquecido": o store não devolve o
  // resultado de enviarMensagem (interface void), então a confirmação é a
  // mensagem nova na conversa (delta do servidor). Enquanto não chega, o
  // botão fica em "Enviando…" e o texto NÃO é limpo — em falha, ele continua
  // no campo para tentar de novo, sem duplo envio.
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const pendenteRef = useRef<{ texto: string; antes: Set<string> } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // M-9: filtro pelo IDENTIFICADOR do paciente — homônimos não podem misturar
  // documentos. Fallback por nome apenas para documentos legados (sem id).
  const docs = useMemo(
    () =>
      pid
        ? documentos.filter((d) => (d.pacienteId ? d.pacienteId === pid : d.paciente === atual.nome))
        : [],
    [documentos, pid, atual.nome],
  );
  const arqs = useMemo(() => (pid ? arquivos.filter((a) => a.pacienteId === pid) : []), [arquivos, pid]);
  const homonimo = listaPacientes.filter((p) => p.nome === atual.nome).length > 1;

  const ref = proxima ?? ultima;
  const anamneseRef = ref ? anamneses.find((a) => a.consultaId === ref.id) : undefined;
  const idade = registro?.dataNascimento ? idadeDeNascimento(registro.dataNascimento) : registro?.idade || null;
  const podeEnviar = Boolean(pid) && consultas.some((c) => c.status !== "cancelada");
  // PC2: janela de RESPOSTA do paciente (regra do POST /api/mensagens,
  // espelhada em metricas.janelaRespostaPaciente). O médico envia sempre;
  // quem tem prazo é o paciente — sem este aviso, o silêncio dele depois do
  // prazo parece desinteresse, quando é a plataforma recusando a resposta.
  const janela = pid ? janelaRespostaPaciente(consultas, Date.now()) : null;

  // Item 23a: modelo preenche o campo (anexa ao rascunho, se houver) —
  // nunca envia direto.
  const aplicarModelo = (modelo: string) => {
    setTexto((atual) => (atual.trim() ? `${atual.replace(/\s+$/, "")}\n${modelo}` : modelo));
  };
  const salvarModeloAtual = () => {
    const t = texto.trim();
    if (!t || modelosPessoais.includes(t)) return;
    const lista = [...modelosPessoais, t].slice(-12);
    setModelosPessoais(lista);
    try {
      window.localStorage.setItem(chaveModelos, JSON.stringify(lista));
    } catch {}
    toast.success("Modelo salvo neste aparelho");
  };
  const removerModelo = (modelo: string) => {
    const lista = modelosPessoais.filter((m) => m !== modelo);
    setModelosPessoais(lista);
    try {
      window.localStorage.setItem(chaveModelos, JSON.stringify(lista));
    } catch {}
  };

  // Item 23b: "Pedir medição" sem sair da conversa — mesma API que a sala
  // usa (POST /api/medico/pedidos-medicao), ancorado na consulta não
  // cancelada mais recente do vínculo (a lista vem da mais nova p/ a mais
  // antiga). A rota recusa consulta cancelada com 409.
  const consultaAlvoPedido = consultas.find((c) => c.status !== "cancelada");
  const alternarTipoPedido = (id: string) =>
    setTiposPedido((atuais) => (atuais.includes(id) ? atuais.filter((t) => t !== id) : [...atuais, id]));
  const enviarPedido = async () => {
    if (!consultaAlvoPedido || tiposPedido.length === 0 || enviandoPedido) return;
    setEnviandoPedido(true);
    try {
      const res = await fetch("/api/medico/pedidos-medicao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultaId: consultaAlvoPedido.id, tipos: tiposPedido }),
      });
      const j = (await res.json().catch(() => ({}))) as { jaExistia?: boolean; erro?: string };
      if (res.ok) {
        if (j.jaExistia) {
          toast.info("Já existe um pedido igual pendente", { description: "O paciente já tem esse pedido em aberto." });
        } else {
          toast.success("Pedido de medição enviado", { description: "O paciente verá o pedido no app dele." });
        }
        setPedidoAberto(false);
      } else {
        toast.error(j.erro === "consulta_cancelada" ? "A consulta foi cancelada." : "Não foi possível enviar o pedido");
      }
    } catch {
      toast.error("Falha de conexão", { description: "O pedido de medição não foi enviado." });
    } finally {
      setEnviandoPedido(false);
    }
  };

  const enviar = () => {
    const t = texto.trim();
    if (!pid || !t || !podeEnviar || enviando) return;
    const corpo = t.slice(0, MAX_TEXTO);
    setEnviando(true);
    setErroEnvio(null);
    pendenteRef.current = { texto: corpo, antes: new Set(conversa.map((m) => m.id)) };
    enviarMensagem(pid, corpo);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!pendenteRef.current) return;
      pendenteRef.current = null;
      setEnviando(false);
      setErroEnvio("Não foi possível confirmar o envio. Tente novamente — sua mensagem não foi apagada.");
    }, 12_000);
  };

  // Confirmação: a mensagem nova (id ainda não visto) com o mesmo texto,
  // enviada por mim, chegou via delta — aí sim limpa o campo.
  useEffect(() => {
    if (!enviando || !pendenteRef.current) return;
    const p = pendenteRef.current;
    if (conversa.some((m) => m.deId === sessao.id && m.texto.trim() === p.texto && !p.antes.has(m.id))) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pendenteRef.current = null;
      setTexto("");
      setEnviando(false);
    }
  }, [conversa, enviando, sessao.id]);

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
          <div className="flex items-center gap-1.5">
            {consultaAlvoPedido ? (
              <button
                type="button"
                onClick={() => {
                  setAba("conversa");
                  setPedidoAberto((v) => !v);
                }}
                aria-expanded={pedidoAberto}
                className="rounded-full px-3 py-2 text-xs font-bold bg-bion-ink/8 dark:bg-white/10 inline-flex items-center gap-1"
              >
                <Ruler className="w-4 h-4" /> Medição
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEmitir({})}
              className="rounded-full px-3 py-2 text-xs font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 inline-flex items-center gap-1"
            >
              <FilePlus2 className="w-4 h-4" /> Emitir
            </button>
          </div>
        ) : null
      }
      rodape={
        aba === "conversa" ? (
          podeEnviar ? (
            <form
              className="p-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                enviar();
              }}
            >
              {erroEnvio ? (
                <p className="text-xs font-semibold text-red-700 dark:text-red-400" role="alert">
                  {erroEnvio}
                </p>
              ) : null}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Modelos de mensagem">
                {MODELOS_PADRAO.map((m) => (
                  <button
                    key={m.rotulo}
                    type="button"
                    onClick={() => aplicarModelo(m.texto)}
                    title={m.texto}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold bg-bion-ink/8 dark:bg-white/10 whitespace-nowrap shrink-0"
                  >
                    {m.rotulo}
                  </button>
                ))}
                {modelosPessoais.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-bold bg-bion-sea/15 text-bion-sea dark:text-sky-300 whitespace-nowrap shrink-0"
                  >
                    <button type="button" onClick={() => aplicarModelo(m)} title={m} className="max-w-40 truncate">
                      {m}
                    </button>
                    <button
                      type="button"
                      onClick={() => removerModelo(m)}
                      aria-label="Excluir modelo pessoal"
                      className="w-4 h-4 rounded-full inline-flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {texto.trim() && !modelosPessoais.includes(texto.trim()) ? (
                  <button
                    type="button"
                    onClick={salvarModeloAtual}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold bg-bion-ink/8 dark:bg-white/10 whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Salvar como modelo
                  </button>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
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
                disabled={enviando || !texto.trim()}
                aria-label={enviando ? "Enviando mensagem…" : "Enviar mensagem"}
                className="w-11 h-11 rounded-full bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 inline-flex items-center justify-center disabled:opacity-50"
              >
                {enviando ? <span className="text-[10px] font-bold">…</span> : <Send className="w-4 h-4" />}
              </button>
              </div>
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
          {pedidoAberto && consultaAlvoPedido ? (
            <section className="bp-glass p-4" aria-label="Pedir medição ao paciente">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold">Pedir medição</div>
                  <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-0.5">
                    O paciente recebe o pedido no app e responde quando medir. Você é avisado quando ele enviar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPedidoAberto(false)}
                  aria-label="Fechar pedido de medição"
                  className="w-8 h-8 rounded-full bg-bion-ink/8 dark:bg-white/10 inline-flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Tipos de medição">
                {TIPOS_MEDICAO_CONVERSA.map((t) => {
                  const ativo = tiposPedido.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => alternarTipoPedido(t.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                        ativo
                          ? "bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950"
                          : "bg-bion-ink/8 dark:bg-white/10"
                      }`}
                    >
                      {t.rotulo}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void enviarPedido()}
                disabled={enviandoPedido || tiposPedido.length === 0}
                className="mt-3 w-full rounded-full py-2.5 text-sm font-bold bg-bion-sea text-white dark:bg-sky-300 dark:text-zinc-950 disabled:opacity-50"
              >
                {enviandoPedido ? "Enviando…" : "Enviar pedido"}
              </button>
            </section>
          ) : null}

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

          {janela ? (
            janela.encerrada ? (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3" role="status">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-100">
                    Janela de resposta do paciente encerrada
                  </div>
                  <p className="text-xs text-amber-900/80 dark:text-amber-100/80 mt-1">
                    Desde {fmtData(janela.limite)} o paciente não consegue mais responder por aqui (a plataforma
                    aceita respostas só até 30 dias após a consulta mais recente). Se ele não respondeu, pode ter
                    sido esse bloqueio — não desinteresse. Para retomar a conversa, ele precisa de uma nova
                    consulta. Você ainda pode enviar mensagens.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bp-glass p-4 flex gap-3" role="status">
                <InfoIcone className="w-5 h-5 shrink-0 text-bion-sea dark:text-sky-300" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-bold">Janela de resposta do paciente: aberta</div>
                  <p className="text-xs text-bion-ink/75 dark:text-bion-paper/75 mt-1">
                    Ele pode responder até {fmtData(janela.limite)} (30 dias após a consulta mais recente
                    {janela.diasRestantes <= 30 ? ` — restam ${janela.diasRestantes} ${janela.diasRestantes === 1 ? "dia" : "dias"}` : ""}).
                    Você pode enviar mensagens a qualquer momento.
                  </p>
                </div>
              </div>
            )
          ) : null}

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
