"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { useBion } from "@/lib/bion-store";

type Contato = {
  id: string;
  nome: string;
  detalhe: string; // especialidade / "Paciente" / "Atendimento BION"
  suporte: boolean;
};

const INICIAIS = (nome: string) => {
  const partes = nome.split(" ").filter(Boolean);
  return partes[1]?.[0] ?? partes[0]?.[0] ?? "?";
};

const MINUTOS_ONLINE = 5;

export function Mensagens() {
  const { sessao, consultas, medicos, pacientes, mensagens, suporte, enviarMensagem, marcarConversaLida } =
    useBion();
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);

  /* Contatos por papel: quem o usuário pode conversar */
  const contatos = useMemo<Contato[]>(() => {
    const lista: Contato[] = [];

    if (sessao.role === "paciente") {
      const vistos = new Set<string>();
      for (const c of consultas) {
        const id = c.medicoId ?? medicos.find((m) => m.nome === c.medico)?.id;
        if (id && !vistos.has(id)) {
          vistos.add(id);
          lista.push({ id, nome: c.medico, detalhe: c.especialidade, suporte: false });
        }
      }
    } else if (sessao.role === "medico") {
      const vistos = new Set<string>();
      for (const c of consultas) {
        if (c.pacienteId && !vistos.has(c.pacienteId)) {
          vistos.add(c.pacienteId);
          lista.push({ id: c.pacienteId, nome: c.paciente, detalhe: "Paciente", suporte: false });
        }
      }
    } else {
      // Admin conversa com médicos e pacientes cadastrados
      for (const m of medicos) {
        if (m.id !== sessao.id) lista.push({ id: m.id, nome: m.nome, detalhe: m.especialidade, suporte: false });
      }
      for (const p of pacientes) {
        if (p.id !== sessao.id) lista.push({ id: p.id, nome: p.nome, detalhe: "Paciente", suporte: false });
      }
    }

    if (suporte.id && suporte.id !== sessao.id && !lista.some((c) => c.id === suporte.id)) {
      lista.push({ id: suporte.id, nome: suporte.nome, detalhe: "Atendimento BION", suporte: true });
    }
    return lista;
  }, [sessao.role, sessao.id, consultas, medicos, pacientes, suporte]);

  /* Resumo de conversas: última mensagem + não lidas por contato */
  const conversas = useMemo(() => {
    const porContato = contatos.map((c) => {
      const thread = mensagens.filter((m) => m.deId === c.id || m.paraId === c.id);
      const ultima = thread[thread.length - 1];
      const naoLidas = thread.filter((m) => !m.minha && !m.lida).length;
      const online =
        !!ultima && !ultima.minha && Date.now() - ultima.ts < MINUTOS_ONLINE * 60_000;
      return { contato: c, ultima, naoLidas, online, atividade: ultima?.ts ?? 0 };
    });

    // Com mensagens primeiro (mais recentes), sem mensagens depois em ordem alfabética
    return porContato.sort((a, b) => {
      if (a.atividade && b.atividade) return b.atividade - a.atividade;
      if (a.atividade) return -1;
      if (b.atividade) return 1;
      return a.contato.nome.localeCompare(b.contato.nome);
    });
  }, [contatos, mensagens]);

  const ativa = conversas.find((c) => c.contato.id === ativaId)?.contato ?? conversas[0]?.contato ?? null;

  const threadAtiva = useMemo(() => {
    if (!ativa) return [];
    return mensagens
      .filter((m) => m.deId === ativa.id || m.paraId === ativa.id)
      .sort((a, b) => a.ts - b.ts);
  }, [mensagens, ativa]);

  /* Abre a conversa e marca como lida ao chegar mensagem nova com a conversa aberta */
  const naoLidasAtivas = threadAtiva.filter((m) => !m.minha && !m.lida).length;
  useEffect(() => {
    if (!ativa) return;
    if (!conversas.some((c) => c.contato.id === ativa.id)) setAtivaId(null);
  }, [conversas, ativa]);

  useEffect(() => {
    if (ativa && naoLidasAtivas > 0) marcarConversaLida(ativa.id);
  }, [ativa, naoLidasAtivas, marcarConversaLida]);

  /* Auto-scroll para a última mensagem */
  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadAtiva.length, ativa?.id]);

  const enviar = useCallback(() => {
    const t = texto.trim();
    if (!t || !ativa) return;
    enviarMensagem(ativa.id, t);
    setTexto("");
  }, [texto, ativa, enviarMensagem]);

  /* Estado vazio: nenhum contato disponível ainda */
  if (!contatos.length) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mensagens &amp; Orientações</h1>
          <p className="text-muted-foreground mt-1">
            Fale diretamente com seu médico especialista entre as consultas.
          </p>
        </div>
        <div className="bg-card border rounded-3xl p-10 text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="mt-4 text-sm font-semibold">Nenhuma conversa disponível</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {sessao.role === "paciente"
              ? "Assim que você agendar sua primeira consulta, seu médico aparecerá aqui para troca de mensagens."
              : "Seus contatos aparecerão aqui conforme consultas e cadastros forem realizados na plataforma."}
          </p>
        </div>
      </div>
    );
  }

  const c = ativa!;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Mensagens &amp; Orientações</h1>
        <p className="text-muted-foreground mt-1">
          Fale diretamente com seu médico especialista entre as consultas.
        </p>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4 min-w-0">
        {/* Lista de conversas */}
        <div className="space-y-2 md:max-h-[560px] md:overflow-y-auto md:pr-1">
          {conversas.map(({ contato, ultima, naoLidas, online }) => (
            <button
              key={contato.id}
              onClick={() => setAtivaId(contato.id)}
              className={`w-full text-left bg-card border rounded-2xl p-3 flex items-center gap-3 transition ${
                contato.id === c.id ? "border-primary bg-primary-soft" : "hover:border-primary"
              }`}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                  {INICIAIS(contato.nome)}
                </div>
                {online && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{contato.nome}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {ultima ? ultima.texto : contato.suporte ? "Como podemos ajudar você hoje?" : "Comece a conversa"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-muted-foreground">
                  {ultima ? ultima.quando.replace(" às ", " ") : ""}
                </div>
                {naoLidas > 0 && (
                  <span
                    className="inline-block mt-1 text-[10px] font-bold text-primary-foreground rounded-full px-1.5"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {naoLidas}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Conversa ativa */}
        <div className="bg-card border rounded-3xl flex flex-col min-h-[460px] md:max-h-[560px] min-w-0 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b bg-muted/40">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
              {INICIAIS(c.nome)}
            </div>
            <div>
              <div className="text-xs font-bold">{c.nome}</div>
              <div className="text-[11px] text-muted-foreground">{c.detalhe}</div>
            </div>
          </div>

          <div ref={listaRef} className="flex-1 p-4 space-y-3 overflow-y-auto">
            {threadAtiva.length === 0 && (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-xs text-muted-foreground max-w-xs">
                  Nenhuma mensagem ainda. Envie a primeira mensagem para {c.nome} — as respostas
                  chegam aqui e nas notificações.
                </p>
              </div>
            )}
            {threadAtiva.map((m) => (
              <div key={m.id} className={`flex ${m.minha ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-xs ${
                    m.minha
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-muted text-foreground rounded-tl-xs"
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap break-words">{m.texto}</p>
                  <div
                    className={`text-[10px] mt-1 text-right ${m.minha ? "opacity-75" : "text-muted-foreground"}`}
                  >
                    {m.quando}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t bg-card flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
              maxLength={4000}
              placeholder={`Mensagem para ${c.nome}...`}
              className="flex-1 bg-muted rounded-2xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={enviar}
              disabled={!texto.trim()}
              className="px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="w-3.5 h-3.5" />
        Conversas registradas com trilha de auditoria e proteção LGPD.
      </p>
    </div>
  );
}
