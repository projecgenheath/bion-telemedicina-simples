"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  LifeBuoy,
  MessageSquare,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Send,
  Search,
  ShieldCheck,
  ChevronRight,
  X,
  User,
  Stethoscope,
} from "lucide-react";
import { useBion, type TicketSuporte } from "@/lib/bion-store";
import { ModalBion } from "@/components/bion/ModalBion";

export function ChamadosSuporte() {
  const { tickets, adicionarTicket, responderTicket, sessao } = useBion();
  const isAdmin = sessao.role === "admin";

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<
    "todos" | "aberto" | "em_andamento" | "resolvido"
  >("todos");
  const [ticketSelecionado, setTicketSelecionado] = useState<TicketSuporte | null>(null);
  const [respostaTexto, setRespostaTexto] = useState("");
  const [modalNovo, setModalNovo] = useState(false);

  // Formulário de novo chamado
  const [novoAssunto, setNovoAssunto] = useState("");
  const [novaCategoria, setNovaCategoria] = useState<TicketSuporte["categoria"]>("tecnico");
  const [novaMensagem, setNovaMensagem] = useState("");

  const ticketsFiltrados = tickets.filter((t) => {
    const matchRole = isAdmin ? true : t.usuario === sessao.nome;
    const matchBusca = (t.assunto + t.mensagem + t.usuario)
      .toLowerCase()
      .includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || t.status === filtroStatus;
    return matchRole && matchBusca && matchStatus;
  });

  const enviarNovoChamado = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoAssunto.trim() || !novaMensagem.trim()) return;

    adicionarTicket({
      usuario: sessao.nome,
      perfil: sessao.role === "medico" ? "medico" : "paciente",
      assunto: novoAssunto.trim(),
      categoria: novaCategoria,
      mensagem: novaMensagem.trim(),
    });

    toast.success("Chamado aberto com sucesso", {
      description: "Nossa equipe responde em até 4 horas úteis.",
    });

    setNovoAssunto("");
    setNovaMensagem("");
    setModalNovo(false);
  };

  const enviarResposta = (id: string) => {
    if (!respostaTexto.trim()) return;
    responderTicket(id, respostaTexto.trim());
    toast.success("Resposta enviada", {
      description: "O chamado foi marcado como resolvido.",
    });
    setRespostaTexto("");
    setTicketSelecionado((prev) =>
      prev && prev.id === id
        ? { ...prev, status: "resolvido", resposta: respostaTexto.trim() }
        : prev,
    );
  };

  const statusBadges = {
    aberto: { label: "Aberto", bg: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
    em_andamento: { label: "Em Análise", bg: "bg-primary-soft text-primary border-primary/30" },
    resolvido: {
      label: "Resolvido",
      bg: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    },
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft text-primary text-xs font-semibold mb-2">
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>Central de Atendimento Humanizado</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {isAdmin ? "Gestão de Chamados de Suporte" : "Central de Suporte BION"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "Responda a dúvidas técnicas, problemas de conexão e solicitações de usuários."
              : "Abra chamados para suporte com receitas, pagamentos ou uso da plataforma."}
          </p>
        </div>

        {!isAdmin && (
          <button
            onClick={() => setModalNovo(true)}
            className="px-5 py-3 rounded-2xl text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center gap-2 self-start sm:self-auto"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <Plus className="w-4 h-4" /> Abrir Novo Chamado
          </button>
        )}
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted w-full sm:flex-1">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
                  aria-label="Buscar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por assunto, usuário ou mensagem..."
            className="bg-transparent outline-none text-sm w-full"
          />
        </div>

        <div className="flex gap-1.5 p-1.5 rounded-2xl bg-muted w-full sm:w-auto overflow-x-auto">
          {(["todos", "aberto", "em_andamento", "resolvido"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition shrink-0 ${
                filtroStatus === st
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {st === "todos" ? "Todos" : statusBadges[st].label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Chamados */}
      <div className="space-y-3">
        {ticketsFiltrados.length === 0 ? (
          <div className="bg-card border rounded-3xl p-10 text-center text-muted-foreground space-y-2">
            <LifeBuoy className="w-10 h-10 mx-auto opacity-40 text-primary" />
            <div className="font-bold text-foreground">Nenhum chamado encontrado</div>
            <p className="text-xs max-w-sm mx-auto">
              Não há solicitações pendentes no momento. Caso precise de ajuda, clique em "Abrir Novo
              Chamado".
            </p>
          </div>
        ) : (
          ticketsFiltrados.map((ticket) => (
            <div
              key={ticket.id}
              role="button"
              tabIndex={0}
              aria-label={`Abrir chamado: ${ticket.assunto}`}
              onClick={() => setTicketSelecionado(ticket)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTicketSelecionado(ticket);
                }
              }}
              className="bg-card border rounded-3xl p-5 hover:border-primary transition shadow-sm cursor-pointer space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center text-primary font-bold shrink-0">
                    {ticket.perfil === "medico" ? (
                      <Stethoscope className="w-5 h-5" />
                    ) : (
                      <User className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground leading-snug">
                      {ticket.assunto}
                    </h3>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        {ticket.usuario} ({ticket.perfil})
                      </span>
                      <span>•</span>
                      <span>{ticket.data}</span>
                      <span>•</span>
                      <span className="capitalize font-medium">Categoria: {ticket.categoria}</span>
                    </div>
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    statusBadges[ticket.status].bg
                  }`}
                >
                  {statusBadges[ticket.status].label}
                </span>
              </div>

              <p className="text-xs text-muted-foreground line-clamp-2 pl-13">{ticket.mensagem}</p>

              {ticket.resposta && (
                <div className="mt-3 pt-3 border-t bg-muted/40 p-3 rounded-2xl flex items-start gap-2.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-foreground">
                      Resposta da Equipe BION ({ticket.dataResposta ?? "Recente"}):
                    </div>
                    <div className="text-muted-foreground mt-0.5 leading-relaxed">
                      {ticket.resposta}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de Detalhes / Resposta de Chamado */}
      {ticketSelecionado && (
        <ModalBion
          aberto
          onFechar={() => setTicketSelecionado(null)}
          titulo={`Chamado: ${ticketSelecionado.assunto}`}
          largura="max-w-xl"
          className="py-4"
        >
          <div className="bg-card border rounded-3xl w-full p-6 md:p-8 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    statusBadges[ticketSelecionado.status].bg
                  }`}
                >
                  {statusBadges[ticketSelecionado.status].label}
                </span>
                <h3 className="text-xl font-bold mt-2 text-foreground">
                  {ticketSelecionado.assunto}
                </h3>
                <div className="text-xs text-muted-foreground mt-1">
                  Aberto por <strong>{ticketSelecionado.usuario}</strong> • {ticketSelecionado.data}
                </div>
              </div>
              <button
                onClick={() => setTicketSelecionado(null)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-muted/60 border text-xs text-foreground leading-relaxed whitespace-pre-wrap">
              {ticketSelecionado.mensagem}
            </div>

            {ticketSelecionado.resposta && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Resposta enviada por {ticketSelecionado.respondidoPor ?? "Suporte BION"}
                </div>
                <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {ticketSelecionado.resposta}
                </p>
                <div className="text-[10px] text-muted-foreground">
                  {ticketSelecionado.dataResposta}
                </div>
              </div>
            )}

            {isAdmin && ticketSelecionado.status !== "resolvido" && (
              <div className="space-y-3 pt-3 border-t">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Responder ao Usuário:
                </label>
                <textarea
                  aria-label="Responder ao Usuário"
                  value={respostaTexto}
                  onChange={(e) => setRespostaTexto(e.target.value)}
                  placeholder="Escreva a resposta e solução oficial para este chamado..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-2xl border text-xs bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => enviarResposta(ticketSelecionado.id)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" /> Enviar Resposta & Marcar como Resolvido
                </button>
              </div>
            )}
          </div>
        </ModalBion>
      )}

      {/* Modal de Abertura de Novo Chamado */}
      {modalNovo && (
        <ModalBion
          aberto
          onFechar={() => setModalNovo(false)}
          titulo="Abrir novo chamado de suporte"
          largura="max-w-lg"
          className="py-4"
        >
          <form
            onSubmit={enviarNovoChamado}
            className="bg-card border rounded-3xl w-full p-6 md:p-8 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-foreground">Abrir Novo Chamado de Suporte</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nossa equipe médica e técnica responde em poucos minutos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalNovo(false)}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">Assunto</label>
                <input
                  aria-label="Assunto"
                  value={novoAssunto}
                  onChange={(e) => setNovoAssunto(e.target.value)}
                  placeholder="Ex: Dúvida com pagamento Pix ou download de receita"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border text-xs bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">Categoria</label>
                <select
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value as TicketSuporte["categoria"])}
                  className="w-full px-4 py-2.5 rounded-xl border text-xs bg-background outline-none"
                >
                  <option value="tecnico">Dúvida Técnica ou Conexão de Vídeo</option>
                  <option value="pagamento">Pagamento e Reembolso</option>
                  <option value="agendamento">Agendamento e Horários</option>
                  <option value="outro">Outros Assuntos</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1.5">
                  Mensagem detalhada
                </label>
                <textarea
                  aria-label="Mensagem detalhada"
                  value={novaMensagem}
                  onChange={(e) => setNovaMensagem(e.target.value)}
                  placeholder="Descreva o que aconteceu para resolvermos o mais rápido possível..."
                  rows={4}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border text-xs bg-background outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Send className="w-4 h-4" /> Enviar Chamado
            </button>
          </form>
        </ModalBion>
      )}
    </div>
  );
}
